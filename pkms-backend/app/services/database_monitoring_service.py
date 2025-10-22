"""
Database Performance Monitoring Service
Comprehensive database performance monitoring and alerting
"""

import asyncio
import time
import psutil
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

@dataclass
class DatabaseMetrics:
    """Database performance metrics"""
    timestamp: float
    active_connections: int
    total_queries: int
    slow_queries: int
    avg_query_time: float
    memory_usage: float
    cpu_usage: float
    disk_io: Dict[str, float]
    cache_hit_ratio: float

@dataclass
class PerformanceAlert:
    """Performance alert"""
    alert_type: str
    severity: str
    message: str
    timestamp: float
    metrics: Dict[str, Any]

class DatabaseMonitoringService:
    """Service for comprehensive database performance monitoring"""
    
    def __init__(self):
        self.metrics_history: List[DatabaseMetrics] = []
        self.alerts: List[PerformanceAlert] = []
        self.monitoring_enabled = True
        self.alert_thresholds = {
            "slow_query_time": 2.0,  # seconds
            "high_memory_usage": 80.0,  # percentage
            "high_cpu_usage": 80.0,  # percentage
            "low_cache_hit_ratio": 70.0,  # percentage
            "high_connection_count": 50  # connections
        }
        self._monitoring_task = None
    
    async def start_monitoring(self, interval: int = 60):
        """Start database performance monitoring"""
        if self._monitoring_task:
            return
        
        self._monitoring_task = asyncio.create_task(
            self._monitor_database(interval)
        )
        logger.info(f"Started database monitoring with {interval}s interval")
    
    async def stop_monitoring(self):
        """Stop database performance monitoring"""
        if self._monitoring_task:
            self._monitoring_task.cancel()
            self._monitoring_task = None
        logger.info("Stopped database monitoring")
    
    async def _monitor_database(self, interval: int):
        """Monitor database performance continuously"""
        while True:
            try:
                await asyncio.sleep(interval)
                await self._collect_metrics()
                await self._check_alerts()
            except Exception as e:
                logger.error(f"Database monitoring error: {e}")
    
    async def _collect_metrics(self):
        """Collect current database metrics"""
        try:
            # System metrics
            memory = psutil.virtual_memory()
            cpu = psutil.cpu_percent()
            disk = psutil.disk_io_counters()
            
            # Database metrics (would need actual database connection)
            # This is a simplified version - in practice, you'd query the database
            metrics = DatabaseMetrics(
                timestamp=time.time(),
                active_connections=0,  # Would get from connection pool
                total_queries=0,  # Would track from query service
                slow_queries=0,  # Would track from query service
                avg_query_time=0.0,  # Would calculate from query times
                memory_usage=memory.percent,
                cpu_usage=cpu,
                disk_io={
                    "read_bytes": disk.read_bytes if disk else 0,
                    "write_bytes": disk.write_bytes if disk else 0
                },
                cache_hit_ratio=0.0  # Would get from database stats
            )
            
            self.metrics_history.append(metrics)
            
            # Keep only last 1000 metrics (about 16 hours at 1-minute intervals)
            if len(self.metrics_history) > 1000:
                self.metrics_history = self.metrics_history[-1000:]
            
        except Exception as e:
            logger.error(f"Failed to collect database metrics: {e}")
    
    async def _check_alerts(self):
        """Check for performance alerts"""
        if not self.metrics_history:
            return
        
        latest = self.metrics_history[-1]
        
        # Check for slow queries
        if latest.slow_queries > 0:
            await self._create_alert(
                "slow_queries",
                "warning",
                f"Detected {latest.slow_queries} slow queries",
                latest.__dict__
            )
        
        # Check for high memory usage
        if latest.memory_usage > self.alert_thresholds["high_memory_usage"]:
            await self._create_alert(
                "high_memory",
                "critical",
                f"High memory usage: {latest.memory_usage:.1f}%",
                latest.__dict__
            )
        
        # Check for high CPU usage
        if latest.cpu_usage > self.alert_thresholds["high_cpu_usage"]:
            await self._create_alert(
                "high_cpu",
                "warning",
                f"High CPU usage: {latest.cpu_usage:.1f}%",
                latest.__dict__
            )
        
        # Check for low cache hit ratio
        if latest.cache_hit_ratio < self.alert_thresholds["low_cache_hit_ratio"]:
            await self._create_alert(
                "low_cache_hit",
                "warning",
                f"Low cache hit ratio: {latest.cache_hit_ratio:.1f}%",
                latest.__dict__
            )
    
    async def _create_alert(self, alert_type: str, severity: str, message: str, metrics: Dict[str, Any]):
        """Create a performance alert"""
        alert = PerformanceAlert(
            alert_type=alert_type,
            severity=severity,
            message=message,
            timestamp=time.time(),
            metrics=metrics
        )
        
        self.alerts.append(alert)
        
        # Log alert
        log_level = logging.ERROR if severity == "critical" else logging.WARNING
        logger.log(log_level, f"Database Alert [{severity.upper()}]: {message}")
        
        # Keep only last 100 alerts
        if len(self.alerts) > 100:
            self.alerts = self.alerts[-100:]
    
    async def get_performance_summary(self) -> Dict[str, Any]:
        """Get database performance summary"""
        if not self.metrics_history:
            return {"message": "No metrics available"}
        
        recent_metrics = self.metrics_history[-10:]  # Last 10 measurements
        
        return {
            "current_status": {
                "active_connections": recent_metrics[-1].active_connections,
                "memory_usage": recent_metrics[-1].memory_usage,
                "cpu_usage": recent_metrics[-1].cpu_usage,
                "cache_hit_ratio": recent_metrics[-1].cache_hit_ratio
            },
            "averages": {
                "memory_usage": sum(m.memory_usage for m in recent_metrics) / len(recent_metrics),
                "cpu_usage": sum(m.cpu_usage for m in recent_metrics) / len(recent_metrics),
                "avg_query_time": sum(m.avg_query_time for m in recent_metrics) / len(recent_metrics)
            },
            "alerts": {
                "total": len(self.alerts),
                "critical": len([a for a in self.alerts if a.severity == "critical"]),
                "warnings": len([a for a in self.alerts if a.severity == "warning"])
            }
        }
    
    async def get_slow_queries(self) -> List[Dict[str, Any]]:
        """Get slow query analysis"""
        # This would integrate with the query optimization service
        return []
    
    async def get_connection_analysis(self) -> Dict[str, Any]:
        """Get connection pool analysis"""
        if not self.metrics_history:
            return {"message": "No metrics available"}
        
        recent_metrics = self.metrics_history[-10:]
        avg_connections = sum(m.active_connections for m in recent_metrics) / len(recent_metrics)
        max_connections = max(m.active_connections for m in recent_metrics)
        
        return {
            "average_connections": avg_connections,
            "max_connections": max_connections,
            "connection_trend": "stable" if avg_connections < 20 else "increasing"
        }
    
    async def get_recommendations(self) -> List[str]:
        """Get performance optimization recommendations"""
        recommendations = []
        
        if not self.metrics_history:
            return recommendations
        
        latest = self.metrics_history[-1]
        
        # Memory recommendations
        if latest.memory_usage > 70:
            recommendations.append("Consider increasing database memory allocation")
        
        # CPU recommendations
        if latest.cpu_usage > 70:
            recommendations.append("Consider optimizing queries or adding database indexes")
        
        # Connection recommendations
        if latest.active_connections > 30:
            recommendations.append("Consider optimizing connection pool settings")
        
        # Cache recommendations
        if latest.cache_hit_ratio < 80:
            recommendations.append("Consider increasing database cache size")
        
        return recommendations

# Global database monitoring service
database_monitoring_service = DatabaseMonitoringService()
