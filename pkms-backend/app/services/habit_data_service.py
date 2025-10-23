"""
Habit Data Service - CLEAN VERSION

PURE CRUD operations for habit tracking and daily metadata management.
This service provides ONLY data management functionality:

CORE FEATURES:
- Daily metadata CRUD operations (mood, habits, financial tracking)
- Habit data storage and retrieval
- Daily mood averaging from diary entries
- Financial data management
- Calendar integration with Nepali date support

NO ANALYTICS - For analytics, use unified_habit_analytics_service.py
"""

import logging
import json
import calendar
from typing import Dict, List, Optional, Any
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
    DiaryDailyMetadataResponse,
    DiaryDailyMetadataUpdate,
    DiaryCalendarData,
    MoodStats,
    WeeklyHighlights,
)
from app.services.unified_cache_service import diary_cache

logger = logging.getLogger(__name__)


class HabitDataService:
    """PURE CRUD service for habit data management - NO ANALYTICS"""
    
    @staticmethod
    async def _get_model_by_date(
        db: AsyncSession, user_uuid: str, day: date
    ) -> Optional[DiaryDailyMetadata]:
        """Get daily metadata for a specific date"""
        result = await db.execute(
            select(DiaryDailyMetadata).where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    func.date(DiaryDailyMetadata.date) == day,
                )
            )
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def _get_metadata_in_date_range(
        db: AsyncSession,
        user_uuid: str,
        start_date: date,
        end_date: date
    ) -> List[DiaryDailyMetadata]:
        """Get daily metadata records within a date range"""
        result = await db.execute(
            select(DiaryDailyMetadata).where(
                and_(
                    DiaryDailyMetadata.created_by == user_uuid,
                    DiaryDailyMetadata.date >= start_date,
                    DiaryDailyMetadata.date <= end_date
                )
            ).order_by(DiaryDailyMetadata.date)
        )
        return result.scalars().all()
    
    @staticmethod
    async def get_or_create_daily_metadata(
        db: AsyncSession,
        user_uuid: str,
        target_date: date
    ) -> DiaryDailyMetadata:
        """Get or create daily metadata for a specific date"""
        existing = await HabitDataService._get_model_by_date(db, user_uuid, target_date)
        if existing:
            return existing
        
        # Create new metadata record
        new_metadata = DiaryDailyMetadata(
            created_by=user_uuid,
            date=target_date,
            default_habits_json="{}",
            defined_habits_json="{}",
            daily_income=0.0,
            daily_expense=0.0,
            is_office_day=False
        )
        
        db.add(new_metadata)
        await db.commit()
        await db.refresh(new_metadata)
        return new_metadata
    
    @staticmethod
    async def update_daily_habits(
        db: AsyncSession,
        user_uuid: str,
        target_date: date,
        habits_data: dict,
        units: Optional[dict] = None
    ) -> dict:
        """Update daily habit tracking data"""
        metadata = await HabitDataService.get_or_create_daily_metadata(
            db, user_uuid, target_date
        )
        
        # Update default habits
        if "default_habits" in habits_data:
            try:
                current_default = json.loads(metadata.default_habits_json or "{}")
                current_default.update(habits_data["default_habits"])
                metadata.default_habits_json = json.dumps(current_default)
            except json.JSONDecodeError:
                metadata.default_habits_json = json.dumps(habits_data["default_habits"])
        
        # Update defined habits
        if "defined_habits" in habits_data:
            try:
                current_defined = json.loads(metadata.defined_habits_json or "{}")
                current_defined["habits"] = habits_data["defined_habits"]
                if units:
                    current_defined["units"] = units
                metadata.defined_habits_json = json.dumps(current_defined)
            except json.JSONDecodeError:
                metadata.defined_habits_json = json.dumps({
                    "habits": habits_data["defined_habits"],
                    "units": units or {}
                })
        
        await db.commit()
        await db.refresh(metadata)
        
        return {
            "success": True,
            "date": target_date.strftime("%Y-%m-%d"),
            "updated_habits": habits_data
        }
    
    @staticmethod
    async def get_daily_metadata(
        db: AsyncSession,
        user_uuid: str,
        target_date: date
    ) -> Optional[DiaryDailyMetadataResponse]:
        """Get daily metadata for a specific date"""
        metadata = await HabitDataService._get_model_by_date(db, user_uuid, target_date)
        if not metadata:
            return None
        
        return DiaryDailyMetadataResponse(
            uuid=metadata.uuid,
            date=metadata.date,
            default_habits_json=metadata.default_habits_json,
            defined_habits_json=metadata.defined_habits_json,
            daily_income=metadata.daily_income,
            daily_expense=metadata.daily_expense,
            is_office_day=metadata.is_office_day,
            created_at=metadata.created_at,
            updated_at=metadata.updated_at
        )
    
    @staticmethod
    async def update_daily_metadata(
        db: AsyncSession,
        user_uuid: str,
        target_date: date,
        update_data: DiaryDailyMetadataUpdate
    ) -> DiaryDailyMetadataResponse:
        """Update daily metadata"""
        metadata = await HabitDataService.get_or_create_daily_metadata(
            db, user_uuid, target_date
        )
        
        # Update fields
        if update_data.daily_income is not None:
            metadata.daily_income = update_data.daily_income
        if update_data.daily_expense is not None:
            metadata.daily_expense = update_data.daily_expense
        if update_data.is_office_day is not None:
            metadata.is_office_day = update_data.is_office_day
        
        await db.commit()
        await db.refresh(metadata)
        
        return DiaryDailyMetadataResponse(
            uuid=metadata.uuid,
            date=metadata.date,
            default_habits_json=metadata.default_habits_json,
            defined_habits_json=metadata.defined_habits_json,
            daily_income=metadata.daily_income,
            daily_expense=metadata.daily_expense,
            is_office_day=metadata.is_office_day,
            created_at=metadata.created_at,
            updated_at=metadata.updated_at
        )
    
    @staticmethod
    async def get_daily_mood_average(
        db: AsyncSession, 
        user_uuid: str, 
        date_obj: date
    ) -> Optional[float]:
        """Get average mood for a specific date from diary entries"""
        result = await db.execute(
            select(func.avg(DiaryEntry.mood)).where(
                and_(
                    DiaryEntry.created_by == user_uuid,
                    func.date(DiaryEntry.date) == date_obj,
                    DiaryEntry.mood.is_not(None)
                )
            )
        )
        return result.scalar()
    
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
        metadata_records = await HabitDataService._get_metadata_in_date_range(
            db, user_uuid, start_date, end_date
        )
        
        total_income = 0.0
        total_expense = 0.0
        for record in metadata_records:
            total_income += float(record.daily_income or 0)
            total_expense += float(record.daily_expense or 0)
        
        # Get habit data from unified service instead of old wellness methods
        from app.services.unified_habit_analytics_service import unified_habit_analytics_service
        
        # Get dashboard summary for habit data
        habit_summary = await unified_habit_analytics_service.get_dashboard_summary(db, user_uuid)
        
        # Get defined habits summary from unified service
        defined_habits_summary = await unified_habit_analytics_service.get_defined_habits_analytics(
            db, user_uuid, 7, normalize=True
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
            # Use habit data from unified service
            sleep_avg_7d=habit_summary.get("sleep_avg_7d", 0),
            exercise_streak=habit_summary.get("exercise_streak", 0),
            mood_today=habit_summary.get("mood_today", 0),
            missing_today=habit_summary.get("missing_today", []),
            top_insights=habit_summary.get("top_insights", []),
            defined_habits_summary=defined_habits_summary.get("habits", {})
        )
        
        # Cache the result
        diary_cache.set(cache_key, highlights)
        
        return highlights


# Global service instance
habit_data_service = HabitDataService()
