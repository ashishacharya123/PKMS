"""
Query Monitoring Middleware

Middleware to detect potential N+1 query issues by automatically tracking
database queries per request using SQLAlchemy event listeners.
Only active in development/staging environments.
"""

import time
import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import event
from contextvars import ContextVar

logger = logging.getLogger(__name__)

# Module-level flag to prevent duplicate listener attachment
_listener_attached = False

# Module-level ContextVar for query monitoring (shared across all instances)
_request_context: ContextVar = ContextVar('query_monitoring_request', default=None)


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
        global _listener_attached
        
        if not self.enabled:
            return
        
        if _listener_attached:
            return  # Listener already attached by another instance
            
        # Import here to avoid circular imports
        from app.database import engine
        
        @event.listens_for(engine.sync_engine, "before_cursor_execute")
        def receive_before_cursor_execute(_conn, _cursor, statement, parameters, _context, _executemany):
            """Automatically track all SQL queries."""
            # Check if we have request state in context
            request_state = _request_context.get()
            if request_state is not None:
                if hasattr(request_state, 'query_count'):
                    request_state.query_count += 1
                    request_state.queries.append({
                        'query': str(statement)[:200],  # Truncate for logging
                        'parameters': None,  # Avoid logging potentially sensitive params
                        'timestamp': time.time()
                    })
        
        _listener_attached = True
    
    async def dispatch(self, request: Request, call_next):
        """Monitor request for database query patterns."""
        
        if not self.enabled:
            return await call_next(request)
        
        # Initialize per-request state (thread-safe)
        request.state.query_count = 0
        request.state.queries = []
        
        # Set context var for event listener access
        token = _request_context.set(request.state)
        try:
            # Track request start time
            start_time = time.time()

            # Process request
            response = await call_next(request)
        finally:
            _request_context.reset(token)
        
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




