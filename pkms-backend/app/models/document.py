"""
Document Model for File Management
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger, Enum, Index
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import document_tags
from app.models.associations import document_projects, document_diary
# UploadStatus import removed - documents no longer store upload status


class Document(Base):
    """Document model for file management"""
    
    __tablename__ = "documents"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)  # Primary key
    
    title = Column(String(255), nullable=False, index=True)
    filename = Column(String(255), nullable=False)  # Stored filename on disk
    original_name = Column(String(255), nullable=False)  # Original uploaded name
    file_path = Column(String(500), nullable=False)  # Path relative to data directory
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_favorite = Column(Boolean, default=False, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    is_project_exclusive = Column(Boolean, default=False, index=True)  # If True, document is deleted when any of its projects are deleted
    is_diary_exclusive = Column(Boolean, default=False, index=True)  # If True, document is hidden from main document list (diary-only)
    
    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)

    # Upload status removed - only needed during upload process, handled by upload services
    thumbnail_path = Column(String(500), nullable=True)  # Path to thumbnail file

    # Audit trail
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)
    
    # Composite indexes for common query patterns
    __table_args__ = (
        Index('ix_doc_user_archived_exclusive', 'created_by', 'is_archived', 'is_project_exclusive', 'is_diary_exclusive'),
        Index('ix_doc_user_deleted', 'created_by', 'is_deleted'),
        Index('ix_doc_user_created_desc', 'created_by', 'created_at'),
        Index('ix_doc_user_favorite', 'created_by', 'is_favorite'),
        Index('ix_doc_mime_type', 'mime_type', 'created_by'),
    )
    
    
    # Removed heavy columns: extracted_text, versioning, page_count, word_count, language
    # These can be added later if needed for specific use cases
    
    
    # Relationships
    user = relationship("User", back_populates="documents")
    tag_objs = relationship("Tag", secondary=document_tags, back_populates="documents")
    projects = relationship("Project", secondary=document_projects, back_populates="documents_multi")
    # Note: No diary_entries relationship - documents don't need to know about diary entries
    
    def __repr__(self):
        return f"<Document(uuid={self.uuid}, title='{self.title}')>" 
        
