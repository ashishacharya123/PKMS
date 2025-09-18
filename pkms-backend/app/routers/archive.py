"""
Archive Router
Handles hierarchical file and folder organization with enhanced security
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Form, File, UploadFile, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, delete, text
from sqlalchemy.orm import selectinload
from app.schemas.archive import (
    FolderCreate,
    FolderUpdate,
    ItemUpdate,
    FolderResponse,
    ItemResponse,
    ItemSummary,
    FolderTree,
    BulkMoveRequest,
    CommitUploadRequest,
)
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
import uuid as uuid_lib
import json
import aiofiles
# import magic  # Temporarily disabled due to Windows segfault
import logging
from slowapi import Limiter
from slowapi.util import get_remote_address
import asyncio
from io import BytesIO
from functools import lru_cache, wraps
import time

from app.services.chunk_service import chunk_manager

# Optional imports for file processing
try:
    import fitz  # PyMuPDF for PDF processing
except ImportError:
    fitz = None

try:
    from docx import Document as DocxDocument  # python-docx for DOCX processing
except ImportError:
    DocxDocument = None

from app.database import get_db
from app.config import settings, get_data_dir, get_file_storage_dir, NEPAL_TZ
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.tag_associations import archive_tags
from app.models.tag import Tag
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.services.fts_service_enhanced import enhanced_fts_service
# from app.services.ai_service import analyze_content, is_ai_enabled
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
from app.services.file_detection import file_detector

router = APIRouter()

# Initialize rate limiter for file uploads
limiter = Limiter(key_func=get_remote_address)

logger = logging.getLogger(__name__)

# Simple cache decorator for folder operations
def folder_cache(maxsize: int = 128):
    """Simple LRU cache decorator for folder and file listing operations.
    
    Caches folder listings to reduce database load when repeatedly viewing
    the same folders. Cache is per-user and respects query parameters.
    """
    def decorator(func):
        # Create a simple cache key from user_id and critical parameters
        def cache_key(*args, **kwargs):
            # Extract user_id from current_user parameter
            user_id = None
            if 'current_user' in kwargs:
                user_id = getattr(kwargs['current_user'], 'id', None)
            
            # Extract key parameters that affect results
            key_parts = [user_id]
            for param in ['parent_uuid', 'root_uuid', 'archived', 'search']:
                if param in kwargs:
                    key_parts.append((param, kwargs[param]))
            
            return tuple(key_parts)
        
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            key = cache_key(*args, **kwargs)
            
            # For async functions, we can't use lru_cache directly
            # So we'll use a simple manual cache instead
            if not hasattr(wrapper, '_cache'):
                wrapper._cache = {}
                wrapper._cache_times = {}
            
            cache_timeout = 30  # 30 seconds cache
            now = time.time()
            
            # Check if we have a valid cached result
            if key in wrapper._cache:
                cached_time = wrapper._cache_times.get(key, 0)
                if now - cached_time < cache_timeout:
                    return wrapper._cache[key]
            
            # Cache miss or expired - call the actual function
            result = await func(*args, **kwargs)
            
            # Store in cache
            wrapper._cache[key] = result
            wrapper._cache_times[key] = now
            
            # Simple cache cleanup - remove oldest entries if cache gets too big
            if len(wrapper._cache) > maxsize:
                oldest_key = min(wrapper._cache_times.keys(), 
                               key=lambda k: wrapper._cache_times[k])
                del wrapper._cache[oldest_key]
                del wrapper._cache_times[oldest_key]
            
            return result
        
        # Add cache control methods
        wrapper.cache_clear = lambda: (
            setattr(wrapper, '_cache', {}),
            setattr(wrapper, '_cache_times', {})
        )
        
        return wrapper
    
    return decorator

# Constants
MAX_FOLDER_NAME_LENGTH = 255
MAX_FOLDER_DESCRIPTION_LENGTH = 1000
MAX_FILE_SIZE = settings.max_file_size  # 50MB from config

# Valid MIME types for file uploads
VALID_MIME_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/msword": ".doc",
    "text/plain": ".txt",
    "text/markdown": ".md",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "application/zip": ".zip",
    "application/x-tar": ".tar",
    "application/gzip": ".gz",
    "application/json": ".json",
    "application/xml": ".xml",
    "text/csv": ".csv",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx"
}

# Pydantic models are now in app/schemas/archive.py

# Folder Management Endpoints

@router.post("/folders", response_model=FolderResponse)
async def create_folder(
    folder_data: FolderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new archive folder with enhanced security validation and duplicate prevention"""
    
    try:
        # Check for duplicate folder name in same location
        duplicate_check = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.parent_uuid == folder_data.parent_uuid,
                    func.lower(ArchiveFolder.name) == func.lower(folder_data.name),
                    ArchiveFolder.user_id == current_user.id
                    # Archive folders don't use is_archived flag - all are active by being in archive
                )
            )
        )
        existing_folder = duplicate_check.scalar_one_or_none()
        
        if existing_folder:
            location = "root" if not folder_data.parent_uuid else f"folder '{existing_folder.parent.name}'"
            raise HTTPException(
                status_code=409,
                detail=f"Folder '{folder_data.name}' already exists in {location}. Please choose a different name."
            )
        
        # Generate the path for the folder and validate parent if specified
        if folder_data.parent_uuid:
            # Get parent folder to build the path
            parent_result = await db.execute(
                select(ArchiveFolder).where(
                    and_(
                        ArchiveFolder.uuid == folder_data.parent_uuid,
                        ArchiveFolder.user_id == current_user.id
                    )
                )
            )
            parent = parent_result.scalar_one_or_none()
            if not parent:
                raise HTTPException(
                    status_code=404,
                    detail="Parent folder not found"
                )
            # Build path based on parent path
            folder_path = f"{parent.path}/{folder_data.name}"
        else:
            # Root folder
            folder_path = f"/{folder_data.name}"
        
        # Create new folder
        folder = ArchiveFolder(
            name=folder_data.name,
            description=folder_data.description,
            parent_uuid=folder_data.parent_uuid,
            path=folder_path,
            user_id=current_user.id
        )
        
        db.add(folder)
        await db.commit()
        await db.refresh(folder)
        
        logger.info(f"✅ Created folder '{folder.name}' for user {current_user.username}")
        
        return await _get_folder_with_stats(db, folder.uuid)
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"❌ Error creating folder: {str(e)}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create folder. Please try again."
        )

