"""
Diary Models for Personal Journaling
"""

from uuid import uuid4
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger, SmallInteger, UniqueConstraint
from sqlalchemy.orm import relationship

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import diary_entry_tags


class DiaryEntry(Base):
    """Diary entry model for personal journaling"""
    
    __tablename__ = "diary_entries"
    
    id = Column(Integer, primary_key=True, index=True)  # Legacy counter (keeps counting lifetime entries)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)  # API identifier
    title = Column(String(255), nullable=False, index=True)
    date = Column(DateTime(timezone=True), nullable=False, index=True)  # Date for the diary entry
    mood = Column(SmallInteger, nullable=True, index=True)  # 1-5 scale
    weather_code = Column(SmallInteger, nullable=True, index=True)  # Enum-coded weather (0-6)
    location = Column(String(100), nullable=True)
    day_of_week = Column(SmallInteger, nullable=True, index=True)
    media_count = Column(Integer, nullable=False, default=0)
    content_length = Column(Integer, nullable=False, default=0)
    content_file_path = Column(String(500), nullable=True)
    file_hash = Column(String(128), nullable=True)
    encryption_tag = Column(String(255), nullable=True)
    encryption_iv = Column(String(255), nullable=True)
    is_favorite = Column(Boolean, default=False, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    is_template = Column(Boolean, default=False, index=True)  # Template flag for reusable entries
    from_template_id = Column(String(36), nullable=True, index=True)  # Source template UUID/ID
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Additional metadata as JSON for flexibility
    daily_metadata_id = Column(Integer, ForeignKey("diary_daily_metadata.id", ondelete="SET NULL"), nullable=True, index=True)
    
    # FTS5 Search Support
    tags_text = Column(Text, nullable=True, default="")  # Denormalized tags for FTS5 search
    
    # Relationships
    user = relationship("User", back_populates="diary_entries")
    tag_objs = relationship("Tag", secondary=diary_entry_tags, back_populates="diary_entries")
    media = relationship("DiaryMedia", back_populates="entry", cascade="all, delete-orphan")
    daily_metadata = relationship("DiaryDailyMetadata", back_populates="entries")

    def __repr__(self):
        return (
            f"<DiaryEntry(id={self.id}, uuid={self.uuid}, title='{self.title}', date={self.date}, "
            f"mood={self.mood}, weather_code={self.weather_code})>"
        )


class DiaryDailyMetadata(Base):
    """Daily wellness metrics per user (sleep, exercise, nepali date, etc.)."""

    __tablename__ = "diary_daily_metadata"
    __table_args__ = (
        UniqueConstraint('user_id', 'date', name='uq_diary_daily_metadata_user_date'),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    nepali_date = Column(String(20), nullable=True)
    metrics_json = Column(Text, nullable=False, default='{}')
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())

    # Relationships
    user = relationship("User", back_populates="diary_daily_metadata")
    entries = relationship("DiaryEntry", back_populates="daily_metadata")

    def __repr__(self):
        return f"<DiaryDailyMetadata(id={self.id}, user_id={self.user_id}, date={self.date})>"


class DiaryMedia(Base):
    """Media attachments for diary entries (photos, videos, voice recordings)"""
    
    __tablename__ = "diary_media"
    
    id = Column(Integer, primary_key=True, index=True)  # Legacy counter (keeps counting lifetime entries)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)  # API identifier
    diary_entry_uuid = Column(String(36), ForeignKey("diary_entries.uuid", ondelete="CASCADE"), nullable=False, index=True)
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
        return f"<DiaryMedia(id={self.id}, uuid={self.uuid}, filename='{self.filename}', media_type='{self.media_type}')>"

