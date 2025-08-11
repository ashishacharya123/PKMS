"""
Document Model for File Storage and Management
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import document_tags


class Document(Base):
    """Document model for file storage and management"""
    
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)

    # Original name uploaded by user (for display).  The internal stored filename on disk stays in `filename`.
    original_name = Column(String(255), nullable=False)

    title = Column(String(255), nullable=False, index=True)
    filename = Column(String(255), nullable=False)  # stored filename on disk
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_favorite = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False, index=True)
    archive_item_uuid = Column(String(36), nullable=True, index=True)  # Reference to ArchiveItem when archived
    upload_status = Column(String(20), default="completed")  # pending, processing, completed, failed
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Relationships
    user = relationship("User", back_populates="documents")
    tag_objs = relationship("Tag", secondary=document_tags, back_populates="documents")
    
    # Convenience alias for frontend which expects `size_bytes`.
    @property
    def size_bytes(self):
        return self.file_size

    def __repr__(self):
        return f"<Document(id={self.id}, uuid='{self.uuid}', title='{self.title}')>" 