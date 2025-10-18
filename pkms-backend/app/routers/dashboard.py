"""
Dashboard router for PKMS backend
Provides aggregated statistics and overview data for the dashboard
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Tuple
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, and_

from app.database import get_db
from app.config import NEPAL_TZ
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.note import Note
from app.models.document import Document
from app.models.todo import Todo, TodoStatus
from app.models.project import Project, ProjectStatus
from app.models.diary import DiaryEntry
from app.models.archive import ArchiveFolder, ArchiveItem
from app.schemas.dashboard import DashboardStats, ModuleActivity, QuickStats

router = APIRouter()

# ============================================================
# TTL In-Memory Cache (30 seconds)
# Reduces database load for repeated dashboard refreshes
# Cache key: created_by (and days for activity endpoint)
# Cache value: (timestamp, response_object)
# ============================================================
_DASH_TTL_SECONDS = 30
_STATS_CACHE_MAX = 1024
_ACTIVITY_CACHE_MAX = 4096
_QUICK_CACHE_MAX = 1024
_STATS_CACHE: Dict[str, Tuple[float, DashboardStats]] = {}
_ACTIVITY_CACHE: Dict[Tuple[str, int], Tuple[float, ModuleActivity]] = {}
_QUICK_CACHE: Dict[str, Tuple[float, QuickStats]] = {}

@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get aggregated statistics for all modules in a single request
    This is optimized for fast dashboard loading with 30s TTL cache
    """
    try:
        created_by = current_user.uuid
        
        # Check cache first
        now_ts = time.time()
        cached = _STATS_CACHE.get(created_by)
        if cached and (now_ts - cached[0] < _DASH_TTL_SECONDS):
            return cached[1]
        
        # Define time range for "recent" items (last 7 days)
        recent_cutoff = datetime.now(NEPAL_TZ) - timedelta(days=7)
        
        # Notes Statistics
        notes_total = await db.scalar(
            select(func.count(Note.uuid)).where(
                and_(Note.created_by == created_by, Note.is_archived.is_(False))
            )
        )
        notes_recent = await db.scalar(
            select(func.count(Note.uuid)).where(
                and_(
                    Note.created_by == created_by,
                    Note.is_archived.is_(False),
                    Note.created_at >= recent_cutoff
                )
            )
        )
        
        # Documents Statistics  
        docs_total = await db.scalar(
            select(func.count(Document.uuid)).where(
                and_(Document.created_by == created_by, Document.is_archived.is_(False))
            )
        )
        docs_recent = await db.scalar(
            select(func.count(Document.uuid)).where(
                and_(
                    Document.created_by == created_by,
                    Document.is_archived.is_(False),
                    Document.created_at >= recent_cutoff
                )
            )
        )
        
        # Todos Statistics with Status Breakdown
        todos_total = await db.scalar(
            select(func.count(Todo.uuid)).where(Todo.created_by == created_by)
        )
        
        # Status breakdown
        todos_pending = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(Todo.created_by == created_by, Todo.status == TodoStatus.PENDING)
            )
        )
        todos_in_progress = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(Todo.created_by == created_by, Todo.status == TodoStatus.IN_PROGRESS)
            )
        )
        todos_blocked = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(Todo.created_by == created_by, Todo.status == TodoStatus.BLOCKED)
            )
        )
        todos_done = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(Todo.created_by == created_by, Todo.status == TodoStatus.DONE)
            )
        )
        todos_cancelled = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(Todo.created_by == created_by, Todo.status == TodoStatus.CANCELLED)
            )
        )
        
        # Legacy completed count (for backward compatibility)
        todos_completed = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(Todo.created_by == created_by, Todo.status == TodoStatus.DONE)
            )
        )
        
        # Overdue todos (not done/cancelled and past due date)
        todos_overdue = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.status.notin_([TodoStatus.DONE, TodoStatus.CANCELLED]),
                    Todo.due_date.is_not(None),
                    Todo.due_date < datetime.now(NEPAL_TZ).date()
                )
            )
        )

        # Due today (not completed): date match in Nepal TZ
        now_np = datetime.now(NEPAL_TZ)
        start_today = now_np.replace(hour=0, minute=0, second=0, microsecond=0)
        end_today = start_today + timedelta(days=1)
        today_date = now_np.date()
        todos_due_today = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.status.notin_([TodoStatus.DONE, TodoStatus.CANCELLED]),
                    Todo.due_date == today_date,
                )
            )
        )

        # Completed today: completed_at within today's window
        todos_completed_today = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.status == TodoStatus.DONE,
                    Todo.completed_at >= start_today,
                    Todo.completed_at < end_today,
                )
            )
        )
        
        # Diary Statistics
        diary_total = await db.scalar(
            select(func.count(DiaryEntry.uuid)).where(DiaryEntry.created_by == created_by)
        )
        
        # Calculate diary streak (consecutive days with entries)
        diary_streak = await _calculate_diary_streak(db, created_by)
        
        # Archive Statistics
        archive_folders = await db.scalar(
            select(func.count(ArchiveFolder.uuid)).where(ArchiveFolder.created_by == created_by)
        )
        archive_items = await db.scalar(
            select(func.count(ArchiveItem.uuid)).where(ArchiveItem.created_by == created_by)
        )
        
        # Active Projects Count
        active_projects = await db.scalar(
            select(func.count(Project.uuid)).where(
                and_(
                    Project.created_by == created_by,
                    Project.status == ProjectStatus.IS_RUNNING,
                    Project.is_archived.is_(False),
                    Project.is_deleted.is_(False)
                )
            )
        )
        
        stats = DashboardStats(
            notes={
                "total": notes_total or 0,
                "recent": notes_recent or 0
            },
            documents={
                "total": docs_total or 0, 
                "recent": docs_recent or 0
            },
            todos={
                "total": todos_total or 0,
                "pending": todos_pending or 0,
                "in_progress": todos_in_progress or 0,
                "blocked": todos_blocked or 0,
                "done": todos_done or 0,
                "cancelled": todos_cancelled or 0,
                "completed": todos_completed or 0,  # Legacy field
                "overdue": todos_overdue or 0,
                "due_today": todos_due_today or 0,
                "completed_today": todos_completed_today or 0,
            },
            diary={
                "entries": diary_total or 0,
                "streak": diary_streak
            },
            archive={
                "folders": archive_folders or 0,
                "items": archive_items or 0
            },
            projects={
                "active": active_projects or 0
            },
            last_updated=datetime.now(NEPAL_TZ)
        )
        
        # Store in cache with bounded size (evict oldest)
        if len(_STATS_CACHE) >= _STATS_CACHE_MAX:
            oldest_key = min(_STATS_CACHE, key=lambda k: _STATS_CACHE[k][0])
            _STATS_CACHE.pop(oldest_key, None)
        _STATS_CACHE[created_by] = (now_ts, stats)
        return stats
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load dashboard statistics: {str(e)}"
        )

