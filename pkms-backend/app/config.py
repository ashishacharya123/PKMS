"""
PKMS Backend Configuration Management
Handles environment variables and application settings
"""

import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings


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
    
    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    password_min_length: int = 8
    
    # File Storage
    data_dir: str = "./data"
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    allowed_file_types: list = [".pdf", ".docx", ".txt", ".jpg", ".png", ".mp3", ".wav"]
    
    # CORS
    cors_origins: list = [
        "http://localhost:3000",
        "http://localhost:5173", 
        "tauri://localhost",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173"
    ]
    
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