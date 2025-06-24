"""
Document Model for Documents Module
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Table, BigInteger, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from app.database import Base

# Junction table for document-tag relationships
document_tags = Table(
    'document_tags',
    Base.metadata,
    Column('document_uuid', String(36), ForeignKey('documents.uuid', ondelete='CASCADE'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id', ondelete='CASCADE'), primary_key=True)
)


class Document(Base):
    """Document model for file management"""
    
    __tablename__ = "documents"
    
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String(255), nullable=False, index=True)  # Stored filename
    original_name = Column(String(255), nullable=False)  # Original filename
    filepath = Column(String(500), nullable=False)  # Path to file in storage
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(BigInteger, nullable=False)
    extracted_text = Column(Text, nullable=True)  # Full-text search content
    metadata_json = Column(Text, default="{}")  # Additional metadata as JSON
    thumbnail_path = Column(String(500), nullable=True)  # Path to thumbnail
    is_archived = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="documents")
    tags = relationship("Tag", secondary=document_tags, back_populates="documents")
    links = relationship("Link", back_populates="from_document", cascade="all, delete-orphan")
    backlinks = relationship("Link", back_populates="to_document", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Document(uuid='{self.uuid}', filename='{self.filename}')>" 