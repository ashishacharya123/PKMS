"""
Query Monitoring Middleware

Middleware to detect potential N+1 query issues by automatically tracking
database queries per request using SQLAlchemy event listeners.
Only active in development/staging environments.
"""

import time
import logging
from typing import List, Dict, Any
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import event
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


class QueryMonitoringMiddleware(BaseHTTPMiddleware):
    """
    Middleware to monitor database query count per request.
    
    Uses SQLAlchemy event listeners to automatically track all queries.
    Detects potential N+1 query issues by tracking query execution.
    Only active in development/staging environments.
    """
    
    def __init__(self, app, query_threshold: int = 10, enabled: bool = True):
        super().__init__(app)
        self.query_threshold = query_threshold
        self.enabled = enabled
        self._setup_event_listeners()
    
    def _setup_event_listeners(self):
        """Setup SQLAlchemy event listeners for automatic query tracking."""
        if not self.enabled:
            return
            
        # Import here to avoid circular imports
        from app.database import engine
        
        # Use thread-local storage to track queries per request
        import threading
        self._thread_local = threading.local()
        
        @event.listens_for(engine.sync_engine, "before_cursor_execute")
        def receive_before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
            """Automatically track all SQL queries."""
            # Check if we have request state in thread local
            if hasattr(self._thread_local, 'request_state'):
                request_state = self._thread_local.request_state
                if hasattr(request_state, 'query_count'):
                    request_state.query_count += 1
                    request_state.queries.append({
                        'query': str(statement)[:200],  # Truncate for logging
                        'parameters': str(parameters)[:100] if parameters else None,
                        'timestamp': time.time()
                    })
    
    async def dispatch(self, request: Request, call_next):
        """Monitor request for database query patterns."""
        
        if not self.enabled:
            return await call_next(request)
        
        # Initialize per-request state (thread-safe)
        request.state.query_count = 0
        request.state.queries = []
        
        # Set thread local state for event listener access
        if hasattr(self, '_thread_local'):
            self._thread_local.request_state = request.state
        
        # Track request start time
        start_time = time.time()
        
        # Process request
        response = await call_next(request)
        
        # Calculate request duration
        duration = time.time() - start_time
        
        # Get final query count from request state
        query_count = getattr(request.state, 'query_count', 0)
        queries = getattr(request.state, 'queries', [])
        
        # Log warnings for potential N+1 issues
        if query_count > self.query_threshold:
            logger.warning(
                f"🚨 POTENTIAL N+1 QUERY DETECTED: "
                f"{query_count} queries in {duration:.2f}s "
                f"for {request.method} {request.url.path}"
            )
            
            # Log first few queries for debugging
            for i, query_info in enumerate(queries[:3]):
                logger.warning(f"  Query {i+1}: {query_info['query'][:80]}...")
            
            if len(queries) > 3:
                logger.warning(f"  ... and {len(queries) - 3} more queries")
        
        # Log performance info for slow requests
        elif duration > 1.0:  # Requests taking more than 1 second
            logger.info(
                f"⏱️  SLOW REQUEST: {query_count} queries in {duration:.2f}s "
                f"for {request.method} {request.url.path}"
            )
        
        return response
    
    # Removed: track_query method - now using automatic SQLAlchemy event listeners


# Global instance for query tracking
query_monitor = QueryMonitoringMiddleware(
    app=None,  # Will be set when middleware is added
    query_threshold=10,  # Alert if more than 10 queries
    enabled=True  # Set to False in production
)


def track_query(query: str, params: Any = None):
    """Convenience function to track queries from services."""
    query_monitor.track_query(query, params)
