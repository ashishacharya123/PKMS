"""
Query Optimization Service
Advanced query optimization with performance monitoring

FUTURE USE: This service is designed for N+1 query detection and optimization.
Currently instantiated but not actively used. Will be integrated in future
iterations to automatically detect and optimize database queries.

Key Features (Future Implementation):
- N+1 query detection and automatic eager loading
- Query performance monitoring and alerting
- Automatic query optimization suggestions
- Database connection pooling optimization
- Slow query identification and optimization

Usage (Future):
- Automatically detect N+1 queries in ORM operations
- Suggest optimal eager loading strategies
- Monitor query performance across the application
- Provide optimization recommendations

Note: Service is ready for integration when needed.
"""

import asyncio
import time
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from sqlalchemy.orm import selectinload, joinedload
import logging

logger = logging.getLogger(__name__)

@dataclass
class QueryMetrics:
    """Query performance metrics"""
    query_id: str
    sql: str
    execution_time: float
    rows_returned: int
    cache_hit: bool
    optimization_applied: List[str]

class QueryOptimizationService:
    """
    Service for query optimization and performance monitoring
    
    FUTURE INTEGRATION: This service will be used to:
    1. Detect N+1 queries in ORM operations
    2. Automatically suggest eager loading optimizations
    3. Monitor query performance and identify bottlenecks
    4. Provide real-time optimization recommendations
    
    Current Status: Ready for integration, not actively used
    """
    
    def __init__(self):
        self.query_cache: Dict[str, Any] = {}  # Future: Cache optimized query results
        self.slow_queries: List[QueryMetrics] = []
        self.optimization_rules = self._load_optimization_rules()
        self.metrics_enabled = True  # Feature flag for enabling/disabling metrics
        self.max_slow_queries = 100  # Limit to prevent memory issues
    
    def _load_optimization_rules(self) -> Dict[str, Any]:
        """Load query optimization rules"""
        return {
            "use_selectinload": {
                "pattern": r"selectinload\(.*\)",
                "description": "Use selectinload for one-to-many relationships"
            },
            "use_joinedload": {
                "pattern": r"joinedload\(.*\)",
                "description": "Use joinedload for many-to-one relationships"
            },
            "limit_queries": {
                "pattern": r"\.limit\(\d+\)",
                "description": "Always use LIMIT for large result sets"
            },
            "index_hints": {
                "pattern": r"WHERE.*uuid.*=",
                "description": "Use indexed columns in WHERE clauses"
            }
        }
    
    async def optimize_query(
        self, 
        db: AsyncSession, 
        query: Any, 
        query_id: Optional[str] = None
    ) -> Tuple[Any, QueryMetrics]:
        """Optimize a query and return metrics"""
        start_time = time.time()
        
        # Apply optimizations
        optimized_query = await self._apply_optimizations(query)
        
        # Execute query
        result = await db.execute(optimized_query)
        rows = result.scalars().all() if hasattr(result, 'scalars') else []
        
        execution_time = time.time() - start_time
        
        # Create metrics
        metrics = QueryMetrics(
            query_id=query_id or f"query_{int(time.time())}",
            sql=str(optimized_query),
            execution_time=execution_time,
            rows_returned=len(rows),
            cache_hit=False,
            optimization_applied=self._get_applied_optimizations(optimized_query)
        )
        
        # Track slow queries with bounded growth
        if execution_time > 1.0:  # Queries taking more than 1 second
            self.slow_queries.append(metrics)
            # Keep only the most recent slow queries to prevent memory issues
            if len(self.slow_queries) > self.max_slow_queries:
                self.slow_queries.pop(0)  # Remove oldest
            logger.warning(f"Slow query detected: {execution_time:.2f}s - {metrics.sql[:100]}...")
        
        return result, metrics
    
    async def _apply_optimizations(self, query: Any) -> Any:
        """Apply query optimizations"""
        optimizations = []
        
        # Add LIMIT if not present and query might return many rows
        if not hasattr(query, 'limit') or query.limit is None:
            # This would need to be implemented based on specific query types
            pass
        
        # Optimize relationships loading
        if hasattr(query, 'options'):
            # Ensure proper loading strategies
            pass
        
        return query
    
    def _get_applied_optimizations(self, query: Any) -> List[str]:
        """Get list of applied optimizations"""
        optimizations = []
        
        # Check for selectinload usage
        if "selectinload" in str(query):
            optimizations.append("selectinload")
        
        # Check for joinedload usage
        if "joinedload" in str(query):
            optimizations.append("joinedload")
        
        # Check for LIMIT usage
        if "LIMIT" in str(query):
            optimizations.append("limit")
        
        return optimizations
    
    async def get_slow_queries(self, limit: int = 10) -> List[QueryMetrics]:
        """Get slowest queries for analysis"""
        return sorted(
            self.slow_queries, 
            key=lambda x: x.execution_time, 
            reverse=True
        )[:limit]
    
    async def analyze_query_performance(self) -> Dict[str, Any]:
        """Analyze overall query performance"""
        if not self.slow_queries:
            return {"message": "No slow queries detected"}
        
        avg_time = sum(q.execution_time for q in self.slow_queries) / len(self.slow_queries)
        max_time = max(q.execution_time for q in self.slow_queries)
        
        return {
            "total_slow_queries": len(self.slow_queries),
            "average_execution_time": avg_time,
            "max_execution_time": max_time,
            "slowest_query": self.slow_queries[0].sql if self.slow_queries else None
        }
    
    async def suggest_optimizations(self, query: str) -> List[str]:
        """Suggest optimizations for a specific query"""
        suggestions = []
        
        # Check for missing indexes
        if "WHERE" in query.upper() and "uuid" not in query:
            suggestions.append("Consider adding index on WHERE columns")
        
        # Check for N+1 queries
        if query.count("SELECT") > 1:
            suggestions.append("Potential N+1 query detected - consider using joins or selectinload")
        
        # Check for missing LIMIT
        if "SELECT" in query.upper() and "LIMIT" not in query.upper():
            suggestions.append("Consider adding LIMIT to prevent large result sets")
        
        return suggestions

# Global query optimization service
# FUTURE USE: This service will be integrated for N+1 query detection
# Currently instantiated but not actively used - ready for future integration
query_optimization_service = QueryOptimizationService()
