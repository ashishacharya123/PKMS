"""
PKMS Backend - Main FastAPI Application
Personal Knowledge Management System
"""

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
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
from fastapi.responses import JSONResponse

# Import routers
from app.routers import auth, notes, documents, todos, diary, archive, dashboard, search

# Import database initialization
from app.database import init_db, close_db, get_db_session
from app.config import settings, get_data_dir

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

# Session cleanup task
cleanup_task = None

# Initialize logging with more detailed configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

async def cleanup_expired_sessions():
    """Periodic task to clean up expired sessions"""
    while True:
        try:
            async with get_db_session() as db:
                from app.models.user import Session
                from sqlalchemy import delete
                
                # Delete expired sessions
                now = datetime.utcnow()
                result = await db.execute(
                    delete(Session).where(Session.expires_at < now)
                )
                deleted_count = result.rowcount
                
                if deleted_count > 0:
                    logger.info(f"🧹 Cleaned up {deleted_count} expired sessions")
                    
        except Exception as e:
            logger.error(f"❌ Session cleanup error: {e}")
        
        # Sleep for configured interval
        await asyncio.sleep(settings.session_cleanup_interval_hours * 3600)

async def run_migrations():
    """Run lightweight, idempotent migrations at startup."""
    try:
        async with get_db_session() as db:
            # This is a good place for future lightweight, idempotent migrations.
            logger.info("✅ No migrations needed at this time")
            
    except Exception as e:
        logger.error(f"❌ Error during migrations: {e}")
        # Log the error but don't exit - let the app try to continue
        return False
    return True

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    
    # Startup
    logger.info("🚀 Starting PKMS Backend...")
    
    try:
        # Initialize database tables (creates tables if they don't exist)
        logger.info("Initializing database...")
        await init_db()
        logger.info("✅ Database initialized successfully")
        
        # Run lightweight migrations
        logger.info("Running migrations...")
        migration_success = await run_migrations()
        if not migration_success:
            logger.warning("⚠️ Migrations had some issues but continuing startup")
        
        # Start background tasks
        logger.info("Starting background tasks...")
        global cleanup_task
        cleanup_task = asyncio.create_task(cleanup_expired_sessions())
        logger.info("✅ Background tasks started")
        
        yield
        
    except Exception as e:
        logger.error(f"❌ Critical error during startup: {e}")
        raise
    finally:
        # Shutdown
        logger.info("🌙 Shutting down PKMS Backend...")
        if cleanup_task:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass
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

# Add routers
app.include_router(auth.router, prefix="/api/v1/auth")
app.include_router(notes.router, prefix="/api/v1/notes")
app.include_router(documents.router, prefix="/api/v1/documents")
app.include_router(todos.router, prefix="/api/v1/todos")
app.include_router(diary.router, prefix="/api/v1/diary")
app.include_router(archive.router, prefix="/api/v1/archive")
app.include_router(dashboard.router, prefix="/api/v1/dashboard")
app.include_router(search.router, prefix="/api/v1/search")

# ------------------------------------------------------------
# ⛑️  Global middlewares
# ------------------------------------------------------------
# 1. Query-string sanitisation (defence-in-depth)
from app.middleware.sanitization import SanitizationMiddleware
app.add_middleware(SanitizationMiddleware)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add SlowAPI middleware for rate limiting
app.add_middleware(SlowAPIMiddleware)

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
        "⚠️ Rate limit exceeded for %s – retry after %s s",
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
        
        # XSS Protection (legacy but still useful)
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

# Trusted Host Middleware - Updated for local development
if settings.environment == "production":
    app.add_middleware(
        TrustedHostMiddleware, 
        allowed_hosts=["localhost", "127.0.0.1", "0.0.0.0", "localhost:8000", "127.0.0.1:8000"]
    )
else:
    # In development, be more permissive with hosts
    app.add_middleware(
        TrustedHostMiddleware, 
        allowed_hosts=["*"]  # Allow all hosts in development
    )

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
        "timestamp": datetime.utcnow().isoformat(),
        "environment": settings.environment
    }

if __name__ == "__main__":
    print(f"🌐 Starting server on {settings.host}:{settings.port}")
    print(f"🔄 Reload mode: {settings.debug}")
    print(f"📝 Log level: {settings.log_level}")
    
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
        print(f"❌ Failed to start server: {e}")
        import traceback
        traceback.print_exc()