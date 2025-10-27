"""
Note Model for Knowledge Management
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger, Index
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.models.base import Base, SoftDeleteMixin
from app.config import nepal_now
from app.models.tag_associations import note_tags
from app.models.associations import note_documents


class Note(Base, SoftDeleteMixin):
    """Note model for knowledge management"""
    
    __tablename__ = "notes"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)  # Primary key
    
    title = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)  # Brief description for FTS5 search
    content = Column(Text, nullable=False)  # Max ~65KB in SQLite TEXT
    content_file_path = Column(String(500), nullable=True)  # For large content stored as files
    size_bytes = Column(BigInteger, default=0, nullable=False)  # Calculated on the fly and stored for analytics
    is_favorite = Column(Boolean, default=False, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    is_template = Column(Boolean, default=False, index=True)  # Template flag for reusable notes
    from_template_id = Column(String(36), nullable=True, index=True)  # Source template UUID/ID
    # REMOVED: is_project_exclusive - exclusivity now handled in project_items association table
    # Ownership
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)

    # Audit trail
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)

    # note_type removed - use tags for classification instead
    
    # Lightweight Versioning (diff-based)
    version = Column(Integer, default=1)
    content_diff = Column(Text, nullable=True)  # Stores diff from previous version
    last_version_uuid = Column(String(36), ForeignKey('notes.uuid'), nullable=True, index=True)  # Points to previous version
    
    # is_deleted now provided by SoftDeleteMixin
    # Derived counts - updated via service methods when files are added/removed
    file_count = Column(Integer, default=0, nullable=False)
    
    # Composite indexes for common query patterns
    __table_args__ = (
        Index('ix_note_user_archived', 'created_by', 'is_archived'),
        Index('ix_note_user_created_desc', 'created_by', 'created_at'),
        Index('ix_note_user_favorite', 'created_by', 'is_favorite'),
        Index('ix_note_user_template', 'created_by', 'is_template'),
        Index('ix_note_user_deleted', 'created_by', 'is_deleted'),
    )
    thumbnail_path = Column(String(500), nullable=True)  # Path to note thumbnail (if applicable)
    
    # Search optimization removed - word_count and reading_time_minutes not needed
    
    
    # Relationships
    user = relationship("User", back_populates="notes", foreign_keys=[created_by])
    tag_objs = relationship("Tag", secondary=note_tags, back_populates="notes")
    documents = relationship("Document", secondary=note_documents, back_populates="notes")  # NEW: Documents via note_documents
    # REMOVED: projects relationship - notes now linked to projects via polymorphic project_items
    
    def get_size_bytes(self):
        """Calculate content size in bytes on the fly"""
        return len(self.content.encode('utf-8')) if self.content else 0

    def __repr__(self):
        return f"<Note(uuid={self.uuid}, title='{self.title}')>"


# NoteFile class removed - replaced with note_documents junction table 