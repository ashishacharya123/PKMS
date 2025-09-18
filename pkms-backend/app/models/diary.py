"""
Diary Models for Personal Journaling
"""

from uuid import uuid4
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger, SmallInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import diary_entry_tags


class DiaryEntry(Base):
    """Diary entry model for personal journaling"""
    
    __tablename__ = "diary_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)
    title = Column(String(255), nullable=False, index=True)
    content = Column(Text, nullable=False)
    date = Column(DateTime(timezone=True), nullable=False, index=True)  # Date for the diary entry
    mood = Column(SmallInteger, nullable=True, index=True)  # 1-10 scale
    weather = Column(String(50), nullable=True)
    location = Column(String(100), nullable=True)
    is_encrypted = Column(Boolean, default=False, index=True)
    is_favorite = Column(Boolean, default=False, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    is_template = Column(Boolean, default=False, index=True)  # Template flag for reusable entries
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Additional metadata as JSON for flexibility
    metadata_json = Column(Text, nullable=True, default='{}')  # Flexible metadata storage
    
    # FTS5 Search Support
    tags_text = Column(Text, nullable=True, default="")  # Denormalized tags for FTS5 search
    
    # Relationships
    user = relationship("User", back_populates="diary_entries")
    tag_objs = relationship("Tag", secondary=diary_entry_tags, back_populates="diary_entries")
    media = relationship("DiaryMedia", back_populates="entry", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<DiaryEntry(id={self.id}, title='{self.title}', mood={self.mood})>"


class DiaryMedia(Base):
    """Media attachments for diary entries (photos, videos, voice recordings)"""
    
    __tablename__ = "diary_media"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)
    entry_uuid = Column(String(36), ForeignKey("diary_entries.uuid", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    media_type = Column(String(20), nullable=False, index=True)  # photo, video, voice
    caption = Column(Text, nullable=True)
    is_encrypted = Column(Boolean, default=False, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Relationships
    entry = relationship("DiaryEntry", back_populates="media")
    user = relationship("User", back_populates="diary_media")
    
    def __repr__(self):
        return f"<DiaryMedia(id={self.id}, filename='{self.filename}', media_type='{self.media_type}')>" 