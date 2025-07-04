"""
Archive module models for PKMS backend
Hierarchical folder/file structure for organized document storage
"""

import uuid as uuid_lib
from typing import Dict, List, Optional
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, BigInteger, func
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property
import json
import os
from pathlib import Path

from app.database import Base
from app.models.tag import archive_tags


class ArchiveFolder(Base):
    """Archive folder model for hierarchical organization"""
    
    __tablename__ = "archive_folders"
    
    uuid = Column(String(36), primary_key=True, default=lambda: str(uuid_lib.uuid4()))
    name = Column(String(255), nullable=False, index=True)  # Folder name
    description = Column(Text, nullable=True)  # Optional description
    parent_uuid = Column(String(36), ForeignKey("archive_folders.uuid", ondelete="CASCADE"), nullable=True, index=True)
    path = Column(String(4096), nullable=False, index=True)  # Increased from 1000 to 4096 for deep hierarchies
    is_archived = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="archive_folders")
    parent = relationship("ArchiveFolder", remote_side=[uuid], back_populates="children")
    children = relationship("ArchiveFolder", back_populates="parent", cascade="all, delete-orphan")
    items = relationship("ArchiveItem", back_populates="folder", cascade="all, delete-orphan")
    
    @hybrid_property
    def full_path(self) -> str:
        """Return normalized full path to folder"""
        if not self.path:
            return "/"
        # Normalize path separators and remove any double slashes
        normalized = os.path.normpath(self.path).replace("\\", "/")
        # Ensure path starts with / and doesn't end with /
        if not normalized.startswith("/"):
            normalized = "/" + normalized
        if normalized != "/" and normalized.endswith("/"):
            normalized = normalized[:-1]
        return normalized
    
    @hybrid_property
    def depth(self) -> int:
        """Return folder depth in hierarchy"""
        return len([p for p in self.full_path.split("/") if p])
    
    def __repr__(self):
        return f"<ArchiveFolder {self.name} ({self.uuid})>"


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
    file_path = Column(String(4096), nullable=False)  # Full path to stored file, increased for consistency
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
        """Return metadata as dictionary"""
        try:
            return json.loads(self.metadata_json)
        except (json.JSONDecodeError, TypeError):
            return {}
    
    @metadata_dict.setter
    def metadata_dict(self, value: Dict):
        """Set metadata from dictionary"""
        self.metadata_json = json.dumps(value)
    
    @hybrid_property
    def full_path(self) -> str:
        """Return normalized full path to file"""
        if not self.file_path:
            return ""
        # Normalize path separators and remove any double slashes
        normalized = os.path.normpath(self.file_path).replace("\\", "/")
        # Ensure path starts with / but doesn't end with /
        if not normalized.startswith("/"):
            normalized = "/" + normalized
        if normalized != "/" and normalized.endswith("/"):
            normalized = normalized[:-1]
        return normalized
    
    @property
    def file_extension(self) -> str:
        """Return file extension"""
        return os.path.splitext(self.original_filename)[1].lower()
    
    def __repr__(self):
        return f"<ArchiveItem {self.name} ({self.uuid})>"


# FTS5 virtual table for archive items search
class ArchiveItemsFTS(Base):
    """Full-text search virtual table for archive items"""
    
    __tablename__ = "archive_items_fts"
    __table_args__ = {"sqlite_fts5": True}
    
    rowid = Column(Integer, primary_key=True)
    name = Column(String)
    description = Column(String)
    extracted_text = Column(String)
    
    # Define tokenizer and other FTS5 options
    __table_args__ = {
        "sqlite_fts5": {
            "content": "archive_items",  # Content table
            "content_rowid": "uuid",     # Primary key of content table
            "tokenize": "porter unicode61",  # Use Porter stemming
            "prefix": [2, 3],            # Enable prefix searches of length 2 and 3
            "columnsize": 0              # Disable column size optimization
        }
    }


# Note: We previously added a dynamic `metadata` property on `ArchiveItem` to expose the parsed
# metadata dictionary. Unfortunately, defining an attribute named `metadata` conflicts with
# SQLAlchemy's internal use of that name during table construction, causing the application to
# crash at startup (`AttributeError: 'property' object has no attribute 'schema'`).
#
# To avoid this name collision, we will no longer inject a `metadata` property here.  Consumers
# should use the existing `metadata_dict` helper or access `metadata_json` directly and parse it
# themselves. 