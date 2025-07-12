"""
Archive Model for File and Folder Management
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid as uuid_lib

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import archive_tags


class ArchiveFolder(Base):
    """Archive folder model for organizing files"""
    
    __tablename__ = "archive_folders"
    
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid_lib.uuid4()))
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    path = Column(String(1000), nullable=False, index=True)  # Full path for hierarchy
    parent_uuid = Column(String(36), ForeignKey("archive_folders.uuid", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Relationships
    user = relationship("User", back_populates="archive_folders")
    parent = relationship("ArchiveFolder", remote_side=[uuid], back_populates="children")
    children = relationship("ArchiveFolder", back_populates="parent", cascade="all, delete-orphan")
    items = relationship("ArchiveItem", back_populates="folder", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<ArchiveFolder(uuid={self.uuid}, name='{self.name}', path='{self.path}')>"


class ArchiveItem(Base):
    """Archive item model for files within folders"""
    
    __tablename__ = "archive_items"
    
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid_lib.uuid4()), unique=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    folder_uuid = Column(String(36), ForeignKey("archive_folders.uuid", ondelete="CASCADE"), nullable=False, index=True)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)
    file_path = Column(String(1000), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False, index=True)
    thumbnail_path = Column(String(1000), nullable=True)
    metadata_json = Column(Text, default="{}")  # Additional metadata as JSON
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    is_favorite = Column(Boolean, default=False, index=True)
    version = Column(String(50), default="1.0")
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Relationships
    user = relationship("User", back_populates="archive_items")
    folder = relationship("ArchiveFolder", back_populates="items")
    tag_objs = relationship("Tag", secondary=archive_tags, back_populates="archive_items")
    
    def __repr__(self):
        return f"<ArchiveItem(uuid={self.uuid}, name='{self.name}', mime_type='{self.mime_type}')>" 