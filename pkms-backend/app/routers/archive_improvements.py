"""
Archive Router Improvements
Contains enhanced versions of archive endpoints with better performance and features
"""

from fastapi import (
    APIRouter, Depends, HTTPException, status, Query, 
    Form, File, UploadFile, Request, Response,
    BackgroundTasks
)
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, delete
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field, validator, ValidationError
from typing import List, Optional, Dict, Any, BinaryIO
from datetime import datetime
from pathlib import Path
import uuid as uuid_lib
import json
import aiofiles
# import magic  # Temporarily disabled due to Windows segfault
import logging
import asyncio
from functools import lru_cache
from fastapi_cache import FastAPICache
from fastapi_cache.decorator import cache
from fastapi_limiter import FastAPILimiter

# Import existing models and dependencies
from app.database import get_db
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.tag import archive_tags
from app.models.tag import Tag
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.config import settings, get_data_dir
from app.services.ai_service import analyze_content, is_ai_enabled
from app.services.chunk_service import chunk_manager
from app.routers.archive import FolderResponse, _get_folder_with_stats
from app.utils.security import (
    sanitize_folder_name,
    sanitize_filename,
    sanitize_search_query,
    sanitize_description,
    sanitize_tags,
    sanitize_json_metadata,
    validate_file_size,
    validate_uuid_format,
    sanitize_text_input
)
# from app.services.chunk_assembly import chunk_assembly_service

router = APIRouter(prefix="/archive", tags=["archive"])
logger = logging.getLogger(__name__)

# Enhanced Constants
CHUNK_SIZE = 1024 * 1024  # 1MB chunks for file upload
MAX_CONCURRENT_UPLOADS = 3
CACHE_TTL = 300  # 5 minutes cache for folder listings

# Custom Exceptions
class ArchiveError(Exception):
    """Base exception for archive operations"""
    def __init__(self, message: str, details: Optional[Dict] = None):
        self.message = message
        self.details = details or {}
        super().__init__(message)

class FileUploadError(ArchiveError):
    """Exception for file upload failures"""
    pass

class FolderOperationError(ArchiveError):
    """Exception for folder operation failures"""
    pass

class ChunkUploadError(Exception):
    """Custom exception for chunk upload errors"""
    def __init__(self, message: str, status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)

# Enhanced Models
class ChunkUploadData(BaseModel):
    """Data model for chunk upload metadata"""
    chunk_number: int
    total_chunks: int
    chunk_size: int
    total_size: int
    filename: str
    file_id: str

    @validator('filename')
    def validate_filename(cls, v):
        """Validate filename is safe"""
        if not v or '/' in v or '\\' in v:
            raise ValueError("Invalid filename")
        return v

    @validator('total_size')
    def validate_total_size(cls, v):
        """Validate file size is within limits"""
        max_size = 1024 * 1024 * 1024  # 1GB
        if v <= 0 or v > max_size:
            raise ValueError(f"File size must be between 1 byte and {max_size} bytes")
        return v

class UploadProgress(BaseModel):
    """Data model for upload progress tracking"""
    fileId: str
    filename: str
    bytesUploaded: int
    totalSize: int
    status: str
    progress: float
    error: Optional[str] = None

# Cache decorator for folder operations
def folder_cache(ttl: int = CACHE_TTL):
    """Custom cache decorator for folder operations"""
    def decorator(func):
        @lru_cache(maxsize=100)
        async def wrapper(*args, **kwargs):
            return await func(*args, **kwargs)
        return wrapper
    return decorator

