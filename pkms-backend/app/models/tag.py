"""
Tag Model for Cross-Module Content Organization
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Table
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base

# Junction table for archive-tag relationships
archive_tags = Table(
    'archive_tags',
    Base.metadata,
    Column('item_uuid', String(36), ForeignKey('archive_items.uuid', ondelete='CASCADE'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id', ondelete='CASCADE'), primary_key=True)
)


class Tag(Base):
    """Tag model for organizing content across modules"""
    
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, index=True)
    color = Column(String(7), default="#757575")  # Hex color code
    module_type = Column(String(20), nullable=False, index=True)  # notes, documents, todos, archive
    is_archived = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="tags")
    notes = relationship("Note", secondary="note_tags", back_populates="tags")
    documents = relationship("Document", secondary="document_tags", back_populates="tags")
    todos = relationship("Todo", secondary="todo_tags", back_populates="tags")
    archive_items = relationship("ArchiveItem", secondary=archive_tags, back_populates="tags")
    
    def __repr__(self):
        return f"<Tag(id={self.id}, name='{self.name}', module_type='{self.module_type}')>" 