@router.get("/folders", response_model=List[FolderResponse])
@folder_cache()
async def list_folders(
    parent_uuid: Optional[str] = Query(None),
    archived: Optional[bool] = Query(False),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List folders with FTS5 search on name/description and enhanced security/error handling."""
    from sqlalchemy import text
    try:
        # Validate parent UUID if provided (simplified for single user)
        if parent_uuid:
            parent_uuid = validate_uuid_format(parent_uuid)
            # Verify parent folder exists (no user check needed for single user)
            parent_result = await db.execute(
                select(ArchiveFolder).where(ArchiveFolder.uuid == parent_uuid)
            )
            if not parent_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=404,
                    detail="Parent folder not found"
                )
        # Sanitize search query if provided
        if search:
            search = sanitize_search_query(search)
            # Use centralized FTS5 search
            uuid_list = await enhanced_fts_service.search_archive_folders(db, search, current_user.id)
            if not uuid_list:
                return []
            # Fetch full rows, preserving FTS5 order
            query = select(ArchiveFolder).where(ArchiveFolder.uuid.in_(uuid_list))
            if parent_uuid is not None:
                query = query.where(ArchiveFolder.parent_uuid == parent_uuid)
            # Archive folders don't use is_archived flag - all are active by being in archive
            query = query.order_by(ArchiveFolder.name)
            result = await db.execute(query)
            folders = result.scalars().all()
            folder_map = {f.uuid: f for f in folders}
            folder_responses = []
            for uuid in uuid_list:
                if uuid in folder_map:
                    folder_response = await _get_folder_with_stats(db, uuid)
                    folder_responses.append(folder_response)
            return folder_responses
        else:
            # Build query (simplified for single user)
            query = select(ArchiveFolder)
            query = query.where(ArchiveFolder.parent_uuid == parent_uuid)
            # Archive folders don't use is_archived flag - all are active by being in archive
            query = query.order_by(ArchiveFolder.name)
            result = await db.execute(query)
            folders = result.scalars().all()
            folder_responses = []
            for folder in folders:
                folder_response = await _get_folder_with_stats(db, folder.uuid)
                folder_responses.append(folder_response)
            return folder_responses
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error listing folders: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve folders. Please try again."
        )

@router.get("/folders/tree", response_model=List[FolderTree])
@folder_cache()
async def get_folder_tree(
    root_uuid: Optional[str] = Query(None),
    archived: Optional[bool] = Query(False),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get hierarchical folder tree structure, or flat FTS5 search results if search is provided."""
    from sqlalchemy import text
    if search:
        # Use centralized FTS5 search for folders
        search = sanitize_search_query(search)
        uuid_list = await enhanced_fts_service.search_archive_folders(db, search, current_user.id)
        if not uuid_list:
            return []
        # Fetch full rows, preserving FTS5 order
        query = select(ArchiveFolder).where(ArchiveFolder.uuid.in_(uuid_list))
        # Archive folders don't use is_archived flag - all are active by being in archive
        result = await db.execute(query)
        folders = result.scalars().all()
        folder_map = {f.uuid: f for f in folders}
        folder_trees = []
        for uuid in uuid_list:
            if uuid in folder_map:
                folder_response = await _get_folder_with_stats(db, uuid)
                folder_trees.append(FolderTree(folder=folder_response, children=[], items=[]))
        return folder_trees
    else:
        async def build_tree(parent_uuid: Optional[str]) -> List[FolderTree]:
            # Get folders
            folder_query = select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.user_id == current_user.id,
                    ArchiveFolder.parent_uuid == parent_uuid
                )
            )
            # Archive folders don't use is_archived flag - all are active by being in archive
            folder_result = await db.execute(folder_query.order_by(ArchiveFolder.name))
            folders = folder_result.scalars().all()
            tree = []
            for folder in folders:
                # Get folder stats
                folder_response = await _get_folder_with_stats(db, folder.uuid)
                # Get items in this folder
                items_query = select(ArchiveItem).where(
                    and_(
                        ArchiveItem.folder_uuid == folder.uuid,
                        ArchiveItem.user_id == current_user.id
                    )
                )
                # Archive items don't need archived filtering - they're all active in archive
                items_result = await db.execute(items_query.order_by(ArchiveItem.name))
                items = items_result.scalars().all()
                item_summaries = []
                for item in items:
                    item_summary = await _get_item_summary(db, item.uuid)
                    item_summaries.append(item_summary)
                # Recursively build children
                children = await build_tree(folder.uuid)
                tree.append(FolderTree(
                    folder=folder_response,
                    children=children,
                    items=item_summaries
                ))
            return tree
        return await build_tree(root_uuid)

