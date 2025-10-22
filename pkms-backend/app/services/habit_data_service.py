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
from typing import Dict, List, Optional, Any
from datetime import datetime, date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from app.config import NEPAL_TZ
from app.models.diary import DiaryEntry, DiaryDailyMetadata
from app.schemas.diary import (
    DiaryDailyMetadataResponse,
    DiaryDailyMetadataUpdate,
)

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


# Global service instance
habit_data_service = HabitDataService()
