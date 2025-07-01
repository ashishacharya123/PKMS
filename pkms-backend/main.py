"""
PKMS Backend - Main FastAPI Application
Personal Knowledge Management System
"""

from fastapi import FastAPI, HTTPException, Request, Response
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

# Import routers
from app.routers import auth, notes, documents, todos, diary, archive, dashboard, search

# Import database initialization
from app.database import init_db, close_db, get_db_session
from app.config import settings, get_data_dir

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)

# Session cleanup task
cleanup_task = None

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
                    print(f"🧹 Cleaned up {deleted_count} expired sessions")
                    
        except Exception as e:
            print(f"❌ Session cleanup error: {e}")
        
        # Sleep for configured interval
        await asyncio.sleep(settings.session_cleanup_interval_hours * 3600)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    global cleanup_task
    
    # Startup
    print("🚀 Starting PKMS Backend...")
    
    # Get data directory
    data_dir = get_data_dir()
    print(f"📁 Data directory: {data_dir}")
    
    # Initialize database
    await init_db()
    
    # Create data directories
    directories = [
        data_dir,
        data_dir / "assets" / "documents",
        data_dir / "assets" / "images", 
        data_dir / "secure" / "entries",
        data_dir / "secure" / "voice",
        data_dir / "secure" / "photos",
        data_dir / "secure" / "videos",
        data_dir / "archive",  # Archive storage
        data_dir / "exports",
        data_dir / "backups",
        data_dir / "recovery"
    ]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
        print(f"✅ Created directory: {directory}")
    
    # Start session cleanup task
    cleanup_task = asyncio.create_task(cleanup_expired_sessions())
    print("🧹 Started session cleanup task")
    
    print("✅ Database and directories initialized")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down PKMS Backend...")
    
    # Cancel cleanup task
    if cleanup_task:
        cleanup_task.cancel()
        print("🧹 Stopped session cleanup task")
    
    await close_db()

# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="Personal Knowledge Management System - Local-First Backend",
    version=settings.app_version,
    lifespan=lifespan
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

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add rate limiter middleware
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda request, exc: HTTPException(status_code=429, detail="Rate limit exceeded"))
app.add_middleware(SlowAPIMiddleware)

# Health check endpoint
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
        "service": "pkms-backend",
        "environment": settings.environment,
        "data_dir": str(get_data_dir())
    }

# API Routes
app.include_router(auth.router, prefix="/api/v1/auth", tags=["authentication"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(notes.router, prefix="/api/v1/notes", tags=["notes"])
app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(todos.router, prefix="/api/v1/todos", tags=["todos"])
app.include_router(diary.router, prefix="/api/v1/diary", tags=["diary"])
app.include_router(archive.router, prefix="/api/v1", tags=["archive"])
app.include_router(search.router, prefix="/api/v1", tags=["search"])

if __name__ == "__main__":
    print(f"🌐 Starting server on {settings.host}:{settings.port}")
    print(f"🔄 Reload mode: {settings.debug}")
    print(f"📝 Log level: {settings.log_level}")
    
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level
    ) 