@router.get("/folders/{folder_uuid}/breadcrumb", response_model=List[FolderResponse])
async def get_folder_breadcrumb(
    folder_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the breadcrumb trail for a specific folder."""
    breadcrumb = []
    current_folder_uuid = folder_uuid

    while current_folder_uuid:
        folder_query = select(ArchiveFolder).where(
            ArchiveFolder.uuid == current_folder_uuid,
            ArchiveFolder.user_id == current_user.id
        )
        result = await db.execute(folder_query)
        folder = result.scalar_one_or_none()

        if not folder:
            # This can happen if a parent in the chain is not found
            # or doesn't belong to the user. Stop here.
            break
        
        # This uses an internal helper, but it's efficient
        folder_response = await _get_folder_with_stats(db, folder.uuid)
        breadcrumb.append(folder_response)
        
        current_folder_uuid = folder.parent_uuid

    # The breadcrumb is built from child to parent, so reverse it
    return breadcrumb[::-1]

@router.get("/folders/{folder_uuid}", response_model=FolderResponse)
async def get_folder(
    folder_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get folder details (simplified for single user)"""
    folder_uuid = validate_uuid_format(folder_uuid)
    return await _get_folder_with_stats(db, folder_uuid)

@router.put("/folders/{folder_uuid}", response_model=FolderResponse)
async def update_folder(
    folder_uuid: str,
    folder_data: FolderUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update folder (simplified for single user)"""
    
    try:
        folder_uuid = validate_uuid_format(folder_uuid)
        
        # Get folder (simplified for single user)
        result = await db.execute(
            select(ArchiveFolder).where(ArchiveFolder.uuid == folder_uuid)
        )
        folder = result.scalar_one_or_none()
        
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Update folder fields
        if folder_data.name is not None:
            folder.name = folder_data.name
        if folder_data.description is not None:
            folder.description = folder_data.description
        
        await db.commit()
        await db.refresh(folder)
        
        return await _get_folder_with_stats(db, folder.uuid)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error updating folder: {str(e)}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update folder. Please try again."
        )

@router.delete("/folders/{folder_uuid}")
async def delete_folder(
    folder_uuid: str,
    force: bool = Query(False, description="Force delete non-empty folder"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete folder (simplified for single user)"""
    
    try:
        folder_uuid = validate_uuid_format(folder_uuid)
        
        # Get folder (simplified for single user)
        result = await db.execute(
            select(ArchiveFolder).where(ArchiveFolder.uuid == folder_uuid)
        )
        folder = result.scalar_one_or_none()
        
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Check if folder has contents
        if not force:
            # Check for subfolders
            subfolder_result = await db.execute(
                select(func.count(ArchiveFolder.uuid)).where(
                    ArchiveFolder.parent_uuid == folder_uuid
                )
            )
            subfolder_count = subfolder_result.scalar()
            
            # Check for items
            item_result = await db.execute(
                select(func.count(ArchiveItem.uuid)).where(
                    ArchiveItem.folder_uuid == folder_uuid
                )
            )
            item_count = item_result.scalar()
            
            if subfolder_count > 0 or item_count > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Folder is not empty. Use force=true to delete non-empty folder."
                )
        
        # Delete folder and all contents (CASCADE handles this)
        await db.delete(folder)
        await db.commit()
        
        logger.info(f"✅ Deleted folder '{folder.name}' for user {current_user.username}")
        
        return {"message": "Folder deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error deleting folder: {str(e)}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete folder. Please try again."
        )

# ---------------------------
# Bulk operations
# ---------------------------



@router.post("/bulk/move")
async def bulk_move_items(
    payload: BulkMoveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Move many items to a different folder in one transaction.

    Accepts a JSON body:
    {
      "items": ["item-uuid-1", "item-uuid-2"],
      "target_folder": "folder-uuid"
    }
    """

    # Validate destination folder exists
    tgt = await db.execute(
        select(ArchiveFolder).where(and_(ArchiveFolder.uuid == payload.target_folder))
    )
    target_folder_obj = tgt.scalar_one_or_none()
    if not target_folder_obj:
        raise HTTPException(status_code=404, detail="Target folder not found")

    # Fetch all items to move – ensure they belong to user
    result = await db.execute(
        select(ArchiveItem).where(ArchiveItem.uuid.in_(payload.items))
    )
    items_to_move = result.scalars().all()

    if len(items_to_move) != len(payload.items):
        missing = set(payload.items) - {it.uuid for it in items_to_move}
        raise HTTPException(status_code=404, detail={"message": "Some items not found", "missing": list(missing)})

    # Update folder_uuid for each item
    for item in items_to_move:
        item.folder_uuid = payload.target_folder

    await db.commit()

    return {"moved": len(items_to_move), "target_folder": payload.target_folder}

# Item Management Endpoints

@router.post("/folders/{folder_uuid}/items", response_model=ItemResponse)
@limiter.limit("10/minute")  # Rate limit file uploads to 10 per minute
async def upload_item(
    folder_uuid: str,
    request: Request,  # Required for rate limiting - moved before optional params
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),  # JSON string of tag list
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload a new item to a folder with enhanced security and validation"""
    
    try:
        # Validate folder UUID format
        folder_uuid = validate_uuid_format(folder_uuid)
        
        # Verify folder exists (simplified for single user)
        result = await db.execute(
            select(ArchiveFolder).where(ArchiveFolder.uuid == folder_uuid)
        )
        folder = result.scalar_one_or_none()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        
        # Validate file is provided
        if not file or not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No file provided"
            )
        
        # Read file content and validate size first
        file_content = await file.read()
        file_size = len(file_content)
        
        # Validate file size using security function
        validate_file_size(file_size, MAX_FILE_SIZE)
        
        # Reset file pointer for further processing
        await file.seek(0)
        
        # Detect MIME type from content (more secure than trusting filename)
        # mime_type = magic.from_buffer(file_content[:2048], mime=True)
        # Temporarily use file extension-based detection due to magic segfault
        import mimetypes
        mime_type, _ = mimetypes.guess_type(file.filename)
        if not mime_type:
            mime_type = "application/octet-stream"
        
        # Validate MIME type
        if mime_type not in VALID_MIME_TYPES:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Unsupported file type: {mime_type}. Supported types: {', '.join(VALID_MIME_TYPES.values())}"
            )
        
        # Sanitize and validate inputs
        original_filename = sanitize_filename(file.filename)
        item_name = sanitize_filename(name) if name else Path(original_filename).stem
        item_description = sanitize_description(description) if description else None
        
        # Check for duplicate file name in same folder
        duplicate_check = await db.execute(
            select(ArchiveItem).where(
                and_(
                    ArchiveItem.folder_uuid == folder_uuid,
                    func.lower(ArchiveItem.name) == func.lower(item_name),
                    ArchiveItem.user_id == current_user.id
                    # Archive items don't need archived filtering - they're all active in archive
                )
            )
        )
        existing_file = duplicate_check.scalar_one_or_none()
        
        if existing_file:
            raise HTTPException(
                status_code=409,
                detail=f"File '{item_name}' already exists in this folder. Please rename the file or choose a different folder."
            )
        
        # Parse and sanitize tags
        tag_list = []
        if tags:
            try:
                parsed_tags = json.loads(tags)
                if isinstance(parsed_tags, list):
                    tag_list = sanitize_tags(parsed_tags)
            except json.JSONDecodeError:
                # If JSON parsing fails, treat as single tag
                tag_list = sanitize_tags([tags])
        
        # Generate safe filename for storage
        file_extension = VALID_MIME_TYPES[mime_type]
        stored_filename = f"{uuid_lib.uuid4()}{file_extension}"
        
        # Create storage directory
        storage_dir = get_file_storage_dir() / "archive" / folder_uuid
        storage_dir.mkdir(parents=True, exist_ok=True)
        
        # Save file with atomic operation
        file_path = storage_dir / stored_filename
        try:
            async with aiofiles.open(file_path, 'wb') as f:
                await f.write(file_content)
        except Exception as e:
            logger.error(f"❌ Failed to save file: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save file to storage"
            )
        
        # AI analysis for smart tagging (with error handling)
        ai_tags = []
        # TODO: Re-enable AI analysis when available
        # if is_ai_enabled() and extracted_text:
        #     try:
        #         analysis = await analyze_content(extracted_text, "archive")
        #         ai_tags = analysis.get("tags", [])
        #         # Sanitize AI-generated tags
        #         ai_tags = sanitize_tags(ai_tags)
        #     except Exception as e:
        #         logger.warning(f"⚠️ AI analysis failed: {str(e)}")
        #         # Continue without AI tags
        
        # Combine tags (user tags take precedence)
        all_tags = list(set(tag_list + ai_tags))
        
        # Create item using shared helper
        item = await _create_archive_item(
            db=db,
            file_path=file_path,
            folder_uuid=folder_uuid,
            original_filename=original_filename,
            stored_filename=stored_filename,
            mime_type=mime_type,
            file_size=file_size,
            user_id=current_user.id,
            name=item_name,
            description=item_description,
            tags=all_tags
        )
        
        await db.commit()
        await db.refresh(item)
        
        logger.info(f"✅ Uploaded file '{original_filename}' to folder '{folder.name}' for user {current_user.username}")
        
        return await _get_item_with_relations(db, item.uuid)
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        logger.error(f"❌ Error uploading file: {str(e)}")
        await db.rollback()
        
        # Clean up partially uploaded file if it exists
        try:
            if 'file_path' in locals() and Path(file_path).exists():
                Path(file_path).unlink()
        except Exception as cleanup_error:
            logger.error(f"❌ Failed to cleanup file: {str(cleanup_error)}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload file. Please try again."
        )

