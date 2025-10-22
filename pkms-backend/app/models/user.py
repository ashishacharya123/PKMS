"""
User Model for Authentication and User Management
"""

from sqlalchemy import Column, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4

from app.models.base import Base
from app.config import nepal_now


class User(Base):
    """User model for authentication and user management
    
    Schema Notes:
    - settings_json: Planned for user preferences (theme, language, etc.) but currently only used in testing
    - diary_password_hash/hint: Separate encryption layer for diary entries beyond login auth
    """
    
    __tablename__ = "users"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=False)  # bcrypt hash (includes salt)
    login_password_hint = Column(String(255), nullable=True)  # Simple hint for login password
    
    # Diary encryption fields
    diary_password_hash = Column(String(255), nullable=True)  # bcrypt hash for diary encryption
    diary_password_hint = Column(String(255), nullable=True)  # Hint for diary password
    
    is_active = Column(Boolean, default=True)
    is_first_login = Column(Boolean, default=True)
    settings_json = Column(Text, default="{}")  # User preferences as JSON
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    recovery_keys = relationship("RecoveryKey", back_populates="user", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="user", cascade="all, delete-orphan", foreign_keys="Note.created_by")
    # note_files relationship removed - replaced with note_documents junction table
    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan", foreign_keys="Document.created_by")
    todos = relationship("Todo", back_populates="user", cascade="all, delete-orphan", foreign_keys="Todo.created_by")
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan", foreign_keys="Project.created_by")
    diary_entries = relationship("DiaryEntry", back_populates="user", cascade="all, delete-orphan", foreign_keys="DiaryEntry.created_by")

    diary_daily_metadata = relationship("DiaryDailyMetadata", back_populates="user", cascade="all, delete-orphan", foreign_keys="DiaryDailyMetadata.created_by")
    archive_folders = relationship("ArchiveFolder", back_populates="user", cascade="all, delete-orphan", foreign_keys="ArchiveFolder.created_by")
    archive_items = relationship("ArchiveItem", back_populates="user", cascade="all, delete-orphan", foreign_keys="ArchiveItem.created_by")
    # links relationship removed - links module deleted
    tags = relationship("Tag", back_populates="user", cascade="all, delete-orphan", foreign_keys="Tag.created_by")
    
    def __repr__(self):
        return f"<User(uuid={self.uuid}, username='{self.username}')>"


class Session(Base):
    """User session management for authentication"""
    
    __tablename__ = "sessions"
    
    session_token = Column(String(255), primary_key=True, index=True)
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    last_activity = Column(DateTime(timezone=True), server_default=nepal_now())
    ip_address = Column(String(45), nullable=True)  # IPv6 support
    user_agent = Column(String(500), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="sessions")
    
    def __repr__(self):
        return f"<Session(session_token='{self.session_token}', created_by={self.created_by})>"


class RecoveryKey(Base):
    """Password recovery system with security questions and master recovery password"""
    
    __tablename__ = "recovery_keys"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    key_hash = Column(String(255), nullable=False)
    questions_json = Column(Text, nullable=False)  # Security questions as JSON
    answers_hash = Column(String(255), nullable=False)  # Hashed answers
    salt = Column(String(255), nullable=False)  # Salt for answers (still needed for security questions)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    last_used = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="recovery_keys")
    
    def __repr__(self):
        return f"<RecoveryKey(uuid={self.uuid}, created_by={self.created_by})>" 