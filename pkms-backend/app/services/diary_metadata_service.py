"""
Diary Metadata Service

Handles daily metadata, calendar data, statistics, and wellness analytics.
"""

import logging
import json
import calendar
import time
from typing import Dict, List, Optional, Any, Literal
from datetime import datetime, date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, extract

from app.config import NEPAL_TZ
from app.models.diary import DiaryEntry, DiaryDailyMetadata
from app.models.note import Note
from app.models.document import Document
from app.models.associations import document_diary
from app.models.todo import Todo, TodoStatus
from app.models.project import Project, ProjectStatus
from app.models.archive import ArchiveItem
from app.schemas.diary import (
    DiaryCalendarData,
    MoodStats,
    WellnessStats,
    WellnessTrendPoint,
    WeeklyHighlights,
    DiaryDailyMetadataResponse,
    DiaryDailyMetadataUpdate,
)

from app.services.unified_cache_service import diary_cache

logger = logging.getLogger(__name__)


class DiaryMetadataService:
    @staticmethod
    async def _get_model_by_date(
        db: AsyncSession, user_uuid: str, day: date
    ) -> Optional[DiaryDailyMetadata]:
        """Internal: fetch DiaryDailyMetadata model by day."""
        result = await db.execute(
            select(DiaryDailyMetadata).where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    func.date(DiaryDailyMetadata.date) == day,
                )
            )
        )
        return result.scalar_one_or_none()
    """
    Service for diary metadata operations including daily metadata,
    calendar data, mood/wellness statistics, and weekly highlights.
    """
    
    @staticmethod
    async def _get_metadata_in_date_range(
        db: AsyncSession,
        user_uuid: str,
        start_date: date,
        end_date: date
    ) -> List[DiaryDailyMetadata]:
        """
        Helper method to get daily metadata records within a date range.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            start_date: Start date (inclusive)
            end_date: End date (inclusive)
            
        Returns:
            List of DiaryDailyMetadata records ordered by date
        """
        metadata_query = (
            select(DiaryDailyMetadata)
            .where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    func.date(DiaryDailyMetadata.date) >= start_date,
                    func.date(DiaryDailyMetadata.date) <= end_date
                )
            )
            .order_by(DiaryDailyMetadata.date)
        )
        metadata_result = await db.execute(metadata_query)
        return metadata_result.scalars().all()
    
    @staticmethod
    async def get_or_create_daily_metadata(
        db: AsyncSession,
        user_uuid: str,
        entry_date: date | datetime,
        nepali_date: Optional[str],
        metrics: Dict[str, Any],
        daily_income: Optional[int] = None,
        daily_expense: Optional[int] = None,
        is_office_day: Optional[bool] = None
    ) -> DiaryDailyMetadata:
        """
        Get or create daily metadata for a specific date.
        Merges metrics if metadata already exists.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            entry_date: Date of the entry
            nepali_date: Nepali date string
            metrics: Dictionary of wellness metrics
            daily_income: Daily income amount
            daily_expense: Daily expense amount
            is_office_day: Whether it's an office day
            
        Returns:
            DiaryDailyMetadata instance
        """
        # Normalize to date for stable comparisons
        entry_day = entry_date.date() if isinstance(entry_date, datetime) else entry_date
        result = await db.execute(
            select(DiaryDailyMetadata).where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    func.date(DiaryDailyMetadata.date) == entry_day
                )
            )
        )
        snapshot = result.scalar_one_or_none()
        
        if snapshot:
            # Merge default habits/metrics (existing + new)
            existing = {}
            try:
                existing = json.loads(snapshot.default_habits_json or "{}")
            except Exception:
                existing = {}
            merged = {**existing, **(metrics or {})}
            snapshot.default_habits_json = json.dumps(merged)
            snapshot.nepali_date = nepali_date or snapshot.nepali_date
            if daily_income is not None:
                snapshot.daily_income = daily_income
            if daily_expense is not None:
                snapshot.daily_expense = daily_expense
            if is_office_day is not None:
                snapshot.is_office_day = is_office_day
            snapshot.updated_at = datetime.now(NEPAL_TZ)
            await db.flush()
            return snapshot
        
        # Create new snapshot
        snapshot = DiaryDailyMetadata(
            created_by=user_uuid,
            date=entry_day,
            nepali_date=nepali_date,
            default_habits_json=json.dumps(metrics or {}),
            daily_income=daily_income or 0,
            daily_expense=daily_expense or 0,
            is_office_day=is_office_day or False,
        )
        db.add(snapshot)
        await db.flush()
        return snapshot
    
    @staticmethod
    def format_daily_metadata(snapshot: DiaryDailyMetadata) -> DiaryDailyMetadataResponse:
        """Format daily metadata model to response schema."""
        metrics = json.loads(snapshot.default_habits_json) if snapshot.default_habits_json else {}
        return DiaryDailyMetadataResponse(
            date=snapshot.date.date() if isinstance(snapshot.date, datetime) else snapshot.date,
            nepali_date=snapshot.nepali_date,
            metrics=metrics,
            created_at=snapshot.created_at,
            updated_at=snapshot.updated_at,
        )
    
    @staticmethod
    async def get_calendar_data(
        db: AsyncSession,
        user_uuid: str,
        year: int,
        month: int
    ) -> Dict[str, List[DiaryCalendarData]]:
        """
        Get calendar data for a specific month showing which days have entries.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            year: Year
            month: Month (1-12)
            
        Returns:
            Dictionary with calendar_data key containing list of DiaryCalendarData
        """
        # Subquery to count files per day (via document_diary association)
        file_count_subquery = (
            select(
                func.date(Document.created_at).label("media_date"),
                func.count(Document.uuid).label("file_count")
            )
            .join(document_diary, Document.uuid == document_diary.c.document_uuid)
            .join(DiaryEntry, document_diary.c.diary_entry_uuid == DiaryEntry.uuid)
            .where(
                and_(
                    DiaryEntry.created_by == user_uuid,
                    extract('year', Document.created_at) == year,
                    extract('month', Document.created_at) == month
                )
            )
            .group_by(func.date(Document.created_at))
            .subquery()
        )
        
        query = (
            select(
                func.date(DiaryEntry.date).label("entry_date"),
                func.avg(DiaryEntry.mood).label("avg_mood"),
                func.count(DiaryEntry.uuid).label("entry_count")
            )
            .where(
                and_(
                    DiaryEntry.created_by == user_uuid,
                    extract('year', DiaryEntry.date) == year,
                    extract('month', DiaryEntry.date) == month,
                    DiaryEntry.is_template.is_(False)
                )
            )
            .group_by(func.date(DiaryEntry.date))
        )
        
        result = await db.execute(query)
        db_data = {}
        for row in result.all():
            # Handle case where entry_date might be string or date
            if isinstance(row.entry_date, str):
                date_key = row.entry_date
            else:
                date_key = row.entry_date.strftime('%Y-%m-%d')
            db_data[date_key] = row
        
        media_result = await db.execute(select(file_count_subquery))
        media_data = {}
        for row in media_result.all():
            # Handle case where media_date might be string or date
            if isinstance(row.media_date, str):
                date_key = row.media_date
            else:
                date_key = row.media_date.strftime('%Y-%m-%d')
            media_data[date_key] = row.file_count
        
        calendar_data = []
        num_days = calendar.monthrange(year, month)[1]
        for day in range(1, num_days + 1):
            date_str = f"{year}-{month:02d}-{day:02d}"
            day_data = db_data.get(date_str)
            file_count = media_data.get(date_str, 0)
            
            calendar_data.append(
                DiaryCalendarData(
                    date=date_str,
                    has_entry=day_data is not None and day_data.entry_count > 0,
                    mood=round(float(day_data.avg_mood)) if (day_data and day_data.avg_mood is not None) else None,
                    file_count=file_count
                )
            )
        
        return {"calendar_data": calendar_data}
    
    @staticmethod
    async def get_mood_stats(
        db: AsyncSession,
        user_uuid: str
    ) -> MoodStats:
        """
        Get mood statistics for all user entries.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            
        Returns:
            MoodStats with distribution and averages
        """
        # Mood Distribution
        dist_query = (
            select(DiaryEntry.mood, func.count(DiaryEntry.uuid).label("count"))
            .where(
                and_(
                    DiaryEntry.created_by == user_uuid,
                    DiaryEntry.mood.isnot(None)
                )
            )
            .group_by(DiaryEntry.mood)
        )
        dist_result = await db.execute(dist_query)
        mood_distribution = {mood: count for mood, count in dist_result.all()}
        
        # Average Mood
        avg_query = select(func.avg(DiaryEntry.mood)).where(
            and_(
                DiaryEntry.created_by == user_uuid,
                DiaryEntry.mood.isnot(None)
            )
        )
        average_mood = (await db.execute(avg_query)).scalar_one_or_none()
        
        # Total entries with mood
        total_entries = sum(mood_distribution.values())
        
        return MoodStats(
            average_mood=average_mood,
            mood_distribution=mood_distribution,
            total_entries=total_entries
        )
    
    @staticmethod
    async def get_wellness_stats(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30
    ) -> WellnessStats:
        """
        Get comprehensive wellness analytics including mood, sleep, exercise,
        screen time, energy, stress, and correlations.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            days: Number of days to analyze (default: 30)
            
        Returns:
            WellnessStats with comprehensive analytics
        """
        # Calculate date range
        end_date = datetime.now(NEPAL_TZ).date()
        start_date = end_date - timedelta(days=days - 1)
        
        # Query all diary entries in range with mood
        entries_query = (
            select(DiaryEntry)
            .where(
                and_(
                    DiaryEntry.created_by == user_uuid,
                    func.date(DiaryEntry.date) >= start_date,
                    func.date(DiaryEntry.date) <= end_date
                )
            )
            .order_by(DiaryEntry.date)
        )
        entries_result = await db.execute(entries_query)
        entries = entries_result.scalars().all()
        
        # Query all daily metadata in range using helper method
        metadata_records = await DiaryMetadataService._get_metadata_in_date_range(
            db, user_uuid, start_date, end_date
        )
        
        # Parse metrics from JSON
        daily_data = {}  # {date_str: {mood, metrics_dict}}
        for record in metadata_records:
            date_str = record.date.strftime("%Y-%m-%d")
            try:
                metrics = json.loads(record.default_habits_json) if record.default_habits_json else {}
            except json.JSONDecodeError:
                metrics = {}
            daily_data[date_str] = {"metrics": metrics, "mood": None}
        
        # Add mood data from entries
        for entry in entries:
            date_str = entry.date.strftime("%Y-%m-%d")
            if date_str not in daily_data:
                daily_data[date_str] = {"metrics": {}, "mood": entry.mood}
            else:
                daily_data[date_str]["mood"] = entry.mood
        
        # Initialize aggregators
        mood_values = []
        sleep_values = []
        stress_values = []
        exercise_values = []
        meditation_values = []
        screen_time_values = []
        steps_values = []
        learning_values = []
        outdoor_values = []
        social_values = []
        exercise_days = 0
        meditation_days = 0
        sleep_quality_days = 0
        active_days = 0
        learning_days = 0
        outdoor_days = 0
        social_days = 0
        
        # Trends
        mood_trend = []
        sleep_trend = []
        stress_trend = []
        exercise_trend = []
        meditation_trend = []
        screen_time_trend = []
        steps_trend = []
        learning_trend = []
        outdoor_trend = []
        social_trend = []
        
        # Correlation data
        mood_sleep_pairs = []
        
        # Mood distribution
        mood_distribution = {}
        
        # Process each day in range
        for single_date in (start_date + timedelta(n) for n in range(days)):
            date_str = single_date.strftime("%Y-%m-%d")
            data = daily_data.get(date_str, {"metrics": {}, "mood": None})
            metrics = data["metrics"]
            mood = data["mood"]
            
            # Mood
            if mood is not None:
                mood_values.append(mood)
                mood_distribution[mood] = mood_distribution.get(mood, 0) + 1
                mood_trend.append(WellnessTrendPoint(date=date_str, value=float(mood)))
            else:
                mood_trend.append(WellnessTrendPoint(date=date_str, value=None))
            
            # Default habits tracking (using actual field names)
            sleep = metrics.get("sleep")
            if sleep is not None:
                sleep_values.append(sleep)
                sleep_trend.append(WellnessTrendPoint(date=date_str, value=float(sleep)))
                if sleep >= 7:
                    sleep_quality_days += 1
                # For correlation
                if mood is not None:
                    mood_sleep_pairs.append({"mood": float(mood), "sleep": float(sleep)})
            else:
                sleep_trend.append(WellnessTrendPoint(date=date_str, value=None))
            
            # Stress
            stress = metrics.get("stress")
            if stress is not None:
                stress_values.append(stress)
                stress_trend.append(WellnessTrendPoint(date=date_str, value=float(stress)))
            else:
                stress_trend.append(WellnessTrendPoint(date=date_str, value=None))
            
            # Exercise
            exercise = metrics.get("exercise")
            if exercise is not None:
                exercise_values.append(exercise)
                exercise_trend.append(WellnessTrendPoint(date=date_str, value=float(exercise)))
                if exercise > 0:
                    exercise_days += 1
            else:
                exercise_trend.append(WellnessTrendPoint(date=date_str, value=None))
            
            # Meditation
            meditation = metrics.get("meditation")
            if meditation is not None:
                meditation_values.append(meditation)
                meditation_trend.append(WellnessTrendPoint(date=date_str, value=float(meditation)))
                if meditation > 0:
                    meditation_days += 1
            else:
                meditation_trend.append(WellnessTrendPoint(date=date_str, value=None))
            
            # Screen time
            screen_time = metrics.get("screen_time")
            if screen_time is not None:
                screen_time_values.append(screen_time)
                screen_time_trend.append(WellnessTrendPoint(date=date_str, value=float(screen_time)))
            else:
                screen_time_trend.append(WellnessTrendPoint(date=date_str, value=None))

            # Enhanced wellness metrics
            # Steps
            steps = metrics.get("steps")
            if steps is not None:
                steps_values.append(steps)
                steps_trend.append(WellnessTrendPoint(date=date_str, value=float(steps)))
                if steps >= 8000:  # Daily step goal
                    active_days += 1
            else:
                steps_trend.append(WellnessTrendPoint(date=date_str, value=None))

            # Learning
            learning = metrics.get("learning")
            if learning is not None:
                learning_values.append(learning)
                learning_trend.append(WellnessTrendPoint(date=date_str, value=float(learning)))
                if learning > 0:
                    learning_days += 1
            else:
                learning_trend.append(WellnessTrendPoint(date=date_str, value=None))

            # Outdoor time
            outdoor = metrics.get("outdoor")
            if outdoor is not None:
                outdoor_values.append(outdoor)
                outdoor_trend.append(WellnessTrendPoint(date=date_str, value=float(outdoor)))
                if outdoor >= 1:  # At least 1 hour outdoors
                    outdoor_days += 1
            else:
                outdoor_trend.append(WellnessTrendPoint(date=date_str, value=None))

            # Social time
            social = metrics.get("social")
            if social is not None:
                social_values.append(social)
                social_trend.append(WellnessTrendPoint(date=date_str, value=float(social)))
                if social >= 1:  # At least 1 hour social interaction
                    social_days += 1
            else:
                social_trend.append(WellnessTrendPoint(date=date_str, value=None))

        # Calculate averages with proper floating point handling
        avg_mood = round(sum(mood_values) / len(mood_values), 2) if mood_values else None
        avg_sleep = round(sum(sleep_values) / len(sleep_values), 2) if sleep_values else None
        avg_stress = round(sum(stress_values) / len(stress_values), 2) if stress_values else None
        avg_exercise = round(sum(exercise_values) / len(exercise_values), 2) if exercise_values else None
        avg_meditation = round(sum(meditation_values) / len(meditation_values), 2) if meditation_values else None
        avg_screen_time = round(sum(screen_time_values) / len(screen_time_values), 2) if screen_time_values else None
        avg_steps = round(sum(steps_values) / len(steps_values), 2) if steps_values else None
        avg_learning = round(sum(learning_values) / len(learning_values), 2) if learning_values else None
        avg_outdoor = round(sum(outdoor_values) / len(outdoor_values), 2) if outdoor_values else None
        avg_social = round(sum(social_values) / len(social_values), 2) if social_values else None

        # Calculate frequency metrics for wellness score
        exercise_freq_per_week = (exercise_days / days) * 7 if days > 0 else 0
        steps_freq_per_week = (active_days / days) * 7 if days > 0 else 0
        learning_freq_per_week = (learning_days / days) * 7 if days > 0 else 0
        outdoor_freq_per_week = (outdoor_days / days) * 7 if days > 0 else 0
        social_freq_per_week = (social_days / days) * 7 if days > 0 else 0

        # Get defined habits summary
        defined_habits_summary = await DiaryMetadataService._get_defined_habits_summary(
            db, user_uuid, start_date, end_date
        )
        
        # Calculate correlation coefficient (Pearson r) for mood vs sleep
        correlation_coefficient = None
        if len(mood_sleep_pairs) >= 3:  # Need at least 3 points for correlation
            try:
                moods = [p["mood"] for p in mood_sleep_pairs]
                sleeps = [p["sleep"] for p in mood_sleep_pairs]
                
                n = len(moods)
                sum_mood = sum(moods)
                sum_sleep = sum(sleeps)
                sum_mood_sq = sum(m * m for m in moods)
                sum_sleep_sq = sum(s * s for s in sleeps)
                sum_mood_sleep = sum(m * s for m, s in zip(moods, sleeps, strict=True))
                
                numerator = n * sum_mood_sleep - sum_mood * sum_sleep
                denominator = ((n * sum_mood_sq - sum_mood ** 2) * (n * sum_sleep_sq - sum_sleep ** 2)) ** 0.5
                
                if denominator != 0:
                    correlation_coefficient = numerator / denominator
            except Exception:
                logger.exception("Failed to calculate correlation")
        
        # Calculate enhanced wellness score (0-100)
        score_components = {}
        component_scores = []

        # Physical Health (35%)
        # Sleep component (20%)
        if avg_sleep is not None:
            # 7 hours optimal, penalize both under and over sleep
            if avg_sleep >= 6.5 and avg_sleep <= 7.5:
                sleep_score = 100  # Sweet spot
            elif avg_sleep < 6.5:
                sleep_score = max(0, (avg_sleep / 6.5) * 100)  # Under sleep penalty
            else:  # avg_sleep > 7.5
                sleep_score = max(0, 100 - ((avg_sleep - 7.5) / 2.5) * 50)  # Over sleep penalty
            score_components["sleep"] = round(sleep_score, 1)
            component_scores.append(sleep_score * 0.20)

        # Exercise component (10%) - Combination of frequency + average value
        if exercise_freq_per_week > 0 and avg_exercise is not None:
            freq_score = min(100, (exercise_freq_per_week / 4.0) * 100)  # 4 days/week goal
            value_score = min(100, (avg_exercise / 30.0) * 100)  # 30 minutes optimal
            exercise_score = (freq_score + value_score) / 2
            score_components["exercise"] = round(exercise_score, 1)
            component_scores.append(exercise_score * 0.10)

        # Steps component (5%) - Combination of frequency + average value
        if steps_freq_per_week > 0 and avg_steps is not None:
            freq_score = min(100, (steps_freq_per_week / 5.0) * 100)  # 5 days/week goal
            value_score = min(100, (avg_steps / 10000.0) * 100)  # 10k steps optimal
            steps_score = (freq_score + value_score) / 2
            score_components["steps"] = round(steps_score, 1)
            component_scores.append(steps_score * 0.05)

        # Mental Health (35%)
        # Stress component (15%) - Average value based
        if avg_stress is not None:
            # Lower stress is better: 1-5 scale, 2.5 is optimal
            stress_score = max(0, min(100, ((5 - avg_stress) / 3.5) * 100))  # 5-1=4 range, 2.5 target
            score_components["stress"] = round(stress_score, 1)
            component_scores.append(stress_score * 0.15)

        # Meditation component (10%) - Combination of frequency + average value
        if meditation_freq_per_week := (meditation_days / days) * 7 if days > 0 else 0:
            if avg_meditation is not None:
                freq_score = min(100, (meditation_freq_per_week / 5.0) * 100)  # 5 days/week goal
                value_score = min(100, (avg_meditation / 15.0) * 100)  # 15 minutes optimal
                meditation_score = (freq_score + value_score) / 2
            else:
                meditation_score = (meditation_days / days) * 100
            score_components["meditation"] = round(meditation_score, 1)
            component_scores.append(meditation_score * 0.10)

        # Outdoor component (5%) - Combination of frequency + average value
        if outdoor_freq_per_week > 0 and avg_outdoor is not None:
            freq_score = min(100, (outdoor_freq_per_week / 4.0) * 100)  # 4 days/week goal
            value_score = min(100, (avg_outdoor / 1.0) * 100)  # 1 hour optimal
            outdoor_score = (freq_score + value_score) / 2
            score_components["outdoor"] = round(outdoor_score, 1)
            component_scores.append(outdoor_score * 0.05)

        # Social component (5%) - Combination of frequency + average value
        if social_freq_per_week > 0 and avg_social is not None:
            freq_score = min(100, (social_freq_per_week / 3.0) * 100)  # 3 days/week goal
            value_score = min(100, (avg_social / 1.0) * 100)  # 1 hour optimal
            social_score = (freq_score + value_score) / 2
            score_components["social"] = round(social_score, 1)
            component_scores.append(social_score * 0.05)

        # Productivity (25%)
        # Learning component (15%) - Combination of frequency + average value
        if learning_freq_per_week > 0 and avg_learning is not None:
            freq_score = min(100, (learning_freq_per_week / 5.0) * 100)  # 5 days/week goal
            value_score = min(100, (avg_learning / 60.0) * 100)  # 60 minutes optimal (updated!)
            learning_score = (freq_score + value_score) / 2
            score_components["learning"] = round(learning_score, 1)
            component_scores.append(learning_score * 0.15)

        # Screen time control component (10%)
        if avg_screen_time is not None:
            # 2 hours optimal for perfect score, stricter than before
            screen_score = max(0, 100 - ((avg_screen_time - 2.0) / 4.0) * 100) if avg_screen_time > 2.0 else 100
            score_components["screen_time"] = round(screen_score, 1)
            component_scores.append(screen_score * 0.10)
        
        overall_wellness_score = sum(component_scores) if component_scores else None
        
        # Generate insights
        insights = []
        
        # Positive insights
        if avg_sleep and 6.5 <= avg_sleep <= 7.5:
            insights.append({
                "type": "positive",
                "message": f"Perfect sleep balance! Averaging {avg_sleep:.1f} hours - you're in the optimal zone.",
                "metric": "sleep"
            })

        if exercise_freq_per_week >= 4:
            insights.append({
                "type": "positive",
                "message": f"Great job! You exercised {exercise_freq_per_week:.1f} days per week.",
                "metric": "exercise"
            })

        if meditation_days >= days * 0.5:
            insights.append({
                "type": "positive",
                "message": f"Wonderful mindfulness practice! {meditation_days} meditation days.",
                "metric": "mental"
            })

        # Enhanced habit insights
        if learning_days >= days * 0.6:
            insights.append({
                "type": "positive",
                "message": f"Excellent learning habit! {learning_days} days with personal growth time.",
                "metric": "learning"
            })

        if outdoor_days >= days * 0.4:
            insights.append({
                "type": "positive",
                "message": f"Great outdoor exposure! {outdoor_days} days spent in nature.",
                "metric": "outdoor"
            })

        if social_days >= days * 0.3:
            insights.append({
                "type": "positive",
                "message": f"Good social connection! {social_days} days with meaningful interactions.",
                "metric": "social"
            })

        # Areas for improvement
        if avg_sleep and avg_sleep < 6.5:
            insights.append({
                "type": "negative",
                "message": f"You're averaging only {avg_sleep:.1f} hours of sleep. Aim for 7 hours for optimal recovery.",
                "metric": "sleep"
            })
        elif avg_sleep and avg_sleep > 8.5:
            insights.append({
                "type": "neutral",
                "message": f"You're sleeping {avg_sleep:.1f} hours - consider if oversleeping affects your energy levels.",
                "metric": "sleep"
            })
        
        if avg_screen_time and avg_screen_time > 3:
            insights.append({
                "type": "negative",
                "message": f"High screen time detected ({avg_screen_time:.1f} hrs/day). Aim for ≤2 hours for digital wellness.",
                "metric": "screen_time"
            })
        elif avg_screen_time and avg_screen_time <= 2:
            insights.append({
                "type": "positive",
                "message": f"Excellent digital wellness! Only {avg_screen_time:.1f} hrs/day screen time.",
                "metric": "screen_time"
            })
        
        if exercise_freq_per_week < 2:
            insights.append({
                "type": "neutral",
                "message": f"Only {exercise_freq_per_week:.1f} exercise days per week. Try to increase activity.",
                "metric": "exercise"
            })
        
        # Correlation insights
        if correlation_coefficient is not None:
            if correlation_coefficient > 0.5:
                insights.append({
                    "type": "neutral",
                    "message": f"Strong positive link: Better sleep improves your mood (r={correlation_coefficient:.2f}).",
                    "metric": "correlation"
                })
            elif correlation_coefficient < -0.5:
                insights.append({
                    "type": "neutral",
                    "message": f"Inverse relationship: More sleep correlates with lower mood (r={correlation_coefficient:.2f}).",
                    "metric": "correlation"
                })
        
        # Process financial data
        financial_trend = []
        total_income = 0.0
        total_expense = 0.0
        cumulative_savings = 0.0
        
        for date_str, data in sorted(daily_data.items()):
            metrics = data.get("metrics", {})
            daily_income = float(metrics.get("daily_income", 0) or 0)
            daily_expense = float(metrics.get("daily_expense", 0) or 0)
            daily_savings = daily_income - daily_expense
            cumulative_savings += daily_savings
            
            total_income += daily_income
            total_expense += daily_expense
            
            financial_trend.append({
                "date": date_str,
                "income": daily_income,
                "expense": daily_expense,
                "savings": daily_savings,
                "cumulative_savings": cumulative_savings
            })
        
        net_savings = total_income - total_expense
        
        # Calculate daily averages using multiple time periods
        # Always calculate 30-day, 3-month, and 6-month averages for comparison
        thirty_days_ago = datetime.now(NEPAL_TZ).date() - timedelta(days=29)  # 30 days total
        three_months_ago = datetime.now(NEPAL_TZ).date() - timedelta(days=89)  # ~3 months
        six_months_ago = datetime.now(NEPAL_TZ).date() - timedelta(days=179)  # ~6 months
        
        # 30-day averages (always calculated)
        recent_metadata_30d = await DiaryMetadataService._get_metadata_in_date_range(
            db, user_uuid, thirty_days_ago, end_date
        )
        recent_income_30d = sum(record.daily_income or 0 for record in recent_metadata_30d)
        recent_expense_30d = sum(record.daily_expense or 0 for record in recent_metadata_30d)
        avg_daily_income = recent_income_30d / 30.0 if recent_income_30d > 0 else None
        avg_daily_expense = recent_expense_30d / 30.0 if recent_expense_30d > 0 else None
        
        # 3-month averages (only if we have enough data)
        avg_daily_income_3m = None
        avg_daily_expense_3m = None
        if days >= 90:  # Only calculate if requested period is 3+ months
            recent_metadata_3m = await DiaryMetadataService._get_metadata_in_date_range(
                db, user_uuid, three_months_ago, end_date
            )
            recent_income_3m = sum(record.daily_income or 0 for record in recent_metadata_3m)
            recent_expense_3m = sum(record.daily_expense or 0 for record in recent_metadata_3m)
            avg_daily_income_3m = recent_income_3m / 90.0 if recent_income_3m > 0 else None
            avg_daily_expense_3m = recent_expense_3m / 90.0 if recent_expense_3m > 0 else None
        
        # 6-month averages (only if we have enough data)
        avg_daily_income_6m = None
        avg_daily_expense_6m = None
        if days >= 180:  # Only calculate if requested period is 6+ months
            recent_metadata_6m = await DiaryMetadataService._get_metadata_in_date_range(
                db, user_uuid, six_months_ago, end_date
            )
            recent_income_6m = sum(record.daily_income or 0 for record in recent_metadata_6m)
            recent_expense_6m = sum(record.daily_expense or 0 for record in recent_metadata_6m)
            avg_daily_income_6m = recent_income_6m / 180.0 if recent_income_6m > 0 else None
            avg_daily_expense_6m = recent_expense_6m / 180.0 if recent_expense_6m > 0 else None
        
        # Add financial insights
        if net_savings > 0:
            insights.append({
                "type": "positive",
                "message": f"Great financial management! Net savings of NPR {net_savings:,.0f} over {days} days.",
                "metric": "financial"
            })
        elif net_savings < 0:
            insights.append({
                "type": "negative",
                "message": f"Spending exceeded income by NPR {abs(net_savings):,.0f}. Consider reviewing expenses.",
                "metric": "financial"
            })
        
        if avg_daily_income and avg_daily_income > 0:
            savings_rate = (net_savings / total_income) * 100 if total_income > 0 else 0
            if savings_rate >= 20:
                insights.append({
                    "type": "positive",
                    "message": f"Excellent savings rate of {savings_rate:.1f}%!",
                    "metric": "financial"
                })
            elif savings_rate < 10:
                insights.append({
                    "type": "neutral",
                    "message": f"Savings rate is {savings_rate:.1f}%. Consider increasing it to 20%+.",
                    "metric": "financial"
                })
        
        # Long-term trend insights
        if avg_daily_income and avg_daily_income_3m and avg_daily_income_6m:
            if avg_daily_income > avg_daily_income_3m > avg_daily_income_6m:
                insights.append({
                    "type": "positive",
                    "message": "Income is trending upward over the past 6 months! Great financial growth.",
                    "metric": "financial_trend"
                })
            elif avg_daily_income < avg_daily_income_3m < avg_daily_income_6m:
                insights.append({
                    "type": "negative",
                    "message": "Income has been declining over the past 6 months. Consider reviewing income sources.",
                    "metric": "financial_trend"
                })
        
        if avg_daily_expense and avg_daily_expense_3m and avg_daily_expense_6m:
            if avg_daily_expense < avg_daily_expense_3m < avg_daily_expense_6m:
                insights.append({
                    "type": "positive",
                    "message": "Expenses are trending downward over the past 6 months! Great cost management.",
                    "metric": "financial_trend"
                })
            elif avg_daily_expense > avg_daily_expense_3m > avg_daily_expense_6m:
                insights.append({
                    "type": "negative",
                    "message": "Expenses have been increasing over the past 6 months. Consider reviewing spending habits.",
                    "metric": "financial_trend"
                })
        
        # Days with data
        days_with_data = len([d for d in daily_data.values() if d["metrics"] or d["mood"] is not None])
        
        return WellnessStats(
            period_start=start_date.strftime("%Y-%m-%d"),
            period_end=end_date.strftime("%Y-%m-%d"),
            total_days=days,
            days_with_data=days_with_data,
            average_mood=round(avg_mood, 2) if avg_mood else None,
            mood_trend=mood_trend,
            mood_distribution=mood_distribution,
            average_sleep=round(avg_sleep, 1) if avg_sleep else None,
            sleep_trend=sleep_trend,
            average_stress=round(avg_stress, 1) if avg_stress else None,
            stress_trend=stress_trend,
            average_exercise=round(avg_exercise, 1) if avg_exercise else None,
            exercise_trend=exercise_trend,
            average_meditation=round(avg_meditation, 1) if avg_meditation else None,
            meditation_trend=meditation_trend,
            average_screen_time=round(avg_screen_time, 1) if avg_screen_time else None,
            screen_time_trend=screen_time_trend,
            # Enhanced wellness metrics
            average_steps=round(avg_steps, 1) if avg_steps else None,
            steps_trend=steps_trend,
            average_learning=round(avg_learning, 1) if avg_learning else None,
            learning_trend=learning_trend,
            average_outdoor=round(avg_outdoor, 1) if avg_outdoor else None,
            outdoor_trend=outdoor_trend,
            average_social=round(avg_social, 1) if avg_social else None,
            social_trend=social_trend,
            # Wellness score and components
            overall_wellness_score=round(sum(component_scores), 1) if component_scores else None,
            score_components=score_components,
            financial_trend=financial_trend,
            total_income=round(total_income, 2),
            total_expense=round(total_expense, 2),
            net_savings=round(net_savings, 2),
            average_daily_income=round(avg_daily_income, 2) if avg_daily_income else None,
            average_daily_expense=round(avg_daily_expense, 2) if avg_daily_expense else None,
            average_daily_income_3m=round(avg_daily_income_3m, 2) if avg_daily_income_3m else None,
            average_daily_expense_3m=round(avg_daily_expense_3m, 2) if avg_daily_expense_3m else None,
            average_daily_income_6m=round(avg_daily_income_6m, 2) if avg_daily_income_6m else None,
            average_daily_expense_6m=round(avg_daily_expense_6m, 2) if avg_daily_expense_6m else None,
            defined_habits_summary=defined_habits_summary,
            insights=insights
        )

    @staticmethod
    async def get_wellness_score_analytics(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get wellness score analytics for different time periods.

        Args:
            db: Database session
            user_uuid: User's UUID
            days: Number of days for primary analysis (default: 30)

        Returns:
            Dict with wellness scores for different time periods
        """
        from datetime import date
        end_date = datetime.now(NEPAL_TZ).date()

        # Define time periods
        time_periods = {
            "day": {"days": 1, "start_date": end_date},
            "week": {"days": 7, "start_date": end_date - timedelta(days=6)},
            "month": {"days": days, "start_date": end_date - timedelta(days=days-1)},
            "3_months": {"days": 90, "start_date": end_date - timedelta(days=89)},
            "6_months": {"days": 180, "start_date": end_date - timedelta(days=179)},
            "1_year": {"days": 365, "start_date": end_date - timedelta(days=364)}  # Optimistic yearly view! 🎯
        }

        wellness_scores = {}

        for period_name, period_config in time_periods.items():
            try:
                # Get wellness stats for this period
                wellness_stats = await DiaryMetadataService.get_wellness_stats(
                    db, user_uuid, period_config["days"]
                )

                wellness_scores[period_name] = {
                    "score": wellness_stats.overall_wellness_score,
                    "score_components": wellness_stats.score_components,
                    "period_start": wellness_stats.period_start,
                    "period_end": wellness_stats.period_end,
                    "total_days": wellness_stats.total_days,
                    "days_with_data": wellness_stats.days_with_data
                }

            except Exception as e:
                logger.exception(f"Error calculating wellness score for {period_name}: {e}")
                wellness_scores[period_name] = {
                    "score": None,
                    "score_components": {},
                    "period_start": period_config["start_date"].strftime("%Y-%m-%d"),
                    "period_end": end_date.strftime("%Y-%m-%d"),
                    "total_days": period_config["days"],
                    "days_with_data": 0,
                    "error": "Failed to calculate"
                }

        return {
            "current_scores": wellness_scores,
            "trend_analysis": {
                "weekly_vs_daily": None,
                "monthly_vs_weekly": None,
                "quarterly_vs_monthly": None,
                "half_yearly_vs_quarterly": None
            },
            "insights": DiaryMetadataService._generate_score_insights(wellness_scores)
        }

    @staticmethod
    def _generate_score_insights(wellness_scores: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate insights based on wellness score trends across time periods"""
        insights = []

        try:
            day_score = wellness_scores.get("day", {}).get("score")
            week_score = wellness_scores.get("week", {}).get("score")
            month_score = wellness_scores.get("month", {}).get("score")
            quarterly_score = wellness_scores.get("3_months", {}).get("score")
            half_yearly_score = wellness_scores.get("6_months", {}).get("score")
            yearly_score = wellness_scores.get("1_year", {}).get("score")

            # Trend insights
            if day_score and week_score:
                if week_score > day_score + 5:
                    insights.append({
                        "type": "positive",
                        "message": f"Great improvement! Weekly average ({week_score:.1f}) is higher than today ({day_score:.1f}).",
                        "metric": "trend"
                    })
                elif week_score < day_score - 5:
                    insights.append({
                        "type": "neutral",
                        "message": f"Keep consistent! Today's score ({day_score:.1f}) is higher than your weekly average ({week_score:.1f}).",
                        "metric": "trend"
                    })

            # Long-term trend insights
            if month_score and quarterly_score:
                if quarterly_score > month_score + 10:
                    insights.append({
                        "type": "positive",
                        "message": f"Excellent long-term progress! 3-month average ({quarterly_score:.1f}) is much higher than current month ({month_score:.1f}).",
                        "metric": "long_term_trend"
                    })

            # Yearly comparison (for the truly dedicated!)
            if yearly_score and quarterly_score:
                if yearly_score > quarterly_score + 5:
                    insights.append({
                        "type": "positive",
                        "message": f"Incredible consistency! Yearly average ({yearly_score:.1f}) shows you're maintaining excellence over time. 🏆",
                        "metric": "yearly_consistency"
                    })
                elif yearly_score and quarterly_score > yearly_score + 15:
                    insights.append({
                        "type": "positive",
                        "message": f"Amazing growth trajectory! Current quarter ({quarterly_score:.1f}) vs yearly average ({yearly_score:.1f}) shows major improvement! 🚀",
                        "metric": "breakthrough_growth"
                    })

            # Score level insights
            latest_score = day_score or week_score or month_score
            if latest_score:
                if latest_score >= 85:
                    insights.append({
                        "type": "positive",
                        "message": f"Outstanding wellness score of {latest_score:.1f}! You're in the top performance zone.",
                        "metric": "achievement"
                    })
                elif latest_score >= 70:
                    insights.append({
                        "type": "positive",
                        "message": f"Good wellness score of {latest_score:.1f}! You're building healthy habits consistently.",
                        "metric": "achievement"
                    })
                elif latest_score < 50:
                    insights.append({
                        "type": "neutral",
                        "message": f"Current wellness score is {latest_score:.1f}. Focus on one habit at a time to see improvement.",
                        "metric": "improvement_focus"
                    })

        except Exception as e:
            logger.exception(f"Error generating wellness score insights: {e}")

        return insights

    @staticmethod
    async def _get_defined_habits_summary(
        db: AsyncSession,
        user_uuid: str,
        start_date: date,
        end_date: date
    ) -> Dict[str, Any]:
        """Get summary of defined habits for the period"""
        try:
            from app.services.habit_config_service import habit_config_service
            
            # Get user's defined habits config
            defined_habits = await habit_config_service.get_config(db, user_uuid, "defined_habits")
            if not defined_habits:
                return {}
            
            # Get metadata records for the period
            metadata_records = await DiaryMetadataService._get_metadata_in_date_range(
                db, user_uuid, start_date, end_date
            )
            
            # Aggregate defined habits data
            habits_summary = {}
            for habit in defined_habits:
                habit_id = habit.get("habitId")
                habit_name = habit.get("name", habit_id)
                if not habit_id:
                    continue
                
                values = []
                days_tracked = 0
                
                for record in metadata_records:
                    if record.defined_habits_json:
                        try:
                            habits_data = json.loads(record.defined_habits_json)
                            habit_value = habits_data.get("habits", {}).get(habit_id)
                            if habit_value is not None:
                                values.append(habit_value)
                                days_tracked += 1
                        except json.JSONDecodeError:
                            continue
                
                if values:
                    habits_summary[habit_id] = {
                        "name": habit_name,
                        "unit": habit.get("unit", ""),
                        "average": round(sum(values) / len(values), 2),
                        "total": sum(values),
                        "days_tracked": days_tracked,
                        "goal_type": habit.get("goalType"),
                        "target_quantity": habit.get("targetQuantity")
                    }
            
            return habits_summary
            
        except Exception:
            logger.exception("Error getting defined habits summary")
            return {}
    
    @staticmethod
    async def _get_wellness_data_for_period(
        db: AsyncSession,
        user_uuid: str,
        start_date: date,
        end_date: date
    ) -> Dict[str, Any]:
        """Get wellness data for a specific period"""
        try:
            # Get metadata records for the period
            metadata_records = await DiaryMetadataService._get_metadata_in_date_range(
                db, user_uuid, start_date, end_date
            )
            
            # Get diary entries for mood data
            entries_query = (
                select(DiaryEntry)
                .where(
                    and_(
                        DiaryEntry.created_by == user_uuid,
                        func.date(DiaryEntry.date) >= start_date,
                        func.date(DiaryEntry.date) <= end_date
                    )
                )
                .order_by(DiaryEntry.date)
            )
            entries_result = await db.execute(entries_query)
            entries = entries_result.scalars().all()
            
            # Aggregate wellness data
            mood_values = []
            sleep_values = []
            stress_values = []
            exercise_values = []
            meditation_values = []
            screen_time_values = []
            
            # Process each day
            for single_date in (start_date + timedelta(n) for n in range((end_date - start_date).days + 1)):
                date_str = single_date.strftime("%Y-%m-%d")
                
                # Find mood for this date
                mood = None
                for entry in entries:
                    if entry.date.strftime("%Y-%m-%d") == date_str:
                        mood = entry.mood
                        break
                
                if mood is not None:
                    mood_values.append(mood)
                
                # Find metrics for this date
                metrics = {}
                for record in metadata_records:
                    if record.date.strftime("%Y-%m-%d") == date_str:
                        try:
                            metrics = json.loads(record.default_habits_json) if record.default_habits_json else {}
                        except json.JSONDecodeError:
                            metrics = {}
                        break
                
                # Extract default habits
                for habit_name in ["sleep", "stress", "exercise", "meditation", "screen_time"]:
                    value = metrics.get(habit_name)
                    if value is not None:
                        if habit_name == "sleep":
                            sleep_values.append(value)
                        elif habit_name == "stress":
                            stress_values.append(value)
                        elif habit_name == "exercise":
                            exercise_values.append(value)
                        elif habit_name == "meditation":
                            meditation_values.append(value)
                        elif habit_name == "screen_time":
                            screen_time_values.append(value)
            
            # Calculate 30-day daily averages for financial data
            thirty_days_ago = datetime.now(NEPAL_TZ).date() - timedelta(days=29)  # 30 days total
            recent_metadata = await DiaryMetadataService._get_metadata_in_date_range(
                db, user_uuid, thirty_days_ago, end_date
            )
            
            recent_income = sum(record.daily_income or 0 for record in recent_metadata)
            recent_expense = sum(record.daily_expense or 0 for record in recent_metadata)
            
            avg_daily_income = recent_income / 30.0 if recent_income > 0 else None
            avg_daily_expense = recent_expense / 30.0 if recent_expense > 0 else None
            
            # Calculate averages
            return {
                "average_mood": round(sum(mood_values) / len(mood_values), 2) if mood_values else None,
                "average_sleep": round(sum(sleep_values) / len(sleep_values), 2) if sleep_values else None,
                "average_stress": round(sum(stress_values) / len(stress_values), 2) if stress_values else None,
                "average_exercise": round(sum(exercise_values) / len(exercise_values), 2) if exercise_values else None,
                "average_meditation": round(sum(meditation_values) / len(meditation_values), 2) if meditation_values else None,
                "average_screen_time": round(sum(screen_time_values) / len(screen_time_values), 2) if screen_time_values else None,
                "average_daily_income": round(avg_daily_income, 2) if avg_daily_income else None,
                "average_daily_expense": round(avg_daily_expense, 2) if avg_daily_expense else None,
            }
            
        except Exception:
            logger.exception("Error getting wellness data for period")
            return {}
    
    @staticmethod
    async def get_weekly_highlights(
        db: AsyncSession,
        user_uuid: str
    ) -> WeeklyHighlights:
        """
        Get weekly highlights summary across all modules with caching.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            
        Returns:
            WeeklyHighlights with activity summary
        """
        # Check cache
        cache_key = f"weekly:{user_uuid}"
        cached = diary_cache.get(cache_key)
        if cached is not None:
            return cached
        
        end_date = datetime.now(NEPAL_TZ).date()
        start_date = end_date - timedelta(days=6)
        
        # Aggregate counts across modules
        notes_created = await db.scalar(
            select(func.count(Note.uuid)).where(
                and_(
                    Note.created_by == user_uuid,
                    func.date(Note.created_at) >= start_date,
                    func.date(Note.created_at) <= end_date,
                )
            )
        )
        
        documents_uploaded = await db.scalar(
            select(func.count(Document.uuid)).where(
                and_(
                    Document.created_by == user_uuid,
                    func.date(Document.created_at) >= start_date,
                    func.date(Document.created_at) <= end_date,
                )
            )
        )
        
        todos_completed = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == user_uuid,
                    Todo.completed_at.isnot(None),
                    func.date(Todo.completed_at) >= start_date,
                    func.date(Todo.completed_at) <= end_date,
                )
            )
        )
        
        diary_entries = await db.scalar(
            select(func.count(DiaryEntry.uuid)).where(
                and_(
                    DiaryEntry.created_by == user_uuid,
                    func.date(DiaryEntry.date) >= start_date,
                    func.date(DiaryEntry.date) <= end_date,
                )
            )
        )
        
        archive_items_added = await db.scalar(
            select(func.count(ArchiveItem.uuid)).where(
                and_(
                    ArchiveItem.created_by == user_uuid,
                    func.date(ArchiveItem.created_at) >= start_date,
                    func.date(ArchiveItem.created_at) <= end_date,
                )
            )
        )
        
        projects_created = await db.scalar(
            select(func.count(Project.uuid)).where(
                and_(
                    Project.created_by == user_uuid,
                    func.date(Project.created_at) >= start_date,
                    func.date(Project.created_at) <= end_date,
                )
            )
        )
        
        projects_completed = await db.scalar(
            select(func.count(Project.uuid)).where(
                and_(
                    Project.created_by == user_uuid,
                    Project.status == ProjectStatus.COMPLETED,
                    func.date(Project.updated_at) >= start_date,
                    func.date(Project.updated_at) <= end_date,
                )
            )
        )
        
        # Finance sums from daily metadata using helper method
        metadata_records = await DiaryMetadataService._get_metadata_in_date_range(
            db, user_uuid, start_date, end_date
        )
        
        total_income = 0.0
        total_expense = 0.0
        for record in metadata_records:
            total_income += float(record.daily_income or 0)
            total_expense += float(record.daily_expense or 0)
        
        # Get wellness data for the week
        wellness_data = await DiaryMetadataService._get_wellness_data_for_period(
            db, user_uuid, start_date, end_date
        )
        
        # Get defined habits summary
        defined_habits_summary = await DiaryMetadataService._get_defined_habits_summary(
            db, user_uuid, start_date, end_date
        )
        
        highlights = WeeklyHighlights(
            period_start=start_date.strftime("%Y-%m-%d"),
            period_end=end_date.strftime("%Y-%m-%d"),
            notes_created=int(notes_created or 0),
            documents_uploaded=int(documents_uploaded or 0),
            todos_completed=int(todos_completed or 0),
            diary_entries=int(diary_entries or 0),
            archive_items_added=int(archive_items_added or 0),
            projects_created=int(projects_created or 0),
            projects_completed=int(projects_completed or 0),
            total_income=round(total_income, 2),
            total_expense=round(total_expense, 2),
            net_savings=round(total_income - total_expense, 2),
            **wellness_data,
            defined_habits_summary=defined_habits_summary
        )
        
        # Cache the result
        diary_cache.set(cache_key, highlights)
        
        return highlights
    
    @staticmethod
    async def get_daily_metadata(
        db: AsyncSession,
        user_uuid: str,
        target_date: str
    ) -> DiaryDailyMetadataResponse:
        """
        Get daily metadata for a specific date.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            target_date: Date string in YYYY-MM-DD format
            
        Returns:
            DiaryDailyMetadataResponse
            
        Raises:
            ValueError: If date format is invalid
            HTTPException: If no metadata found
        """
        try:
            date_obj = datetime.strptime(target_date, "%Y-%m-%d").date()
        except ValueError as err:
            raise ValueError("Invalid date format. Expected YYYY-MM-DD") from err
        
        result = await db.execute(
            select(DiaryDailyMetadata)
            .where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    func.date(DiaryDailyMetadata.date) == date_obj,
                )
            )
        )
        snapshot = result.scalar_one_or_none()
        if not snapshot:
            raise ValueError("No daily metadata found for this date")
        
        return DiaryMetadataService.format_daily_metadata(snapshot)
    
    @staticmethod
    async def update_daily_metadata(
        db: AsyncSession,
        user_uuid: str,
        target_date: str,
        payload: DiaryDailyMetadataUpdate
    ) -> DiaryDailyMetadataResponse:
        """
        Update daily metadata for a specific date.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            target_date: Date string in YYYY-MM-DD format
            payload: Update payload
            
        Returns:
            Updated DiaryDailyMetadataResponse
            
        Raises:
            ValueError: If date format is invalid
        """
        try:
            date_obj = datetime.strptime(target_date, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Invalid date format. Expected YYYY-MM-DD")
        
        # Get or create metadata
        snapshot = await DiaryMetadataService.get_or_create_daily_metadata(
            db=db,
            user_uuid=user_uuid,
            entry_date=date_obj,
            nepali_date=payload.nepali_date,
            metrics=payload.metrics or {},
            daily_income=payload.daily_income,
            daily_expense=payload.daily_expense,
            is_office_day=payload.is_office_day
        )
        
        await db.commit()
        await db.refresh(snapshot)
        
        return DiaryMetadataService.format_daily_metadata(snapshot)

    # ==================== HABIT TRACKING METHODS ====================

    @staticmethod
    async def update_daily_habits(
        db: AsyncSession,
        user_uuid: str,
        target_date: date,
        habits_data: dict,
        units: Optional[dict] = None
    ) -> dict:
        """
        Update habits for specific day with automatic streak calculation.

        Args:
            db: Database session
            user_uuid: User's UUID
            target_date: Date for habit tracking
            habits_data: Dictionary of habit values
            units: Dictionary of unit definitions for habits

        Returns:
            Updated habits data with calculated streaks
        """
        try:
            # Get or create metadata record
            snapshot = await DiaryMetadataService.get_or_create_daily_metadata(
                db=db,
                user_uuid=user_uuid,
                entry_date=target_date
            )

            # Get previous day's streaks for calculation
            previous_date = target_date - timedelta(days=1)
            previous_snapshot = await DiaryMetadataService._get_model_by_date(
                db=db, user_uuid=user_uuid, day=previous_date
            )

            # Parse previous habits data
            previous_habits = {}
            if previous_snapshot and previous_snapshot.defined_habits_json:
                try:
                    previous_habits = json.loads(previous_snapshot.defined_habits_json)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid defined_habits_json for user {user_uuid} on {previous_date}")
                    previous_habits = {}

            previous_streaks = previous_habits.get("streaks", {})

            # Calculate new streaks
            new_streaks = {}
            for habit_key, value in habits_data.items():
                if value != 0:  # Non-zero value continues or starts streak
                    new_streaks[habit_key] = previous_streaks.get(habit_key, 0) + 1
                else:  # Zero value resets streak
                    new_streaks[habit_key] = 0

            # Update first tracked dates for new habits
            current_habits = {}
            if snapshot.defined_habits_json:
                try:
                    current_habits = json.loads(snapshot.defined_habits_json)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid defined_habits_json for user {user_uuid} on {target_date}")
                    current_habits = {}

            first_tracked = current_habits.get("first_tracked", {})
            for habit_key in habits_data:
                if habit_key not in first_tracked:
                    first_tracked[habit_key] = target_date.isoformat()

            # Build updated defined_habits_json
            updated_habits_json = {
                "habits": habits_data,
                "streaks": new_streaks,
                "units": units or current_habits.get("units", {}),
                "first_tracked": first_tracked,
                "last_updated": datetime.now(NEPAL_TZ).isoformat()
            }

            # Update record
            snapshot.defined_habits_json = json.dumps(updated_habits_json)
            await db.commit()
            await db.refresh(snapshot)

            return updated_habits_json

        except Exception:
            logger.exception("Error updating habits for user %s on %s", user_uuid, target_date)
            await db.rollback()
            raise

    
    @staticmethod
    async def get_habit_analytics(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30
    ) -> dict:
        """
        Get comprehensive analytics for all tracked habits.

        Args:
            db: Database session
            user_uuid: User's UUID
            days: Number of days to analyze

        Returns:
            Dictionary with analytics for each habit
        """
        try:
            # Get recent daily metadata records
            end_date = datetime.now(NEPAL_TZ).date()
            start_date = end_date - timedelta(days=days-1)

            records = await DiaryMetadataService._get_metadata_in_date_range(
                db, user_uuid, start_date, end_date
            )

            # Get all unique habit keys
            all_habits = set()
            for record in records:
                if record.defined_habits_json:
                    try:
                        habits = json.loads(record.defined_habits_json).get("habits", {})
                        all_habits.update(habits.keys())
                    except json.JSONDecodeError:
                        continue

            # Calculate analytics for each habit
            analytics = {}
            for habit in all_habits:
                analytics[habit] = await DiaryMetadataService._calculate_single_habit_analytics(
                    db, user_uuid, habit, days
                )

            return analytics

        except Exception:
            logger.exception("Error getting habit analytics for user %s", user_uuid)
            return {}

    @staticmethod
    async def _calculate_single_habit_analytics(
        db: AsyncSession,
        user_uuid: str,
        habit_key: str,
        days: int
    ) -> dict:
        """Calculate analytics for a single habit"""
        end_date = datetime.now(NEPAL_TZ).date()
        start_date = end_date - timedelta(days=days-1)

        records = await DiaryMetadataService._get_metadata_in_date_range(
            db, user_uuid, start_date, end_date
        )

        # Calculate metrics
        current_streak = 0
        best_streak = 0
        total_tracked = 0
        total_value = 0
        non_zero_days = 0

        for record in records:
            if record.defined_habits_json:
                try:
                    habits = json.loads(record.defined_habits_json)
                    habit_value = habits.get("habits", {}).get(habit_key, 0)
                    streaks = habits.get("streaks", {}).get(habit_key, 0)

                    if habit_value is not None:
                        total_tracked += 1
                        total_value += habit_value

                        if habit_value != 0:
                            non_zero_days += 1

                    if streaks > best_streak:
                        best_streak = streaks

                except json.JSONDecodeError:
                    continue

        # Current streak (from today's record)
        today_metadata = await DiaryMetadataService._get_model_by_date(
            db, user_uuid, end_date
        )
        if today_metadata and today_metadata.defined_habits_json:
            try:
                today_habits = json.loads(today_metadata.defined_habits_json)
                current_streak = today_habits.get("streaks", {}).get(habit_key, 0)
            except json.JSONDecodeError:
                pass

        # Calculate trend (simple comparison of first half vs second half)
        trend = "stable"
        if total_tracked >= 10:
            mid_point = total_tracked // 2
            sorted_records = sorted(records, key=lambda x: x.date)

            first_half_avg = 0
            second_half_avg = 0
            first_count = 0
            second_count = 0

            for i, record in enumerate(sorted_records):
                if record.defined_habits_json:
                    try:
                        habits = json.loads(record.defined_habits_json)
                        value = habits.get("habits", {}).get(habit_key, 0)

                        if i < mid_point:
                            first_half_avg += value
                            first_count += 1
                        else:
                            second_half_avg += value
                            second_count += 1
                    except json.JSONDecodeError:
                        continue

            if first_count > 0 and second_count > 0:
                first_avg = first_half_avg / first_count
                second_avg = second_half_avg / second_count

                if second_avg > first_avg * 1.1:
                    trend = "improving"
                elif second_avg < first_avg * 0.9:
                    trend = "declining"

        return {
            "current_streak": current_streak,
            "best_streak": best_streak,
            "completion_rate": non_zero_days / total_tracked if total_tracked > 0 else 0,
            "total_days_tracked": total_tracked,
            "average_value": total_value / non_zero_days if non_zero_days > 0 else 0,
            "trend": trend
        }

    @staticmethod
    async def get_active_habit_keys(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30
    ) -> list:
        """
        Get list of all habit keys user has tracked recently.

        Args:
            db: Database session
            user_uuid: User's UUID
            days: Number of days to look back

        Returns:
            List of habit keys
        """
        try:
            end_date = datetime.now(NEPAL_TZ).date()
            start_date = end_date - timedelta(days=days-1)

            records = await DiaryMetadataService._get_metadata_in_date_range(
                db, user_uuid, start_date, end_date
            )

            all_habits = set()
            for record in records:
                if record.defined_habits_json:
                    try:
                        habits = json.loads(record.defined_habits_json).get("habits", {})
                        all_habits.update(habits.keys())
                    except json.JSONDecodeError:
                        continue

            return sorted(list(all_habits))

        except Exception:
            logger.exception("Error getting active habits for user %s", user_uuid)
            return []

    @staticmethod
    async def get_habit_insights(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30
    ) -> list:
        """
        Generate personalized insights based on habit patterns.

        Args:
            db: Database session
            user_uuid: User's UUID
            days: Number of days to analyze

        Returns:
            List of insight objects
        """
        try:
            analytics = await DiaryMetadataService.get_habit_analytics(db, user_uuid, days)
            insights = []

            for habit, data in analytics.items():
                # Streak achievements
                if data["current_streak"] >= 7:
                    insights.append({
                        "type": "achievement",
                        "message": f"🔥 {data['current_streak']} day streak for {habit}!",
                        "habit": habit,
                        "severity": "success"
                    })
                elif data["current_streak"] >= 3:
                    insights.append({
                        "type": "achievement",
                        "message": f"👍 {data['current_streak']} day streak for {habit}!",
                        "habit": habit,
                        "severity": "info"
                    })

                # Streak warnings
                if data["current_streak"] == 0 and data["best_streak"] >= 7:
                    insights.append({
                        "type": "warning",
                        "message": f"💔 Streak broken for {habit}. Best was {data['best_streak']} days!",
                        "habit": habit,
                        "severity": "warning"
                    })

                # Completion rate insights
                if data["completion_rate"] >= 0.8:
                    insights.append({
                        "type": "positive",
                        "message": f"📈 Great consistency with {habit}! {data['completion_rate']*100:.0f}% completion rate",
                        "habit": habit,
                        "severity": "success"
                    })
                elif data["completion_rate"] < 0.3 and data["total_days_tracked"] >= 7:
                    insights.append({
                        "type": "suggestion",
                        "message": f"💪 Try setting a smaller goal for {habit} to build momentum",
                        "habit": habit,
                        "severity": "info"
                    })

                # Trend insights
                if data["trend"] == "improving":
                    insights.append({
                        "type": "positive",
                        "message": f"📊 {habit} is trending upward! Keep up the great work!",
                        "habit": habit,
                        "severity": "success"
                    })
                elif data["trend"] == "declining":
                    insights.append({
                        "type": "warning",
                        "message": f"📉 {habit} is trending down. Let's get back on track!",
                        "habit": habit,
                        "severity": "warning"
                    })

            return insights

        except Exception:
            logger.exception("Error generating habit insights for user %s", user_uuid)
            return []

    @staticmethod
    async def get_today_habits(
        db: AsyncSession,
        user_uuid: str,
        target_date: date = None
    ) -> dict:
        """
        Get today's habits data.

        Args:
            db: Database session
            user_uuid: User's UUID
            target_date: Date to get habits for (defaults to today)

        Returns:
            Habits data dictionary
        """
        if target_date is None:
            target_date = datetime.now(NEPAL_TZ).date()

        try:
            snapshot = await DiaryMetadataService._get_model_by_date(db, user_uuid, target_date)
            if snapshot and snapshot.defined_habits_json:
                return json.loads(snapshot.defined_habits_json)
            else:
                return {
                    "habits": {},
                    "streaks": {},
                    "units": {},
                    "first_tracked": {},
                    "last_updated": None
                }

        except Exception:
            logger.exception("Error getting today's habits for user %s", user_uuid)
            return {
                "habits": {},
                "streaks": {},
                "units": {},
                "first_tracked": {},
                "last_updated": None
            }


    # DRY: Unified update method for BOTH types
    @staticmethod
    async def update_daily_tracking(
        db: AsyncSession,
        user_uuid: str,
        target_date: date,
        config_type: Literal["default_habits", "defined_habits"],
        column_name: str,  # "default_habits_json" or "defined_habits_json"
        tracking_data: dict,
        calculate_streaks: bool = False
    ) -> dict:
        """
        Unified method for updating both default and defined habits.
        Works for both types - DRY principle!
        """
        from app.services.habit_config_service import habit_config_service
        
        snapshot = await DiaryMetadataService.get_or_create_daily_metadata(
            db=db, user_uuid=user_uuid, entry_date=target_date
        )
        
        # Get config for validation
        config = await habit_config_service.get_config(db, user_uuid, config_type)
        
        # For defined habits, filter by isActive
        if config_type == "defined_habits":
            valid_items = {item["habitId"]: item for item in config if item.get("isActive", False)}
        else:
            valid_items = {item["habitId"]: item for item in config}
        
        # Build daily log
        daily_log = [
            {"habitId": habit_id, "loggedQuantity": quantity}
            for habit_id, quantity in tracking_data.items()
            if habit_id in valid_items
        ]
        
        # Save to appropriate column
        setattr(snapshot, column_name, json.dumps(daily_log))
        await db.commit()
        await db.refresh(snapshot)
        
        result = {"data": tracking_data}
        
        # Calculate streaks only for defined_habits
        if calculate_streaks and config_type == "defined_habits":
            streaks = {}
            for habit_id in tracking_data.keys():
                if habit_id in valid_items:
                    streak = await DiaryMetadataService.calculate_habit_streak(
                        db, user_uuid, habit_id, target_date, config_type, column_name
                    )
                    streaks[habit_id] = streak
            result["streaks"] = streaks
        
        return result

    # DRY: Unified streak calculation for both types
    @staticmethod
    async def calculate_habit_streak(
        db: AsyncSession,
        user_uuid: str,
        habit_id: str,
        end_date: date,
        config_type: Literal["default_habits", "defined_habits"],
        column_name: str
    ) -> int:
        """
        Calculate streak - works for both types!
        Checks if habit has goalType to determine if streak applies.
        """
        from app.services.habit_config_service import habit_config_service
        from app.services.unified_cache_service import dashboard_cache
        
        # Cache key
        cache_key = f"habit_streak_{user_uuid}_{habit_id}_{end_date.isoformat()}"
        cached = dashboard_cache.get(cache_key)
        if cached is not None:
            return cached
        
        # Get habit definition
        config = await habit_config_service.get_config(db, user_uuid, config_type)
        habit_config = next((h for h in config if h["habitId"] == habit_id), None)
        
        if not habit_config:
            return 0
        
        # Check if habit has goals (only defined_habits)
        if "goalType" not in habit_config:
            return 0  # No streak for default habits
        
        goal_type = habit_config["goalType"]
        target = habit_config.get("targetQuantity", 0)
        
        streak = 0
        check_date = end_date
        
        while True:
            daily_metadata = await DiaryMetadataService._get_model_by_date(db, user_uuid, check_date)
            
            if not daily_metadata:
                break
            
            # Get data from appropriate column
            column_data = getattr(daily_metadata, column_name, None)
            if not column_data:
                break
            
            try:
                daily_log = json.loads(column_data)
                habit_entry = next((h for h in daily_log if h["habitId"] == habit_id), None)
                
                if not habit_entry:
                    break
                
                quantity = habit_entry.get("loggedQuantity", 0)
                
                # Check success based on goal
                success = (
                    (goal_type == "atLeast" and quantity >= target) or
                    (goal_type == "atMost" and quantity <= target)
                )
                
                if success:
                    streak += 1
                    check_date -= timedelta(days=1)
                else:
                    break
            except (json.JSONDecodeError, KeyError):
                break
        
        dashboard_cache.set(cache_key, streak, ttl=300)
        return streak

    # DRY: Convenience wrappers that call unified method
    @staticmethod
    async def update_default_habits(
        db: AsyncSession,
        user_uuid: str,
        target_date: date,
        data: dict
    ) -> dict:
        """Convenience wrapper for default habits"""
        return await DiaryMetadataService.update_daily_tracking(
            db, user_uuid, target_date,
            config_type="default_habits",
            column_name="default_habits_json",
            tracking_data=data,
            calculate_streaks=False  # No streaks for defaults
        )

    @staticmethod
    async def update_defined_habits(
        db: AsyncSession,
        user_uuid: str,
        target_date: date,
        data: dict
    ) -> dict:
        """Convenience wrapper for defined habits"""
        return await DiaryMetadataService.update_daily_tracking(
            db, user_uuid, target_date,
            config_type="defined_habits",
            column_name="defined_habits_json",
            tracking_data=data,
            calculate_streaks=True  # Calculate streaks!
        )


# Global instance
diary_metadata_service = DiaryMetadataService()