@router.get("/folders/{folder_uuid}/items", response_model=List[ItemSummary])
async def list_folder_items(
    folder_uuid: str,
    archived: Optional[bool] = Query(False),
    search: Optional[str] = Query(None),
    mime_type: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List items in folder"""
    
    # Verify folder access
    folder_result = await db.execute(
        select(ArchiveFolder).where(
            and_(
                ArchiveFolder.uuid == folder_uuid,
                ArchiveFolder.user_id == current_user.id
            )
        )
    )
    if not folder_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Build query
    query = select(ArchiveItem).where(
        and_(
            ArchiveItem.folder_uuid == folder_uuid,
            ArchiveItem.user_id == current_user.id
        )
    )
    
    # Filters
    # Archive items don't need archived filtering - they're all active in archive
    
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                ArchiveItem.name.ilike(search_term),
                ArchiveItem.original_filename.ilike(search_term)
            )
        )
    
    if mime_type:
        if mime_type.endswith('/'):
            query = query.where(ArchiveItem.mime_type.like(f"{mime_type}%"))
        else:
            query = query.where(ArchiveItem.mime_type == mime_type)
    
    if tag:
        # Join with tags to filter by tag
        query = query.join(archive_tags).join(Tag).where(Tag.name == tag)
    
    # Pagination and ordering
    query = query.order_by(desc(ArchiveItem.updated_at)).offset(offset).limit(limit)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    # Convert to summaries
    summaries = []
    for item in items:
        summary = await _get_item_summary(db, item.uuid)
        summaries.append(summary)
    
    return summaries

@router.get("/items/{item_uuid}", response_model=ItemResponse)
async def get_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get item details (simplified for single user)"""
    item_uuid = validate_uuid_format(item_uuid)
    return await _get_item_with_relations(db, item_uuid)

@router.put("/items/{item_uuid}", response_model=ItemResponse)
async def update_item(
    item_uuid: str,
    item_data: ItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update item (simplified for single user)"""
    
    try:
        item_uuid = validate_uuid_format(item_uuid)
        
        # Get item (simplified for single user)
        result = await db.execute(
            select(ArchiveItem).where(ArchiveItem.uuid == item_uuid)
        )
        item = result.scalar_one_or_none()
        
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        
        # Validate folder if changing
        if item_data.folder_uuid and item_data.folder_uuid != item.folder_uuid:
            folder_result = await db.execute(
                select(ArchiveFolder).where(ArchiveFolder.uuid == item_data.folder_uuid)
            )
            if not folder_result.scalar_one_or_none():
                raise HTTPException(status_code=404, detail="Target folder not found")
        
        # Update item fields
        if item_data.name is not None:
            item.name = item_data.name
        if item_data.description is not None:
            item.description = item_data.description
        if item_data.folder_uuid is not None:
            item.folder_uuid = item_data.folder_uuid
        if item_data.is_favorite is not None:
            item.is_favorite = item_data.is_favorite
        
        # Handle tags
        if item_data.tags is not None:
            await _handle_item_tags(db, item, item_data.tags)
        
        await db.commit()
        await db.refresh(item)
        
        return await _get_item_with_relations(db, item.uuid)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error updating item: {str(e)}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update item. Please try again."
        )

@router.delete("/items/{item_uuid}")
async def delete_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete item (simplified for single user)"""
    
    try:
        item_uuid = validate_uuid_format(item_uuid)
        
        # Get item (simplified for single user)
        result = await db.execute(
            select(ArchiveItem).where(ArchiveItem.uuid == item_uuid)
        )
        item = result.scalar_one_or_none()
        
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        
        # Delete file from storage
        if item.file_path and Path(item.file_path).exists():
            try:
                Path(item.file_path).unlink()
            except Exception as e:
                logger.warning(f"⚠️ Failed to delete file: {str(e)}")
        
        # Delete thumbnail if exists
        if item.thumbnail_path and Path(item.thumbnail_path).exists():
            try:
                Path(item.thumbnail_path).unlink()
            except Exception as e:
                logger.warning(f"⚠️ Failed to delete thumbnail: {str(e)}")
        
        # Delete item from database
        await db.delete(item)
        await db.commit()
        
        logger.info(f"✅ Deleted item '{item.name}' for user {current_user.username}")
        
        return {"message": "Item deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error deleting item: {str(e)}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete item. Please try again."
        )

@router.get("/items/{item_uuid}/download")
async def download_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download item file"""
    
    # Get item
    result = await db.execute(
        select(ArchiveItem).where(
            and_(
                ArchiveItem.uuid == item_uuid,
                ArchiveItem.user_id == current_user.id
            )
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    file_path = Path(item.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    return FileResponse(
        path=str(file_path),
        filename=item.original_filename,
        media_type=item.mime_type
    )

# Search Endpoints

@router.get("/search", response_model=List[ItemResponse])
async def search_items(
    query: str,
    folder_uuid: Optional[str] = None,
    mime_type: Optional[str] = None,
    tag: Optional[str] = None,
    include_archived: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Search for items with FTS5 (name, filename, description, metadata, tags) and filter by tag/mime type."""
    from sqlalchemy import text
    try:
        # Sanitize search query and use centralized FTS5 search
        search_query = sanitize_search_query(query)
        uuid_list = await enhanced_fts_service.search_archive_items(
            db, search_query, current_user.id, tag=tag, 
            limit=page_size, offset=(page-1)*page_size
        )
        if not uuid_list:
            return []
        # Fetch full rows, preserving FTS5 order
        item_query = (
            select(ArchiveItem)
            .options(selectinload(ArchiveItem.tag_objs))
            .where(ArchiveItem.uuid.in_(uuid_list))
        )
        # Archive items don't need archived filtering - they're all active in archive
        if folder_uuid:
            item_query = item_query.where(ArchiveItem.folder_uuid == folder_uuid)
        # Filter by mime_type after FTS5
        if mime_type:
            if mime_type.endswith('/'):
                item_query = item_query.where(ArchiveItem.mime_type.like(f"{mime_type}%"))
            else:
                item_query = item_query.where(ArchiveItem.mime_type == mime_type)
        item_result = await db.execute(item_query)
        items = item_result.scalars().all()
        # Map uuid to item for FTS5 order
        item_map = {item.uuid: item for item in items}
        item_responses = []
        for uuid in uuid_list:
            if uuid in item_map:
                item_response = await _get_item_with_relations(db, uuid)
                item_responses.append(item_response)
        logger.info(f"🔍 FTS5 Search completed: '{query}' - {len(item_responses)} results for user {current_user.username}")
        return item_responses
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ FTS5 search error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed. Please try again."
        )

# Helper functions

async def _get_folder_with_stats(db: AsyncSession, folder_uuid: str) -> FolderResponse:
    """Get folder with statistics (simplified for single user)"""
    
    # Get folder
    result = await db.execute(
        select(ArchiveFolder).where(ArchiveFolder.uuid == folder_uuid)
    )
    folder = result.scalar_one_or_none()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Get item count
    item_count_result = await db.execute(
        select(func.count(ArchiveItem.uuid)).where(
            ArchiveItem.folder_uuid == folder_uuid
            # Archive items don't use is_archived flag - all are active by being in archive
        )
    )
    item_count = item_count_result.scalar() or 0
    
    # Get subfolder count
    subfolder_count_result = await db.execute(
        select(func.count(ArchiveFolder.uuid)).where(
            ArchiveFolder.parent_uuid == folder_uuid
            # Archive folders don't use is_archived flag - all are active by being in archive
        )
    )
    subfolder_count = subfolder_count_result.scalar() or 0
    
    # Get total size
    size_result = await db.execute(
        select(func.sum(ArchiveItem.file_size)).where(
            ArchiveItem.folder_uuid == folder_uuid
            # Archive items don't use is_archived flag - all are active by being in archive
        )
    )
    total_size = size_result.scalar() or 0
    
    return FolderResponse(
        uuid=folder.uuid,
        name=folder.name,
        description=folder.description,
        parent_uuid=folder.parent_uuid,
        path=folder.path,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        item_count=item_count,
        subfolder_count=subfolder_count,
        total_size=total_size
    )


async def _get_item_with_relations(db: AsyncSession, item_uuid: str) -> ItemResponse:
    """Get item with all relationships (simplified for single user)"""
    
    # Get item with tags
    result = await db.execute(
        select(ArchiveItem)
        .options(selectinload(ArchiveItem.tag_objs))
        .where(ArchiveItem.uuid == item_uuid)
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Parse metadata
    metadata = {}
    if item.metadata_json:
        try:
            metadata = json.loads(item.metadata_json)
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON metadata for item {item_uuid}")
    
    # Get tag names
    tag_names = [tag.name for tag in item.tag_objs]
    
    return ItemResponse(
        uuid=item.uuid,
        name=item.name,
        description=item.description,
        folder_uuid=item.folder_uuid,
        original_filename=item.original_filename,
        stored_filename=item.stored_filename,
        mime_type=item.mime_type,
        file_size=item.file_size,
        metadata=metadata,
        thumbnail_path=item.thumbnail_path,
        is_favorite=item.is_favorite,
        version=item.version,
        created_at=item.created_at,
        updated_at=item.updated_at,
        tags=tag_names
    )


async def _get_item_summary(db: AsyncSession, item_uuid: str) -> ItemSummary:
    """Get item summary (simplified for single user)"""
    
    # Get item with tags
    result = await db.execute(
        select(ArchiveItem)
        .options(selectinload(ArchiveItem.tag_objs))
        .where(ArchiveItem.uuid == item_uuid)
    )
    item = result.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Get tag names
    tag_names = [tag.name for tag in item.tag_objs]
    
    # Create preview (placeholder for now)
    preview = ""
    
    return ItemSummary(
        uuid=item.uuid,
        name=item.name,
        folder_uuid=item.folder_uuid,
        original_filename=item.original_filename,
        mime_type=item.mime_type,
        file_size=item.file_size,
        is_favorite=item.is_favorite,
        created_at=item.created_at,
        updated_at=item.updated_at,
        tags=tag_names,
        preview=preview
    )

async def _handle_item_tags(db: AsyncSession, item: ArchiveItem, tag_names: List[str]):
    """Handle item tag associations with proper module_type"""
    
    # Clear existing tags
    await db.execute(
        delete(archive_tags).where(archive_tags.c.item_uuid == item.uuid)
    )
    
    for tag_name in tag_names:
        # Get or create tag with proper module_type
        result = await db.execute(
            select(Tag).where(and_(
                Tag.name == tag_name,
                Tag.user_id == item.user_id,
                Tag.module_type == "archive"
            ))
        )
        tag = result.scalar_one_or_none()
        
        if not tag:
            # Create new tag with archive module_type
            tag = Tag(
                name=tag_name, 
                user_id=item.user_id,
                module_type="archive",
                usage_count=1,
                color="#8b5cf6"  # Purple color for archive tags
            )
            db.add(tag)
            await db.flush()
        else:
            # Increment usage count for existing tag
            tag.usage_count += 1
        
        # Create association
        await db.execute(
            archive_tags.insert().values(
                item_uuid=item.uuid,
                tag_uuid=tag.uuid
            )
        )

# --- START: COPIED FROM documents.py router ---

# Text extraction functionality removed as requested

async def _extract_metadata(file_path: Path, mime_type: str, original_name: str) -> Dict[str, Any]:
    """Extract metadata from file"""
    # Basic metadata
    metadata = {
        "original_name": original_name,
        "mime_type": mime_type,
        "size": file_path.stat().st_size
    }
    
    # Add more metadata based on file type (can be extended)
    if mime_type.startswith('image/'):
        try:
            from PIL import Image
            with Image.open(file_path) as img:
                metadata.update({
                    "width": img.width,
                    "height": img.height,
                    "format": img.format,
                    "mode": img.mode
                })
        except ImportError:
            pass # PIL not installed
        except Exception as e:
            print(f"Image metadata extraction failed for {file_path}: {e}")

    elif mime_type == 'application/pdf':
        if fitz:
            try:
                with fitz.open(file_path) as doc:
                    metadata.update({
                        "page_count": doc.page_count,
                        "pdf_metadata": doc.metadata
                    })
            except Exception as e:
                print(f"PDF metadata extraction failed for {file_path}: {e}")
    
    return metadata

# --- END: COPIED FROM documents.py router ---

async def _create_archive_item(
    db: AsyncSession,
    file_path: Path,
    folder_uuid: str,
    original_filename: str,
    stored_filename: str,
    mime_type: str,
    file_size: int,
    user_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    tags: Optional[List[str]] = None,
    additional_metadata: Optional[Dict[str, Any]] = None
) -> ArchiveItem:
    """
    Shared helper function to create archive items with consistent logic
    
    This centralizes the file processing, text extraction, metadata generation,
    and tag handling to ensure consistency across all upload endpoints.
    """
    
    try:
        # Generate metadata
        metadata = {}
        try:
            metadata = await _extract_metadata(file_path, mime_type, original_filename)
            # Add any additional metadata
            if additional_metadata:
                metadata.update(additional_metadata)
            metadata = sanitize_json_metadata(metadata)
        except Exception as e:
            logger.warning(f"⚠️ Metadata extraction failed: {str(e)}")
            metadata = additional_metadata or {}
        
        # Create item name
        item_name = sanitize_filename(name) if name else Path(original_filename).stem
        item_description = sanitize_description(description) if description else None
        
        # Create archive item
        item = ArchiveItem(
            name=item_name,
            description=item_description,
            folder_uuid=folder_uuid,
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_path=str(file_path),
            mime_type=mime_type,
            file_size=file_size,
            metadata_json=json.dumps(metadata),
            user_id=user_id
        )
        
        db.add(item)
        await db.flush()  # Get the UUID for tag handling
        
        # Handle tags if provided
        if tags:
            try:
                await _handle_item_tags(db, item, tags)
            except Exception as e:
                logger.warning(f"⚠️ Tag handling failed: {str(e)}")
        
        return item
        
    except Exception as e:
        logger.error(f"❌ Error creating archive item: {str(e)}")
        raise

@router.post("/upload")
async def upload_files(
    files: List[UploadFile] = File(...),
    folder_uuid: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload multiple files to the archive"""
    
    logger.info(f"📁 Starting upload of {len(files)} files to folder {folder_uuid}")
    
    try:
        # Verify folder exists if specified
        if folder_uuid:
            folder_query = select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.uuid == folder_uuid,
                    ArchiveFolder.user_id == current_user.id
                )
            )
            folder_result = await db.execute(folder_query)
            folder = folder_result.scalar_one_or_none()
            if not folder:
                raise HTTPException(status_code=404, detail="Folder not found")
        
        # Parse tags
        tag_list = []
        if tags:
            tag_names = [tag.strip() for tag in tags.split(",") if tag.strip()]
            for tag_name in tag_names:
                # Find or create tag
                tag_query = select(Tag).where(
                    and_(
                        Tag.name == tag_name,
                        Tag.module_type == "archive",
                        Tag.user_id == current_user.id
                    )
                )
                tag_result = await db.execute(tag_query)
                tag = tag_result.scalar_one_or_none()
                if not tag:
                    tag = Tag(
                        name=tag_name,
                        module_type="archive",
                        user_id=current_user.id,
                        color="#6366f1"
                    )
                    db.add(tag)
                    await db.flush()
                tag_list.append(tag)
        
        uploaded_files = []
        
        for file in files:
            try:
                # Validate file input
                if not file or not file.filename:
                    logger.warning(f"⚠️ Skipping invalid file in bulk upload")
                    continue
                    
                # Validate file size
                file_content = await file.read()
                file_size = len(file_content)
                
                try:
                    validate_file_size(file_size, MAX_FILE_SIZE)
                except Exception as e:
                    logger.warning(f"⚠️ Skipping file '{file.filename}' due to size validation: {str(e)}")
                    continue
                
                # Generate unique filename
                file_uuid = str(uuid_lib.uuid4())
                file_extension = Path(file.filename).suffix
                safe_filename = f"{file_uuid}{file_extension}"
                
                # Create storage directory specific to the folder
                if folder_uuid:
                    storage_dir = get_file_storage_dir() / "archive" / folder_uuid
                else:
                    # If no folder specified, use a default "unorganized" folder
                    storage_dir = get_file_storage_dir() / "archive" / "unorganized"
                storage_dir.mkdir(parents=True, exist_ok=True)
                
                file_path = storage_dir / safe_filename
                
                # Detect file type using our enhanced service
                try:
                    detection_result = await file_detector.detect_file_type(
                        file_path=Path(file.filename),
                        file_content=file_content
                    )
                except Exception as e:
                    logger.warning(f"⚠️ File detection failed for '{file.filename}': {str(e)}")
                    # Use fallback detection
                    import mimetypes
                    mime_type, _ = mimetypes.guess_type(file.filename)
                    detection_result = {
                        "mime_type": mime_type or "application/octet-stream",
                        "confidence": "low",
                        "detection_method": "fallback"
                    }
                
                # Validate MIME type
                if detection_result["mime_type"] not in VALID_MIME_TYPES:
                    logger.warning(f"⚠️ Skipping file '{file.filename}' due to unsupported MIME type: {detection_result['mime_type']}")
                    continue
                
                # Save file with error handling
                try:
                    async with aiofiles.open(file_path, 'wb') as f:
                        await f.write(file_content)
                except Exception as e:
                    logger.error(f"❌ Failed to save file '{file.filename}': {str(e)}")
                    continue
                
                # Create archive item using shared helper
                additional_metadata = {
                    "upload_info": {
                        "original_name": file.filename,
                        "upload_date": datetime.now(NEPAL_TZ).isoformat(),
                        "file_detection": detection_result
                    }
                }
                
                # Extract tag names for the shared helper
                tag_names = [tag.name for tag in tag_list] if tag_list else None
                
                archive_item = await _create_archive_item(
                    db=db,
                    file_path=file_path,
                    folder_uuid=folder_uuid,
                    original_filename=file.filename,
                    stored_filename=safe_filename,
                    mime_type=detection_result["mime_type"],
                    file_size=len(file_content),
                    user_id=current_user.id,
                    name=Path(file.filename).stem,
                    description=description,
                    tags=tag_names,
                    additional_metadata=additional_metadata
                )
                
                # Note: archive_item.uuid is set by the shared helper
                
                uploaded_files.append({
                    "uuid": archive_item.uuid,
                    "name": archive_item.name,
                    "filename": archive_item.original_filename,
                    "mime_type": archive_item.mime_type,
                    "file_size": archive_item.file_size,
                    "detection_info": detection_result
                })
                
                logger.info(f"✅ Uploaded file: {file.filename} -> {safe_filename}")
                
            except Exception as e:
                logger.error(f"❌ Failed to upload file {file.filename}: {e}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to upload file {file.filename}"
                )
        
        await db.commit()
        
        logger.info(f"🎉 Successfully uploaded {len(uploaded_files)} files")
        
        return {
            "message": f"Successfully uploaded {len(uploaded_files)} files",
            "files": uploaded_files,
            "total_files": len(uploaded_files)
        }
        
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Archive upload failed: {e}")
        raise HTTPException(status_code=500, detail="Upload failed") 



@router.post("/upload/commit", response_model=ItemResponse)
async def commit_uploaded_file(
    payload: CommitUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Finalize a previously chunk-uploaded file: move it to the archive folder and create DB record."""
    try:
        # Validate payload
        if not payload.file_id:
            raise HTTPException(status_code=400, detail="file_id is required")
        if not payload.folder_uuid:
            raise HTTPException(status_code=400, detail="folder_uuid is required")
        
        # Check assembled file status
        status = await chunk_manager.get_upload_status(payload.file_id)
        if not status or status.get("status") != "completed":
            raise HTTPException(status_code=400, detail="File not yet assembled or assembly failed")

        # Locate assembled file path
        temp_dir = Path(get_data_dir()) / "temp_uploads"
        assembled = next(temp_dir.glob(f"complete_{payload.file_id}_*"), None)
        if not assembled or not assembled.exists():
            raise HTTPException(status_code=404, detail="Assembled file not found on disk")

        # Validate destination folder exists and user has access
        folder_res = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.uuid == payload.folder_uuid,
                    ArchiveFolder.user_id == current_user.id
                )
            )
        )
        folder = folder_res.scalar_one_or_none()
        if not folder:
            raise HTTPException(status_code=404, detail="Target folder not found or access denied")

        # Validate file size
        assembled_file_size = assembled.stat().st_size
        try:
            validate_file_size(assembled_file_size, MAX_FILE_SIZE)
        except Exception as e:
            # Clean up assembled file
            try:
                assembled.unlink()
            except Exception:
                pass
            raise HTTPException(status_code=413, detail=str(e))

        # Prepare destination directory on disk
        dest_dir = Path(get_file_storage_dir()) / "archive" / folder.uuid
        dest_dir.mkdir(parents=True, exist_ok=True)

        stored_filename = f"{uuid_lib.uuid4()}{assembled.suffix}"
        dest_path = dest_dir / stored_filename
        
        # Move file with error handling
        try:
            assembled.rename(dest_path)
        except Exception as e:
            logger.error(f"❌ Failed to move assembled file: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to move file to archive location")

        # Get final file size for database operations  
        final_file_size = dest_path.stat().st_size
        
        # Create archive item using shared helper
        item = await _create_archive_item(
            db=db,
            file_path=dest_path,
            folder_uuid=payload.folder_uuid,
            original_filename=assembled.name,
            stored_filename=stored_filename,
            mime_type=status.get("mime_type", "application/octet-stream"),
            file_size=final_file_size,
            user_id=current_user.id,
            name=payload.name,
            description=payload.description,
            tags=payload.tags
        )
        
        await db.commit()
        await db.refresh(item)

        # Remove tracking from chunk manager
        if payload.file_id in chunk_manager.uploads:
            del chunk_manager.uploads[payload.file_id]

        logger.info(f"✅ Committed chunked upload '{item.original_filename}' to folder '{folder.name}' for user {current_user.username}")
        
        return await _get_item_with_relations(db, item.uuid)
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        await db.rollback()
        raise
    except Exception as e:
        logger.error(f"❌ Error committing chunked upload: {str(e)}")
        await db.rollback()
        
        # Clean up destination file if it was created
        try:
            if 'dest_path' in locals() and dest_path.exists():
                dest_path.unlink()
        except Exception as cleanup_error:
            logger.error(f"❌ Failed to cleanup destination file: {str(cleanup_error)}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to commit chunked upload. Please try again."
        )

