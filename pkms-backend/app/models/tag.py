"""
Tag Model for Content Organization
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import (
    note_tags, document_tags, todo_tags, project_tags, 
    archive_item_tags, archive_folder_tags, diary_entry_tags, link_tags
)


class Tag(Base):
    """Tag model for organizing content"""
    
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    color = Column(String(7), default="#3498db")  # Hex color code
    is_system = Column(Boolean, default=False, index=True)  # System tags can't be deleted
    is_archived = Column(Boolean, default=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Relationships to content models
    notes = relationship("Note", secondary=note_tags, back_populates="tag_objs")
    documents = relationship("Document", secondary=document_tags, back_populates="tag_objs")
    todos = relationship("Todo", secondary=todo_tags, back_populates="tag_objs")
    projects = relationship("Project", secondary=project_tags, back_populates="tag_objs")
    archive_items = relationship("ArchiveItem", secondary=archive_item_tags, back_populates="tag_objs")
    archive_folders = relationship("ArchiveFolder", secondary=archive_folder_tags, back_populates="tag_objs")
    diary_entries = relationship("DiaryEntry", secondary=diary_entry_tags, back_populates="tag_objs")
    links = relationship("Link", secondary=link_tags, back_populates="tag_objs")
    
    def __repr__(self):
        return f"<Tag(id={self.id}, name='{self.name}', color='{self.color}')>" 