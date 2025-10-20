"""
PKMS Backend - Main FastAPI Application
Personal Knowledge Management System
"""

from fastapi import FastAPI, HTTPException, Request, Response, status, Cookie
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import uvicorn
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
import logging
import logging.config
import sys

# Import routers
from app.routers import (
    auth,
    notes,
    documents,
    todos,
    projects,
    diary,
    archive,
    dashboard,
    backup,
    tags,
    testing_router,
    advanced_fuzzy,
    delete_preflight,
)
from app.routers import unified_uploads
from app.routers.search import router as search_endpoints_router
from app.services.chunk_service import chunk_manager
from app.middleware.query_monitoring import QueryMonitoringMiddleware

# Import database initialization
from app.database import init_db, close_db, get_db_session
from app.config import settings, get_data_dir, NEPAL_TZ

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

# TODO: Add security headers middleware for production deployment
# Security headers to add:
# - X-Content-Type-Options: nosniff
# - X-Frame-Options: DENY
# - X-XSS-Protection: 1; mode=block
# - Strict-Transport-Security: max-age=31536000; includeSubDomains
# - Content-Security-Policy: default-src 'self'
# Example implementation:
# @app.middleware("http")
# async def add_security_headers(request: Request, call_next):
#     response = await call_next(request)
#     response.headers["X-Content-Type-Options"] = "nosniff"
#     response.headers["X-Frame-Options"] = "DENY"
#     response.headers["X-XSS-Protection"] = "1; mode=block"
#     return response

# Session cleanup task
cleanup_task = None

# --- Custom Nepal Time Formatter ---
class NepalTimeFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, NEPAL_TZ)
        if datefmt:
            return dt.strftime(datefmt)
        return dt.isoformat()

# Initialize logging with Nepal time
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(NepalTimeFormatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logging.getLogger().handlers = [handler]
logging.getLogger().setLevel(logging.INFO)

logger = logging.getLogger(__name__)

async def cleanup_expired_sessions():
    """Periodic task to clean up expired sessions"""
    while True:
        try:
            async with get_db_session() as db:
                from app.models.user import Session
                from sqlalchemy import delete
                
                # Delete expired sessions
                now = datetime.now(NEPAL_TZ)
                result = await db.execute(
                    delete(Session).where(Session.expires_at < now)
                )
                deleted_count = result.rowcount
                
                if deleted_count > 0:
                    logger.info(f"Cleaned up {deleted_count} expired sessions")
                    
        except Exception as e:
            logger.error(f"Session cleanup error: {e}")
        
        # Sleep for configured interval
        await asyncio.sleep(settings.session_cleanup_interval_hours * 3600)



@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    
    # Startup
    logger.info("Starting PKMS Backend...")
    
    try:
        # Initialize database tables (creates tables if they don't exist)
        logger.info("Initializing database...")
        await init_db()
        logger.info("Database initialized successfully")
        
        # Initialize FTS5 tables and triggers
        logger.info("FTS5 search tables are now managed by the unified SearchService")
        
        # Start background tasks
        logger.info("Starting background tasks...")
        global cleanup_task
        cleanup_task = asyncio.create_task(cleanup_expired_sessions())

        # Start chunk upload cleanup loop
        await chunk_manager.start()

  
        logger.info("Background tasks started")

        yield
        
    except Exception as e:
        logger.exception("Critical error during startup")
        raise
    finally:
        # Shutdown
        logger.info("Shutting down PKMS Backend...")
        if cleanup_task:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass
        await chunk_manager.stop()
        await close_db()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="Personal Knowledge Management System - Local-First Backend",
    version=settings.app_version,
    lifespan=lifespan
)

# Attach limiter to app state for SlowAPI middleware
app.state.limiter = limiter

# ------------------------------------------------------------
# Global middlewares - CORS MUST BE FIRST
# ------------------------------------------------------------
# CORS middleware for frontend communication - MUST BE FIRST
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # Use origins from settings
    allow_credentials=True,  # Enable credentials for proper authentication
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],  # Specific methods
    allow_headers=["*"],  # Allow all headers
    expose_headers=["*"]  # Expose all headers
)

# 2. Query monitoring for N+1 detection (development only)
if settings.environment in ["development", "staging"]:
    app.add_middleware(QueryMonitoringMiddleware, query_threshold=10, enabled=True)

# 3. Query-string sanitisation (defence-in-depth)
from app.middleware.sanitization import SanitizationMiddleware
app.add_middleware(SanitizationMiddleware)

