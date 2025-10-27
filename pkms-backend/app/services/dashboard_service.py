"""
Dashboard Service
Handles all dashboard statistics aggregation, caching, and business logic.

Refactored from dashboard.py router to follow "thin router, thick service" pattern.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, and_, or_

from app.config import NEPAL_TZ
from app.models.note import Note
from app.models.document import Document
from app.models.todo import Todo
from app.models.project import Project
from app.models.diary import DiaryEntry
from app.models.associations import document_diary
from app.models.archive import ArchiveItem
from app.schemas.dashboard import DashboardStats, ModuleActivity, QuickStats, RecentActivityTimeline, RecentActivityItem
logger = logging.getLogger(__name__)


class DashboardService:
    """Service for dashboard statistics and aggregations"""
    
    
    async def get_dashboard_stats(
        self, 
        db: AsyncSession, 
        user_uuid: str
    ) -> DashboardStats:
        """
        Get comprehensive dashboard statistics for all modules.
        """
        
        # Use shared dashboard stats service to avoid duplication
        from app.services.dashboard_stats_service import dashboard_stats_service
        
        # Get module statistics using shared service
        notes_stats = await dashboard_stats_service.get_notes_stats(db, user_uuid, 3)
        docs_stats = await dashboard_stats_service.get_documents_stats(db, user_uuid, 3)
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
        
        # Use shared service to get all statistics
        from app.services.dashboard_stats_service import dashboard_stats_service
        
        # Get all module statistics using shared service
        notes_stats = await dashboard_stats_service.get_notes_stats(db, user_uuid, 3)
        docs_stats = await dashboard_stats_service.get_documents_stats(db, user_uuid, 3)
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
        
        return quick_stats
    
    async def get_recent_activity_timeline(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        days: int = 3, 
        limit: int = 20
    ) -> RecentActivityTimeline:
        """
        Get unified recent activity timeline sorted by last activity time (updated_at if present, fallback to created_at).
        
        Returns activities across all modules in chronological order:
        Projects, Todos, Notes, Documents, Archive, Diary
        """
        
        cutoff = datetime.now(NEPAL_TZ) - timedelta(days=days)
        all_activities = []
        
        # Get projects (both created and updated)
        projects_result = await db.execute(
            select(Project.uuid, Project.name, Project.description, Project.status, Project.created_at, Project.updated_at)
            .where(
                and_(
                    Project.created_by == user_uuid,
                    Project.is_deleted.is_(False),
                    or_(Project.created_at >= cutoff, Project.updated_at >= cutoff)
                )
            )
            .order_by(Project.updated_at.desc())
            .limit(limit)
        )
        for row in projects_result:
            is_updated = row.updated_at > row.created_at and row.updated_at >= cutoff
            all_activities.append(RecentActivityItem(
                id=row.uuid,
                type="project",
                title=row.name,
                description=row.description,
                created_at=row.created_at,
                updated_at=row.updated_at,
                is_updated=is_updated,
                attachment_count=None,
                metadata={"status": row.status}
            ))
        
        # Get todos (both created and updated)
        todos_result = await db.execute(
            select(Todo.uuid, Todo.title, Todo.description, Todo.status, Todo.priority, Todo.created_at, Todo.updated_at)
            .where(
                and_(
                    Todo.created_by == user_uuid,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False),
                    or_(Todo.created_at >= cutoff, Todo.updated_at >= cutoff)
                )
            )
            .order_by(Todo.updated_at.desc())
            .limit(limit)
        )
        for row in todos_result:
            is_updated = row.updated_at > row.created_at and row.updated_at >= cutoff
            all_activities.append(RecentActivityItem(
                id=row.uuid,
                type="todo",
                title=row.title,
                description=row.description,
                created_at=row.created_at,
                updated_at=row.updated_at,
                is_updated=is_updated,
                attachment_count=None,
                metadata={"status": row.status, "priority": row.priority}
            ))
        
        # Get notes (both created and updated) with attachment count
        notes_result = await db.execute(
            select(Note.uuid, Note.title, Note.content, Note.file_count, Note.created_at, Note.updated_at)
            .where(
                and_(
                    Note.created_by == user_uuid,
                    Note.is_deleted.is_(False),
                    Note.is_archived.is_(False),
                    or_(Note.created_at >= cutoff, Note.updated_at >= cutoff)
                )
            )
            .order_by(Note.updated_at.desc())
            .limit(limit)
        )
        for row in notes_result:
            is_updated = row.updated_at > row.created_at and row.updated_at >= cutoff
            # Truncate content for description
            description = row.content[:100] + "..." if row.content and len(row.content) > 100 else row.content
            all_activities.append(RecentActivityItem(
                id=row.uuid,
                type="note",
                title=row.title,
                description=description,
                created_at=row.created_at,
                updated_at=row.updated_at,
                is_updated=is_updated,
                attachment_count=row.file_count,
                metadata=None
            ))
        
        # Get documents (both created and updated)
        docs_result = await db.execute(
            select(Document.uuid, Document.title, Document.mime_type, Document.created_at, Document.updated_at)
            .where(
                and_(
                    Document.created_by == user_uuid,
                    Document.is_deleted.is_(False),
                    Document.is_archived.is_(False),
                    or_(Document.created_at >= cutoff, Document.updated_at >= cutoff)
                )
            )
            .order_by(Document.updated_at.desc())
            .limit(limit)
        )
        for row in docs_result:
            is_updated = row.updated_at > row.created_at and row.updated_at >= cutoff
            all_activities.append(RecentActivityItem(
                id=row.uuid,
                type="document",
                title=row.title,
                description=f"File type: {row.mime_type}",
                created_at=row.created_at,
                updated_at=row.updated_at,
                is_updated=is_updated,
                attachment_count=None,
                metadata={"mime_type": row.mime_type}
            ))
        
        # Get archive items (both created and updated)
        archive_result = await db.execute(
            select(ArchiveItem.uuid, ArchiveItem.name, ArchiveItem.mime_type, ArchiveItem.created_at, ArchiveItem.updated_at)
            .where(
                and_(
                    ArchiveItem.created_by == user_uuid,
                    ArchiveItem.is_deleted.is_(False),
                    or_(ArchiveItem.created_at >= cutoff, ArchiveItem.updated_at >= cutoff)
                )
            )
            .order_by(ArchiveItem.updated_at.desc())
            .limit(limit)
        )
        for row in archive_result:
            is_updated = row.updated_at > row.created_at and row.updated_at >= cutoff
            all_activities.append(RecentActivityItem(
                id=row.uuid,
                type="archive",
                title=row.name,
                description=f"File: {row.mime_type}",
                created_at=row.created_at,
                updated_at=row.updated_at,
                is_updated=is_updated,
                attachment_count=None,
                metadata={"item_type": "file", "mime_type": row.mime_type}
            ))
        
        # Get diary entries (metadata only, show count instead of title)
        diary_result = await db.execute(
            select(DiaryEntry.uuid, DiaryEntry.mood, DiaryEntry.weather_code, DiaryEntry.file_count, DiaryEntry.created_at, DiaryEntry.updated_at)
            .where(
                and_(
                    DiaryEntry.created_by == user_uuid,
                    DiaryEntry.is_deleted.is_(False),
                    or_(DiaryEntry.created_at >= cutoff, DiaryEntry.updated_at >= cutoff)
                )
            )
            .order_by(DiaryEntry.updated_at.desc())
            .limit(limit)
        )
        for row in diary_result:
            is_updated = row.updated_at > row.created_at and row.updated_at >= cutoff
            # Create description from metadata
            mood_text = f"Mood: {row.mood}/5" if row.mood else "No mood"
            weather_text = f"Weather: {row.weather_code}" if row.weather_code else "No weather"
            description = f"{mood_text}, {weather_text}"
            
            all_activities.append(RecentActivityItem(
                id=row.uuid,
                type="diary",
                title="Diary Entry",  # Generic title instead of actual title
                description=description,
                created_at=row.created_at,
                updated_at=row.updated_at,
                is_updated=is_updated,
                attachment_count=row.file_count,
                metadata={"mood": row.mood, "weather_code": row.weather_code}
            ))
        
        # Sort all activities by updated_at (most recent first)
        all_activities.sort(key=lambda x: x.updated_at or x.created_at, reverse=True)
        
        # Limit to requested number
        limited_activities = all_activities[:limit]
        
        timeline = RecentActivityTimeline(
            items=limited_activities,
            total_count=len(all_activities),
            cutoff_days=days
        )
        
        return timeline
    
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
    


# Global instance
dashboard_service = DashboardService()
