"""
Unified Analytics Cache Service
Memory-efficient caching for all analytics results with automatic cleanup
"""
import time
import hashlib
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from app.config import NEPAL_TZ
from .analytics_config import CACHE_CONFIG, get_cache_key

logger = logging.getLogger(__name__)

class AnalyticsCache:
    """Memory-efficient cache for analytics results"""

    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._user_cache_keys: Dict[str, List[str]] = {}  # Track keys per user
        self._last_cleanup = time.time()

    def _cleanup_expired_entries(self):
        """Remove expired entries and enforce per-user limits"""
        current_time = time.time()

        # Run cleanup periodically
        if current_time - self._last_cleanup < 60:  # 1 minute
            return

        self._last_cleanup = current_time
        cleaned_count = 0

        # Remove expired entries
        expired_keys = []
        for key, entry in self._cache.items():
            if current_time - entry['timestamp'] > entry['ttl']:
                expired_keys.append(key)

        for key in expired_keys:
            self._remove_entry(key)
            cleaned_count += 1

        # Enforce per-user limits
        for user_uuid, keys in self._user_cache_keys.items():
            if len(keys) > CACHE_CONFIG["max_entries_per_user"]:
                # Sort by timestamp (newest first) and remove oldest
                keys_with_timestamp = [(key, self._cache[key]['timestamp']) for key in keys if key in self._cache]
                keys_with_timestamp.sort(key=lambda x: x[1], reverse=True)

                keys_to_remove = [k for k, _ in keys_with_timestamp[CACHE_CONFIG["max_entries_per_user"]:]]
                for key in keys_to_remove:
                    self._remove_entry(key)
                    cleaned_count += 1

        if cleaned_count > 0:
            logger.info(f"Analytics cache cleanup: removed {cleaned_count} entries")

    def _remove_entry(self, key: str):
        """Remove entry from cache and user tracking"""
        if key in self._cache:
            user_uuid = self._cache[key].get('user_uuid')
            del self._cache[key]

            if user_uuid and user_uuid in self._user_cache_keys:
                if key in self._user_cache_keys[user_uuid]:
                    self._user_cache_keys[user_uuid].remove(key)

                # Clean up empty user entries
                if not self._user_cache_keys[user_uuid]:
                    del self._user_cache_keys[user_uuid]

    def get(self, user_uuid: str, timeframe: str, days: int, analytics_type: str) -> Optional[Dict[str, Any]]:
        """Get cached analytics result"""
        self._cleanup_expired_entries()

        cache_key = get_cache_key(user_uuid, timeframe, days, analytics_type)
        entry = self._cache.get(cache_key)

        if entry:
            # Check if expired
            if time.time() - entry['timestamp'] > entry['ttl']:
                self._remove_entry(cache_key)
                return None

            logger.debug(f"Cache hit: {cache_key}")
            return entry['data']

        return None

    def set(self, user_uuid: str, timeframe: str, days: int, analytics_type: str,
            data: Dict[str, Any], ttl: int):
        """Cache analytics result"""
        cache_key = get_cache_key(user_uuid, timeframe, days, analytics_type)

        # Store entry
        self._cache[cache_key] = {
            'data': data,
            'timestamp': time.time(),
            'ttl': ttl,
            'user_uuid': user_uuid,
            'timeframe': timeframe,
            'days': days,
            'analytics_type': analytics_type
        }

        # Track user keys
        if user_uuid not in self._user_cache_keys:
            self._user_cache_keys[user_uuid] = []

        if cache_key not in self._user_cache_keys[user_uuid]:
            self._user_cache_keys[user_uuid].append(cache_key)

        logger.debug(f"Cached: {cache_key} (TTL: {ttl}s)")

    def invalidate_user(self, user_uuid: str):
        """Clear all cached data for a specific user"""
        keys_to_remove = self._user_cache_keys.get(user_uuid, []).copy()
        for key in keys_to_remove:
            self._remove_entry(key)

        logger.info(f"Invalidated {len(keys_to_remove)} cache entries for user {user_uuid}")

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics for monitoring"""
        return {
            "total_entries": len(self._cache),
            "users_cached": len(self._user_cache_keys),
            "memory_estimate_mb": len(self._cache) * 0.002,  # Rough estimate
            "last_cleanup": self._last_cleanup
        }

# Global cache instance
analytics_cache = AnalyticsCache()