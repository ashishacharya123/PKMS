"""
Note Model for Personal Knowledge Management
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import note_tags


class Note(Base):
    """Note model for storing personal notes and knowledge"""
    
    __tablename__ = "notes"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)
    title = Column(String(255), nullable=False, index=True)
    content = Column(Text, nullable=False)
    file_count = Column(Integer, default=0, nullable=False)  # Count of attached files
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_favorite = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Relationships
    user = relationship("User", back_populates="notes")
    tag_objs = relationship("Tag", secondary=note_tags, back_populates="notes")
    files = relationship("NoteFile", back_populates="note", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Note(id={self.id}, title='{self.title[:50]}')>"


class NoteFile(Base):
    """File attachments for notes (documents, images, etc.)"""
    
    __tablename__ = "note_files"
    
    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)  # Stored filename on disk
    original_name = Column(String(255), nullable=False)  # Original uploaded name
    file_path = Column(String(500), nullable=False)  # Path relative to data directory
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)  # Optional description/caption
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    
    # Relationships
    note = relationship("Note", back_populates="files")
    user = relationship("User", back_populates="note_files")
    
    def __repr__(self):
        return f"<NoteFile(id={self.id}, filename='{self.filename}', note_id={self.note_id})>" 