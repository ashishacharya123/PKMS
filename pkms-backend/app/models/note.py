"""
Note Model for Knowledge Management
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import note_tags
from app.models.associations import note_projects


class Note(Base):
    """Note model for knowledge management"""
    
    __tablename__ = "notes"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)  # Primary key
    
    title = Column(String(255), nullable=False, index=True)
    content = Column(Text, nullable=False)
    size_bytes = Column(BigInteger, default=0, nullable=False)  # Size of content in bytes
    is_favorite = Column(Boolean, default=False, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    is_exclusive_mode = Column(Boolean, default=False, index=True)  # If True, note is deleted when any of its projects are deleted

    # Audit trail
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    
    # Classification
    note_type = Column(String(50), default='general', index=True)  # general, meeting, idea, reference
    
    # Lightweight Versioning (diff-based)
    version = Column(Integer, default=1)
    content_diff = Column(Text, nullable=True)  # Stores diff from previous version
    last_version_uuid = Column(String(36), ForeignKey('notes.uuid'), nullable=True, index=True)  # Points to previous version
    
    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    
    # Search optimization removed - word_count and reading_time_minutes not needed
    
    
    # Relationships
    user = relationship("User", back_populates="notes")
    tag_objs = relationship("Tag", secondary=note_tags, back_populates="notes")
    files = relationship("NoteFile", back_populates="note", cascade="all, delete-orphan")
    projects = relationship("Project", secondary=note_projects, back_populates="notes")
    
    def __repr__(self):
        return f"<Note(uuid={self.uuid}, title='{self.title}')>"


class NoteFile(Base):
    """Note file attachments"""
    
    __tablename__ = "note_files"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)  # Primary key
    
    note_uuid = Column(String(36), ForeignKey("notes.uuid", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)  # Optional description/caption
    is_archived = Column(Boolean, default=False, index=True)
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)  # Who uploaded this file
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())

    # Relationships
    note = relationship("Note", back_populates="files")
    user = relationship("User", back_populates="note_files")
    
    def __repr__(self):
        return f"<NoteFile(uuid={self.uuid}, filename='{self.filename}')>" 