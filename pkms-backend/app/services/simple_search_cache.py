"""
Simple Search Cache Service

Lightweight in-memory caching for search results.
Stores only UUIDs, scores, and metadata - not full result data.
Perfect for FTS5 which is already fast and returns minimal data.

Benefits:
- Tiny memory footprint (KB-level cache)
- Fast lookups (O(1) dictionary access)
- Simple invalidation
- No external dependencies
- High cache hit rate for repeated queries
"""

import time
import logging
import asyncio
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class SimpleSearchCacheService:
    """Lightweight in-memory search cache for UUIDs and scores only"""

    def __init__(self, default_ttl_seconds: int = 300):
        self.default_ttl = default_ttl_seconds
        self._cache: Dict[str, Dict] = {}
        self._lock = asyncio.Lock()
        self._stats = {
            "hits": 0,
            "misses": 0,
            "invalidations": 0,
            "total_requests": 0
        }

    def _generate_cache_key(self, query: str, user_uuid: str,
                           item_types: Optional[List[str]] = None,
                           limit: int = 50, offset: int = 0,
                           **additional_params) -> str:
        """Generate consistent cache key for search results"""
        # Normalize query for consistent keys
        normalized_query = query.lower().strip()

        # Build key components
        key_parts = [
            normalized_query,
            user_uuid,
            str(limit),
            str(offset)
        ]

        # Add item types if specified
        if item_types:
            key_parts.append(":".join(sorted(item_types)))

        # Add any additional params (sorted for consistency)
        if additional_params:
            param_str = ":".join(f"{k}={v}" for k, v in sorted(additional_params.items()))
            key_parts.append(param_str)

        return "|".join(key_parts)

    async def get_search_results(self, query: str, user_uuid: str,
                          item_types: Optional[List[str]] = None,
                          limit: int = 50, offset: int = 0,
                          **additional_params) -> Optional[List[Dict]]:
        """
        Get cached search results (UUIDs + scores only).

        Args:
            query: Search query string
            user_uuid: User identifier
            item_types: Optional list of item types to search
            limit: Maximum number of results
            offset: Offset for pagination
            **additional_params: Additional search parameters

        Returns:
            List of cached result dictionaries with uuids and scores, or None if not cached
        """
        async with self._lock:
            self._stats["total_requests"] += 1

            cache_key = self._generate_cache_key(query, user_uuid, item_types, limit, offset, **additional_params)
            cache_entry = self._cache.get(cache_key)

            if cache_entry and cache_entry["expires_at"] > time.time():
                self._stats["hits"] += 1
                logger.debug(f"Search cache HIT: query='{query[:30]}...' for user {user_uuid[:8]}")
                return cache_entry["results"]

            self._stats["misses"] += 1
            logger.debug(f"Search cache MISS: query='{query[:30]}...' for user {user_uuid[:8]}")
            return None

    async def store_search_results(self, query: str, user_uuid: str, results: List[Dict],
                           item_types: Optional[List[str]] = None,
                           limit: int = 50, offset: int = 0,
                           **additional_params) -> None:
        """
        Store search results in cache (UUIDs + scores only).

        Args:
            query: Search query string
            user_uuid: User identifier
            results: Search results from database
            item_types: List of item types searched
            limit: Number of results returned
            offset: Offset used
            **additional_params: Additional search parameters
        """
        cache_key = self._generate_cache_key(query, user_uuid, item_types, limit, offset, **additional_params)

        # Store only essential data - UUIDs, scores, and metadata
        cache_entry = {
            "results": [
                {
                    "uuid": result["uuid"],
                    "item_type": result["item_type"],
                    "score": result.get("score", 0.0),
                    "created_at": result.get("created_at")
                }
                for result in results
            ],
            "query": query,
            "item_types": item_types or [],
            "limit": limit,
            "offset": offset,
            "cached_at": time.time(),
            "expires_at": time.time() + self.default_ttl,
            "result_count": len(results)
        }

        async with self._lock:
            self._cache[cache_key] = cache_entry

            # Periodic cleanup of expired entries
            if len(self._cache) > 1000:  # Cleanup when cache gets large
                await self._cleanup_expired_entries()

        logger.debug(f"Cached {len(results)} search results for query: '{query[:30]}...'")

    async def invalidate_user_cache(self, user_uuid: str, reason: str = "data_update"):
        """
        Invalidate search cache for specific user when their data changes.

        Call this whenever:
        - Note/Todo/Project content changes
        - Items are created, updated, or deleted
        - Content indexing completes
        """
        async with self._lock:
            keys_to_remove = [
                key for key in self._cache.keys()
                if key.split("|")[1] == user_uuid
            ]

            for key in keys_to_remove:
                del self._cache[key]

            if keys_to_remove:
                self._stats["invalidations"] += len(keys_to_remove)
                logger.info(f"Invalidated {len(keys_to_remove)} search cache entries for user {user_uuid[:8]} - reason: {reason}")

    async def invalidate_all_cache(self, reason: str = "system_maintenance"):
        """Invalidate all search cache entries - use sparingly"""
        async with self._lock:
            cache_size = len(self._cache)
            self._cache.clear()
            self._stats["invalidations"] += cache_size
            logger.info(f"Cleared {cache_size} search cache entries - reason: {reason}")

    async def invalidate_query_cache(self, query: str, reason: str = "content_change"):
        """Invalidate cache entries containing specific query"""
        async with self._lock:
            query_lower = query.lower()
            keys_to_remove = [
                key for key in self._cache.keys()
                if key.startswith(f"{query_lower}|")  # Keys start with query
            ]

            for key in keys_to_remove:
                del self._cache[key]

            if keys_to_remove:
                self._stats["invalidations"] += len(keys_to_remove)
                logger.info(f"Invalidated {len(keys_to_remove)} search cache entries for query '{query[:30]}...' - reason: {reason}")

    async def _cleanup_expired_entries(self):
        """Remove expired cache entries to prevent memory leaks"""
        current_time = time.time()
        expired_keys = [
            key for key, entry in self._cache.items()
            if entry["expires_at"] <= current_time
        ]

        for key in expired_keys:
            del self._cache[key]

        if expired_keys:
            logger.debug(f"Cleaned up {len(expired_keys)} expired search cache entries")

    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics"""
        async with self._lock:
            total_requests = self._stats["total_requests"]
            hits = self._stats["hits"]
            hit_rate = (hits / total_requests * 100) if total_requests > 0 else 0

            return {
                "hit_rate_percent": round(hit_rate, 2),
                "total_requests": total_requests,
                "cache_hits": hits,
                "cache_misses": self._stats["misses"],
                "invalidations": self._stats["invalidations"],
                "cached_entries": len(self._cache),
                "memory_usage_kb": round(await self._estimate_memory_usage() / 1024, 2),
                "ttl_seconds": self.default_ttl
            }

    async def _estimate_memory_usage(self) -> int:
        """Estimate memory usage in bytes"""
        # This method should be called within a lock
        total_bytes = 0
        for entry in self._cache.values():
            # Rough estimate: dict + strings + ints overhead
            total_bytes += len(str(entry)) * 2  # String representation estimate
        return total_bytes

    async def health_check(self) -> Dict[str, Any]:
        """Health check for search cache service"""
        async with self._lock:
            stats = await self.get_cache_stats()
            expired_count = len([e for e in self._cache.values() if e["expires_at"] <= time.time()])
            return {
                "status": "healthy",
                "cache_size": len(self._cache),
                "expired_entries": expired_count,
                "stats": stats
            }


# Global singleton instance
simple_search_cache_service = SimpleSearchCacheService(default_ttl_seconds=300)  # 5 minutes