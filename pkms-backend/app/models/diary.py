"""
Diary Models for Encrypted Journal Entries
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, BigInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid as uuid_lib

from app.database import Base


class DiaryEntry(Base):
    """
    Encrypted diary entry model.
    The entire diary entry content is stored as a single encrypted blob.
    """
    
    __tablename__ = "diary_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=True, index=True) # Unencrypted for searchability
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    
    # Encrypted data as a single blob (now only contains the content)
    encrypted_blob = Column(Text, nullable=False)
    
    # AES-GCM parameters are stored alongside the blob
    encryption_iv = Column(String(255), nullable=False)
    encryption_tag = Column(String(255), nullable=False)
    
    # Unencrypted metadata for filtering and display
    mood = Column(Integer, nullable=True, index=True)
    metadata_json = Column(Text, default='{}') # For optional fields like sleep, exercise, etc.
    is_template = Column(Boolean, default=False, index=True)
    
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="diary_entries")
    media = relationship("DiaryMedia", back_populates="entry", cascade="all, delete-orphan", lazy="selectin")
    
    def __repr__(self):
        return f"<DiaryEntry(id={self.id}, date='{self.date}')>"

class DiaryMedia(Base):
    """Encrypted media associated with a diary entry."""
    
    __tablename__ = "diary_media"
    
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid_lib.uuid4()))
    entry_id = Column(Integer, ForeignKey("diary_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Encrypted file details
    filename_encrypted = Column(Text, nullable=False)
    filepath_encrypted = Column(Text, nullable=False)
    encryption_iv = Column(String(255), nullable=False)
    encryption_tag = Column(String(255), nullable=False)
    
    # Unencrypted metadata
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    media_type = Column(String(20), nullable=False, index=True) # E.g., 'voice', 'photo', 'video'
    duration_seconds = Column(Integer, nullable=True) # For audio/video
    
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="diary_media")
    entry = relationship("DiaryEntry", back_populates="media")
    
    def __repr__(self):
        return f"<DiaryMedia(uuid={self.uuid}, entry_id={self.entry_id}, type='{self.media_type}')>"

# The DiaryMedia model has been removed to align with the new single-blob
# encryption strategy. Media handling will be redesigned separately if needed. 