"""
Cache Invalidation Service
Intelligent cache invalidation based on data changes
"""

import asyncio
from typing import Dict, Set, Any, Optional
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class InvalidationStrategy(Enum):
    """Cache invalidation strategies"""
    IMMEDIATE = "immediate"      # Invalidate immediately
    DELAYED = "delayed"          # Invalidate after delay
    BATCH = "batch"             # Batch invalidations
    SMART = "smart"             # Smart invalidation based on patterns

class CacheInvalidationService:
    """Service for intelligent cache invalidation - Single point of truth for all cache invalidation"""
    
    def __init__(self):
        self.invalidation_queue = asyncio.Queue()
        self.patterns: Dict[str, Set[str]] = {}  # pattern -> set of cache keys
        self.dependencies: Dict[str, Set[str]] = {}  # key -> set of dependent keys
        self.strategy = InvalidationStrategy.SMART
        self.batch_delay = 5.0  # seconds
        self._running = False
        self._task: Optional[asyncio.Task] = None  # ADD: Store task handle
        self._cache_instances = {}  # Will store cache instances
    
    async def start(self):
        """Start the invalidation service"""
        if not self._running:
            self._running = True
            # Store task handle for cleanup
            self._task = asyncio.create_task(self._process_invalidations())
    
    async def stop(self):
        """Stop the invalidation service with proper cleanup"""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass  # Expected
            self._task = None
    
    async def invalidate_on_create(self, module: str, item_id: str, tags: Set[str] = None):
        """Invalidate cache when new item is created"""
        patterns = [
            f"{module}:list:*",
            f"{module}:stats:*",
            f"dashboard:*",
            f"analytics:*"
        ]
        
        if tags:
            for tag in tags:
                patterns.append(f"tag:{tag}:*")
        
        await self._queue_invalidation(patterns, f"create:{module}:{item_id}")
    
    async def invalidate_on_update(self, module: str, item_id: str, tags: Set[str] = None):
        """Invalidate cache when item is updated"""
        patterns = [
            f"{module}:item:{item_id}",
            f"{module}:list:*",
            f"{module}:stats:*",
            f"dashboard:*"
        ]
        
        if tags:
            for tag in tags:
                patterns.append(f"tag:{tag}:*")
        
        await self._queue_invalidation(patterns, f"update:{module}:{item_id}")
    
    async def invalidate_on_delete(self, module: str, item_id: str, tags: Set[str] = None):
        """Invalidate cache when item is deleted"""
        patterns = [
            f"{module}:item:{item_id}",
            f"{module}:list:*",
            f"{module}:stats:*",
            f"dashboard:*",
            f"analytics:*"
        ]
        
        if tags:
            for tag in tags:
                patterns.append(f"tag:{tag}:*")
        
        await self._queue_invalidation(patterns, f"delete:{module}:{item_id}")
    
    async def invalidate_by_pattern(self, pattern: str, reason: str = "manual"):
        """Invalidate cache entries matching a pattern"""
        await self._queue_invalidation([pattern], reason)
    
    async def invalidate_user_data(self, user_id: str, reason: str = "user_data_change"):
        """Invalidate all cache entries for a specific user"""
        patterns = [
            f"user:{user_id}:*",
            f"dashboard:{user_id}:*",
            f"analytics:{user_id}:*"
        ]
        
        await self._queue_invalidation(patterns, f"{reason}:{user_id}")
    
    async def _queue_invalidation(self, patterns: list, reason: str):
        """Queue invalidation for processing"""
        await self.invalidation_queue.put({
            "patterns": patterns,
            "reason": reason,
            "timestamp": asyncio.get_event_loop().time()
        })
    
    async def _process_invalidations(self):
        """Process invalidation queue"""
        batch = []
        
        while self._running:
            try:
                # Collect batch of invalidations
                timeout = self.batch_delay
                while len(batch) < 10:  # Max batch size
                    try:
                        invalidation = await asyncio.wait_for(
                            self.invalidation_queue.get(), 
                            timeout=timeout
                        )
                        batch.append(invalidation)
                        timeout = 0.1  # Short timeout for batching
                    except asyncio.TimeoutError:
                        break
                
                if batch:
                    await self._execute_batch_invalidation(batch)
                    batch.clear()
                
            except Exception as e:
                logger.exception("Invalidation processing failed")
                await asyncio.sleep(1)
    
    async def _execute_batch_invalidation(self, batch: list):
        """Execute batch invalidation"""
        from app.services.unified_cache_service import analytics_cache, search_cache, user_cache, dashboard_cache
        
        # Collect all patterns to invalidate
        all_patterns = set()
        for invalidation in batch:
            all_patterns.update(invalidation["patterns"])
        
        # Invalidate by pattern
        for pattern in all_patterns:
            try:
                # Analytics cache
                if pattern.startswith("analytics:") or pattern.startswith("dashboard:"):
                    analytics_cache.invalidate_pattern(pattern)
                    dashboard_cache.invalidate_pattern(pattern)
                
                # Search cache
                if pattern.startswith("search:") or pattern.startswith("tag:"):
                    search_cache.invalidate_pattern(pattern)
                
                # User data cache
                if pattern.startswith("user:"):
                    user_cache.invalidate_pattern(pattern)
                
                logger.info(f"Invalidated pattern: {pattern}")
                
            except Exception as e:
                logger.exception(f"Failed to invalidate pattern {pattern}")
    
    def add_dependency(self, key: str, dependent_key: str):
        """Add dependency relationship between cache keys"""
        if key not in self.dependencies:
            self.dependencies[key] = set()
        self.dependencies[key].add(dependent_key)
    
    async def invalidate_dependencies(self, key: str):
        """Invalidate all dependent cache keys"""
        if key in self.dependencies:
            for dependent_key in self.dependencies[key]:
                await self.invalidate_by_pattern(dependent_key, f"dependency:{key}")
    
    def register_cache_instances(self, cache_instances: Dict[str, Any]):
        """Register cache instances for direct invalidation"""
        self._cache_instances = cache_instances
    
    def invalidate_key(self, key: str, cache_name: str = None) -> bool:
        """
        Remove specific key from cache (moved from unified_cache_service)
        
        Args:
            key: Cache key to remove
            cache_name: Specific cache instance name, or None for all caches
            
        Returns:
            True if key was found and removed, False otherwise
        """
        if cache_name and cache_name in self._cache_instances:
            return self._cache_instances[cache_name]._invalidate_internal(key)
        
        # Invalidate in all caches
        invalidated = False
        for cache in self._cache_instances.values():
            if cache._invalidate_internal(key):
                invalidated = True
        
        return invalidated
    
    def invalidate_pattern(self, pattern: str, cache_name: str = None) -> int:
        """
        Invalidate all keys starting with pattern (moved from unified_cache_service)
        
        Args:
            pattern: Key prefix to match
            cache_name: Specific cache instance name, or None for all caches
            
        Returns:
            Number of keys invalidated
        """
        total_invalidated = 0
        
        if cache_name and cache_name in self._cache_instances:
            return self._cache_instances[cache_name]._invalidate_pattern_internal(pattern)
        
        # Invalidate in all caches
        for cache in self._cache_instances.values():
            total_invalidated += cache._invalidate_pattern_internal(pattern)
        
        return total_invalidated
    
    def clear_all_caches(self):
        """Clear all registered cache instances"""
        for cache in self._cache_instances.values():
            cache.clear()

# Global invalidation service
cache_invalidation_service = CacheInvalidationService()

# Register cache instances from unified_cache_service
def initialize_invalidation_service():
    """Initialize the invalidation service with cache instances"""
    from app.services.unified_cache_service import (
        dashboard_cache, diary_cache, general_cache, 
        analytics_cache, search_cache, user_cache
    )
    
    cache_instances = {
        "dashboard": dashboard_cache,
        "diary": diary_cache,
        "general": general_cache,
        "analytics": analytics_cache,
        "search": search_cache,
        "user": user_cache
    }
    
    cache_invalidation_service.register_cache_instances(cache_instances)
    # NOTE: Call initialize_invalidation_service() during FastAPI startup and await
    # cache_invalidation_service.start() in the app lifespan/startup event.