# Test endpoint for FTS integration debugging
@router.get("/debug/fts-status")
async def debug_fts_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Debug endpoint to check FTS integration status for archive items"""
    try:
        # Check if FTS tables exist and have data
        result = await db.execute(text("""
            SELECT COUNT(*) as archive_items_count 
            FROM archive_items 
            WHERE user_id = :user_id
        """), {"user_id": current_user.id})
        archive_items_count = result.scalar()
        
        # Check FTS table
        try:
            fts_result = await db.execute(text("""
                SELECT COUNT(*) as fts_count 
                FROM fts_archive_items 
                WHERE user_id = :user_id
            """), {"user_id": current_user.id})
            fts_count = fts_result.scalar()
        except Exception as e:
            fts_count = f"Error: {str(e)}"
        
        # Test a simple search
        try:
            search_result = await enhanced_fts_service.search_archive_items(db, "test", current_user.id, limit=5)
            search_working = True
            search_results_count = len(search_result)
        except Exception as e:
            search_working = False
            search_results_count = f"Error: {str(e)}"
        
        return {
            "archive_items_count": archive_items_count,
            "fts_items_count": fts_count,
            "fts_search_working": search_working,
            "test_search_results": search_results_count,
            "fts_tables_initialized": enhanced_fts_service.tables_initialized
        }
        
    except Exception as e:
        logger.error(f"❌ FTS debug check failed: {str(e)}")
        return {
            "error": str(e),
            "archive_items_count": 0,
            "fts_items_count": 0,
            "fts_search_working": False,
            "test_search_results": 0,
            "fts_tables_initialized": False
        }


# Additional endpoints for file/folder management

@router.patch("/folders/{folder_uuid}/rename")
async def rename_folder(
    folder_uuid: str,
    request: Request,
    new_name: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Rename a folder"""
    try:
        # Get the folder
        result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.uuid == folder_uuid,
                    ArchiveFolder.user_id == current_user.id
                )
            )
        )
        folder = result.scalar_one_or_none()
        
        if not folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found"
            )
        
        # Update the folder name
        folder.name = new_name.strip()
        folder.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(folder)
        
        return {"success": True, "message": "Folder renamed successfully"}
        
    except Exception as e:
        await db.rollback()
        logger.error(f"Error renaming folder {folder_uuid}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to rename folder"
        )


