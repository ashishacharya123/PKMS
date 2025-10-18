"""
Dashboard Statistics Service

Centralized service for all dashboard statistics to avoid duplication.
All modules should use this service instead of duplicating queries.
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, and_

from app.config import NEPAL_TZ
from app.models.note import Note
from app.models.document import Document
from app.models.todo import Todo, TodoStatus
from app.models.project import Project, ProjectStatus
from app.models.diary import DiaryEntry
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.enums import TodoStatsKey, ModuleStatsKey


class DashboardStatsService:
    """Centralized dashboard statistics service"""
    
    @staticmethod
    async def get_todo_stats(db: AsyncSession, created_by: str) -> Dict[str, int]:
        """Get comprehensive todo statistics"""
        today_date = datetime.now(NEPAL_TZ).date()
        start_today = datetime.now(NEPAL_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
        end_today = start_today + timedelta(days=1)
        
        # Status-based counts
        todos_total = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False)
                )
            )
        )
        
        todos_pending = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False),
                    Todo.status == TodoStatus.PENDING
                )
            )
        )
        
        todos_in_progress = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False),
                    Todo.status == TodoStatus.IN_PROGRESS
                )
            )
        )
        
        todos_blocked = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False),
                    Todo.status == TodoStatus.BLOCKED
                )
            )
        )
        
        todos_done = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False),
                    Todo.status == TodoStatus.DONE
                )
            )
        )
        
        # Time-based counts (active todos only)
        todos_overdue = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False),
                    Todo.status.notin_([TodoStatus.DONE, TodoStatus.CANCELLED]),
                    Todo.due_date.is_not(None),
                    Todo.due_date < today_date
                )
            )
        )
        
        todos_due_today = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False),
                    Todo.status.notin_([TodoStatus.DONE, TodoStatus.CANCELLED]),
                    Todo.due_date == today_date
                )
            )
        )
        
        todos_completed_today = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False),
                    Todo.status == TodoStatus.DONE,
                    Todo.completed_at >= start_today,
                    Todo.completed_at < end_today
                )
            )
        )
        
        todos_within_time = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False),
                    Todo.due_date >= today_date,
                    Todo.status.notin_([TodoStatus.DONE, TodoStatus.CANCELLED])
                )
            )
        )
        
        return {
            # Status-based counts
            TodoStatsKey.TOTAL.value: todos_total or 0,
            TodoStatsKey.PENDING.value: todos_pending or 0,
            TodoStatsKey.IN_PROGRESS.value: todos_in_progress or 0,
            TodoStatsKey.BLOCKED.value: todos_blocked or 0,
            TodoStatsKey.DONE.value: todos_done or 0,
            # Time-based counts
            TodoStatsKey.OVERDUE.value: todos_overdue or 0,
            TodoStatsKey.DUE_TODAY.value: todos_due_today or 0,
            TodoStatsKey.COMPLETED_TODAY.value: todos_completed_today or 0,
            TodoStatsKey.WITHIN_TIME.value: todos_within_time or 0,
        }
    
    @staticmethod
    async def get_notes_stats(db: AsyncSession, created_by: str, recent_days: int = 7) -> Dict[str, int]:
        """Get notes statistics"""
        recent_cutoff = datetime.now(NEPAL_TZ) - timedelta(days=recent_days)
        
        notes_total = await db.scalar(
            select(func.count(Note.uuid)).where(
                and_(
                    Note.created_by == created_by,
                    Note.is_deleted.is_(False),
                    Note.is_archived.is_(False)
                )
            )
        )
        
        notes_recent = await db.scalar(
            select(func.count(Note.uuid)).where(
                and_(
                    Note.created_by == created_by,
                    Note.is_deleted.is_(False),
                    Note.is_archived.is_(False),
                    Note.created_at >= recent_cutoff
                )
            )
        )
        
        return {
            ModuleStatsKey.TOTAL.value: notes_total or 0,
            ModuleStatsKey.RECENT.value: notes_recent or 0
        }
    
    @staticmethod
    async def get_documents_stats(db: AsyncSession, created_by: str, recent_days: int = 7) -> Dict[str, int]:
        """Get documents statistics"""
        recent_cutoff = datetime.now(NEPAL_TZ) - timedelta(days=recent_days)
        
        docs_total = await db.scalar(
            select(func.count(Document.uuid)).where(
                and_(
                    Document.created_by == created_by,
                    Document.is_deleted.is_(False),
                    Document.is_archived.is_(False)
                )
            )
        )
        
        docs_recent = await db.scalar(
            select(func.count(Document.uuid)).where(
                and_(
                    Document.created_by == created_by,
                    Document.is_deleted.is_(False),
                    Document.is_archived.is_(False),
                    Document.created_at >= recent_cutoff
                )
            )
        )
        
        return {
            ModuleStatsKey.TOTAL.value: docs_total or 0,
            ModuleStatsKey.RECENT.value: docs_recent or 0
        }
    
    @staticmethod
    async def get_projects_stats(db: AsyncSession, created_by: str) -> Dict[str, int]:
        """Get projects statistics"""
        active_projects = await db.scalar(
            select(func.count(Project.uuid)).where(
                and_(
                    Project.created_by == created_by,
                    Project.is_deleted.is_(False),
                    Project.is_archived.is_(False),
                    Project.status == ProjectStatus.IS_RUNNING
                )
            )
        )
        
        return {
            "active": active_projects or 0
        }
    
    @staticmethod
    async def get_diary_stats(db: AsyncSession, created_by: str) -> Dict[str, int]:
        """Get diary statistics"""
        diary_total = await db.scalar(
            select(func.count(DiaryEntry.uuid)).where(
                and_(
                    DiaryEntry.created_by == created_by,
                    DiaryEntry.is_deleted.is_(False)
                )
            )
        )
        
        # Calculate diary streak (consecutive days with entries)
        diary_streak = await DashboardStatsService._calculate_diary_streak(db, created_by)
        
        return {
            "entries": diary_total or 0,
            "streak": diary_streak
        }
    
    @staticmethod
    async def get_archive_stats(db: AsyncSession, created_by: str) -> Dict[str, int]:
        """Get archive statistics"""
        archive_folders = await db.scalar(
            select(func.count(ArchiveFolder.uuid)).where(
                and_(
                    ArchiveFolder.created_by == created_by,
                    ArchiveFolder.is_deleted.is_(False)
                )
            )
        )
        
        archive_items = await db.scalar(
            select(func.count(ArchiveItem.uuid)).where(
                and_(
                    ArchiveItem.created_by == created_by,
                    ArchiveItem.is_deleted.is_(False)
                )
            )
        )
        
        return {
            "folders": archive_folders or 0,
            "items": archive_items or 0
        }
    
    @staticmethod
    async def get_recent_activity_stats(db: AsyncSession, created_by: str, days: int = 7) -> Dict[str, int]:
        """Get recent activity statistics across all modules"""
        cutoff = datetime.now(NEPAL_TZ) - timedelta(days=days)
        
        recent_notes = await db.scalar(
            select(func.count(Note.uuid)).where(
                and_(
                    Note.created_by == created_by,
                    Note.is_deleted.is_(False),
                    Note.is_archived.is_(False),
                    Note.created_at >= cutoff
                )
            )
        )
        
        recent_documents = await db.scalar(
            select(func.count(Document.uuid)).where(
                and_(
                    Document.created_by == created_by,
                    Document.is_deleted.is_(False),
                    Document.is_archived.is_(False),
                    Document.created_at >= cutoff
                )
            )
        )
        
        recent_todos = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False),
                    Todo.created_at >= cutoff
                )
            )
        )
        
        recent_diary = await db.scalar(
            select(func.count(DiaryEntry.uuid)).where(
                and_(
                    DiaryEntry.created_by == created_by,
                    DiaryEntry.is_deleted.is_(False),
                    DiaryEntry.created_at >= cutoff
                )
            )
        )
        
        recent_archive = await db.scalar(
            select(func.count(ArchiveItem.uuid)).where(
                and_(
                    ArchiveItem.created_by == created_by,
                    ArchiveItem.is_deleted.is_(False),
                    ArchiveItem.created_at >= cutoff
                )
            )
        )
        
        return {
            "recent_notes": recent_notes or 0,
            "recent_documents": recent_documents or 0,
            "recent_todos": recent_todos or 0,
            "recent_diary_entries": recent_diary or 0,
            "recent_archive_items": recent_archive or 0
        }
    
    @staticmethod
    async def _calculate_diary_streak(db: AsyncSession, created_by: str) -> int:
        """Calculate consecutive days with diary entries"""
        # Get all diary entry dates for the user
        dates_query = select(DiaryEntry.date).where(
            and_(
                DiaryEntry.created_by == created_by,
                DiaryEntry.is_deleted.is_(False)
            )
        ).distinct().order_by(DiaryEntry.date.desc())
        
        dates_result = await db.execute(dates_query)
        entry_dates = [row[0].date() for row in dates_result.fetchall()]
        
        if not entry_dates:
            return 0
        
        # Calculate streak
        streak = 0
        current_date = datetime.now(NEPAL_TZ).date()
        
        for entry_date in entry_dates:
            if entry_date == current_date:
                streak += 1
                current_date -= timedelta(days=1)
            elif entry_date < current_date:
                break
        
        return streak
    
    @staticmethod
    async def get_project_todo_counts(db: AsyncSession, project_uuid: str) -> tuple[int, int]:
        """Get todo count and completed count for a specific project"""
        from app.models.associations import todo_projects
        
        # Count total todos
        total_result = await db.execute(
            select(func.count(Todo.uuid)).select_from(Todo).join(todo_projects).where(
                todo_projects.c.project_uuid == project_uuid
            )
        )
        total_count = total_result.scalar() or 0
        
        # Count completed todos
        completed_result = await db.execute(
            select(func.count(Todo.uuid)).select_from(Todo).join(todo_projects).where(
                and_(
                    todo_projects.c.project_uuid == project_uuid,
                    Todo.status == TodoStatus.DONE
                )
            )
        )
        completed_count = completed_result.scalar() or 0
        
        return total_count, completed_count


# Global instance
dashboard_stats_service = DashboardStatsService()
