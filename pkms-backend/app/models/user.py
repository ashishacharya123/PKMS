"""
User Model for Authentication and User Management
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class User(Base):
    """User model for authentication and user management"""
    
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=False)  # bcrypt hash (includes salt)
    is_active = Column(Boolean, default=True)
    is_first_login = Column(Boolean, default=True)
    settings_json = Column(Text, default="{}")  # User preferences as JSON
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    recovery_keys = relationship("RecoveryKey", back_populates="user", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    todos = relationship("Todo", back_populates="user", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
    diary_entries = relationship("DiaryEntry", back_populates="user", cascade="all, delete-orphan")
    diary_media = relationship("DiaryMedia", back_populates="user", cascade="all, delete-orphan")
    archive_folders = relationship("ArchiveFolder", back_populates="user", cascade="all, delete-orphan")
    archive_items = relationship("ArchiveItem", back_populates="user", cascade="all, delete-orphan")
    tags = relationship("Tag", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}')>"


class Session(Base):
    """User session management for authentication"""
    
    __tablename__ = "sessions"
    
    session_token = Column(String(255), primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_activity = Column(DateTime(timezone=True), server_default=func.now())
    ip_address = Column(String(45), nullable=True)  # IPv6 support
    user_agent = Column(String(500), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="sessions")
    
    def __repr__(self):
        return f"<Session(session_token='{self.session_token}', user_id={self.user_id})>"


class RecoveryKey(Base):
    """Password recovery system with security questions and master recovery password"""
    
    __tablename__ = "recovery_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key_hash = Column(String(255), nullable=False)
    questions_json = Column(Text, nullable=False)  # Security questions as JSON
    answers_hash = Column(String(255), nullable=False)  # Hashed answers
    salt = Column(String(255), nullable=False)  # Salt for answers (still needed for security questions)
    master_password_hash = Column(String(255), nullable=True)  # Master recovery password hash
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="recovery_keys")
    
    def __repr__(self):
        return f"<RecoveryKey(id={self.id}, user_id={self.user_id})>" 