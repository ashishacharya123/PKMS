"""
Dashboard Cache Service

Intelligent caching system for dashboard statistics with TTL-based expiration
and event-driven invalidation. Dramatically reduces dashboard load times
from 15+ database queries to single cache lookup.

Features:
- 1-2 minute TTL for dashboard stats
- Event-driven invalidation on data changes
- Per-user isolation for multi-tenancy
- Graceful fallback on cache misses
"""

import time
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class CacheEntry:
    """Cache entry with TTL support"""

    def __init__(self, data: Dict[str, Any], ttl_seconds: int = 120):
        self.data = data
        self.expires_at = time.time() + ttl_seconds
        self.created_at = time.time()

    def is_expired(self) -> bool:
        return time.time() > self.expires_at

    def get_age_seconds(self) -> float:
        return time.time() - self.created_at


class DashboardCacheService:
    """
    High-performance caching service for dashboard statistics.

    Caches all dashboard stats per user with intelligent invalidation.
    Reduces database queries from 15+ per dashboard load to 0-1.
    """

    def __init__(self, default_ttl_seconds: int = 120):
        self.default_ttl = default_ttl_seconds
        self._cache: Dict[str, CacheEntry] = {}  # user_uuid -> CacheEntry
        self._cache_lock = asyncio.Lock()

        # Cache statistics for monitoring
        self._stats = {
            "hits": 0,
            "misses": 0,
            "invalidations": 0,
            "total_requests": 0
        }

    async def get_dashboard_stats(
        self,
        user_uuid: str,
        db_session,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Get dashboard statistics with intelligent caching.

        Args:
            user_uuid: User identifier for cache isolation
            db_session: Database session for cache miss population
            force_refresh: Force cache refresh regardless of TTL

        Returns:
            Complete dashboard statistics dictionary
        """
        self._stats["total_requests"] += 1

        cache_key = f"dashboard_stats:{user_uuid}"

        async with self._cache_lock:
            cache_entry = self._cache.get(cache_key)

            # Check cache hit
            if (cache_entry and
                not cache_entry.is_expired() and
                not force_refresh):

                self._stats["hits"] += 1
                logger.debug(f"Cache hit for user {user_uuid}, age: {cache_entry.get_age_seconds():.1f}s")
                return cache_entry.data

            # Cache miss - generate fresh data
            self._stats["misses"] += 1
            logger.info(f"Cache miss for user {user_uuid} - generating dashboard stats")

        # Generate fresh dashboard data
        fresh_data = await self._generate_fresh_dashboard_data(user_uuid, db_session)

        # Store in cache
        await self._store_cache(cache_key, fresh_data)

        return fresh_data

    async def _generate_fresh_dashboard_data(self, user_uuid: str, db_session) -> Dict[str, Any]:
        """Generate fresh dashboard data from database"""
        from app.services.dashboard_stats_service import dashboard_stats_service

        # Use existing dashboard service but wrap in single transaction for efficiency
        try:
            # Get all statistics in parallel for better performance
            todo_stats_task = dashboard_stats_service.get_todo_stats(db_session, user_uuid)
            notes_stats_task = dashboard_stats_service.get_notes_stats(db_session, user_uuid)
            docs_stats_task = dashboard_stats_service.get_documents_stats(db_session, user_uuid)
            projects_stats_task = dashboard_stats_service.get_projects_stats(db_session, user_uuid)
            diary_stats_task = dashboard_stats_service.get_diary_stats(db_session, user_uuid)
            archive_stats_task = dashboard_stats_service.get_archive_stats(db_session, user_uuid)
            activity_stats_task = dashboard_stats_service.get_recent_activity_stats(db_session, user_uuid)

            # Execute all queries concurrently
            (todo_stats, notes_stats, docs_stats,
             projects_stats, diary_stats, archive_stats,
             activity_stats) = await asyncio.gather(
                todo_stats_task, notes_stats_task, docs_stats_task,
                projects_stats_task, diary_stats_task, archive_stats_task,
                activity_stats_task
            )

            return {
                "todo": todo_stats,
                "notes": notes_stats,
                "documents": docs_stats,
                "projects": projects_stats,
                "diary": diary_stats,
                "archive": archive_stats,
                "recent_activity": activity_stats,
                "cached_at": datetime.utcnow().isoformat(),
                "cache_ttl_seconds": self.default_ttl
            }

        except Exception as e:
            logger.exception(f"Error generating dashboard data for user {user_uuid}")
            raise

    async def _store_cache(self, cache_key: str, data: Dict[str, Any]):
        """Store data in cache with TTL"""
        async with self._cache_lock:
            self._cache[cache_key] = CacheEntry(data, self.default_ttl)

        # Periodic cleanup of expired entries
        if len(self._cache) > 100:  # Cleanup when cache gets large
            await self._cleanup_expired_entries()

    async def invalidate_user_cache(self, user_uuid: str, reason: str = "data_update"):
        """
        Invalidate cache for specific user.

        Call this whenever user's data changes:
        - New note/todo/project created
        - Items updated/deleted
        - Status changes
        """
        cache_key = f"dashboard_stats:{user_uuid}"

        async with self._cache_lock:
            if cache_key in self._cache:
                del self._cache[cache_key]
                self._stats["invalidations"] += 1
                logger.info(f"Invalidated cache for user {user_uuid} - reason: {reason}")

    async def invalidate_all_cache(self, reason: str = "system_maintenance"):
        """Invalidate all cached data - use sparingly"""
        async with self._cache_lock:
            cache_size = len(self._cache)
            self._cache.clear()
            self._stats["invalidations"] += cache_size
            logger.info(f"Cleared {cache_size} cache entries - reason: {reason}")

    async def _cleanup_expired_entries(self):
        """Remove expired cache entries to prevent memory leaks"""
        current_time = time.time()
        expired_keys = []

        for key, entry in self._cache.items():
            if entry.is_expired():
                expired_keys.append(key)

        for key in expired_keys:
            del self._cache[key]

        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics"""
        total = self._stats["total_requests"]
        hit_rate = (self._stats["hits"] / total * 100) if total > 0 else 0

        return {
            "hit_rate_percent": round(hit_rate, 2),
            "total_requests": self._stats["total_requests"],
            "cache_hits": self._stats["hits"],
            "cache_misses": self._stats["misses"],
            "invalidations": self._stats["invalidations"],
            "cached_users": len(self._cache),
            "default_ttl_seconds": self.default_ttl
        }

    async def health_check(self) -> Dict[str, Any]:
        """Health check for cache service"""
        async with self._cache_lock:
            cache_size = len(self._cache)
            expired_count = sum(1 for entry in self._cache.values() if entry.is_expired())

        return {
            "status": "healthy",
            "cache_size": cache_size,
            "expired_entries": expired_count,
            "stats": self.get_cache_stats()
        }


# Global singleton instance
dashboard_cache_service = DashboardCacheService(default_ttl_seconds=120)  # 2 minutes


# Cache invalidation decorator for automatic cache management
def invalidate_dashboard_cache(operation_type: str = "update"):
    """
    Decorator to automatically invalidate dashboard cache after operations.

    Usage:
    @invalidate_dashboard_cache("note_create")
    async def create_note(...):
        # Note creation logic
        pass
    """
    def decorator(func):
        async def wrapper(*args, **kwargs):
            # Extract user_uuid from function arguments
            user_uuid = None

            # Common patterns for user UUID extraction
            if 'current_user' in kwargs:
                user_uuid = kwargs['current_user'].uuid
            elif 'user_uuid' in kwargs:
                user_uuid = kwargs['user_uuid']
            elif args and hasattr(args[0], 'uuid'):  # First argument might be User object
                user_uuid = args[0].uuid

            # Execute the original function
            result = await func(*args, **kwargs)

            # Invalidate cache if we could determine the user
            if user_uuid:
                await dashboard_cache_service.invalidate_user_cache(
                    user_uuid,
                    f"{operation_type}_operation"
                )

            return result
        return wrapper
    return decorator