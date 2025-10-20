"""
Dashboard Router for PKMS Backend

Thin router that delegates all business logic to DashboardService.
Handles only HTTP concerns: request/response mapping, authentication, error handling.

Refactored to follow "thin router, thick service" architecture pattern.
"""

from datetime import datetime
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.dashboard import DashboardStats, ModuleActivity, QuickStats
from app.services.dashboard_service import dashboard_service
from app.services.unified_cache_service import get_all_cache_stats

router = APIRouter()
logger = logging.getLogger(__name__)


def invalidate_user_dashboard_cache(user_uuid: str, reason: str = "data_update"):
    """
    Invalidate dashboard cache for specific user when their data changes.

    This is a convenience wrapper for external modules to call.
    Call this function whenever:
    - Note/Todo/Project is created, updated, or deleted
    - Status changes occur
    - Any dashboard-affecting data modification
    
    Args:
        user_uuid: User UUID to invalidate cache for
        reason: Reason for invalidation (for logging)
    """
    return dashboard_service.invalidate_user_cache(user_uuid, reason)


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get aggregated statistics for all modules in a single request.
    
    Optimized for fast dashboard loading with 120s TTL cache.
    """
    try:
        return await dashboard_service.get_dashboard_stats(db, current_user.uuid)
    except Exception as e:
        logger.exception(f"Error getting dashboard stats for user {current_user.uuid}")
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
    """
    Get recent activity across all modules.
    
    Args:
        days: Number of days to look back (default 7)
    """
    try:
        return await dashboard_service.get_recent_activity(db, current_user.uuid, days)
    except Exception as e:
        logger.exception(f"Error getting activity for user {current_user.uuid}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load activity data: {str(e)}"
        )


@router.get("/quick-stats", response_model=QuickStats)
async def get_quick_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get quick overview statistics for dashboard widgets.
    
    Includes totals, active projects, overdue todos, diary streak, and storage.
    """
    try:
        return await dashboard_service.get_quick_stats(db, current_user.uuid)
    except Exception as e:
        logger.exception(f"Error getting quick stats for user {current_user.uuid}")
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
        # Get stats from all cache instances
        all_cache_stats = get_all_cache_stats()
        
        return {
            "cache_performance": all_cache_stats,
            "configuration": {
                "dashboard_ttl_seconds": 120,
                "diary_ttl_seconds": 30,
                "general_ttl_seconds": 300,
            },
            "message": "Cache is working correctly. High hit rates indicate good performance."
        }
    except Exception as e:
        logger.exception("Error getting cache statistics")
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

    Useful for debugging or forcing cache refresh.
    Returns number of cache entries that were invalidated.
    """
    try:
        count = dashboard_service.invalidate_user_cache(
            current_user.uuid, 
            reason="manual_invalidation"
        )
        
        return {
            "message": "Cache invalidated successfully",
            "entries_cleared": count,
            "user_uuid": current_user.uuid
        }
    except Exception as e:
        logger.exception(f"Error invalidating cache for user {current_user.uuid}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to invalidate cache: {str(e)}"
        )