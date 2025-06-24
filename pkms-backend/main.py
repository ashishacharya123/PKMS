"""
PKMS Backend - Main FastAPI Application
Personal Knowledge Management System
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import uvicorn
import os
from pathlib import Path

# Import routers
from app.routers import auth

# Import database initialization
from app.database import init_db, close_db
from app.config import settings, get_data_dir


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
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
        data_dir / "exports",
        data_dir / "backups",
        data_dir / "recovery"
    ]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
        print(f"✅ Created directory: {directory}")
    
    print("✅ Database and directories initialized")
    
    yield
    
    # Shutdown
    print("🛑 Shutting down PKMS Backend...")
    await close_db()


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="Personal Knowledge Management System - Local-First Backend",
    version=settings.app_version,
    lifespan=lifespan
)

# CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# TODO: Add other routers as they are implemented
# app.include_router(notes.router, prefix="/api/v1/notes", tags=["notes"])
# app.include_router(documents.router, prefix="/api/v1/documents", tags=["documents"])
# app.include_router(todos.router, prefix="/api/v1/todos", tags=["todos"])
# app.include_router(diary.router, prefix="/api/v1/diary", tags=["diary"])
# app.include_router(search.router, prefix="/api/v1/search", tags=["search"])

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