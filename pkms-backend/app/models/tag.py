"""
Tag Model for Content Organization
"""

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, ForeignKey,
    UniqueConstraint, Enum
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.models.base import Base
from app.config import nepal_now
# ModuleType removed - tags are now universal across all modules
from app.models.tag_associations import (
    note_tags, document_tags, todo_tags, project_tags,
    archive_item_tags, archive_folder_tags, diary_entry_tags
    # link_tags removed - links module deleted
)


class Tag(Base):
    """Tag model for organizing content"""
    
    __tablename__ = "tags"

    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)
    name = Column(String(100), nullable=False, index=True)
    
    description = Column(Text, nullable=True)
    color = Column(String(7), default="#3498db")  # Hex color code
    
    # CRITICAL: Tracks usage for cleanup and UI sorting.
    usage_count = Column(Integer, default=0, nullable=False)
    
    # Simplified: Universal tags work across all modules - no module_type separation needed
    is_system = Column(Boolean, default=False, index=True)  # System tags can't be deleted
    is_archived = Column(Boolean, default=False, index=True)
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)
    
    # CRITICAL: Ensures a user can't have duplicate tag names (universal across all modules).
    __table_args__ = (
        UniqueConstraint('name', 'created_by', name='_user_tag_uc'),
        Index('ix_tag_user_usage', 'created_by', 'usage_count'),
        Index('ix_tag_user_archived', 'created_by', 'is_archived'),
        Index('ix_tag_user_system', 'created_by', 'is_system'),
        Index('ix_tag_name_search', 'name', 'created_by'),
    )
    
    # Relationships
    user = relationship("User", back_populates="tags", foreign_keys=[created_by])

    # Relationships to content models
    notes = relationship("Note", secondary=note_tags, back_populates="tag_objs")
    documents = relationship("Document", secondary=document_tags, back_populates="tag_objs")
    todos = relationship("Todo", secondary=todo_tags, back_populates="tag_objs")
    projects = relationship("Project", secondary=project_tags, back_populates="tag_objs")
    archive_items = relationship("ArchiveItem", secondary=archive_item_tags, back_populates="tag_objs")
    archive_folders = relationship("ArchiveFolder", secondary=archive_folder_tags, back_populates="tag_objs")
    diary_entries = relationship("DiaryEntry", secondary=diary_entry_tags, back_populates="tag_objs")
    # links relationship removed - links module deleted

    def __repr__(self):
        return f"<Tag(uuid={self.uuid}, name='{self.name}')>" 
