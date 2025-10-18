"""
Dashboard router for PKMS backend
Provides aggregated statistics and overview data for the dashboard
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Tuple
import time
import logging
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
from app.models.enums import TodoStatsKey, ModuleStatsKey
from app.models.diary import DiaryEntry
from app.models.archive import ArchiveFolder, ArchiveItem
from app.schemas.dashboard import DashboardStats, ModuleActivity, QuickStats

router = APIRouter()

# ============================================================
# Enhanced TTL In-Memory Cache (2 minutes with invalidation)
# Reduces database load from 15+ queries to cache lookup
# Cache key: created_by (and days for activity endpoint)
# Cache value: (timestamp, response_object)
# ============================================================
_DASH_TTL_SECONDS = 120  # 2 minutes as requested
_STATS_CACHE_MAX = 1024
_ACTIVITY_CACHE_MAX = 4096
_QUICK_CACHE_MAX = 1024
_STATS_CACHE: Dict[str, Tuple[float, DashboardStats]] = {}
_ACTIVITY_CACHE: Dict[Tuple[str, int], Tuple[float, ModuleActivity]] = {}
_QUICK_CACHE: Dict[str, Tuple[float, QuickStats]] = {}

# Cache statistics for monitoring
_CACHE_STATS = {
    "stats_hits": 0,
    "stats_misses": 0,
    "activity_hits": 0,
    "activity_misses": 0,
    "invalidations": 0
}


def invalidate_user_dashboard_cache(user_uuid: str, reason: str = "data_update"):
    """
    Invalidate dashboard cache for specific user when their data changes.

    Call this function whenever:
    - Note/Todo/Project is created, updated, or deleted
    - Status changes occur
    - Any dashboard-affecting data modification
    """
    global _CACHE_STATS

    removed_count = 0

    # Invalidate stats cache
    if user_uuid in _STATS_CACHE:
        del _STATS_CACHE[user_uuid]
        removed_count += 1

    # Invalidate activity cache (multiple possible day combinations)
    keys_to_remove = [key for key in _ACTIVITY_CACHE.keys() if key[0] == user_uuid]
    for key in keys_to_remove:
        del _ACTIVITY_CACHE[key]
        removed_count += 1

    # Invalidate quick cache
    if user_uuid in _QUICK_CACHE:
        del _QUICK_CACHE[user_uuid]
        removed_count += 1

    _CACHE_STATS["invalidations"] += removed_count

    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Invalidated {removed_count} cache entries for user {user_uuid} - reason: {reason}")


def get_cache_stats() -> Dict[str, Any]:
    """Get cache performance statistics"""
    total_stats_requests = _CACHE_STATS["stats_hits"] + _CACHE_STATS["stats_misses"]
    total_activity_requests = _CACHE_STATS["activity_hits"] + _CACHE_STATS["activity_misses"]

    stats_hit_rate = (_CACHE_STATS["stats_hits"] / total_stats_requests * 100) if total_stats_requests > 0 else 0
    activity_hit_rate = (_CACHE_STATS["activity_hits"] / total_activity_requests * 100) if total_activity_requests > 0 else 0

    return {
        "stats_cache": {
            "hit_rate_percent": round(stats_hit_rate, 2),
            "hits": _CACHE_STATS["stats_hits"],
            "misses": _CACHE_STATS["stats_misses"],
            "cached_users": len(_STATS_CACHE),
            "ttl_seconds": _DASH_TTL_SECONDS
        },
        "activity_cache": {
            "hit_rate_percent": round(activity_hit_rate, 2),
            "hits": _CACHE_STATS["activity_hits"],
            "misses": _CACHE_STATS["activity_misses"],
            "cached_entries": len(_ACTIVITY_CACHE),
            "ttl_seconds": _DASH_TTL_SECONDS
        },
        "invalidations": _CACHE_STATS["invalidations"],
        "cache_memory_usage": {
            "stats_cache_size": len(_STATS_CACHE),
            "activity_cache_size": len(_ACTIVITY_CACHE),
            "quick_cache_size": len(_QUICK_CACHE)
        }
    }

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
            _CACHE_STATS["stats_hits"] += 1
            logger.debug(f"Dashboard stats cache hit for user {created_by}")
            return cached[1]

        _CACHE_STATS["stats_misses"] += 1
        logger.debug(f"Dashboard stats cache miss for user {created_by}")
        
        # Define time range for "recent" items (last 7 days)
        recent_cutoff = datetime.now(NEPAL_TZ) - timedelta(days=7)
        
        # Use shared dashboard stats service to avoid duplication
        from app.services.dashboard_stats_service import dashboard_stats_service
        
        # Get module statistics using shared service
        notes_stats = await dashboard_stats_service.get_notes_stats(db, created_by, 7)
        docs_stats = await dashboard_stats_service.get_documents_stats(db, created_by, 7)
        todos_stats = await dashboard_stats_service.get_todo_stats(db, created_by)
        projects_stats = await dashboard_stats_service.get_projects_stats(db, created_by)
        diary_stats = await dashboard_stats_service.get_diary_stats(db, created_by)
        archive_stats = await dashboard_stats_service.get_archive_stats(db, created_by)
        
        
        stats = DashboardStats(
            notes=notes_stats,
            documents=docs_stats,
            todos=todos_stats,
            diary=diary_stats,
            archive=archive_stats,
            projects=projects_stats,
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
            _CACHE_STATS["activity_hits"] += 1
            logger.debug(f"Activity cache hit for user {created_by}, days={days}")
            return cached[1]

        _CACHE_STATS["activity_misses"] += 1
        logger.debug(f"Activity cache miss for user {created_by}, days={days}")
        
        # Use shared service to get recent activity stats
        from app.services.dashboard_stats_service import dashboard_stats_service
        activity_stats = await dashboard_stats_service.get_recent_activity_stats(db, created_by, days)
        
        activity = ModuleActivity(
            recent_notes=activity_stats.get("recent_notes", 0),
            recent_documents=activity_stats.get("recent_documents", 0),
            recent_todos=activity_stats.get("recent_todos", 0),
            recent_diary_entries=activity_stats.get("recent_diary_entries", 0),
            recent_archive_items=activity_stats.get("recent_archive_items", 0)
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
        
        # Use shared service to get all statistics
        from app.services.dashboard_stats_service import dashboard_stats_service
        
        # Get all module statistics using shared service
        notes_stats = await dashboard_stats_service.get_notes_stats(db, created_by, 7)
        docs_stats = await dashboard_stats_service.get_documents_stats(db, created_by, 7)
        todos_stats = await dashboard_stats_service.get_todo_stats(db, created_by)
        projects_stats = await dashboard_stats_service.get_projects_stats(db, created_by)
        diary_stats = await dashboard_stats_service.get_diary_stats(db, created_by)
        archive_stats = await dashboard_stats_service.get_archive_stats(db, created_by)
        
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


@router.get("/cache/stats")
async def get_cache_statistics(
    current_user: User = Depends(get_current_user)
):
    """
    Get cache performance statistics for monitoring and debugging.

    Returns cache hit rates, memory usage, and invalidation counts.
    Only accessible by authenticated users for their own monitoring.
    """
    try:
        cache_stats = get_cache_stats()

        return {
            "cache_performance": cache_stats,
            "configuration": {
                "ttl_seconds": _DASH_TTL_SECONDS,
                "max_stats_cache": _STATS_CACHE_MAX,
                "max_activity_cache": _ACTIVITY_CACHE_MAX,
                "max_quick_cache": _QUICK_CACHE_MAX
            },
            "current_user_cache_status": {
                "stats_cached": current_user.uuid in _STATS_CACHE,
                "activity_cached": any(key[0] == current_user.uuid for key in _ACTIVITY_CACHE.keys()),
                "quick_cached": current_user.uuid in _QUICK_CACHE
            },
            "retrieved_at": datetime.now(NEPAL_TZ).isoformat()
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve cache statistics: {str(e)}"
        )


@router.post("/cache/invalidate")
async def invalidate_my_cache(
    current_user: User = Depends(get_current_user)
):
    """
    Manually invalidate current user's dashboard cache.

    Useful for:
    - Force refresh after suspicious data
    - Testing cache invalidation
    - Troubleshooting stale data issues
    """
    try:
        invalidate_user_dashboard_cache(current_user.uuid, "manual_invalidation")

        return {
            "success": True,
            "message": "Dashboard cache invalidated successfully",
            "user_uuid": current_user.uuid,
            "invalidated_at": datetime.now(NEPAL_TZ).isoformat()
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to invalidate cache: {str(e)}"
        )


# Initialize logger
logger = logging.getLogger(__name__)

# Diary streak calculation moved to shared dashboard stats service 