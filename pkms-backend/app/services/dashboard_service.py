"""
Dashboard Service
Handles all dashboard statistics aggregation, caching, and business logic.

Refactored from dashboard.py router to follow "thin router, thick service" pattern.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Final
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, and_

from app.config import NEPAL_TZ
from app.models.note import Note
from app.models.document import Document
from app.models.todo import Todo, TodoStatus
from app.models.project import Project, ProjectStatus
from app.models.diary import DiaryEntry
from app.models.associations import document_diary
from app.models.archive import ArchiveFolder, ArchiveItem
from app.schemas.dashboard import DashboardStats, ModuleActivity, QuickStats
from app.services.unified_cache_service import dashboard_cache

CACHE_TTL_SECONDS: Final[int] = 120
logger = logging.getLogger(__name__)


class DashboardService:
    """Service for dashboard statistics and aggregations"""
    
    def __init__(self):
        self.cache = dashboard_cache
    
    async def get_dashboard_stats(
        self, 
        db: AsyncSession, 
        user_uuid: str
    ) -> DashboardStats:
        """
        Get comprehensive dashboard statistics for all modules.
        
        Cached with 120-second TTL for performance.
        """
        # Check cache first
        cache_key = f"stats:{user_uuid}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            logger.debug(f"Dashboard stats cache hit for user {user_uuid}")
            return cached
        
        logger.debug(f"Dashboard stats cache miss for user {user_uuid}")
        
        # Use shared dashboard stats service to avoid duplication
        from app.services.dashboard_stats_service import dashboard_stats_service
        
        # Get module statistics using shared service
        notes_stats = await dashboard_stats_service.get_notes_stats(db, user_uuid, 7)
        docs_stats = await dashboard_stats_service.get_documents_stats(db, user_uuid, 7)
        todos_stats = await dashboard_stats_service.get_todo_stats(db, user_uuid)
        projects_stats = await dashboard_stats_service.get_projects_stats(db, user_uuid)
        diary_stats = await dashboard_stats_service.get_diary_stats(db, user_uuid)
        archive_stats = await dashboard_stats_service.get_archive_stats(db, user_uuid)
        
        stats = DashboardStats(
            notes=notes_stats,
            documents=docs_stats,
            todos=todos_stats,
            diary=diary_stats,
            archive=archive_stats,
            projects=projects_stats,
            last_updated=datetime.now(NEPAL_TZ)
        )
        
        # Cache the result
        self.cache.set(cache_key, stats, ttl_seconds=CACHE_TTL_SECONDS)
        return stats
    
    async def get_recent_activity(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        days: int = 7
    ) -> ModuleActivity:
        """
        Get recent activity across all modules.
        
        Args:
            db: Database session
            user_uuid: User UUID
            days: Number of days to look back (default 7)
            
        Returns:
            ModuleActivity with counts of recent items
        """
        # Check cache first (keyed by user and days)
        cache_key = f"activity:{user_uuid}:{days}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            logger.debug(f"Activity cache hit for user {user_uuid}, days={days}")
            return cached
        
        logger.debug(f"Activity cache miss for user {user_uuid}, days={days}")
        
        # Use shared service to get recent activity stats
        from app.services.dashboard_stats_service import dashboard_stats_service
        activity_stats = await dashboard_stats_service.get_recent_activity_stats(db, user_uuid, days)
        
        activity = ModuleActivity(
            recent_notes=activity_stats.get("recent_notes", 0),
            recent_documents=activity_stats.get("recent_documents", 0),
            recent_todos=activity_stats.get("recent_todos", 0),
            recent_diary_entries=activity_stats.get("recent_diary_entries", 0),
            recent_archive_items=activity_stats.get("recent_archive_items", 0)
        )
        
        # Cache the result
        self.cache.set(cache_key, activity, ttl_seconds=CACHE_TTL_SECONDS)
        return activity
    
    async def get_quick_stats(
        self, 
        db: AsyncSession, 
        user_uuid: str
    ) -> QuickStats:
        """
        Get quick overview statistics for dashboard widgets.
        
        Includes:
        - Total item counts
        - Active projects
        - Overdue todos
        - Diary streak
        - Storage usage by module
        """
        # Check cache first
        cache_key = f"quick:{user_uuid}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            logger.debug(f"Quick stats cache hit for user {user_uuid}")
            return cached
        
        logger.debug(f"Quick stats cache miss for user {user_uuid}")
        
        # Use shared service to get all statistics
        from app.services.dashboard_stats_service import dashboard_stats_service
        
        # Get all module statistics using shared service
        notes_stats = await dashboard_stats_service.get_notes_stats(db, user_uuid, 7)
        docs_stats = await dashboard_stats_service.get_documents_stats(db, user_uuid, 7)
        todos_stats = await dashboard_stats_service.get_todo_stats(db, user_uuid)
        projects_stats = await dashboard_stats_service.get_projects_stats(db, user_uuid)
        diary_stats = await dashboard_stats_service.get_diary_stats(db, user_uuid)
        archive_stats = await dashboard_stats_service.get_archive_stats(db, user_uuid)
        
        # Calculate totals from shared service data
        notes_count = notes_stats.get("total", 0)
        docs_count = docs_stats.get("total", 0)
        todos_count = todos_stats.get("total", 0)
        diary_count = diary_stats.get("entries", 0)
        archive_count = archive_stats.get("items", 0)
        
        total_items = notes_count + docs_count + todos_count + diary_count + archive_count
        active_projects = projects_stats.get("active", 0)
        overdue_todos = todos_stats.get("overdue", 0)
        diary_streak = diary_stats.get("streak", 0)
        
        # Storage used (calculate from file sizes)
        storage_data = await self._calculate_storage(db, user_uuid)
        
        quick_stats = QuickStats(
            total_items=total_items,
            active_projects=active_projects or 0,
            overdue_todos=overdue_todos or 0,
            current_diary_streak=diary_streak,
            storage_used_mb=storage_data["total_mb"],
            storage_by_module=storage_data["by_module"]
        )
        
        # Cache the result
        self.cache.set(cache_key, quick_stats, ttl_seconds=CACHE_TTL_SECONDS)
        return quick_stats
    
    async def _calculate_storage(
        self, 
        db: AsyncSession, 
        user_uuid: str
    ) -> Dict[str, Any]:
        """
        Calculate storage usage by module.
        
        Returns:
            Dictionary with total_mb and by_module breakdown
        """
        # Documents storage
        docs_bytes = await db.scalar(
            select(func.coalesce(func.sum(Document.file_size), 0))
            .where(
                Document.created_by == user_uuid,
                Document.is_deleted.is_(False),
                Document.is_archived.is_(False),
            )
        ) or 0
        
        # Archive storage
        archive_bytes = await db.scalar(
            select(func.coalesce(func.sum(ArchiveItem.file_size), 0))
            .where(
                ArchiveItem.created_by == user_uuid,
                ArchiveItem.is_deleted.is_(False),
            )
        ) or 0
        
        # Notes storage
        notes_bytes = await db.scalar(
            select(func.coalesce(func.sum(Note.size_bytes), 0))
            .where(
                Note.created_by == user_uuid,
                Note.is_deleted.is_(False),
                Note.is_archived.is_(False),
            )
        ) or 0
        
        # Diary media storage (via document_diary association) - count each document only once
        subquery = (
            select(
                Document.uuid,
                Document.file_size
            )
            .distinct()
            .join(document_diary, document_diary.c.document_uuid == Document.uuid)
            .join(DiaryEntry, document_diary.c.diary_entry_uuid == DiaryEntry.uuid)
            .where(
                DiaryEntry.created_by == user_uuid,
                DiaryEntry.is_deleted.is_(False),
                Document.is_deleted.is_(False),
                Document.is_archived.is_(False),
            )
            .subquery()
        )

        diary_media_bytes = await db.scalar(
            select(func.coalesce(func.sum(subquery.c.file_size), 0))
            .select_from(subquery)
        ) or 0
        
        # Diary text storage (approximate from content length)
        diary_text_bytes = await db.scalar(
            select(func.coalesce(func.sum(DiaryEntry.content_length), 0))
            .where(
                DiaryEntry.created_by == user_uuid,
                DiaryEntry.is_deleted.is_(False),
            )
        ) or 0
        
        # Calculate totals
        total_bytes = docs_bytes + archive_bytes + notes_bytes + diary_media_bytes + diary_text_bytes
        
        return {
            "total_mb": round(total_bytes / (1024 * 1024), 2),
            "by_module": {
                "documents_mb": round(docs_bytes / (1024 * 1024), 2),
                "archive_mb": round(archive_bytes / (1024 * 1024), 2),
                "notes_mb": round(notes_bytes / (1024 * 1024), 2),
                "diary_media_mb": round(diary_media_bytes / (1024 * 1024), 2),
                "diary_text_mb": round(diary_text_bytes / (1024 * 1024), 2),
            }
        }
    
    def invalidate_user_cache(self, user_uuid: str, reason: str = "data_update") -> int:
        """
        Invalidate all dashboard cache entries for a specific user.
        
        Call this when user data changes (CRUD operations).
        
        Args:
            user_uuid: User UUID to invalidate cache for
            reason: Reason for invalidation (for logging)
            
        Returns:
            Number of cache entries invalidated
        """
        # Invalidate all cache entries for this user with specific prefixes
        count = self.cache.invalidate_pattern(f"stats:{user_uuid}")
        count += self.cache.invalidate_pattern(f"activity:{user_uuid}")
        count += self.cache.invalidate_pattern(f"quick:{user_uuid}")
        
        logger.info(f"Invalidated {count} dashboard cache entries for user {user_uuid} - reason: {reason}")
        return count
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics for monitoring."""
        return self.cache.get_stats()


# Global instance
dashboard_service = DashboardService()
