"""
Diary Models for Personal Journaling
"""

from uuid import uuid4
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger, SmallInteger, UniqueConstraint, func
from sqlalchemy.orm import relationship
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

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
    # day_of_week moved to DiaryDailyMetadata for better organization
    media_count = Column(Integer, nullable=False, default=0)
    content_length = Column(Integer, nullable=False, default=0)
    content_file_path = Column(String(500), nullable=True)
    file_hash = Column(String(128), nullable=True)
    encryption_tag = Column(String(255), nullable=True)
    encryption_iv = Column(String(255), nullable=True)
    is_favorite = Column(Boolean, default=False, index=True)
    # is_archived removed - use is_deleted for consistent soft delete across all modules
    is_template = Column(Boolean, default=False, index=True)  # Template flag for reusable entries
    from_template_id = Column(String(36), nullable=True, index=True)  # Source template UUID/ID
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)
    
    # daily_metadata_id removed - will use natural date relationship instead

    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="diary_entries", foreign_keys=[created_by])
    tag_objs = relationship("Tag", secondary=diary_entry_tags, back_populates="diary_entries")
    media = relationship("DiaryMedia", back_populates="entry", cascade="all, delete-orphan")
    # daily_metadata relationship now uses natural date+user matching instead of FK

    def get_daily_metadata(self, db: AsyncSession) -> Optional["DiaryDailyMetadata"]:
        """
        Helper method to get the daily metadata for this diary entry using natural date relationship.
        This replaces the old FK-based relationship lookup.
        """
        from sqlalchemy import select

        query = select(DiaryDailyMetadata).where(
            DiaryDailyMetadata.created_by == self.created_by,
            func.date(DiaryDailyMetadata.date) == func.date(self.date)
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()

    def __repr__(self):
        return (
            f"<DiaryEntry(uuid={self.uuid}, title='{self.title}', date={self.date}, "
            f"mood={self.mood}, weather_code={self.weather_code})>"
        )


class DiaryDailyMetadata(Base):
    """Daily wellness metrics per user (sleep, exercise, nepali date, financial, office day, etc.)."""

    __tablename__ = "diary_daily_metadata"
    __table_args__ = (
        UniqueConstraint('created_by', 'date', name='uq_diary_daily_metadata_user_date'),
    )

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid4()), index=True)
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    nepali_date = Column(String(20), nullable=True)
    day_of_week = Column(SmallInteger, nullable=True, index=True)  # 0=Sunday .. 6=Saturday

    # Financial tracking (in NPR)
    daily_income = Column(Integer, nullable=True, default=0)  # Income in NPR for the day
    daily_expense = Column(Integer, nullable=True, default=0)  # Expense in NPR for the day
    
    # Office/work tracking
    is_office_day = Column(Boolean, nullable=True, default=False)  # Was this an office/work day?
    
    # Generic metrics
    metrics_json = Column(Text, nullable=False, default='{}')
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="diary_daily_metadata", foreign_keys=[created_by])
    # entries relationship removed - now uses natural date+user matching via queries instead of FK relationship

    def get_diary_entries(self, db: AsyncSession) -> list["DiaryEntry"]:
        """
        Helper method to get all diary entries for this day using natural date relationship.
        This provides easy access to all entries that belong to this metadata record.
        """
        from sqlalchemy import select

        query = select(DiaryEntry).where(
            DiaryEntry.created_by == self.created_by,
            func.date(DiaryEntry.date) == func.date(self.date)
        ).order_by(DiaryEntry.created_at)

        result = await db.execute(query)
        return result.scalars().all()

    def __repr__(self):
        return f"<DiaryDailyMetadata(uuid={self.uuid}, created_by={self.created_by}, date={self.date})>"


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
    description = Column(Text, nullable=True)  # Renamed from caption for consistency
    display_order = Column(Integer, default=0, nullable=False)  # Order of display within diary entry (0 = first)
    # is_encrypted removed - diary media is always encrypted by default
    # created_by removed - redundant, already in parent diary entry
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)

    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)  # Consistent soft delete naming
    
    # Relationships
    entry = relationship("DiaryEntry", back_populates="media")
    # user relationship removed - created_by field removed
    # is_exclusive_mode removed - always exclusive to parent diary entry (cascade handles this)
    
    def __repr__(self):
        return f"<DiaryMedia(uuid={self.uuid}, filename='{self.filename}', media_type='{self.media_type}')>"

