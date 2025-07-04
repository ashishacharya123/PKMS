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
    data_dir: str = "./data"
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
    data_dir = Path(settings.data_dir)
    if not data_dir.exists():
        data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


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