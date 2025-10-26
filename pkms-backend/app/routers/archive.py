"""
Archive Router
Handles hierarchical file and folder organization with enhanced security
Refactored to use service layer for better maintainability
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Form, File, UploadFile, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
import logging

from app.database import get_db
from app.models.user import User
from app.auth.dependencies import get_current_user
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
from app.services.archive_folder_service import archive_folder_service
from app.services.archive_item_service import archive_item_service
from app.services.chunk_service import chunk_manager
from app.services.file_validation import file_validation_service

logger = logging.getLogger(__name__)
router = APIRouter()


# Folder endpoints
@router.post("/folders", response_model=FolderResponse)
async def create_folder(
    folder_data: FolderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new folder"""
    try:
        result = await archive_folder_service.create_folder(db, current_user.uuid, folder_data)
        await db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error creating folder for user %s", current_user.uuid)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create folder: {str(e)}"
        )


@router.get("/folders", response_model=List[FolderResponse])
async def list_folders(
    parent_uuid: Optional[str] = Query(None, description="Parent folder UUID"),
    search: Optional[str] = Query(None, description="Search term for folder names"),
    is_favorite: Optional[bool] = Query(None, description="Filter by favorite status"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of folders to return"),
    offset: int = Query(0, ge=0, description="Number of folders to skip"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List folders with filters and pagination"""
    try:
        return await archive_folder_service.list_folders(
            db, current_user.uuid, parent_uuid, search, is_favorite, limit, offset
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error listing folders for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list folders: {str(e)}"
        )


@router.get("/folders/tree", response_model=List[FolderTree])
async def get_folder_tree(
    parent_uuid: Optional[str] = Query(None, description="Root folder UUID for tree"),
    max_depth: Optional[int] = Query(None, ge=1, le=10, description="Maximum tree depth"),
    search: Optional[str] = Query(None, description="Search term for folder names"),  # NEW
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get folder tree structure with lazy loading support"""
    try:
        return await archive_folder_service.get_folder_tree(
            db, current_user.uuid, parent_uuid, max_depth, search=search
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error getting folder tree for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get folder tree: {str(e)}"
        )


@router.get("/folders/{folder_uuid}/breadcrumb", response_model=List[Dict[str, str]])
async def get_folder_breadcrumb(
    folder_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get folder breadcrumb path for navigation"""
    try:
        return await archive_folder_service.get_breadcrumb(db, current_user.uuid, folder_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error getting breadcrumb for folder %s", folder_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get breadcrumb: {str(e)}"
        )


@router.get("/folders/{folder_uuid}", response_model=FolderResponse)
async def get_folder(
    folder_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get single folder with stats"""
    try:
        return await archive_folder_service.get_folder(db, current_user.uuid, folder_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error getting folder %s", folder_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get folder: {str(e)}"
        )


@router.put("/folders/{folder_uuid}", response_model=FolderResponse)
async def update_folder(
    folder_uuid: str,
    update_data: FolderUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update folder"""
    try:
        result = await archive_folder_service.update_folder(
            db, current_user.uuid, folder_uuid, update_data
        )
        await db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error updating folder %s", folder_uuid)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update folder: {str(e)}"
        )


@router.delete("/folders/{folder_uuid}")
async def delete_folder(
    folder_uuid: str,
    force: bool = Query(False, description="Force delete non-empty folder"),  # NEW
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete folder and all contents"""
    try:
        await archive_folder_service.delete_folder(db, current_user.uuid, folder_uuid, force=force)
        await db.commit()
        return {"message": "Folder deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error deleting folder %s", folder_uuid)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete folder: {str(e)}"
        )


@router.post("/bulk/move")
async def bulk_move_items(
    move_request: BulkMoveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Move multiple items to new folder"""
    try:
        result = await archive_folder_service.bulk_move_items(
            db, current_user.uuid, move_request
        )
        await db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error bulk moving items for user %s", current_user.uuid)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to move items: {str(e)}"
        )


# Item endpoints
@router.post("/folders/{folder_uuid}/items", response_model=ItemResponse)
async def create_item_in_folder(
    folder_uuid: str,
    name: str = Form(...),
    description: Optional[str] = Form(None),
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create items in folder by uploading files"""
    try:
        # SECURITY: Validate all files before processing
        for file in files:
            await file_validation_service.validate_file(file)
        
        results = await archive_item_service.upload_files(
            db, current_user.uuid, folder_uuid, files
        )
        
        await db.commit()
        
        # Return first successful upload
        for result in results:
            if result["success"]:
                return await archive_item_service.get_item(db, current_user.uuid, result["item_uuid"])
        
        # If no successful uploads
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No files were uploaded successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error creating items in folder %s", folder_uuid)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create items"
        )


@router.get("/folders/{folder_uuid}/items", response_model=List[ItemResponse])
async def list_folder_items(
    folder_uuid: str,
    search: Optional[str] = Query(None, description="Search term for item names"),
    mime_type: Optional[str] = Query(None, description="Filter by MIME type"),
    is_favorite: Optional[bool] = Query(None, description="Filter by favorite status"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of items to return"),
    offset: int = Query(0, ge=0, description="Number of items to skip"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List items in folder with filters and pagination"""
    try:
        items = await archive_item_service.list_folder_items(
            db, current_user.uuid, folder_uuid, search, mime_type, is_favorite, limit, offset
        )
        return items  # Service already returns ItemResponse objects
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error listing items in folder %s", folder_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list items: {str(e)}"
        )


@router.get("/items/deleted", response_model=List[ItemResponse])
async def list_deleted_items(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List deleted archive items for Recycle Bin."""
    try:
        return await archive_item_service.list_deleted_items(db, current_user.uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error listing deleted archive items for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list deleted archive items"
        )


@router.get("/items/{item_uuid}", response_model=ItemResponse)
async def get_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get single item"""
    try:
        return await archive_item_service.get_item(db, current_user.uuid, item_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error getting item %s", item_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get item: {str(e)}"
        )


@router.put("/items/{item_uuid}", response_model=ItemResponse)
async def update_item(
    item_uuid: str,
    update_data: ItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update item"""
    try:
        result = await archive_item_service.update_item(
            db, current_user.uuid, item_uuid, update_data
        )
        await db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error updating item %s", item_uuid)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update item: {str(e)}"
        )


@router.delete("/items/{item_uuid}")
async def delete_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete item"""
    try:
        await archive_item_service.delete_item(db, current_user.uuid, item_uuid)
        await db.commit()
        return {"message": "Item deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error deleting item %s", item_uuid)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete item: {str(e)}"
        )


@router.post("/items/{item_uuid}/restore")
async def restore_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Restore a soft-deleted archive item from Recycle Bin."""
    try:
        await archive_item_service.restore_item(db, current_user.uuid, item_uuid)
        await db.commit()
        return {"message": "Item restored successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error restoring item %s", item_uuid)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to restore item: {str(e)}"
        )


@router.delete("/items/{item_uuid}/permanent")
async def permanent_delete_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete archive item (hard delete) - WARNING: Cannot be undone!"""
    try:
        await archive_item_service.hard_delete_archive_item(db, current_user.uuid, item_uuid)
        await db.commit()
        return {"message": "Archive item permanently deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error permanently deleting archive item %s", item_uuid)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to permanently delete archive item: {str(e)}"
        )


@router.get("/search", response_model=List[ItemSummary])
async def search_items(
    q: str = Query(..., description="Search query"),
    folder_uuid: Optional[str] = Query(None, description="Limit search to specific folder"),
    mime_type: Optional[str] = Query(None, description="Filter by MIME type"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Search items across archive"""
    try:
        return await archive_item_service.search_items(
            db, current_user.uuid, q, folder_uuid, mime_type, limit, offset
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error searching items for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search items: {str(e)}"
        )


# Upload endpoints
@router.post("/upload")
async def upload_files(
    folder_uuid: Optional[str] = Form(None),
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload multiple files"""
    try:
        # SECURITY: Validate all files before processing
        for file in files:
            await file_validation_service.validate_file(file)
        
        results = await archive_item_service.upload_files(
            db, current_user.uuid, folder_uuid, files
        )
        await db.commit()
        return {"results": results}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error uploading files for user %s", current_user.uuid)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload files: {str(e)}"
        )


@router.post("/upload/commit", response_model=ItemResponse)
async def commit_upload(
    commit_request: CommitUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Commit chunked upload and create archive item"""
    try:
        result = await archive_item_service.commit_upload(
            db, current_user.uuid, commit_request
        )
        await db.commit()
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error committing upload %s", commit_request.file_id)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to commit chunked upload. Please try again."
        ) from e


# Download endpoints
@router.get("/items/{item_uuid}/download")
async def download_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download single item"""
    try:
        return await archive_item_service.download_item(db, current_user.uuid, item_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error downloading item %s", item_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download item: {str(e)}"
        )


@router.get("/folders/{folder_uuid}/download")
async def download_folder(
    folder_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download folder as ZIP"""
    try:
        return await archive_folder_service.download_folder(
            db, current_user.uuid, folder_uuid
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error downloading folder %s", folder_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download folder: {str(e)}"
        )


# Debug endpoints
@router.get("/debug/fts-status")
async def get_fts_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get full-text search status (debug endpoint)"""
    try:
        # TODO: Implement FTS status check
        return {"status": "FTS not implemented yet"}
    except Exception as e:
        logger.exception("Error getting FTS status")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get FTS status"
        )

