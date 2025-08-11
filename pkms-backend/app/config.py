"""
PKMS Backend Configuration Management
Handles environment variables and application settings
"""

import os
import secrets
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
import warnings
from datetime import timezone, timedelta
from sqlalchemy import text
from sqlalchemy.sql import expression
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.types import DateTime

# Nepal Standard Time (UTC +05:45)
NEPAL_TZ = timezone(timedelta(hours=5, minutes=45))

class nepal_now(expression.FunctionElement):
    """Custom SQLAlchemy function that returns current time in Nepal timezone"""
    type = DateTime()
    name = 'nepal_now'

@compiles(nepal_now, 'sqlite')
def visit_nepal_now_sqlite(element, compiler, **kw):
    """Compile nepal_now() for SQLite - adds 5:45 to UTC time"""
    return "datetime('now', '+5 hours', '+45 minutes')"

@compiles(nepal_now, 'postgresql') 
def visit_nepal_now_postgresql(element, compiler, **kw):
    """Compile nepal_now() for PostgreSQL"""
    return "NOW() AT TIME ZONE 'Asia/Kathmandu'"

@compiles(nepal_now, 'mysql')
def visit_nepal_now_mysql(element, compiler, **kw):
    """Compile nepal_now() for MySQL"""
    return "CONVERT_TZ(NOW(), 'UTC', '+05:45')"


class Settings(BaseSettings):
    """Application settings with environment variable support"""
    
    # Application
    app_name: str = "PKMS API"
    app_version: str = "1.0.0"
    environment: str = "development"
    debug: bool = True
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"
    
    # Database
    database_url: str = "sqlite+aiosqlite:///./data/pkm_metadata.db"
    auth_db_path: str = "./data/auth.db"
    
    # Redis Configuration
    redis_url: str = "redis://localhost:6379/0"
    redis_max_connections: int = 10
    redis_timeout: int = 5
    redis_cache_ttl: int = 300  # 5 minutes default cache TTL
    redis_rate_limit_window: int = 60  # 1 minute window for rate limiting
    redis_rate_limit_max_requests: int = 100  # Max requests per window
    
    # Security - MUST be provided via environment variables in production
    secret_key: Optional[str] = None  # Will be generated if not provided
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_lifetime_days: int = 7
    password_min_length: int = 8
    session_cleanup_interval_hours: int = 24  # Clean expired sessions every 24 hours
    
    # File Storage
    # data_dir should be supplied via the DATA_DIR env-var or left unset so the
    # helper below can resolve to the repository-root PKMS_Data folder. Using a
    # hard-coded "./data" default was causing duplicate SQLite files whenever
    # the backend was launched outside Docker.
    data_dir: Optional[str] = None  # Set via DATA_DIR or auto-resolved
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    allowed_file_types: list = [".pdf", ".docx", ".txt", ".jpg", ".png", ".mp3", ".wav"]
    
    # Security Headers
    enable_security_headers: bool = True
    
    # CORS
    cors_origins: list = [
        "http://localhost:3000",
        "http://localhost:5173", 
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "http://localhost",
        "http://127.0.0.1"
    ]
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # Generate secret key if not provided (for development only)
        if not self.secret_key:
            if self.environment == "production":
                raise ValueError(
                    "SECRET_KEY environment variable must be set in production. "
                    "Generate a secure key using: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
                )
            else:
                # Generate a temporary key for development
                self.secret_key = secrets.token_urlsafe(32)
                # Only show warning in debug mode, never log the actual key
                if self.debug:
                    warnings.warn(
                        "Using auto-generated SECRET_KEY for development. "
                        "Set SECRET_KEY environment variable for production.",
                        stacklevel=2
                    )
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()


def get_data_dir() -> Path:
    """Get the data directory path"""
    # (1) Use the data_dir attribute if it's set (e.g., for Docker)
    if settings.data_dir:
        data_dir = Path(settings.data_dir)
        if not data_dir.exists():
            data_dir.mkdir(parents=True, exist_ok=True)
        return data_dir
    
    # (2) Use project-root PKMS_Data **only if it already exists**.
    #     This is the normal case when you run the backend from the host
    #     machine (not in Docker) because you created the folder once and
    #     Docker also bind-mounts it to /app/data inside the container.
    repo_root = Path(__file__).resolve().parents[2]
    root_data_dir = repo_root / "PKMS_Data"
    if root_data_dir.exists():
        return root_data_dir
    
    # Fallback to current directory if data_dir is not set and PKMS_Data doesn't exist
    current_dir = Path(__file__).resolve().parent
    data_dir = current_dir / "data"
    if not data_dir.exists():
        data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_file_storage_dir() -> Path:
    """Get the file storage directory path - Always use PKMS_Data for file storage
    This ensures files are accessible outside Docker and not stored in Docker volumes"""
    # For file storage, always use the Windows filesystem mount point
    # This ensures files are accessible outside Docker and not stored in Docker volumes
    if Path("/app/PKMS_Data").exists():
        # Docker environment - use mounted Windows filesystem
        file_storage_dir = Path("/app/PKMS_Data")
    else:
        # Native/development environment - use project root
        repo_root = Path(__file__).resolve().parents[2]
        file_storage_dir = repo_root / "PKMS_Data"
    
    if not file_storage_dir.exists():
        file_storage_dir.mkdir(parents=True, exist_ok=True)
    return file_storage_dir


# Note: get_archive_data_dir() was removed as it was just a wrapper around get_file_storage_dir()
# Use get_file_storage_dir() directly instead


def get_database_url() -> str:
    """Get the database URL with proper path resolution"""
    if settings.database_url.startswith("sqlite"):
        # Ensure SQLite database is in the data directory
        db_path = get_data_dir() / "pkm_metadata.db"
        return f"sqlite+aiosqlite:///{db_path}"
    return settings.database_url


def get_auth_db_path() -> Path:
    """Get the authentication database path"""
    return get_data_dir() / "auth.db"


def get_redis_url() -> str:
    """Get the Redis URL with proper error handling"""
    redis_url = os.getenv("REDIS_URL", settings.redis_url)
    if not redis_url.startswith("redis://"):
        raise ValueError("Invalid Redis URL format. Must start with 'redis://'")
    return redis_url 