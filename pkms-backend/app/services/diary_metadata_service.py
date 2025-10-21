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
        entry_date: datetime,
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
        result = await db.execute(
            select(DiaryDailyMetadata).where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    DiaryDailyMetadata.date == entry_date.date()
                )
            )
        )
        snapshot = result.scalar_one_or_none()
        
        if snapshot:
            # Merge metrics (existing + new)
            existing = {}
            try:
                existing = json.loads(snapshot.metrics_json or "{}")
            except Exception:
                existing = {}
            merged = {**existing, **(metrics or {})}
            snapshot.metrics_json = json.dumps(merged)
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
            date=entry_date.date(),
            nepali_date=nepali_date,
            metrics_json=json.dumps(metrics or {}),
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
        metrics = json.loads(snapshot.metrics_json) if snapshot.metrics_json else {}
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
                    DiaryEntry.is_template == False
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
        end_date = datetime.now().date()
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
                metrics = json.loads(record.metrics_json) if record.metrics_json else {}
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
        exercise_days = 0
        exercise_minutes = []
        screen_time_values = []
        energy_values = []
        stress_values = []
        water_values = []
        meditation_days = 0
        gratitude_days = 0
        social_days = 0
        sleep_quality_days = 0
        
        # Trends
        mood_trend = []
        sleep_trend = []
        exercise_trend = []
        screen_time_trend = []
        energy_trend = []
        stress_trend = []
        hydration_trend = []
        
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
            
            # Sleep
            sleep_duration = metrics.get("sleep_duration")
            if sleep_duration is not None:
                sleep_values.append(sleep_duration)
                sleep_trend.append(WellnessTrendPoint(date=date_str, value=float(sleep_duration)))
                if sleep_duration >= 7:
                    sleep_quality_days += 1
                # For correlation
                if mood is not None:
                    mood_sleep_pairs.append({"mood": float(mood), "sleep": float(sleep_duration)})
            else:
                sleep_trend.append(WellnessTrendPoint(date=date_str, value=None))
            
            # Exercise
            did_exercise = metrics.get("did_exercise", False)
            exercise_minutes_val = metrics.get("exercise_minutes", 0) if did_exercise else 0
            if did_exercise:
                exercise_days += 1
                if exercise_minutes_val:
                    exercise_minutes.append(exercise_minutes_val)
            exercise_trend.append(WellnessTrendPoint(
                date=date_str,
                value=float(exercise_minutes_val) if exercise_minutes_val else 0,
                label="Yes" if did_exercise else "No"
            ))
            
            # Screen time
            screen_time = metrics.get("screen_time")
            if screen_time is not None:
                screen_time_values.append(screen_time)
                screen_time_trend.append(WellnessTrendPoint(date=date_str, value=float(screen_time)))
            else:
                screen_time_trend.append(WellnessTrendPoint(date=date_str, value=None))
            
            # Energy
            energy = metrics.get("energy_level")
            if energy is not None:
                energy_values.append(energy)
                energy_trend.append(WellnessTrendPoint(date=date_str, value=float(energy)))
            else:
                energy_trend.append(WellnessTrendPoint(date=date_str, value=None))
            
            # Stress
            stress = metrics.get("stress_level")
            if stress is not None:
                stress_values.append(stress)
                stress_trend.append(WellnessTrendPoint(date=date_str, value=float(stress)))
            else:
                stress_trend.append(WellnessTrendPoint(date=date_str, value=None))
            
            # Water intake
            water = metrics.get("water_intake")
            if water is not None:
                water_values.append(water)
                hydration_trend.append(WellnessTrendPoint(date=date_str, value=float(water)))
            else:
                hydration_trend.append(WellnessTrendPoint(date=date_str, value=None))
            
            # Habits
            if metrics.get("did_meditation"):
                meditation_days += 1
            if metrics.get("gratitude_practice"):
                gratitude_days += 1
            if metrics.get("social_interaction"):
                social_days += 1
        
        # Calculate averages with proper floating point handling
        avg_mood = round(sum(mood_values) / len(mood_values), 2) if mood_values else None
        avg_sleep = round(sum(sleep_values) / len(sleep_values), 2) if sleep_values else None
        avg_screen_time = round(sum(screen_time_values) / len(screen_time_values), 2) if screen_time_values else None
        avg_energy = round(sum(energy_values) / len(energy_values), 2) if energy_values else None
        avg_stress = round(sum(stress_values) / len(stress_values), 2) if stress_values else None
        avg_water = round(sum(water_values) / len(water_values), 2) if water_values else None
        avg_exercise_minutes = round(sum(exercise_minutes) / len(exercise_minutes), 2) if exercise_minutes else None
        
        # Exercise frequency per week
        weeks = days / 7.0
        exercise_freq_per_week = exercise_days / weeks if weeks > 0 else 0
        
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
                sum_mood_sleep = sum(m * s for m, s in zip(moods, sleeps))
                
                numerator = n * sum_mood_sleep - sum_mood * sum_sleep
                denominator = ((n * sum_mood_sq - sum_mood ** 2) * (n * sum_sleep_sq - sum_sleep ** 2)) ** 0.5
                
                if denominator != 0:
                    correlation_coefficient = numerator / denominator
            except Exception as e:
                logger.warning(f"Failed to calculate correlation: {e}")
        
        # Calculate wellness score (0-100)
        score_components = {}
        component_scores = []
        
        # Sleep component (25%)
        if avg_sleep is not None:
            sleep_score = min(100, (avg_sleep / 8.0) * 100)
            score_components["sleep"] = round(sleep_score, 1)
            component_scores.append(sleep_score * 0.25)
        
        # Exercise component (20%)
        if exercise_freq_per_week > 0:
            exercise_score = min(100, (exercise_freq_per_week / 4.0) * 100)
            score_components["exercise"] = round(exercise_score, 1)
            component_scores.append(exercise_score * 0.20)
        
        # Mental wellness component (20%)
        if avg_energy is not None and avg_stress is not None:
            mental_score = ((avg_energy + (6 - avg_stress)) / 10.0) * 100
            score_components["mental"] = round(mental_score, 1)
            component_scores.append(mental_score * 0.20)
        
        # Healthy habits component (15%)
        if avg_water is not None:
            habits_score = min(100, (avg_water / 8.0) * 100)
            score_components["habits"] = round(habits_score, 1)
            component_scores.append(habits_score * 0.15)
        
        # Low screen time component (10%)
        if avg_screen_time is not None:
            screen_score = max(0, 100 - (avg_screen_time / 8.0) * 100)
            score_components["screenTime"] = round(screen_score, 1)
            component_scores.append(screen_score * 0.10)
        
        # Mindfulness component (10%)
        mindfulness_score = (meditation_days / days) * 100 if days > 0 else 0
        score_components["mindfulness"] = round(mindfulness_score, 1)
        component_scores.append(mindfulness_score * 0.10)
        
        overall_wellness_score = sum(component_scores) if component_scores else None
        
        # Generate insights
        insights = []
        
        # Positive insights
        if avg_sleep and avg_sleep >= 7.5:
            insights.append({
                "type": "positive",
                "message": f"Excellent sleep quality! Averaging {avg_sleep:.1f} hours per night.",
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
        
        # Areas for improvement
        if avg_sleep and avg_sleep < 6:
            insights.append({
                "type": "negative",
                "message": f"You're averaging only {avg_sleep:.1f} hours of sleep. Aim for 7-8 hours.",
                "metric": "sleep"
            })
        
        if avg_screen_time and avg_screen_time > 6:
            insights.append({
                "type": "negative",
                "message": f"High screen time detected ({avg_screen_time:.1f} hrs/day). Consider reducing it.",
                "metric": "habits"
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
        avg_daily_income = total_income / days if days > 0 else None
        avg_daily_expense = total_expense / days if days > 0 else None
        
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
        
        # Days with data
        days_with_data = len([d for d in daily_data.values() if d["metrics"] or d["mood"] is not None])
        
        return WellnessStats(
            period_start=start_date.strftime("%Y-%m-%d"),
            period_end=end_date.strftime("%Y-%m-%d"),
            total_days=days,
            days_with_data=days_with_data,
            wellness_score=round(overall_wellness_score, 1) if overall_wellness_score else None,
            average_mood=round(avg_mood, 2) if avg_mood else None,
            average_sleep=round(avg_sleep, 1) if avg_sleep else None,
            mood_trend=mood_trend,
            mood_distribution=mood_distribution,
            sleep_trend=sleep_trend,
            sleep_quality_days=sleep_quality_days,
            exercise_trend=exercise_trend,
            days_exercised=exercise_days,
            exercise_frequency_per_week=round(exercise_freq_per_week, 1),
            average_exercise_minutes=round(avg_exercise_minutes, 1) if avg_exercise_minutes else None,
            screen_time_trend=screen_time_trend,
            average_screen_time=round(avg_screen_time, 1) if avg_screen_time else None,
            energy_trend=energy_trend,
            stress_trend=stress_trend,
            average_energy=round(avg_energy, 1) if avg_energy else None,
            average_stress=round(avg_stress, 1) if avg_stress else None,
            hydration_trend=hydration_trend,
            average_water_intake=round(avg_water, 1) if avg_water else None,
            meditation_days=meditation_days,
            gratitude_days=gratitude_days,
            social_interaction_days=social_days,
            mood_sleep_correlation=mood_sleep_pairs,
            correlation_coefficient=round(correlation_coefficient, 3) if correlation_coefficient else None,
            wellness_components=score_components,
            financial_trend=financial_trend,
            total_income=round(total_income, 2),
            total_expense=round(total_expense, 2),
            net_savings=round(net_savings, 2),
            average_daily_income=round(avg_daily_income, 2) if avg_daily_income else None,
            average_daily_expense=round(avg_daily_expense, 2) if avg_daily_expense else None,
            insights=insights
        )
    
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
        except ValueError:
            raise ValueError("Invalid date format. Expected YYYY-MM-DD")
        
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
        units: dict = None
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
            previous_metadata = await DiaryMetadataService.get_daily_metadata(
                db, user_uuid, previous_date
            )

            # Parse previous habits data
            previous_habits = {}
            if previous_metadata and previous_metadata.habits_json:
                try:
                    previous_habits = json.loads(previous_metadata.habits_json)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid habits_json for user {user_uuid} on {previous_date}")
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
            if snapshot.habits_json:
                try:
                    current_habits = json.loads(snapshot.habits_json)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid habits_json for user {user_uuid} on {target_date}")
                    current_habits = {}

            first_tracked = current_habits.get("first_tracked", {})
            for habit_key in habits_data:
                if habit_key not in first_tracked:
                    first_tracked[habit_key] = target_date.isoformat()

            # Build updated habits_json
            updated_habits_json = {
                "habits": habits_data,
                "streaks": new_streaks,
                "units": units or current_habits.get("units", {}),
                "first_tracked": first_tracked,
                "last_updated": datetime.now(NEPAL_TZ).isoformat()
            }

            # Update record
            snapshot.habits_json = json.dumps(updated_habits_json)
            await db.commit()
            await db.refresh(snapshot)

            return updated_habits_json

        except Exception as e:
            logger.error(f"Error updating habits for user {user_uuid} on {target_date}: {e}")
            await db.rollback()
            raise

    @staticmethod
    async def calculate_habit_streak(
        db: AsyncSession,
        user_uuid: str,
        habit_key: str,
        end_date: date
    ) -> int:
        """
        Calculate streak by counting consecutive non-zero days.

        Args:
            db: Database session
            user_uuid: User's UUID
            habit_key: Key of the habit to calculate streak for
            end_date: End date for streak calculation

        Returns:
            Current streak count
        """
        streak = 0
        check_date = end_date

        while True:
            # Get that day's metadata
            daily_metadata = await DiaryMetadataService.get_daily_metadata(
                db, user_uuid, check_date
            )

            if not daily_metadata or not daily_metadata.habits_json:
                break

            try:
                habits_data = json.loads(daily_metadata.habits_json)
                habit_values = habits_data.get("habits", {})

                # Check if habit has non-zero value
                if habit_key in habit_values and habit_values[habit_key] != 0:
                    streak += 1
                    check_date -= timedelta(days=1)
                else:
                    break

            except json.JSONDecodeError:
                logger.warning(f"Invalid habits_json for user {user_uuid} on {check_date}")
                break

        return streak

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
                if record.habits_json:
                    try:
                        habits = json.loads(record.habits_json).get("habits", {})
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

        except Exception as e:
            logger.error(f"Error getting habit analytics for user {user_uuid}: {e}")
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
            if record.habits_json:
                try:
                    habits = json.loads(record.habits_json)
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
        today_metadata = await DiaryMetadataService.get_daily_metadata(
            db, user_uuid, end_date
        )
        if today_metadata and today_metadata.habits_json:
            try:
                today_habits = json.loads(today_metadata.habits_json)
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
                if record.habits_json:
                    try:
                        habits = json.loads(record.habits_json)
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
                if record.habits_json:
                    try:
                        habits = json.loads(record.habits_json).get("habits", {})
                        all_habits.update(habits.keys())
                    except json.JSONDecodeError:
                        continue

            return sorted(list(all_habits))

        except Exception as e:
            logger.error(f"Error getting active habits for user {user_uuid}: {e}")
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

        except Exception as e:
            logger.error(f"Error generating habit insights for user {user_uuid}: {e}")
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
            daily_metadata = await DiaryMetadataService.get_daily_metadata(
                db, user_uuid, target_date
            )

            if daily_metadata and daily_metadata.habits_json:
                return json.loads(daily_metadata.habits_json)
            else:
                return {
                    "habits": {},
                    "streaks": {},
                    "units": {},
                    "first_tracked": {},
                    "last_updated": None
                }

        except Exception as e:
            logger.error(f"Error getting today's habits for user {user_uuid}: {e}")
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
            daily_metadata = await DiaryMetadataService.get_daily_metadata(db, user_uuid, check_date)
            
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

