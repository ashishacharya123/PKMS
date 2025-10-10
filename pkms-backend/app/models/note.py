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
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)
    title = Column(String(255), nullable=False, index=True)
    content = Column(Text, nullable=False)
    is_favorite = Column(Boolean, default=False, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    is_exclusive_mode = Column(Boolean, default=False, index=True)  # If True, note is deleted when any of its projects are deleted
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # FTS5 Search Support
    tags_text = Column(Text, nullable=True, default="")  # Denormalized tags for FTS5 search
    
    # Relationships
    user = relationship("User", back_populates="notes")
    tag_objs = relationship("Tag", secondary=note_tags, back_populates="notes")
    files = relationship("NoteFile", back_populates="note", cascade="all, delete-orphan")
    projects = relationship("Project", secondary=note_projects, back_populates="notes")
    
    def __repr__(self):
        return f"<Note(id={self.id}, title='{self.title}')>"


class NoteFile(Base):
    """Note file attachments"""
    
    __tablename__ = "note_files"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)
    note_uuid = Column(String(36), ForeignKey("notes.uuid", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)  # Optional description/caption
    is_archived = Column(Boolean, default=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Relationships
    note = relationship("Note", back_populates="files")
    user = relationship("User", back_populates="note_files")
    
    def __repr__(self):
        return f"<NoteFile(id={self.id}, filename='{self.filename}', note_uuid='{self.note_uuid}')>" 