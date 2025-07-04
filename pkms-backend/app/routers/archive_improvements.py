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
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, BinaryIO
from datetime import datetime
from pathlib import Path
import uuid as uuid_lib
import json
import aiofiles
import magic
import logging
import asyncio
from functools import lru_cache
from fastapi_cache import FastAPICache
from fastapi_cache.decorator import cache
from fastapi_limiter import FastAPILimiter

# Import existing models and dependencies
from app.database import get_db
from app.models.archive import ArchiveFolder, ArchiveItem, archive_tags
from app.models.tag import Tag
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.config import settings, get_data_dir
from app.services.ai_service import analyze_content, is_ai_enabled
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

router = APIRouter()
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

# Enhanced Models
class ChunkUpload(BaseModel):
    """Model for chunked file upload"""
    chunk_number: int
    total_chunks: int
    chunk_size: int
    total_size: int
    filename: str
    file_id: str

class UploadProgress(BaseModel):
    """Model for upload progress tracking"""
    file_id: str
    filename: str
    bytes_uploaded: int
    total_size: int
    status: str
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

# Chunked file upload endpoint
@router.post("/upload/chunk", response_model=UploadProgress)
async def upload_chunk(
    chunk_data: ChunkUpload,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks = None
):
    """Handle chunked file upload with progress tracking"""
    try:
        # Validate chunk
        if not file.filename or not chunk_data.file_id:
            raise FileUploadError("Invalid chunk data")
            
        # Get upload directory
        upload_dir = Path(get_data_dir()) / "temp_uploads" / chunk_data.file_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Write chunk
        chunk_path = upload_dir / f"chunk_{chunk_data.chunk_number}"
        async with aiofiles.open(chunk_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
            
        # Check if all chunks received
        if chunk_data.chunk_number == chunk_data.total_chunks - 1:
            # Schedule assembly in background
            background_tasks.add_task(
                assemble_chunks,
                chunk_data.file_id,
                chunk_data.filename,
                chunk_data.total_chunks
            )
            
        return UploadProgress(
            file_id=chunk_data.file_id,
            filename=chunk_data.filename,
            bytes_uploaded=(chunk_data.chunk_number + 1) * chunk_data.chunk_size,
            total_size=chunk_data.total_size,
            status="uploading" if chunk_data.chunk_number < chunk_data.total_chunks - 1 else "assembling"
        )
            
    except Exception as e:
        logger.error(f"Chunk upload error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"message": "Chunk upload failed", "error": str(e)}
        )

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

# Helper function for chunk assembly
async def assemble_chunks(file_id: str, filename: str, total_chunks: int):
    """Assemble uploaded chunks into final file"""
    try:
        upload_dir = Path(get_data_dir()) / "temp_uploads" / file_id
        output_path = Path(get_data_dir()) / "uploads" / filename
        
        with open(output_path, 'wb') as outfile:
            for i in range(total_chunks):
                chunk_path = upload_dir / f"chunk_{i}"
                with open(chunk_path, 'rb') as chunk:
                    outfile.write(chunk.read())
                chunk_path.unlink()  # Delete chunk after use
                
        # Cleanup temp directory
        upload_dir.rmdir()
        
    except Exception as e:
        logger.error(f"Chunk assembly error: {str(e)}")
        # Cleanup on failure
        try:
            if output_path.exists():
                output_path.unlink()
            if upload_dir.exists():
                for chunk in upload_dir.glob("chunk_*"):
                    chunk.unlink()
                upload_dir.rmdir()
        except:
            pass
        raise FileUploadError("Failed to assemble file chunks")

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