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
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)  # Primary key
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
    user_uuid = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Additional metadata as JSON for flexibility
    daily_metadata_id = Column(String(36), ForeignKey("diary_daily_metadata.uuid", ondelete="SET NULL"), nullable=True, index=True)
    
    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="diary_entries")
    tag_objs = relationship("Tag", secondary=diary_entry_tags, back_populates="diary_entries")
    media = relationship("DiaryMedia", back_populates="entry", cascade="all, delete-orphan")
    daily_metadata = relationship("DiaryDailyMetadata", back_populates="entries")

    def __repr__(self):
        return (
            f"<DiaryEntry(uuid={self.uuid}, title='{self.title}', date={self.date}, "
            f"mood={self.mood}, weather_code={self.weather_code})>"
        )


class DiaryDailyMetadata(Base):
    """Daily wellness metrics per user (sleep, exercise, nepali date, financial, office day, etc.)."""

    __tablename__ = "diary_daily_metadata"
    __table_args__ = (
        UniqueConstraint('user_uuid', 'date', name='uq_diary_daily_metadata_user_date'),
    )

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid4()), index=True)
    user_uuid = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    nepali_date = Column(String(20), nullable=True)
    
    # Financial tracking (in NPR)
    daily_income = Column(Integer, nullable=True, default=0)  # Income in NPR for the day
    daily_expense = Column(Integer, nullable=True, default=0)  # Expense in NPR for the day
    
    # Office/work tracking
    is_office_day = Column(Boolean, nullable=True, default=False)  # Was this an office/work day?
    
    # Generic metrics (legacy)
    metrics_json = Column(Text, nullable=False, default='{}')
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())

    # Relationships
    user = relationship("User", back_populates="diary_daily_metadata")
    entries = relationship("DiaryEntry", back_populates="daily_metadata")

    def __repr__(self):
        return f"<DiaryDailyMetadata(uuid={self.uuid}, user_uuid={self.user_uuid}, date={self.date})>"


class DiaryMedia(Base):
    """Media attachments for diary entries (photos, videos, voice recordings)"""
    
    __tablename__ = "diary_media"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)  # Primary key
    
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
    user_uuid = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    
    # Relationships
    entry = relationship("DiaryEntry", back_populates="media")
    user = relationship("User", back_populates="diary_media")
    
    def __repr__(self):
        return f"<DiaryMedia(uuid={self.uuid}, filename='{self.filename}', media_type='{self.media_type}')>"

