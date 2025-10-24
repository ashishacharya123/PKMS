"""
File Size Service for PKMS

Handles file size validation and limits across all modules.
Implements consistent 50MB limit for all file uploads.
"""

import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class FileSizeService:
    """Service for managing file size limits and validation."""
    
    # File size limits (in bytes)
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB for all modules
    
    @classmethod
    def validate_file_size(cls, file_size: int) -> bool:
        """
        Validate file size against the 50MB limit for all modules.
        
        Args:
            file_size: File size in bytes
            
        Returns:
            True if file size is within limits, False otherwise
        """
        return file_size <= cls.MAX_FILE_SIZE
    
    @classmethod
    def get_size_limit(cls) -> int:
        """
        Get the file size limit for all modules.
        
        Returns:
            Maximum file size in bytes (50MB)
        """
        return cls.MAX_FILE_SIZE
    
    @classmethod
    def get_size_limit_mb(cls) -> int:
        """
        Get the file size limit in MB for display purposes.
        
        Returns:
            Maximum file size in MB (50)
        """
        return cls.MAX_FILE_SIZE // (1024 * 1024)
    
    @classmethod
    def format_file_size(cls, size_bytes: int) -> str:
        """
        Format file size in human-readable format.
        
        Args:
            size_bytes: File size in bytes
            
        Returns:
            Formatted file size string (e.g., "1.5 MB")
        """
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        elif size_bytes < 1024 * 1024 * 1024:
            return f"{size_bytes / (1024 * 1024):.1f} MB"
        else:
            return f"{size_bytes / (1024 * 1024 * 1024):.1f} GB"
    
    @classmethod
    def validate_upload_metadata(cls, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate upload metadata and add size information.
        
        Args:
            metadata: Upload metadata dictionary
            
        Returns:
            Updated metadata with size validation
        """
        file_size = int(metadata.get("file_size") or metadata.get("total_size") or 0)
        
        if not cls.validate_file_size(file_size):
            raise ValueError(
                f"File size {cls.format_file_size(file_size)} exceeds the limit of {cls.get_size_limit_mb()}MB"
            )
        
        # Add size validation info to metadata
        metadata["size_validated"] = True
        metadata["size_limit_mb"] = cls.get_size_limit_mb()
        
        return metadata


# Global instance
file_size_service = FileSizeService()
