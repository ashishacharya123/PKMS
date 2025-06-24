"""
Diary Models for Encrypted Journal Entries
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, BigInteger, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from app.database import Base


class DiaryEntry(Base):
    """Encrypted diary entry model"""
    
    __tablename__ = "diary_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    title_encrypted = Column(Text, nullable=True)  # Encrypted title
    content_encrypted = Column(Text, nullable=False)  # Encrypted content
    mood = Column(Integer, nullable=True)  # 1-5 scale
    weather = Column(String(50), nullable=True)
    encryption_iv = Column(String(255), nullable=False)  # Initialization vector
    encryption_tag = Column(String(255), nullable=False)  # Authentication tag
    is_template = Column(Boolean, default=False)  # For reusable templates
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="diary_entries")
    media = relationship("DiaryMedia", back_populates="entry", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<DiaryEntry(id={self.id}, date='{self.date}')>"


class DiaryMedia(Base):
    """Encrypted media files for diary entries"""
    
    __tablename__ = "diary_media"
    
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    entry_id = Column(Integer, ForeignKey("diary_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    filename_encrypted = Column(String(255), nullable=False)  # Encrypted filename
    filepath_encrypted = Column(String(500), nullable=False)  # Encrypted file path
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    encryption_iv = Column(String(255), nullable=False)  # Initialization vector
    encryption_tag = Column(String(255), nullable=False)  # Authentication tag
    media_type = Column(String(20), nullable=False)  # voice, photo, video
    duration_seconds = Column(Integer, nullable=True)  # For audio/video
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Relationships
    entry = relationship("DiaryEntry", back_populates="media")
    user = relationship("User")
    
    def __repr__(self):
        return f"<DiaryMedia(uuid='{self.uuid}', media_type='{self.media_type}')>" 