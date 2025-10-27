"""
Unified Cache Service for PKMS

This service provides a simple, unified caching mechanism for all PKMS services.
Replaces the deleted cache services with a single, maintainable implementation.
"""

import logging
from typing import Any, Optional
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class UnifiedCache:
    """Simple in-memory cache with TTL support."""
    
    def __init__(self):
        self._cache = {}
        self._timestamps = {}
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from cache if not expired."""
        if key not in self._cache:
            return None
            
        # Check TTL (default 10 minutes)
        timestamp = self._timestamps.get(key)
        if timestamp and datetime.now() > timestamp + timedelta(minutes=10):
            # Expired, remove from cache
            del self._cache[key]
            del self._timestamps[key]
            return None
            
        return self._cache[key]
    
    def set(self, key: str, value: Any, ttl_minutes: int = 10) -> None:
        """Set value in cache with TTL."""
        self._cache[key] = value
        self._timestamps[key] = datetime.now() + timedelta(minutes=ttl_minutes)
    
    def clear(self, pattern: Optional[str] = None) -> None:
        """Clear cache entries, optionally matching a pattern."""
        if pattern:
            keys_to_remove = [k for k in self._cache.keys() if pattern in k]
            for key in keys_to_remove:
                del self._cache[key]
                del self._timestamps[key]
        else:
            self._cache.clear()
            self._timestamps.clear()
    
    def get_stats(self) -> dict:
        """Get cache statistics."""
        return {
            "total_entries": len(self._cache),
            "keys": list(self._cache.keys())
        }


def get_all_cache_stats() -> dict:
    """Get statistics from all cache instances."""
    return {
        "diary_cache": diary_cache.get_stats(),
        "analytics_cache": analytics_cache.get_stats(),
        "search_cache": search_cache.get_stats(),
        "total_combined_entries": len(diary_cache._cache) + len(analytics_cache._cache) + len(search_cache._cache)
    }


# Global cache instances for different purposes
diary_cache = UnifiedCache()
analytics_cache = UnifiedCache()
search_cache = UnifiedCache()
