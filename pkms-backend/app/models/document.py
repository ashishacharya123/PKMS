"""
Document Model for File Management
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import document_tags
from app.models.associations import document_projects


class Document(Base):
    """Document model for file management"""
    
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)
    title = Column(String(255), nullable=False, index=True)
    filename = Column(String(255), nullable=False)  # Stored filename on disk
    original_name = Column(String(255), nullable=False)  # Original uploaded name
    file_path = Column(String(500), nullable=False)  # Path relative to data directory
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_favorite = Column(Boolean, default=False, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    is_exclusive_mode = Column(Boolean, default=False, index=True)  # If True, document is deleted when any of its projects are deleted
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)  # Legacy single project support
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # FTS5 Search Support
    tags_text = Column(Text, nullable=True, default="")  # Denormalized tags for FTS5 search
    
    # Relationships
    user = relationship("User", back_populates="documents")
    project = relationship("Project", back_populates="documents")  # Legacy single project
    tag_objs = relationship("Tag", secondary=document_tags, back_populates="documents")
    projects = relationship("Project", secondary=document_projects, back_populates="documents_multi")
    
    def __repr__(self):
        return f"<Document(id={self.id}, title='{self.title}', filename='{self.filename}')>" 