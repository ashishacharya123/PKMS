"""
Query Monitoring Middleware

Simple middleware to detect potential N+1 query issues by counting
database queries per request. Logs warnings when query count exceeds threshold.
"""

import time
import logging
from typing import List, Dict, Any
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class QueryMonitoringMiddleware(BaseHTTPMiddleware):
    """
    Middleware to monitor database query count per request.
    
    Detects potential N+1 query issues by tracking query execution.
    Only active in development/staging environments.
    """
    
    def __init__(self, app, query_threshold: int = 10, enabled: bool = True):
        super().__init__(app)
        self.query_threshold = query_threshold
        self.enabled = enabled
        self.query_count = 0
        self.queries: List[Dict[str, Any]] = []
    
    async def dispatch(self, request: Request, call_next):
        """Monitor request for database query patterns."""
        
        if not self.enabled:
            return await call_next(request)
        
        # Reset counters for this request
        self.query_count = 0
        self.queries = []
        
        # Track request start time
        start_time = time.time()
        
        # Process request
        response = await call_next(request)
        
        # Calculate request duration
        duration = time.time() - start_time
        
        # Log warnings for potential N+1 issues
        if self.query_count > self.query_threshold:
            logger.warning(
                f"🚨 POTENTIAL N+1 QUERY DETECTED: "
                f"{self.query_count} queries in {duration:.2f}s "
                f"for {request.method} {request.url.path}"
            )
            
            # Log first few queries for debugging
            for i, query_info in enumerate(self.queries[:3]):
                logger.warning(f"  Query {i+1}: {query_info['query'][:80]}...")
            
            if len(self.queries) > 3:
                logger.warning(f"  ... and {len(self.queries) - 3} more queries")
        
        # Log performance info for slow requests
        elif duration > 1.0:  # Requests taking more than 1 second
            logger.info(
                f"⏱️  SLOW REQUEST: {self.query_count} queries in {duration:.2f}s "
                f"for {request.method} {request.url.path}"
            )
        
        return response
    
    def track_query(self, query: str, params: Any = None):
        """Track a database query execution."""
        if not self.enabled:
            return
        
        self.query_count += 1
        self.queries.append({
            'query': query,
            'params': params,
            'timestamp': time.time()
        })


# Global instance for query tracking
query_monitor = QueryMonitoringMiddleware(
    app=None,  # Will be set when middleware is added
    query_threshold=10,  # Alert if more than 10 queries
    enabled=True  # Set to False in production
)


def track_query(query: str, params: Any = None):
    """Convenience function to track queries from services."""
    query_monitor.track_query(query, params)