@router.get("/activity", response_model=ModuleActivity)
async def get_recent_activity(
    days: int = 7,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get recent activity across all modules with 30s TTL cache"""
    try:
        created_by = current_user.uuid
        
        # Check cache first (keyed by created_by and days)
        now_ts = time.time()
        cache_key = (created_by, days)
        cached = _ACTIVITY_CACHE.get(cache_key)
        if cached and (now_ts - cached[0] < _DASH_TTL_SECONDS):
            return cached[1]
        
        cutoff = datetime.now(NEPAL_TZ) - timedelta(days=days)
        
        # Get recent activity counts
        recent_notes = await db.scalar(
            select(func.count(Note.uuid)).where(
                and_(Note.created_by == created_by, Note.created_at >= cutoff)
            )
        )
        recent_documents = await db.scalar(
            select(func.count(Document.uuid)).where(
                and_(Document.created_by == created_by, Document.created_at >= cutoff)
            )
        )
        recent_todos = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(Todo.created_by == created_by, Todo.created_at >= cutoff)
            )
        )
        recent_diary = await db.scalar(
            select(func.count(DiaryEntry.uuid)).where(
                and_(DiaryEntry.created_by == created_by, DiaryEntry.created_at >= cutoff)
            )
        )
        recent_archive = await db.scalar(
            select(func.count(ArchiveItem.uuid)).where(
                and_(ArchiveItem.created_by == created_by, ArchiveItem.created_at >= cutoff)
            )
        )
        
        activity = ModuleActivity(
            recent_notes=recent_notes or 0,
            recent_documents=recent_documents or 0,
            recent_todos=recent_todos or 0,
            recent_diary_entries=recent_diary or 0,
            recent_archive_items=recent_archive or 0
        )
        
        # Store in cache with bounded size (evict oldest)
        if len(_ACTIVITY_CACHE) >= _ACTIVITY_CACHE_MAX:
            oldest_key = min(_ACTIVITY_CACHE, key=lambda k: _ACTIVITY_CACHE[k][0])
            _ACTIVITY_CACHE.pop(oldest_key, None)
        _ACTIVITY_CACHE[cache_key] = (now_ts, activity)
        return activity
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load activity data: {str(e)}"
        )

@router.get("/quick-stats", response_model=QuickStats)
async def get_quick_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get quick overview statistics for dashboard widgets with 30s TTL cache"""
    try:
        created_by = current_user.uuid
        
        # Check cache first
        now_ts = time.time()
        cached = _QUICK_CACHE.get(created_by)
        if cached and (now_ts - cached[0] < _DASH_TTL_SECONDS):
            return cached[1]
        
        # Batch total counts for all modules in a single query (avoiding 5 round trips)
        from sqlalchemy import union_all
        counts_query = union_all(
            select(func.count(Note.uuid).label("count")).where(Note.created_by == created_by),
            select(func.count(Document.uuid)).where(Document.created_by == created_by),
            select(func.count(Todo.uuid)).where(Todo.created_by == created_by),
            select(func.count(DiaryEntry.uuid)).where(DiaryEntry.created_by == created_by),
            select(func.count(ArchiveItem.uuid)).where(ArchiveItem.created_by == created_by)
        )
        counts_result = await db.execute(counts_query)
        count_values = [r[0] or 0 for r in counts_result.fetchall()]
        notes_count, docs_count, todos_count, diary_count, archive_count = count_values
        
        total_items = (notes_count or 0) + (docs_count or 0) + (todos_count or 0) + (diary_count or 0) + (archive_count or 0)
        
        # Active projects
        active_projects = await db.scalar(
            select(func.count(Project.uuid)).where(
                and_(
                    Project.created_by == created_by,
                    Project.status == ProjectStatus.IS_RUNNING,
                    Project.is_archived.is_(False),
                    Project.is_deleted.is_(False)
                )
            )
        )
        
        # Overdue todos
        overdue_todos = await db.scalar(
            select(func.count(Todo.uuid)).where(
                and_(
                    Todo.created_by == created_by,
                    Todo.is_completed.is_(False),
                    Todo.due_date < datetime.now(NEPAL_TZ)
                )
            )
        )
        
        # Diary streak
        diary_streak = await _calculate_diary_streak(db, created_by)
        
        # Storage used (approximate from file sizes)
        docs_bytes = await db.scalar(
            select(func.coalesce(func.sum(Document.file_size), 0)).where(Document.created_by == created_by)
        )
        archive_bytes = await db.scalar(
            select(func.coalesce(func.sum(ArchiveItem.file_size), 0)).where(ArchiveItem.created_by == created_by)
        )
        notes_bytes = await db.scalar(
            select(func.coalesce(func.sum(Note.size_bytes), 0)).where(Note.created_by == created_by)
        )
        from app.models.diary import DiaryMedia, DiaryEntry as _DiaryEntry
        diary_media_bytes = await db.scalar(
            select(func.coalesce(func.sum(DiaryMedia.file_size), 0)).where(DiaryMedia.created_by == created_by)
        )
        diary_text_bytes = await db.scalar(
            select(func.coalesce(func.sum(_DiaryEntry.content_length), 0)).where(_DiaryEntry.created_by == created_by)
        )

        total_storage_bytes = (
            (docs_bytes or 0)
            + (archive_bytes or 0)
            + (notes_bytes or 0)
            + (diary_media_bytes or 0)
            + (diary_text_bytes or 0)
        )
        storage_mb = total_storage_bytes / (1024 * 1024)  # Convert to MB
        
        quick_stats = QuickStats(
            total_items=total_items,
            active_projects=active_projects or 0,
            overdue_todos=overdue_todos or 0,
            current_diary_streak=diary_streak,
            storage_used_mb=round(storage_mb, 2),
            storage_by_module={
                "documents_mb": round((docs_bytes or 0) / (1024 * 1024), 2),
                "archive_mb": round((archive_bytes or 0) / (1024 * 1024), 2),
                "notes_mb": round((notes_bytes or 0) / (1024 * 1024), 2),
                "diary_media_mb": round((diary_media_bytes or 0) / (1024 * 1024), 2),
                "diary_text_mb": round((diary_text_bytes or 0) / (1024 * 1024), 2),
            }
        )
        
        # Store in cache with bounded size (evict oldest)
        if len(_QUICK_CACHE) >= _QUICK_CACHE_MAX:
            oldest_key = min(_QUICK_CACHE, key=lambda k: _QUICK_CACHE[k][0])
            _QUICK_CACHE.pop(oldest_key, None)
        _QUICK_CACHE[created_by] = (now_ts, quick_stats)
        return quick_stats
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load quick statistics: {str(e)}"
        )

async def _calculate_diary_streak(db: AsyncSession, created_by: str) -> int:
    """Calculate the current consecutive diary writing streak"""
    try:
        # Get the most recent diary entries ordered by date descending
        result = await db.execute(
            select(DiaryEntry.date)
            .where(DiaryEntry.created_by == created_by)
            .order_by(DiaryEntry.date.desc())
            .limit(365)
        )
        dates_dt = [row[0] for row in result.fetchall()]
        dates = [d.date() for d in dates_dt]
        
        if not dates:
            return 0
        
        # Check if there's an entry for today or yesterday
        today = datetime.now(NEPAL_TZ).date()
        yesterday = today - timedelta(days=1)
        
        # Start counting from today or yesterday
        if dates[0] == today:
            streak_start = today
        elif dates[0] == yesterday:
            streak_start = yesterday
        else:
            return 0  # No recent entries
        
        # Count consecutive days
        streak = 0
        current_date = streak_start
        
        for date in dates:
            if date == current_date:
                streak += 1
                current_date -= timedelta(days=1)
            elif date < current_date:
                # Gap found, streak ends
                break
        
        return streak
        
    except Exception:
        return 0 