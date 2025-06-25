"""
Archive module models for PKMS backend
Hierarchical folder/file structure for organized document storage
"""

import uuid as uuid_lib
from typing import Dict, List, Optional
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, BigInteger, func
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.tag import archive_tags


class ArchiveFolder(Base):
    """Archive folder model for hierarchical organization"""
    
    __tablename__ = "archive_folders"
    
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid_lib.uuid4()))
    name = Column(String(255), nullable=False, index=True)  # Folder name
    description = Column(Text, nullable=True)  # Optional description
    parent_uuid = Column(String(36), ForeignKey("archive_folders.uuid", ondelete="CASCADE"), nullable=True, index=True)
    path = Column(String(1000), nullable=False, index=True)  # Full path for easy queries
    is_archived = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="archive_folders")
    parent = relationship("ArchiveFolder", remote_side=[uuid], back_populates="children")
    children = relationship("ArchiveFolder", back_populates="parent", cascade="all, delete-orphan")
    items = relationship("ArchiveItem", back_populates="folder", cascade="all, delete-orphan")
    
    @property
    def full_path(self) -> str:
        """Get the full folder path"""
        return self.path
    
    @property
    def depth(self) -> int:
        """Get folder depth (root = 0)"""
        return len([p for p in self.path.split('/') if p]) - 1 if self.path != '/' else 0
    
    def __repr__(self):
        return f"<ArchiveFolder(uuid='{self.uuid}', name='{self.name}', path='{self.path}')>"


class ArchiveItem(Base):
    """Archive item model for files within folders"""
    
    __tablename__ = "archive_items"
    
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid_lib.uuid4()))
    name = Column(String(255), nullable=False, index=True)  # Display name
    description = Column(Text, nullable=True)  # Optional description
    folder_uuid = Column(String(36), ForeignKey("archive_folders.uuid", ondelete="CASCADE"), nullable=False, index=True)
    
    # File information
    original_filename = Column(String(255), nullable=False)  # Original file name
    stored_filename = Column(String(255), nullable=False)  # Stored file name on disk
    file_path = Column(String(500), nullable=False)  # Full path to stored file
    mime_type = Column(String(100), nullable=False)
    file_size = Column(BigInteger, nullable=False)  # Size in bytes
    file_hash = Column(String(64), nullable=True)  # SHA-256 hash for deduplication
    
    # Content and metadata
    extracted_text = Column(Text, nullable=True)  # Searchable text content
    metadata_json = Column(Text, default="{}")  # File metadata as JSON
    thumbnail_path = Column(String(500), nullable=True)  # Path to thumbnail
    
    # Organization
    is_archived = Column(Boolean, default=False, index=True)
    is_favorite = Column(Boolean, default=False, index=True)
    version = Column(String(50), default="1.0")  # Version tracking
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="archive_items")
    folder = relationship("ArchiveFolder", back_populates="items")
    tags = relationship("Tag", secondary=archive_tags, back_populates="archive_items")
    
    @property
    def metadata_dict(self) -> Dict:
        """Return the parsed metadata JSON as a python dict."""
        import json
        try:
            return json.loads(self.metadata_json) if self.metadata_json else {}
        except json.JSONDecodeError:
            return {}
    
    @metadata_dict.setter
    def metadata_dict(self, value: Dict):
        """Store a python dict into the metadata_json column."""
        import json
        self.metadata_json = json.dumps(value)
    
    @property
    def full_path(self) -> str:
        """Get the full path including folder path and filename"""
        return f"{self.folder.path.rstrip('/')}/{self.name}" if self.folder else f"/{self.name}"
    
    @property
    def file_extension(self) -> str:
        """Get file extension from original filename"""
        return self.original_filename.split('.')[-1].lower() if '.' in self.original_filename else ''
    
    def __repr__(self):
        return f"<ArchiveItem(uuid='{self.uuid}', name='{self.name}', folder='{self.folder.name if self.folder else 'None'}')>"


# Runtime alias: allow `item.metadata` to continue working without conflicting with SQLAlchemy
# This alias is attached AFTER class definition, so it does not interfere with the declarative
# class construction (when SQLAlchemy inspects attributes).

def _add_metadata_alias():
    if not hasattr(ArchiveItem, "metadata"):
        setattr(
            ArchiveItem,
            "metadata",
            property(lambda self: self.metadata_dict, lambda self, v: setattr(self, "metadata_dict", v)),
        )


_add_metadata_alias() 