# Add routers
app.include_router(auth.router, prefix="/api/v1/auth")
app.include_router(notes.router, prefix="/api/v1/notes")
app.include_router(documents.router, prefix="/api/v1/documents")
app.include_router(todos.router, prefix="/api/v1/todos")
app.include_router(projects.router, prefix="/api/v1/projects")
app.include_router(diary.router, prefix="/api/v1/diary")
app.include_router(archive.router, prefix="/api/v1/archive")
# Removed archive_improvements disabled include (module deprecated)
app.include_router(dashboard.router, prefix="/api/v1/dashboard")
app.include_router(search_endpoints_router, prefix="/api/v1")  # Unified search endpoints
app.include_router(backup.router, prefix="/api/v1/backup")
app.include_router(tags.router, prefix="/api/v1/tags")
app.include_router(unified_uploads.router)
app.include_router(testing_router, prefix="/api/v1/testing")
app.include_router(advanced_fuzzy.router, prefix="/api/v1")  # Re-enabled for hybrid search
app.include_router(delete_preflight.router, prefix="/api/v1/delete-preflight")  # Unified delete preflight

# Add SlowAPI middleware for rate limiting



# Rate limit exceeded error handler
@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Return a consistent JSON schema when a client hits a rate-limit.

    Response shape:
        {
            "detail": "Rate limit exceeded. Try again later.",
            "retry_after": <seconds>
        }
    The retry_after field is derived from the SlowAPI header if available so
    frontend clients can display an accurate countdown.
    """

    # SlowAPI sets a "Retry-After" header on the Starlette response object
    # attached to the RateLimitExceeded exception.  If it exists we expose it
    # so the caller can know exactly when to retry.
    retry_after_header = exc.headers.get("Retry-After") if hasattr(exc, "headers") else None
    try:
        retry_after = int(retry_after_header) if retry_after_header else None
    except ValueError:
        retry_after = None

    logger.warning(
        "Rate limit exceeded for %s - retry after %s s",
        request.client.host,
        retry_after or "unknown"
    )

    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={
            "detail": "Rate limit exceeded. Please slow down your requests.",
            "retry_after": retry_after,
        },
        headers={"Retry-After": str(retry_after) if retry_after else "1"},
    )

# --- New: Friendly validation error handler ---

# Provide concise validation error messages instead of the default Pydantic array.
# This makes frontend debugging easier and avoids overwhelming users with raw stack traces.

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return flattened error strings and log them for inspection."""
    # Build a compact human-readable message: <field>: <error>;  ...
    messages = []
    for err in exc.errors():
        loc = ".".join(str(part) for part in err.get("loc", []) if part != "body")
        messages.append(f"{loc}: {err.get('msg')}")

    flat_msg = "; ".join(messages) if messages else "Validation error"

    # Log for backend inspection
    logger.warning("ValidationError [%s] %s", request.url.path, flat_msg)

    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"detail": flat_msg},
    )

# Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses"""
    response = await call_next(request)
    
    if settings.enable_security_headers:
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        
        # XSS Protection
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        # Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Content Security Policy (relaxed for local development)
        if settings.environment == "production":
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob:; "
                "font-src 'self'"
            )
        
        # HSTS (only in production with HTTPS)
        if settings.environment == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    
    return response

# Trusted Host Middleware - Only in production for security
if settings.environment == "production":
    app.add_middleware(
        TrustedHostMiddleware, 
        allowed_hosts=settings.trusted_hosts
    )
# In development, skip TrustedHostMiddleware to avoid CORS conflicts

# Health check endpoints
@app.get("/")
async def root():
    return {
        "message": settings.app_name,
        "status": "operational",
        "version": settings.app_version,
        "environment": settings.environment
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now(NEPAL_TZ).isoformat(),
        "environment": settings.environment
    }

# Test CORS endpoint
@app.get("/test-cors")
async def test_cors():
    return {
        "message": "CORS is working!",
        "timestamp": datetime.now(NEPAL_TZ).isoformat(),
        "cors_headers": "Should include Access-Control-Allow-Origin"
    }



if __name__ == "__main__":
    print(f"Starting server on {settings.host}:{settings.port}")
    print(f"Reload mode: {settings.debug}")
    print(f"Log level: {settings.log_level}")
    
    # Temporarily disable reload to debug segfault
    try:
        uvicorn.run(
            "main:app",
            host=settings.host,
            port=settings.port,
            reload=False,  # Disable reload to debug segfault
            log_level=settings.log_level
        )
    except Exception as e:
        print(f"Failed to start server: {e}")
        import traceback
        traceback.print_exc()