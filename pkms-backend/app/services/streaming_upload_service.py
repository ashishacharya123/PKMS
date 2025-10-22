"""
Streaming Upload Service for Large Files
Optimized for memory efficiency and performance
"""

import asyncio
import aiofiles
import hashlib
from pathlib import Path
from typing import AsyncGenerator, Optional, Dict, Any
from fastapi import UploadFile, HTTPException
import logging

logger = logging.getLogger(__name__)

class StreamingUploadService:
    """Handles large file uploads with streaming to reduce memory usage"""
    
    CHUNK_SIZE = 8192  # 8KB chunks for optimal performance
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB limit
    
    async def stream_upload(
        self, 
        file: UploadFile, 
        destination: Path,
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """
        Stream upload a file with progress tracking and memory efficiency
        """
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        # Check file size
        if hasattr(file, 'size') and file.size and file.size > self.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413, 
                detail=f"File too large. Maximum size: {self.MAX_FILE_SIZE // (1024*1024)}MB"
            )
        
        file_hash = hashlib.sha256()
        total_bytes = 0
        
        try:
            async with aiofiles.open(destination, 'wb') as f:
                while chunk := await file.read(self.CHUNK_SIZE):
                    await f.write(chunk)
                    file_hash.update(chunk)
                    total_bytes += len(chunk)
                    
                    # Progress callback for UI updates
                    if progress_callback:
                        await progress_callback(total_bytes, len(chunk))
                    
                    # Check size during upload
                    if total_bytes > self.MAX_FILE_SIZE:
                        await f.close()
                        destination.unlink(missing_ok=True)
                        raise HTTPException(
                            status_code=413, 
                            detail="File size exceeded during upload"
                        )
            
            return {
                "file_path": str(destination),
                "file_size": total_bytes,
                "file_hash": file_hash.hexdigest(),
                "mime_type": file.content_type or "application/octet-stream"
            }
            
        except Exception as e:
            # Cleanup on error
            destination.unlink(missing_ok=True)
            logger.error(f"Streaming upload failed: {e}")
            raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
    
    async def stream_download(
        self, 
        file_path: Path,
        chunk_size: int = CHUNK_SIZE
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream download a file for efficient memory usage
        """
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        try:
            async with aiofiles.open(file_path, 'rb') as f:
                while chunk := await f.read(chunk_size):
                    yield chunk
        except Exception as e:
            logger.error(f"Streaming download failed: {e}")
            raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")
    
    async def calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash of a file efficiently"""
        file_hash = hashlib.sha256()
        
        async with aiofiles.open(file_path, 'rb') as f:
            while chunk := await f.read(self.CHUNK_SIZE):
                file_hash.update(chunk)
        
        return file_hash.hexdigest()
    
    async def verify_file_integrity(self, file_path: Path, expected_hash: str) -> bool:
        """Verify file integrity using hash comparison"""
        try:
            actual_hash = await self.calculate_file_hash(file_path)
            return actual_hash == expected_hash
        except Exception as e:
            logger.error(f"File integrity check failed: {e}")
            return False

# Global instance
streaming_upload_service = StreamingUploadService()
