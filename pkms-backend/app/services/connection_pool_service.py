"""
Connection Pool Optimization Service
Advanced connection pooling with monitoring and optimization
"""

import asyncio
import time
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import create_async_engine, AsyncEngine
from sqlalchemy.pool import QueuePool
from sqlalchemy import event
import logging

logger = logging.getLogger(__name__)

@dataclass
class PoolMetrics:
    """Connection pool performance metrics"""
    total_connections: int
    active_connections: int
    idle_connections: int
    overflow_connections: int
    checkout_time: float
    checkin_time: float
    pool_size: int
    max_overflow: int

class ConnectionPoolService:
    """Service for connection pool optimization and monitoring"""
    
    def __init__(self):
        self.engine: Optional[AsyncEngine] = None
        self.metrics_history: List[PoolMetrics] = []
        self.optimization_enabled = True
        self._monitoring_task = None
        self._pool_size: int = 0
        self._max_overflow: int = 0
    
    async def create_optimized_engine(
        self, 
        database_url: str,
        pool_size: int = 20,
        max_overflow: int = 30,
        pool_timeout: int = 30,
        pool_recycle: int = 3600
    ) -> AsyncEngine:
        """Create an optimized database engine with connection pooling"""
        
        # Configure connection pool
        pool_config = {
            "poolclass": QueuePool,
            "pool_size": pool_size,
            "max_overflow": max_overflow,
            "pool_timeout": pool_timeout,
            "pool_recycle": pool_recycle,
            "pool_pre_ping": True,  # Verify connections before use
            "echo": False,  # Set to True for SQL debugging
        }
        
        # Create engine
        self.engine = create_async_engine(
            database_url,
            **pool_config
        )
        self._pool_size = pool_size
        self._max_overflow = max_overflow
        
        # Add event listeners for monitoring
        self._add_pool_listeners()
        
        # Start monitoring
        self._start_monitoring()
        
        logger.info(f"Created optimized connection pool: size={pool_size}, overflow={max_overflow}")
        return self.engine
    
    def _add_pool_listeners(self):
        """Add event listeners for pool monitoring"""
        if not self.engine:
            return
        
        @event.listens_for(self.engine.sync_engine, "connect")
        def on_connect(_dbapi_connection, _connection_record):
            """Called when a new connection is created"""
            logger.debug("New database connection created")
        
        @event.listens_for(self.engine.sync_engine, "checkout")
        def on_checkout(_dbapi_connection, connection_record, _connection_proxy):
            """Called when a connection is checked out from the pool"""
            start_time = time.time()
            connection_record.info['checkout_start'] = start_time
            logger.debug("Connection checked out from pool")
        
        @event.listens_for(self.engine.sync_engine, "checkin")
        def on_checkin(_dbapi_connection, connection_record):
            """Called when a connection is checked back into the pool"""
            if 'checkout_start' in connection_record.info:
                checkout_time = time.time() - connection_record.info['checkout_start']
                logger.debug(f"Connection checked in after {checkout_time:.3f}s")
    
    def _start_monitoring(self):
        """Start background monitoring of connection pool"""
        if self._monitoring_task:
            return
        
        self._monitoring_task = asyncio.create_task(self._monitor_pool())
    
    async def _monitor_pool(self):
        """Monitor connection pool performance"""
        while True:
            try:
                await asyncio.sleep(30)  # Monitor every 30 seconds
                await self._collect_metrics()
            except Exception:
                logger.exception("Pool monitoring error")
    
    async def _collect_metrics(self):
        """Collect current pool metrics"""
        if not self.engine:
            return
        
        try:
            # Get pool status
            pool = self.engine.pool
            
            metrics = PoolMetrics(
                total_connections=pool.size() + pool.overflow(),
                active_connections=pool.checkedout(),
                idle_connections=max(pool.size() - pool.checkedout(), 0),
                overflow_connections=pool.overflow(),
                checkout_time=0.0,  # Would need custom tracking
                checkin_time=0.0,   # Would need custom tracking
                pool_size=self._pool_size or pool.size(),
                max_overflow=self._max_overflow
            )
            
            self.metrics_history.append(metrics)
            
            # Keep only last 100 metrics
            if len(self.metrics_history) > 100:
                self.metrics_history = self.metrics_history[-100:]
            
            # Log warnings for high connection usage
            if metrics.active_connections > metrics.pool_size * 0.8:
                logger.warning(f"High connection usage: {metrics.active_connections}/{metrics.pool_size}")
            
        except Exception:
            logger.exception("Failed to collect pool metrics")
    
    async def get_pool_status(self) -> Dict[str, Any]:
        """Get current connection pool status"""
        if not self.engine:
            return {"error": "No engine configured"}
        
        try:
            pool = self.engine.pool
            return {
                "pool_size": pool.size(),
                "max_overflow": self._max_overflow,
                "checked_out": pool.checkedout(),
                "checked_in": pool.checkedin(),
                "overflow": pool.overflow(),
                "total": pool.size() + pool.overflow()
            }
        except Exception as e:
            return {"error": str(e)}
    
    async def optimize_pool_settings(self) -> Dict[str, Any]:
        """Analyze pool metrics and suggest optimizations"""
        if len(self.metrics_history) < 10:
            return {"message": "Insufficient data for optimization analysis"}
        
        recent_metrics = self.metrics_history[-10:]
        
        # Calculate average usage
        avg_active = sum(m.active_connections for m in recent_metrics) / len(recent_metrics)
        avg_overflow = sum(m.overflow_connections for m in recent_metrics) / len(recent_metrics)
        
        suggestions = []
        
        # Suggest pool size adjustments
        if avg_active > recent_metrics[0].pool_size * 0.9:
            suggestions.append("Consider increasing pool_size - high connection usage detected")
        
        if avg_overflow > 0:
            suggestions.append("Consider increasing max_overflow - overflow connections in use")
        
        if avg_active < recent_metrics[0].pool_size * 0.3:
            suggestions.append("Consider decreasing pool_size - low connection usage")
        
        return {
            "average_active_connections": avg_active,
            "average_overflow_connections": avg_overflow,
            "suggestions": suggestions
        }
    
    async def close_pool(self):
        """Close the connection pool"""
        if self.engine:
            await self.engine.dispose()
            self.engine = None
        
        if self._monitoring_task:
            self._monitoring_task.cancel()
            self._monitoring_task = None
        
        logger.info("Connection pool closed")

# Global connection pool service
connection_pool_service = ConnectionPoolService()