@router.patch("/items/{item_uuid}/rename")
async def rename_item(
    item_uuid: str,
    request: Request,
    new_name: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Rename a file/item"""
    try:
        # Get the item
        result = await db.execute(
            select(ArchiveItem).where(
                and_(
                    ArchiveItem.uuid == item_uuid,
                    ArchiveItem.user_id == current_user.id
                )
            )
        )
        item = result.scalar_one_or_none()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Update the item name
        item.name = new_name.strip()
        item.updated_at = datetime.utcnow()
        
        await db.commit()
        await db.refresh(item)
        
        return {"success": True, "message": "Item renamed successfully"}
        
    except Exception as e:
        await db.rollback()
        logger.error(f"Error renaming item {item_uuid}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to rename item"
        )


@router.delete("/folders/{folder_uuid}")
async def delete_folder(
    folder_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a folder and all its contents"""
    try:
        # Get the folder
        result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.uuid == folder_uuid,
                    ArchiveFolder.user_id == current_user.id
                )
            )
        )
        folder = result.scalar_one_or_none()
        
        if not folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found"
            )
        
        # Delete all items in the folder
        await db.execute(
            delete(ArchiveItem).where(
                and_(
                    ArchiveItem.folder_id == folder.id,
                    ArchiveItem.user_id == current_user.id
                )
            )
        )
        
        # Delete all subfolders recursively (note: this could be improved for deeper nesting)
        await db.execute(
            delete(ArchiveFolder).where(
                and_(
                    ArchiveFolder.parent_id == folder.id,
                    ArchiveFolder.user_id == current_user.id
                )
            )
        )
        
        # Delete the folder itself
        await db.delete(folder)
        await db.commit()
        
        return {"success": True, "message": "Folder deleted successfully"}
        
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting folder {folder_uuid}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete folder"
        )


