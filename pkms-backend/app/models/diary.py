"""
Diary Models for Personal Journaling

SQLAlchemy models for diary entries, daily metadata, and wellness tracking.
Includes DiaryEntry for journal entries and DiaryDailyMetadata for habit tracking,
financial data, and wellness analytics. Supports Nepali calendar integration.
"""

from uuid import uuid4
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger, SmallInteger, UniqueConstraint, Index, func
from sqlalchemy.orm import relationship
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import diary_entry_tags
from app.models.associations import document_diary


class DiaryEntry(Base):
    """
    Diary entry model for personal journaling with mood tracking and metadata.
    Stores journal content, mood ratings, and relationships to tags/documents.
    """
    
    __tablename__ = "diary_entries"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)  # Primary key
    title = Column(String(255), nullable=False, index=True)
    date = Column(DateTime(timezone=True), nullable=False, index=True)  # Date for the diary entry
    mood = Column(SmallInteger, nullable=True, index=True)  # 1-5 scale
    weather_code = Column(SmallInteger, nullable=True, index=True)  # Enum-coded weather (0-6)
    location = Column(String(100), nullable=True)
    file_count = Column(Integer, nullable=False, default=0)  # Count of associated files (documents)
    content_length = Column(Integer, nullable=False, default=0)
    content_file_path = Column(String(500), nullable=True)
    file_hash = Column(String(128), nullable=True)
    encryption_tag = Column(String(255), nullable=True)
    encryption_iv = Column(String(255), nullable=True)
    is_favorite = Column(Boolean, default=False, index=True)
    is_template = Column(Boolean, default=False, index=True)  # Template flag for reusable entries
    from_template_id = Column(String(36), nullable=True, index=True)  # Source template UUID/ID
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)
    
    is_deleted = Column(Boolean, default=False, index=True)
    
    # Composite indexes for common query patterns
    __table_args__ = (
        Index('ix_diary_user_date', 'created_by', 'date'),
        Index('ix_diary_user_mood', 'created_by', 'mood'),
        Index('ix_diary_user_weather', 'created_by', 'weather_code'),
        Index('ix_diary_user_favorite', 'created_by', 'is_favorite'),
        Index('ix_diary_user_template', 'created_by', 'is_template'),
        Index('ix_diary_user_deleted', 'created_by', 'is_deleted'),
        Index('ix_diary_date_range', 'date', 'created_by'),
    )
    
    # Relationships
    user = relationship("User", back_populates="diary_entries", foreign_keys=[created_by])
    tag_objs = relationship("Tag", secondary=diary_entry_tags, back_populates="diary_entries")
    documents = relationship("Document", secondary=document_diary, order_by=document_diary.c.sort_order)

    async def get_daily_metadata(self, db: AsyncSession) -> Optional["DiaryDailyMetadata"]:
        """
        Helper method to get the daily metadata for this diary entry using natural date relationship.
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
    """
    Daily wellness metadata for habit tracking, financial data, and analytics.
    Stores habit values, income/expense, Nepali dates, and wellness metrics.
    """

    __tablename__ = "diary_daily_metadata"
    __table_args__ = (
        UniqueConstraint('created_by', 'date', name='uq_diary_daily_metadata_user_date'),  # One metadata per user per day
        Index('ix_diary_metadata_user_date', 'created_by', 'date'),
        Index('ix_diary_metadata_day_of_week', 'created_by', 'day_of_week'),
        Index('ix_diary_metadata_office_day', 'created_by', 'is_office_day'),
    )

    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid4()), index=True)
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    nepali_date = Column(String(20), nullable=True)
    day_of_week = Column(SmallInteger, nullable=True, index=True)  # 0=Sunday .. 6=Saturday
    daily_income = Column(Integer, nullable=True, default=0)
    daily_expense = Column(Integer, nullable=True, default=0)
    is_office_day = Column(Boolean, nullable=True, default=False)
    default_habits_json = Column(Text, nullable=False, default='[]')  # RENAMED from metrics_json
    defined_habits_json = Column(Text, nullable=False, default='[]')  # RENAMED from habits_json
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)

    # Relationships
    user = relationship("User", back_populates="diary_daily_metadata", foreign_keys=[created_by])

    async def get_diary_entries(self, db: AsyncSession) -> list["DiaryEntry"]:
        """
        Helper method to get all diary entries for this day using natural date relationship.
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


# DiaryFile model removed - using Document + document_diary association instead