# Enhanced folder listing with caching
@router.get("/folders", response_model=List[FolderResponse])
@folder_cache(ttl=CACHE_TTL)
async def list_folders(
    parent_uuid: Optional[str] = Query(None),
    archived: Optional[bool] = Query(False),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Enhanced folder listing with caching and better error handling"""
    try:
        query = select(ArchiveFolder)
        
        if parent_uuid:
            query = query.where(ArchiveFolder.parent_uuid == parent_uuid)
        else:
            query = query.where(ArchiveFolder.parent_uuid.is_(None))
            
        if not archived:
            query = query.where(ArchiveFolder.is_archived == False)
            
        if search:
            search_term = f"%{sanitize_search_query(search)}%"
            query = query.where(
                or_(
                    ArchiveFolder.name.ilike(search_term),
                    ArchiveFolder.description.ilike(search_term)
                )
            )
        
        result = await db.execute(query.order_by(ArchiveFolder.name))
        folders = result.scalars().all()
        
        # Get stats for each folder
        folder_responses = []
        for folder in folders:
            stats = await _get_folder_with_stats(db, folder.uuid)
            folder_responses.append(stats)
            
        return folder_responses
        
    except Exception as e:
        logger.error(f"Error listing folders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "Failed to list folders", "error": str(e)}
        )

# Chunked upload endpoints
@router.post("/upload/chunk")
async def upload_chunk(
    file: UploadFile = File(...),
    chunk_data: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Handle chunked file upload"""
    chunk_info = None
    try:
        # Parse and validate chunk metadata
        try:
            chunk_info = ChunkUploadData.parse_raw(chunk_data)
        except ValidationError as e:
            raise ChunkUploadError(str(e), status.HTTP_400_BAD_REQUEST)

        # Validate file type (if first chunk)
        if chunk_info.chunk_number == 0:
            content_type = file.content_type
            allowed_types = [
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'image/jpeg',
                'image/png',
                'image/gif',
                'text/plain'
            ]
            if content_type not in allowed_types:
                raise ChunkUploadError(
                    f"File type {content_type} not allowed",
                    status.HTTP_400_BAD_REQUEST
                )

        # Read chunk data with timeout
        try:
            chunk_bytes = await asyncio.wait_for(
                file.read(),
                timeout=30.0  # 30 second timeout
            )
        except asyncio.TimeoutError:
            raise ChunkUploadError(
                "Chunk upload timed out",
                status.HTTP_408_REQUEST_TIMEOUT
            )

        # Validate chunk size
        if len(chunk_bytes) > chunk_info.chunk_size:
            raise ChunkUploadError(
                "Chunk size exceeds declared size",
                status.HTTP_400_BAD_REQUEST
            )

        # Save chunk
        if not await chunk_assembly_service.save_chunk(
            chunk_info.file_id,
            chunk_info.chunk_number,
            chunk_bytes
        ):
            raise ChunkUploadError("Failed to save chunk")

        # Validate chunk
        if not await chunk_assembly_service.validate_chunk(
            chunk_info.file_id,
            chunk_info.chunk_number,
            len(chunk_bytes)
        ):
            raise ChunkUploadError(
                "Chunk validation failed",
                status.HTTP_400_BAD_REQUEST
            )

        # Calculate progress
        bytes_uploaded = (chunk_info.chunk_number + 1) * chunk_info.chunk_size
        if bytes_uploaded > chunk_info.total_size:
            bytes_uploaded = chunk_info.total_size

        progress = (bytes_uploaded / chunk_info.total_size) * 100

        # Check if this was the last chunk
        if chunk_info.chunk_number == chunk_info.total_chunks - 1:
            # Create user directory if it doesn't exist
            user_dir = Path(get_data_dir()) / "archive" / current_user.username
            user_dir.mkdir(parents=True, exist_ok=True)

            # Assemble file
            target_path = user_dir / chunk_info.filename
            
            # Check if file already exists
            if target_path.exists():
                # Append timestamp to filename
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename_parts = chunk_info.filename.rsplit('.', 1)
                if len(filename_parts) > 1:
                    new_filename = f"{filename_parts[0]}_{timestamp}.{filename_parts[1]}"
                else:
                    new_filename = f"{chunk_info.filename}_{timestamp}"
                target_path = user_dir / new_filename
                chunk_info.filename = new_filename

            if await chunk_assembly_service.assemble_file(
                chunk_info.file_id,
                chunk_info.total_chunks,
                target_path
            ):
                try:
                    # Create archive entry
                    archive = Archive(
                        filename=chunk_info.filename,
                        filepath=str(target_path),
                        size=chunk_info.total_size,
                        user_id=current_user.id
                    )
                    db.add(archive)
                    await db.commit()
                    await db.refresh(archive)

                    return UploadProgress(
                        fileId=chunk_info.file_id,
                        filename=chunk_info.filename,
                        bytesUploaded=chunk_info.total_size,
                        totalSize=chunk_info.total_size,
                        status="completed",
                        progress=100.0
                    )
                except Exception as e:
                    # Cleanup file if DB operation fails
                    if target_path.exists():
                        target_path.unlink()
                    raise ChunkUploadError(f"Failed to save file metadata: {str(e)}")
            else:
                raise ChunkUploadError("Failed to assemble file")

        # Return progress for intermediate chunks
        return UploadProgress(
            fileId=chunk_info.file_id,
            filename=chunk_info.filename,
            bytesUploaded=bytes_uploaded,
            totalSize=chunk_info.total_size,
            status="uploading",
            progress=progress
        )

    except ChunkUploadError as e:
        logger.error(f"Chunk upload error: {e.message}")
        if chunk_info:
            chunk_assembly_service.cleanup_assembly(chunk_info.file_id)
        raise HTTPException(
            status_code=e.status_code,
            detail=e.message
        )
    except Exception as e:
        logger.error(f"Unexpected error in chunk upload: {e}")
        if chunk_info:
            chunk_assembly_service.cleanup_assembly(chunk_info.file_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/upload/{file_id}/status")
async def get_upload_status(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> UploadProgress:
    """Get status of a chunked upload"""
    try:
        # Check if file exists in archive
        archive = await db.execute(
            select(Archive)
            .where(Archive.filepath.like(f"%{file_id}%"))
            .where(Archive.user_id == current_user.id)
        )
        archive = archive.scalar_one_or_none()

        if archive:
            return UploadProgress(
                fileId=file_id,
                filename=archive.filename,
                bytesUploaded=archive.size,
                totalSize=archive.size,
                status="completed",
                progress=100.0
            )

        # File is still being assembled
        return UploadProgress(
            fileId=file_id,
            filename="",  # Will be updated when complete
            bytesUploaded=0,
            totalSize=0,
            status="assembling",
            progress=0.0
        )

    except Exception as e:
        logger.error(f"Error checking upload status: {e}")
        return UploadProgress(
            fileId=file_id,
            filename="",
            bytesUploaded=0,
            totalSize=0,
            status="error",
            error=str(e),
            progress=0.0
        )

@router.delete("/upload/{file_id}")
async def cancel_upload(
    file_id: str,
    current_user: User = Depends(get_current_user)
):
    """Cancel an in-progress upload and cleanup temporary files"""
    try:
        chunk_assembly_service.cleanup_assembly(file_id)
        return {"message": "Upload cancelled successfully"}
    except Exception as e:
        logger.error(f"Error cancelling upload: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

# Startup and shutdown events
@router.on_event("startup")
async def startup_event():
    """Initialize chunk manager on startup"""
    await chunk_manager.start()

@router.on_event("shutdown")
async def shutdown_event():
    """Clean up chunk manager on shutdown"""
    await chunk_manager.stop()

# Bulk operations endpoint
@router.post("/bulk/move")
async def bulk_move_items(
    items: List[str],
    target_folder: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Move multiple items to a target folder"""
    try:
        # Validate target folder
        target = await db.execute(
            select(ArchiveFolder).where(ArchiveFolder.uuid == target_folder)
        )
        if not target.scalar_one_or_none():
            raise FolderOperationError("Target folder not found")
            
        # Move items
        for item_uuid in items:
            item = await db.execute(
                select(ArchiveItem).where(ArchiveItem.uuid == item_uuid)
            )
            item = item.scalar_one_or_none()
            if item:
                item.folder_uuid = target_folder
                
        await db.commit()
        return {"message": f"Moved {len(items)} items successfully"}
        
    except Exception as e:
        await db.rollback()
        logger.error(f"Bulk move error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "Bulk move failed", "error": str(e)}
        )

# Error handler for custom exceptions
@router.exception_handler(ArchiveError)
async def archive_exception_handler(request: Request, exc: ArchiveError):
    """Handle custom archive exceptions"""
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "message": exc.message,
            "details": exc.details,
            "type": exc.__class__.__name__
        }
    )

# Initialize caching on startup
@router.on_event("startup")
async def startup_event():
    """Initialize caching and rate limiting"""
    await FastAPICache.init('redis://localhost', prefix="archive-cache:")
    await FastAPILimiter.init('redis://localhost') 