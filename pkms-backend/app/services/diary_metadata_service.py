"""
Diary Metadata Service

Clean service for managing diary-specific metadata operations.
This service provides ONLY diary-related functionality:

CORE FEATURES:
- Daily metadata CRUD operations (nepali_date, is_office_day)
- Diary entry metadata management
- Financial data storage (income/expense)
- Metadata formatting and response handling

NOTE: All habit analytics have been moved to unified_habit_analytics_service.py
NOTE: All habit CRUD operations have been moved to habit_data_service.py

This service now focuses solely on diary metadata management,
providing a clean separation of concerns.
"""

import logging
import json
from typing import Dict, Optional
from datetime import datetime, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from app.config import NEPAL_TZ
from app.models.diary import DiaryDailyMetadata
from app.schemas.diary import (
    DiaryDailyMetadataResponse,
    DiaryDailyMetadataUpdate,
)

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
        Helper method to get daily metadata records within a date range for analytics.
        
        Used by wellness analytics to fetch habit tracking and financial data.
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



# Global instance
diary_metadata_service = DiaryMetadataService()

