"""
Search Cache Service
Provides Redis-based caching for search results to improve performance and reduce database load
"""

import json
import pickle
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta
import redis.asyncio as redis
from ..config import settings, get_redis_url

logger = logging.getLogger(__name__)

class SearchCacheService:
    """Redis-based caching service for search results"""

    def __init__(self):
        self.redis_client: Optional[redis.Redis] = None
        self.is_available = False
        self.default_ttl = 300  # 5 minutes default TTL

    async def initialize(self) -> bool:
        """Initialize Redis connection"""
        try:
            redis_url = get_redis_url()
            self.redis_client = redis.from_url(redis_url, decode_responses=True)

            # Test connection
            await self.redis_client.ping()
            self.is_available = True
            logger.info("✅ Search cache service initialized with Redis")
            return True

        except Exception as e:
            logger.warning(f"⚠️ Redis cache not available: {e}. Using in-memory fallback.")
            self.is_available = False
            return False

    async def close(self):
        """Close Redis connection"""
        if self.redis_client:
            await self.redis_client.close()
            logger.info("🔌 Search cache service connection closed")

    def _generate_cache_key(self, query: str, user_id: int,
                           modules: Optional[List[str]] = None,
                           search_type: str = "fts5",
                           **additional_params) -> str:
        """Generate consistent cache key for search results"""
        key_parts = [
            "search",
            search_type,
            str(user_id),
            query.lower().strip(),
        ]

        if modules:
            key_parts.append(":".join(sorted(modules)))

        # Add additional params to key (sorted for consistency)
        if additional_params:
            param_str = ":".join(f"{k}={v}" for k, v in sorted(additional_params.items()))
            key_parts.append(param_str)

        return "|".join(key_parts)

    async def get_search_results(self, query: str, user_id: int,
                              modules: Optional[List[str]] = None,
                              search_type: str = "fts5",
                              **additional_params) -> Optional[Dict[str, Any]]:
        """Get cached search results"""
        if not self.is_available:
            return None

        try:
            cache_key = self._generate_cache_key(query, user_id, modules, search_type, **additional_params)
            cached_data = await self.redis_client.get(cache_key)

            if cached_data:
                logger.debug(f"🎯 Cache hit for search: '{query[:50]}...'")
                return json.loads(cached_data)

            logger.debug(f"🔍 Cache miss for search: '{query[:50]}...'")
            return None

        except Exception as e:
            logger.error(f"❌ Error getting search cache: {e}")
            return None

    async def set_search_results(self, query: str, user_id: int,
                              results: Dict[str, Any],
                              modules: Optional[List[str]] = None,
                              search_type: str = "fts5",
                              ttl: Optional[int] = None,
                              **additional_params) -> bool:
        """Cache search results"""
        if not self.is_available:
            return False

        try:
            cache_key = self._generate_cache_key(query, user_id, modules, search_type, **additional_params)
            cache_ttl = ttl or self.default_ttl

            # Serialize results
            serialized_data = json.dumps(results, default=str)

            # Set in cache with TTL
            await self.redis_client.setex(cache_key, cache_ttl, serialized_data)
            logger.debug(f"💾 Cached search results: '{query[:50]}...' (TTL: {cache_ttl}s)")
            return True

        except Exception as e:
            logger.error(f"❌ Error setting search cache: {e}")
            return False

    async def invalidate_search_cache(self, user_id: int = None,
                                    modules: Optional[List[str]] = None,
                                    query_pattern: Optional[str] = None) -> int:
        """Invalidate cached search results"""
        if not self.is_available:
            return 0

        try:
            keys_to_delete = []

            if user_id is not None:
                # Invalidate all searches for a specific user
                pattern = f"search:*:{user_id}:*"
                if modules:
                    pattern = f"search:*:{user_id}:{':'.join(sorted(modules))}*"

                keys = await self.redis_client.keys(pattern)
                keys_to_delete.extend(keys)

            elif query_pattern:
                # Invalidate searches matching a query pattern
                pattern = f"search:*:*:*{query_pattern.lower()}*"
                keys = await self.redis_client.keys(pattern)
                keys_to_delete.extend(keys)

            elif modules:
                # Invalidate all searches for specific modules
                module_str = ':'.join(sorted(modules))
                pattern = f"search:*:*:{module_str}*"
                keys = await self.redis_client.keys(pattern)
                keys_to_delete.extend(keys)

            if keys_to_delete:
                deleted_count = await self.redis_client.delete(*keys_to_delete)
                logger.info(f"🗑️ Invalidated {deleted_count} cached search results")
                return deleted_count

            return 0

        except Exception as e:
            logger.error(f"❌ Error invalidating search cache: {e}")
            return 0

    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        if not self.is_available:
            return {"status": "unavailable", "message": "Redis not available"}

        try:
            info = await self.redis_client.info("memory")
            key_count = await self.redis_client.dbsize()

            return {
                "status": "available",
                "total_keys": key_count,
                "memory_used": info.get("used_memory_human", "N/A"),
                "memory_peak": info.get("used_memory_peak_human", "N/A"),
                "keyspace_hits": info.get("keyspace_hits", 0),
                "keyspace_misses": info.get("keyspace_misses", 0),
                "cache_hit_rate": self._calculate_hit_rate(info)
            }

        except Exception as e:
            logger.error(f"❌ Error getting cache stats: {e}")
            return {"status": "error", "message": str(e)}

    def _calculate_hit_rate(self, redis_info: Dict[str, Any]) -> float:
        """Calculate cache hit rate from Redis info"""
        hits = redis_info.get("keyspace_hits", 0)
        misses = redis_info.get("keyspace_misses", 0)
        total = hits + misses

        if total == 0:
            return 0.0

        return round((hits / total) * 100, 2)

    async def clear_all_cache(self) -> bool:
        """Clear all cached search results"""
        if not self.is_available:
            return False

        try:
            pattern = "search:*"
            keys = await self.redis_client.keys(pattern)

            if keys:
                deleted_count = await self.redis_client.delete(*keys)
                logger.info(f"🧹 Cleared {deleted_count} cached search results")
                return True

            return True

        except Exception as e:
            logger.error(f"❌ Error clearing search cache: {e}")
            return False

