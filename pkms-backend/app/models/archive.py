"""
Archive module models for PKMS backend
Hierarchical folder/file structure for organized document storage
"""

import uuid as uuid_lib
from typing import Dict, List, Optional
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, BigInteger, func, text
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property
import json
import os
from pathlib import Path

from app.database import Base
# archive_tags is imported in the relationships where needed


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
    tags = relationship("Tag", secondary="archive_tags", back_populates="archive_items")
    
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


# Note: FTS5 virtual table implementation is commented out for now
# as SQLAlchemy doesn't natively support FTS5 virtual tables.
# We'll implement full-text search using LIKE queries in the meantime.

# class ArchiveItemsFTS(Base):
#     """Full-text search virtual table for archive items"""
#     
#     __tablename__ = "archive_items_fts"
#     
#     rowid = Column(Integer, primary_key=True)
#     name = Column(String)
#     description = Column(String)
#     extracted_text = Column(String)


# FTS5 Support Implementation
# Since SQLAlchemy doesn't natively support FTS5 virtual tables in declarative mapping,
# we'll create the FTS5 table through raw SQL execution during database initialization.

FTS5_CREATE_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS archive_items_fts USING fts5(
    name,
    description,
    extracted_text,
    content='archive_items',
    content_rowid='rowid',
    tokenize='porter unicode61'
);
"""

FTS5_TRIGGERS_SQL = """
-- Trigger to keep FTS5 index in sync with archive_items table
CREATE TRIGGER IF NOT EXISTS archive_items_fts_insert AFTER INSERT ON archive_items BEGIN
    INSERT INTO archive_items_fts(rowid, name, description, extracted_text)
    VALUES (NEW.rowid, NEW.name, NEW.description, NEW.extracted_text);
END;

CREATE TRIGGER IF NOT EXISTS archive_items_fts_delete AFTER DELETE ON archive_items BEGIN
    INSERT INTO archive_items_fts(archive_items_fts, rowid, name, description, extracted_text)
    VALUES('delete', OLD.rowid, OLD.name, OLD.description, OLD.extracted_text);
END;

CREATE TRIGGER IF NOT EXISTS archive_items_fts_update AFTER UPDATE ON archive_items BEGIN
    INSERT INTO archive_items_fts(archive_items_fts, rowid, name, description, extracted_text)
    VALUES('delete', OLD.rowid, OLD.name, OLD.description, OLD.extracted_text);
    INSERT INTO archive_items_fts(rowid, name, description, extracted_text)
    VALUES (NEW.rowid, NEW.name, NEW.description, NEW.extracted_text);
END;
"""

# Temporarily commenting out FTS5 functions to test for segfault
# async def create_fts5_tables(db_session):
#     """Create FTS5 virtual tables for full-text search"""
#     try:
#         # Create the FTS5 virtual table
#         await db_session.execute(text("""
#             CREATE VIRTUAL TABLE IF NOT EXISTS archive_items_fts USING fts5(
#                 uuid UNINDEXED,
#                 name, 
#                 description,
#                 extracted_text,
#                 tokenize='porter unicode61',
#                 prefix='2,3'
#             );
#         """))
        
#         # Populate FTS table with existing data
#         await db_session.execute(text("""
#             INSERT OR REPLACE INTO archive_items_fts(uuid, name, description, extracted_text)
#             SELECT uuid, name, description, extracted_text 
#             FROM archive_items 
#             WHERE is_archived = 0;
#         """))
        
#         await db_session.commit()
#         logger.info("✅ FTS5 tables created and populated")
        
#     except Exception as e:
#         logger.error(f"❌ Failed to create FTS5 tables: {e}")
#         await db_session.rollback()
#         raise


# async def search_with_fts5(db_session, query: str, limit: int = 50):
#     """Search using FTS5 with BM25 ranking"""
#     try:
#         # Use FTS5 MATCH with BM25 ranking
#         fts_query = query.replace("'", "''")  # Escape single quotes
        
#         result = await db_session.execute(text("""
#             SELECT 
#                 a.uuid, a.name, a.description, a.extracted_text, a.mime_type,
#                 a.file_size, a.created_at, a.updated_at,
#                 fts.rank as relevance_score
#             FROM archive_items_fts fts
#             JOIN archive_items a ON fts.uuid = a.uuid
#             WHERE fts MATCH :query
#             AND a.is_archived = 0
#             ORDER BY fts.rank
#             LIMIT :limit
#         """), {"query": fts_query, "limit": limit})
        
#         return result.fetchall()
        
#     except Exception as e:
#         logger.warning(f"⚠️ FTS5 search failed: {e}")
        
#         # Fallback to LIKE search
#         like_query = f"%{query}%"
#         result = await db_session.execute(text("""
#             SELECT 
#                 uuid, name, description, extracted_text, mime_type,
#                 file_size, created_at, updated_at,
#                 1.0 as relevance_score
#             FROM archive_items
#             WHERE (name LIKE :query OR description LIKE :query OR extracted_text LIKE :query)
#             AND is_archived = 0
#             ORDER BY updated_at DESC
#             LIMIT :limit
#         """), {"query": like_query, "limit": limit})
        
#         return result.fetchall() 