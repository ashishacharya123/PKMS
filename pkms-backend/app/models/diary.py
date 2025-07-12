"""
Diary Model for Personal Journal and Diary Entries

Encrypted-file layout (used for diary text and media stored on disk)
------------------------------------------------------------------
Offset | Size | Purpose
-------|------|----------------------------------------------------
0      | 4    | ASCII b"PKMS"   – magic bytes
4      | 1    | File-format version (0x01)
5      | 1    | Original-extension length N (0-255). N = 0 → diary text
6      | N    | Original extension bytes (utf-8, lowercase, no leading '.')
6+N    | 12   | IV  (AES-GCM 12-byte nonce)
18+N   | 16   | TAG (AES-GCM 16-byte authentication tag)
34+N   | …    | Cipher-text payload (binary)

During decryption, concatenate payload+TAG and call
    AESGCM(key).decrypt(iv, payload+tag, None)
where key = SHA-256(password).

This header is replicated in app/utils/diary_encryption.py and documented
in scripts/decrypt_pkms_file.py so that standalone utilities can process
files without database access.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger, SmallInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import diary_tags


class DiaryEntry(Base):
    """Diary entry model for personal journaling
    
    Schema Notes:
    - location: Indexed for future filtering by location
    - is_favorite: Not currently exposed in API but available for future filtering features  
    - metadata_json: Contains flexible data like sleep, screen time, exercise, etc.
    """
    
    __tablename__ = "diary_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False, index=True)
    day_of_week = Column(SmallInteger, nullable=False, index=True)  # 0=Monday .. 6=Sunday
    media_count = Column(Integer, default=0, nullable=False)
    content_file_path = Column(String(500), nullable=False)  # Unencrypted path to encrypted .dat file
    file_hash = Column(String(64), nullable=False)  # SHA-256 of encrypted file for integrity
    mood = Column(Integer, nullable=True)  # 1=very bad, 2=bad, 3=neutral, 4=good, 5=very good
    location = Column(String(255), nullable=True, index=True)  # Location for filtering diary entries
    is_favorite = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(DateTime(timezone=True), nullable=False, index=True)
    encryption_iv = Column(String(32), nullable=True)  # AES-GCM IV
    encryption_tag = Column(String(32), nullable=True)  # AES-GCM authentication tag
    metadata_json = Column(Text, nullable=True, default='{}')  # Flexible metadata storage
    is_template = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Relationships
    user = relationship("User", back_populates="diary_entries")
    media = relationship("DiaryMedia", back_populates="diary_entry", cascade="all, delete-orphan")
    tag_objs = relationship("Tag", secondary=diary_tags, back_populates="diary_entries")

    def __repr__(self):
        return f"<DiaryEntry(id={self.id}, title='{self.title}', date='{self.date}')>"


class DiaryMedia(Base):
    """Media attachments for diary entries (photos, videos, voice notes)"""
    
    __tablename__ = "diary_media"
    
    id = Column(Integer, primary_key=True, index=True)
    diary_entry_id = Column(Integer, ForeignKey("diary_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)  # Points to encrypted .dat file
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    media_type = Column(String(20), nullable=False)  # photo, video, voice
    caption = Column(Text, nullable=True)
    is_encrypted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    
    # Relationships
    diary_entry = relationship("DiaryEntry", back_populates="media")
    user = relationship("User", back_populates="diary_media")
    
    def __repr__(self):
        return f"<DiaryMedia(id={self.id}, filename='{self.filename}', type='{self.media_type}')>" 