# In-memory fallback cache when Redis is not available
class InMemorySearchCache:
    """Simple in-memory cache as fallback when Redis is not available"""

    def __init__(self):
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.timestamps: Dict[str, float] = {}
        self.default_ttl = 300  # 5 minutes
        self.max_size = 1000  # Maximum number of cached items

    def _generate_cache_key(self, query: str, user_id: int,
                           modules: Optional[List[str]] = None,
                           search_type: str = "fts5",
                           **additional_params) -> str:
        """Generate consistent cache key"""
        key_parts = [
            "search",
            search_type,
            str(user_id),
            query.lower().strip(),
        ]

        if modules:
            key_parts.append(":".join(sorted(modules)))

        if additional_params:
            param_str = ":".join(f"{k}={v}" for k, v in sorted(additional_params.items()))
            key_parts.append(param_str)

        return "|".join(key_parts)

    def get(self, query: str, user_id: int,
            modules: Optional[List[str]] = None,
            search_type: str = "fts5",
            **additional_params) -> Optional[Dict[str, Any]]:
        """Get cached results from memory"""
        cache_key = self._generate_cache_key(query, user_id, modules, search_type, **additional_params)

        if cache_key in self.cache:
            timestamp = self.timestamps.get(cache_key, 0)
            if datetime.now().timestamp() - timestamp < self.default_ttl:
                return self.cache[cache_key]
            else:
                # Expired entry
                del self.cache[cache_key]
                del self.timestamps[cache_key]

        return None

    def set(self, query: str, user_id: int,
            results: Dict[str, Any],
            modules: Optional[List[str]] = None,
            search_type: str = "fts5",
            ttl: Optional[int] = None,
            **additional_params) -> bool:
        """Cache results in memory"""
        cache_key = self._generate_cache_key(query, user_id, modules, search_type, **additional_params)

        # Clean up old entries if cache is full
        if len(self.cache) >= self.max_size:
            self._cleanup_expired()
            if len(self.cache) >= self.max_size:
                self._cleanup_oldest()

        self.cache[cache_key] = results
        self.timestamps[cache_key] = datetime.now().timestamp()
        return True

    def _cleanup_expired(self):
        """Remove expired entries"""
        now = datetime.now().timestamp()
        expired_keys = [
            key for key, timestamp in self.timestamps.items()
            if now - timestamp >= self.default_ttl
        ]

        for key in expired_keys:
            del self.cache[key]
            del self.timestamps[key]

    def _cleanup_oldest(self):
        """Remove oldest entries to make room"""
        if not self.timestamps:
            return

        oldest_key = min(self.timestamps.keys(), key=self.timestamps.get)
        del self.cache[oldest_key]
        del self.timestamps[oldest_key]

    def clear(self):
        """Clear all cached results"""
        self.cache.clear()
        self.timestamps.clear()

# Global instances
search_cache_service = SearchCacheService()
in_memory_cache = InMemorySearchCache()

async def get_cached_search_results(query: str, user_id: int,
                                   modules: Optional[List[str]] = None,
                                   search_type: str = "fts5",
                                   **additional_params) -> Optional[Dict[str, Any]]:
    """Get cached search results with fallback"""
    # Try Redis first
    if search_cache_service.is_available:
        result = await search_cache_service.get_search_results(
            query, user_id, modules, search_type, **additional_params
        )
        if result:
            return result

    # Fall back to in-memory cache
    return in_memory_cache.get(query, user_id, modules, search_type, **additional_params)

async def cache_search_results(query: str, user_id: int,
                             results: Dict[str, Any],
                             modules: Optional[List[str]] = None,
                             search_type: str = "fts5",
                             ttl: Optional[int] = None,
                             **additional_params) -> bool:
    """Cache search results with fallback"""
    # Try Redis first
    if search_cache_service.is_available:
        redis_success = await search_cache_service.set_search_results(
            query, user_id, results, modules, search_type, ttl, **additional_params
        )
        if redis_success:
            return True

    # Fall back to in-memory cache
    return in_memory_cache.set(query, user_id, results, modules, search_type, ttl, **additional_params)

async def invalidate_search_cache(user_id: int = None,
                                modules: Optional[List[str]] = None,
                                query_pattern: Optional[str] = None) -> int:
    """Invalidate cached search results"""
    # Clear Redis cache
    redis_count = 0
    if search_cache_service.is_available:
        redis_count = await search_cache_service.invalidate_search_cache(
            user_id, modules, query_pattern
        )

    # Clear in-memory cache
    in_memory_cache.clear()

    return redis_count