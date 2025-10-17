"""
Archive Models for File Organization
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, BigInteger
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from uuid import uuid4

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import archive_folder_tags, archive_item_tags


class ArchiveFolder(Base):
    """Archive folder for organizing files"""
    
    __tablename__ = "archive_folders"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    parent_uuid = Column(String(36), ForeignKey("archive_folders.uuid", ondelete="CASCADE"), nullable=True, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    is_favorite = Column(Boolean, default=False, index=True)
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())


    # Relationships
    user = relationship("User", back_populates="archive_folders", foreign_keys=[created_by])
    parent = relationship("ArchiveFolder", remote_side=[uuid], backref="children")
    items = relationship("ArchiveItem", back_populates="folder", cascade="all, delete-orphan")
    tag_objs = relationship("Tag", secondary=archive_folder_tags, back_populates="archive_folders")
    
    def __repr__(self):
        return f"<ArchiveFolder(uuid={self.uuid}, name='{self.name}', parent_uuid='{self.parent_uuid}')>"


class ArchiveItem(Base):
    """Archive item (file) stored in folders"""
    
    __tablename__ = "archive_items"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    mime_type = Column(String(100), nullable=False)
    folder_uuid = Column(String(36), ForeignKey("archive_folders.uuid", ondelete="CASCADE"), nullable=True, index=True)
    is_archived = Column(Boolean, default=False, index=True)
    is_favorite = Column(Boolean, default=False, index=True)
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Additional metadata as JSON
    metadata_json = Column(Text, default="{}")  # Additional metadata as JSON
    
    
    # Relationships
    user = relationship("User", back_populates="archive_items", foreign_keys=[created_by])
    folder = relationship("ArchiveFolder", back_populates="items")
    tag_objs = relationship("Tag", secondary=archive_item_tags, back_populates="archive_items")
    
    def __repr__(self):
        return f"<ArchiveItem(uuid={self.uuid}, name='{self.name}', folder_uuid='{self.folder_uuid}')>" 