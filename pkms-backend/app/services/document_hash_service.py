"""
Document Hash Service for File Deduplication

This service handles SHA-256 hash calculation for uploaded files
to enable deduplication and prevent storing duplicate files.
"""

import hashlib
import os
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.document import Document
import logging

logger = logging.getLogger(__name__)


class DocumentHashService:
    """Service for calculating and managing file hashes for deduplication"""
    
    @staticmethod
    def calculate_file_hash(file_path: str) -> str:
        """
        Calculate SHA-256 hash of a file.
        
        Args:
            file_path: Path to the file to hash
            
        Returns:
            SHA-256 hash as hexadecimal string
            
        Raises:
            FileNotFoundError: If file doesn't exist
            IOError: If file can't be read
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        sha256_hash = hashlib.sha256()
        
        try:
            with open(file_path, "rb") as f:
                # Read file in chunks to handle large files efficiently
                for chunk in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(chunk)
            
            return sha256_hash.hexdigest()
            
        except IOError as e:
            logger.error(f"Error reading file {file_path}: {str(e)}")
            raise IOError(f"Could not read file {file_path}: {str(e)}")
    
    @staticmethod
    async def find_duplicate_document(
        db: AsyncSession,
        file_hash: str,
        user_uuid: str,
        exclude_uuid: Optional[str] = None
    ) -> Optional[Document]:
        """
        Find existing document with the same file hash for the same user.

        Args:
            db: Database session
            file_hash: SHA-256 hash to search for
            user_uuid: User UUID to scope the search
            exclude_uuid: Document UUID to exclude from search (for updates)

        Returns:
            Document with matching hash, or None if not found
        """
        try:
            query = select(Document).where(
                and_(
                    Document.file_hash == file_hash,
                    Document.created_by == user_uuid
                )
            )

            if exclude_uuid:
                query = query.where(Document.uuid != exclude_uuid)

            result = await db.execute(query)
            return result.scalar_one_or_none()

        except Exception as e:
            logger.error(f"Error finding duplicate document for hash {file_hash}, user {user_uuid}: {str(e)}")
            raise
    
    @staticmethod
    async def get_document_by_hash(db: AsyncSession, file_hash: str, user_uuid: str) -> Optional[Document]:
        """
        Get document by its file hash for the same user.

        Args:
            db: Database session
            file_hash: SHA-256 hash to search for
            user_uuid: User UUID to scope the search

        Returns:
            Document with matching hash, or None if not found
        """
        try:
            result = await db.execute(
                select(Document).where(
                    and_(
                        Document.file_hash == file_hash,
                        Document.created_by == user_uuid
                    )
                )
            )
            return result.scalar_one_or_none()

        except Exception as e:
            logger.error(f"Error getting document by hash {file_hash}, user {user_uuid}: {str(e)}")
            raise
    
    @staticmethod
    def validate_hash_format(file_hash: str) -> bool:
        """
        Validate that a hash string is a valid SHA-256 hash.
        
        Args:
            file_hash: Hash string to validate
            
        Returns:
            True if valid SHA-256 hash, False otherwise
        """
        if not file_hash:
            return False
        
        # SHA-256 produces 64-character hexadecimal string
        if len(file_hash) != 64:
            return False
        
        try:
            int(file_hash, 16)
            return True
        except ValueError:
            return False
    
    @staticmethod
    async def get_hash_statistics(db: AsyncSession) -> dict:
        """
        Get statistics about file hashes in the database.
        
        Args:
            db: Database session
            
        Returns:
            Dictionary with hash statistics
        """
        try:
            from sqlalchemy import func
            
            # Count total documents
            total_docs_result = await db.execute(
                select(func.count(Document.uuid))
            )
            total_docs = total_docs_result.scalar()
            
            # Count unique hashes
            unique_hashes_result = await db.execute(
                select(func.count(func.distinct(Document.file_hash)))
            )
            unique_hashes = unique_hashes_result.scalar()
            
            # Calculate deduplication ratio
            deduplication_ratio = 0
            if total_docs > 0:
                deduplication_ratio = (total_docs - unique_hashes) / total_docs
            
            return {
                "total_documents": total_docs,
                "unique_hashes": unique_hashes,
                "duplicate_files": total_docs - unique_hashes,
                "deduplication_ratio": round(deduplication_ratio, 4)
            }
            
        except Exception as e:
            logger.error(f"Error getting hash statistics: {str(e)}")
            raise


# Create singleton instance
document_hash_service = DocumentHashService()
