"""
Tag Model for Organizing Content
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import note_tags, document_tags, todo_tags, archive_tags, diary_tags, link_tags


class Tag(Base):
    """Tag model for organizing and categorizing content"""
    
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
    color = Column(String(7), default="#6c757d")  # Hex color code
    module_type = Column(String(20), default="general", index=True)  # notes, documents, todos, diary, archive, general
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_system = Column(Boolean, default=False)  # System tags vs user tags
    usage_count = Column(Integer, default=0)  # Track tag usage frequency
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Relationships
    user = relationship("User", back_populates="tags")
    notes = relationship("Note", secondary=note_tags, back_populates="tag_objs")
    documents = relationship("Document", secondary=document_tags, back_populates="tag_objs")
    todos = relationship("Todo", secondary=todo_tags, back_populates="tag_objs")
    archive_items = relationship("ArchiveItem", secondary=archive_tags, back_populates="tag_objs")
    diary_entries = relationship("DiaryEntry", secondary=diary_tags, back_populates="tag_objs")
    links = relationship("Link", secondary=link_tags, back_populates="tag_objs")
    
    def __repr__(self):
        return f"<Tag(id={self.id}, name='{self.name}', user_id={self.user_id})>" 