@router.delete("/items/{item_uuid}")
async def delete_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a file/item"""
    try:
        # Get the item
        result = await db.execute(
            select(ArchiveItem).where(
                and_(
                    ArchiveItem.uuid == item_uuid,
                    ArchiveItem.user_id == current_user.id
                )
            )
        )
        item = result.scalar_one_or_none()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Delete the physical file
        try:
            file_path = Path(item.file_path)
            if file_path.exists():
                file_path.unlink()
        except Exception as e:
            logger.warning(f"Could not delete physical file {item.file_path}: {str(e)}")
        
        # Delete the database record
        await db.delete(item)
        await db.commit()
        
        return {"success": True, "message": "Item deleted successfully"}
        
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting item {item_uuid}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete item"
        )


@router.get("/folders/{folder_uuid}/download")
async def download_folder(
    folder_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download a folder as a ZIP file"""
    try:
        # Get the folder
        result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.uuid == folder_uuid,
                    ArchiveFolder.user_id == current_user.id
                )
            )
        )
        folder = result.scalar_one_or_none()
        
        if not folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found"
            )
        
        # For now, return a placeholder response
        # TODO: Implement actual ZIP creation
        return {"success": True, "message": "Folder download functionality coming soon"}
        
    except Exception as e:
        logger.error(f"Error downloading folder {folder_uuid}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download folder"
        )