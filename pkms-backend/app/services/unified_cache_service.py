"""
Unified Cache Service

Centralized caching system for PKMS backend with TTL, LRU eviction, and performance statistics.
Used by dashboard analytics, diary metadata, search indexing, and user data caching.
Supports multiple cache instances (analytics, dashboard, search, user) with thread-safe operations.
Designed for easy Redis migration in multi-worker deployments.
"""

import time
import threading
from typing import Any, Optional, Dict, Tuple, TypeVar, Generic
from collections import OrderedDict
import logging

logger = logging.getLogger(__name__)

T = TypeVar('T')


class UnifiedCacheService(Generic[T]):
    """
    Thread-safe in-memory cache with TTL and LRU eviction for PKMS backend.
    
    Used for caching dashboard analytics, diary metadata, search results, and user data.
    Provides automatic expiration, LRU eviction, and performance statistics.
    """
        
        # Set value with default TTL
        cache.set("user:123", user_data)
        
        # Set value with custom TTL
        cache.set("temp:abc", temp_data, ttl_seconds=30)
        
        # Get value (returns None if expired or not found)
        data = cache.get("user:123")
        
        # Invalidate specific key
        from app.services.cache_invalidation_service import cache_invalidation_service
        cache_invalidation_service.invalidate_key("user:123")
        
        # Invalidate by pattern (all keys starting with prefix)
        cache.invalidate_pattern("user:")
        
        # Get statistics
        stats = cache.get_stats()
    """
    
    def __init__(self, max_size: int = 1000, default_ttl: int = 120):
        """
        Initialize cache.
        
        Args:
            max_size: Maximum number of items to store before LRU eviction
            default_ttl: Default time-to-live in seconds
        """
        self.max_size = max_size
        self.default_ttl = default_ttl
        
        # OrderedDict for LRU behavior
        self._cache: OrderedDict[str, Tuple[float, Any]] = OrderedDict()
        
        # Thread lock for thread safety
        self._lock = threading.RLock()
        
        # Statistics
        self._stats = {
            "hits": 0,
            "misses": 0,
            "expired": 0,
            "evictions": 0,
            "invalidations": 0,
            "sets": 0,
        }
    
    def get(self, key: str, default: Optional[T] = None) -> Optional[T]:
        """
        Get value from cache.
        
        Returns None (or default) if:
        - Key doesn't exist
        - Value has expired (TTL exceeded)
        
        Args:
            key: Cache key
            default: Default value if key not found or expired
            
        Returns:
            Cached value or default
        """
        with self._lock:
            if key not in self._cache:
                self._stats["misses"] += 1
                return default
            
            # Check if expired
            expires_at, value = self._cache[key]
            now = time.time()
            
            if now > expires_at:
                # Expired - remove and return default
                del self._cache[key]
                self._stats["expired"] += 1
                self._stats["misses"] += 1
                return default
            
            # Cache hit - move to end (most recently used)
            self._cache.move_to_end(key)
            self._stats["hits"] += 1
            return value
    
    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        """
        Set value in cache with TTL.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl_seconds: Time-to-live in seconds (uses default if not specified)
        """
        with self._lock:
            ttl = ttl_seconds if ttl_seconds is not None else self.default_ttl
            expires_at = time.time() + ttl
            
            # Add or update entry
            self._cache[key] = (expires_at, value)
            self._cache.move_to_end(key)  # Mark as most recently used
            self._stats["sets"] += 1
            
            # LRU eviction if over max size
            while len(self._cache) > self.max_size:
                # Remove least recently used (first item)
                self._cache.popitem(last=False)
                self._stats["evictions"] += 1
    
    def _invalidate_internal(self, key: str) -> bool:
        """
        Internal method to remove specific key from cache.
        Use cache_invalidation_service for public invalidation.
        """
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                self._stats["invalidations"] += 1
                return True
            return False
    
    def _invalidate_pattern_internal(self, pattern: str) -> int:
        """
        Internal method to invalidate all keys starting with pattern.
        Use cache_invalidation_service for public invalidation.
        """
        with self._lock:
            keys_to_remove = [key for key in self._cache.keys() if key.startswith(pattern)]
            count = 0
            for key in keys_to_remove:
                del self._cache[key]
                count += 1
            
            self._stats["invalidations"] += count
            return count
    
    def invalidate_pattern(self, pattern: str) -> int:
        """
        Public method to invalidate all keys starting with pattern.
        """
        return self._invalidate_pattern_internal(pattern)
    
    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            self._stats["invalidations"] += count
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache performance statistics.
        
        Returns:
            Dictionary with hit rate, counts, and size info
        """
        with self._lock:
            total_requests = self._stats["hits"] + self._stats["misses"]
            hit_rate = (self._stats["hits"] / total_requests * 100) if total_requests > 0 else 0
            
            return {
                "hit_rate_percent": round(hit_rate, 2),
                "hits": self._stats["hits"],
                "misses": self._stats["misses"],
                "expired": self._stats["expired"],
                "evictions": self._stats["evictions"],
                "invalidations": self._stats["invalidations"],
                "sets": self._stats["sets"],
                "current_size": len(self._cache),
                "max_size": self.max_size,
                "fill_percent": round(len(self._cache) / self.max_size * 100, 2) if self.max_size > 0 else 0,
            }
    
    def cleanup_expired(self) -> int:
        """
        Manually cleanup expired entries.
        
        Note: This is done automatically on get(), but can be called
        periodically to free memory.
        
        Returns:
            Number of expired entries removed
        """
        with self._lock:
            now = time.time()
            expired_keys = [
                key for key, (expires_at, _) in self._cache.items()
                if now > expires_at
            ]
            
            for key in expired_keys:
                del self._cache[key]
            
            count = len(expired_keys)
            self._stats["expired"] += count
            return count


# Global cache instances for different use cases
# Each has different TTL and size based on data characteristics

# Dashboard statistics cache (2 minute TTL, medium size)
dashboard_cache = UnifiedCacheService(max_size=1024, default_ttl=120)

# Diary highlights cache (30 second TTL, small size)
diary_cache = UnifiedCacheService(max_size=512, default_ttl=30)

# General purpose cache (5 minute TTL, large size)
general_cache = UnifiedCacheService(max_size=2048, default_ttl=300)

# Analytics cache (10 minute TTL, large size for complex calculations)
analytics_cache = UnifiedCacheService(max_size=1024, default_ttl=600)

# Search results cache (5 minute TTL, medium size)
search_cache = UnifiedCacheService(max_size=2048, default_ttl=300)

# User data cache (15 minute TTL, small size)
user_cache = UnifiedCacheService(max_size=512, default_ttl=900)


def get_all_cache_stats() -> Dict[str, Dict[str, Any]]:
    """Get statistics from all cache instances."""
    return {
        "dashboard": dashboard_cache.get_stats(),
        "diary": diary_cache.get_stats(),
        "general": general_cache.get_stats(),
        "analytics": analytics_cache.get_stats(),
        "search": search_cache.get_stats(),
        "user": user_cache.get_stats(),
    }


# Export for convenience
__all__ = [
    "UnifiedCacheService",
    "dashboard_cache",
    "diary_cache",
    "general_cache",
    "analytics_cache",
    "search_cache",
    "user_cache",
    "get_all_cache_stats",
]
