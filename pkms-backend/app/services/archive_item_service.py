"""
Archive Item Service
Handles item CRUD operations, file operations, and metadata extraction
"""

import uuid
import json
import os
from pathlib import Path
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, update
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status, UploadFile
from fastapi.responses import FileResponse
import logging
from datetime import datetime

from app.config import NEPAL_TZ
from app.models.archive import ArchiveFolder, ArchiveItem
from app.schemas.archive import ItemUpdate, ItemResponse, ItemSummary, CommitUploadRequest
from app.services.archive_folder_service import archive_folder_service
from app.services.archive_path_service import archive_path_service
from app.services.document_hash_service import document_hash_service
from app.services.thumbnail_service import thumbnail_service
from app.services.unified_upload_service import unified_upload_service
from app.services.search_service import search_service

logger = logging.getLogger(__name__)


class ArchiveItemService:
    """Service for handling archive item operations"""
    
    def __init__(self):
        self.path_service = archive_path_service
    
    async def create_item(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        name: str,
        description: Optional[str],
        folder_uuid: Optional[str],
        original_filename: str,
        stored_filename: str,
        file_path: str,
        file_size: int,
        mime_type: str,
        metadata_json: Optional[Dict[str, Any]] = None
    ) -> ItemResponse:
        """Create archive item"""
        # Validate folder exists if specified
        if folder_uuid:
            folder_result = await db.execute(
                select(ArchiveFolder).where(
                    and_(
                        ArchiveFolder.uuid == folder_uuid,
                        ArchiveFolder.active_only(),  # Auto-excludes soft-deleted
                        ArchiveFolder.created_by == user_uuid
                    )
                )
            )
            folder = folder_result.scalar_one_or_none()
            if not folder:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Folder not found"
                )
        
        # Calculate file hash for duplicate detection using existing service
        file_hash = None
        try:
            if Path(file_path).exists():
                file_hash = document_hash_service.calculate_file_hash(file_path)
                
                # Check for duplicates in archive items only (not across modules)
                existing_items = await db.execute(
                    select(ArchiveItem).where(
                        and_(
                            ArchiveItem.active_only(),
                            ArchiveItem.file_hash == file_hash,
                            ArchiveItem.created_by == user_uuid
                        )
                    )
                )
                duplicate_items = existing_items.scalars().all()
                
                if duplicate_items:
                    logger.warning(f"Duplicate archive file detected: {original_filename} (hash: {file_hash}) - {len(duplicate_items)} existing items")
                    # Archive-specific duplicate handling - could skip or create reference
        except Exception as e:
            logger.error(f"Error calculating hash for {file_path}: {e}")
            # Continue without hash if calculation fails
        
        # Generate thumbnail for supported file types
        thumbnail_path = None
        try:
            if file_hash:  # Only generate thumbnails if we have a valid file
                file_path_obj = Path(file_path)
                if file_path_obj.exists():
                    # Create thumbnail directory for archive (thread-safe)
                    thumbnail_dir = Path(file_path).parent / "thumbnails"
                    try:
                        thumbnail_dir.mkdir(exist_ok=True)
                    except FileExistsError:
                        # Directory already exists, continue
                        pass
                    
                    # Generate medium-sized thumbnail
                    thumbnail_result = await thumbnail_service.generate_thumbnail(
                        file_path=file_path_obj,
                        output_dir=thumbnail_dir,
                        size='medium'
                    )
                    
                    if thumbnail_result:
                        thumbnail_path = str(thumbnail_result)
                        logger.info(f"Generated thumbnail for archive item: {thumbnail_path}")
        except Exception as e:
            logger.error(f"Failed to generate thumbnail for {file_path}: {e}")
            # Continue without thumbnail if generation fails
        
        # Create item
        item = ArchiveItem(
            uuid=str(uuid.uuid4()),
            name=name,
            description=description,
            original_filename=original_filename,
            stored_filename=stored_filename,
            file_path=file_path,
            file_size=file_size,
            mime_type=mime_type,
            folder_uuid=folder_uuid,
            created_by=user_uuid,
            metadata_json=json.dumps(metadata_json or {}),
            file_hash=file_hash,
            thumbnail_path=thumbnail_path
        )
        
        db.add(item)
        await db.flush()  # Keep flush to get generated ID
        await db.refresh(item)
        
        # Update folder stats (no commit here)
        if folder_uuid:
            await archive_folder_service.update_folder_stats(db, user_uuid, folder_uuid)
            # NOTE: No commit - router will commit once
        
        return ItemResponse.model_validate(item)
    
    async def list_folder_items(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_uuid: Optional[str] = None,
        search: Optional[str] = None,
        mime_type: Optional[str] = None,
        is_favorite: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[ItemResponse]:
        """List items in folder with filters and pagination"""
        cond = and_(
            ArchiveItem.active_only(),  # Auto-excludes soft-deleted
            ArchiveItem.created_by == user_uuid
        )
        
        if folder_uuid is not None:
            cond = and_(cond, ArchiveItem.folder_uuid == folder_uuid)
        
        if search:
            cond = and_(cond, ArchiveItem.name.ilike(f"%{search}%"))
        
        if mime_type:
            cond = and_(cond, ArchiveItem.mime_type.ilike(f"%{mime_type}%"))
        
        if is_favorite is not None:
            cond = and_(cond, ArchiveItem.is_favorite == is_favorite)
        
        result = await db.execute(
            select(ArchiveItem)
            .where(cond)
            .order_by(ArchiveItem.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        items = result.scalars().all()
        
        return [ItemResponse.model_validate(item) for item in items]
    
    async def list_deleted_items(
        self,
        db: AsyncSession,
        user_uuid: str,
    ) -> List[ItemResponse]:
        """List soft-deleted archive items for Recycle Bin."""
        try:
            query = select(ArchiveItem).where(
                and_(
                    ArchiveItem.deleted_only(),
                    ArchiveItem.created_by == user_uuid
                )
            )
            query = query.options(selectinload(ArchiveItem.tag_objs))
            result = await db.execute(query.order_by(ArchiveItem.updated_at.desc()))
            items = result.scalars().all()
            
            responses = []
            for item in items:
                responses.append(ItemResponse.model_validate(item))
            
            return responses
            
        except Exception as e:
            logger.exception(f"Error listing deleted archive items for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list deleted archive items: {str(e)}"
            )
    
    async def get_item(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        item_uuid: str
    ) -> ItemResponse:
        """Get single item"""
        result = await db.execute(
            select(ArchiveItem)
            .where(
                and_(
                    ArchiveItem.uuid == item_uuid,
                    ArchiveItem.active_only(),  # Auto-excludes soft-deleted
                    ArchiveItem.created_by == user_uuid
                )
            )
        )
        item = result.scalar_one_or_none()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        return ItemResponse.model_validate(item)
    
    async def update_item(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        item_uuid: str, 
        update_data: ItemUpdate
    ) -> ItemResponse:
        """Update item"""
        # Get existing item
        result = await db.execute(
            select(ArchiveItem).where(
                and_(
                    ArchiveItem.uuid == item_uuid,
                    ArchiveItem.active_only(),  # Auto-excludes soft-deleted
                    ArchiveItem.created_by == user_uuid
                )
            )
        )
        item = result.scalar_one_or_none()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        old_folder_uuid = item.folder_uuid
        
        # Update fields
        if update_data.name is not None:
            item.name = update_data.name
        
        if update_data.description is not None:
            item.description = update_data.description
        
        if update_data.is_favorite is not None:
            item.is_favorite = update_data.is_favorite
        
        if update_data.folder_uuid is not None:
            # Validate new folder exists
            if update_data.folder_uuid:
                folder_result = await db.execute(
                    select(ArchiveFolder).where(
                        and_(
                            ArchiveFolder.uuid == update_data.folder_uuid,
                            ArchiveFolder.active_only(),  # Auto-excludes soft-deleted
                            ArchiveFolder.created_by == user_uuid
                        )
                    )
                )
                folder = folder_result.scalar_one_or_none()
                if not folder:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Folder not found"
                    )
            
            item.folder_uuid = update_data.folder_uuid
        
        await db.flush()
        await db.refresh(item)
        
        # Update folder stats for old and new folders
        if old_folder_uuid != item.folder_uuid:
            if old_folder_uuid:
                await archive_folder_service.update_folder_stats(db, user_uuid, old_folder_uuid)
            if item.folder_uuid:
                await archive_folder_service.update_folder_stats(db, user_uuid, item.folder_uuid)
            # NOTE: No commits - router will commit once at the end
        
        return ItemResponse.model_validate(item)
    
    async def delete_item(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        item_uuid: str
    ) -> None:
        """Delete item (soft delete)"""
        # Get item
        result = await db.execute(
            select(ArchiveItem).where(
                and_(
                    ArchiveItem.uuid == item_uuid,
                    ArchiveItem.active_only(),  # Auto-excludes soft-deleted
                    ArchiveItem.created_by == user_uuid
                )
            )
        )
        item = result.scalar_one_or_none()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        folder_uuid = item.folder_uuid
        
        # Clean up thumbnails before soft delete
        try:
            if item.thumbnail_path:
                thumbnail_path = Path(item.thumbnail_path)
                if thumbnail_path.exists():
                    thumbnail_path.unlink()
                    logger.info(f"Cleaned up thumbnail: {item.thumbnail_path}")
        except Exception as e:
            logger.error(f"Failed to cleanup thumbnail for item {item_uuid}: {e}")
            # Continue with deletion even if thumbnail cleanup fails
        
        # Soft delete item
        await db.execute(
            update(ArchiveItem)
            .where(ArchiveItem.uuid == item_uuid)
            .values(is_deleted=True)
        )
        
        await db.flush()
        
        # Update folder stats
        if folder_uuid:
            await archive_folder_service.update_folder_stats(db, user_uuid, folder_uuid)
            # NOTE: No commit - router will commit once
    
    async def restore_item(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        item_uuid: str
    ) -> None:
        """Restore a soft-deleted archive item. SIMPLE operation."""
        # 1. Get soft-deleted item
        result = await db.execute(
            select(ArchiveItem).where(
                and_(
                    ArchiveItem.deleted_only(),  # Only soft-deleted
                    ArchiveItem.uuid == item_uuid,
                    ArchiveItem.created_by == user_uuid
                )
            )
        )
        item = result.scalar_one_or_none()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deleted item not found"
            )
        
        # 2. Flip flag
        item.is_deleted = False
        item.updated_at = datetime.now(NEPAL_TZ)
        db.add(item)
        
        # 3. Re-index in search
        await search_service.index_item(db, item, 'archive')
        
        # 4. Commit once
        await db.commit()
        logger.info(f"Archive item restored: {item.name}")

    async def hard_delete_archive_item(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        item_uuid: str
    ) -> None:
        """Permanently delete archive item (hard delete) - WARNING: Cannot be undone!"""
        try:
            # Get item
            result = await db.execute(
                select(ArchiveItem).where(
                    and_(
                        ArchiveItem.uuid == item_uuid,
                        ArchiveItem.created_by == user_uuid,
                        ArchiveItem.is_deleted.is_(True)
                    )
                )
            )
            item = result.scalar_one_or_none()
            
            if not item:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Deleted archive item not found"
                )
            
            # Delete physical file
            if item.file_path:
                file_path = Path(item.file_path)
                if file_path.exists():
                    try:
                        file_path.unlink()
                        logger.info(f"Deleted archive file: {file_path}")
                    except Exception as e:
                        logger.warning(f"Could not delete archive file {file_path}: {e}")
            
            # Delete thumbnail if exists
            if item.thumbnail_path:
                thumbnail_path = Path(item.thumbnail_path)
                if thumbnail_path.exists():
                    try:
                        thumbnail_path.unlink()
                        logger.info(f"Deleted archive thumbnail: {thumbnail_path}")
                    except Exception as e:
                        logger.warning(f"Could not delete archive thumbnail {thumbnail_path}: {e}")
            
            # Hard delete item record
            await db.delete(item)
            
            logger.info(f"Archive item permanently deleted: {item_uuid}")
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error hard deleting archive item {item_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to hard delete archive item: {str(e)}"
            )
    
    async def search_items(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        query: str,
        folder_uuid: Optional[str] = None,
        mime_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[ItemSummary]:
        """Search items across archive"""
        cond = and_(
            ArchiveItem.active_only(),  # Auto-excludes soft-deleted
            ArchiveItem.created_by == user_uuid,
            or_(
                ArchiveItem.name.ilike(f"%{query}%"),
                ArchiveItem.description.ilike(f"%{query}%"),
                ArchiveItem.original_filename.ilike(f"%{query}%")
            )
        )
        
        if folder_uuid is not None:
            cond = and_(cond, ArchiveItem.folder_uuid == folder_uuid)
        
        if mime_type:
            cond = and_(cond, ArchiveItem.mime_type.ilike(f"%{mime_type}%"))
        
        result = await db.execute(
            select(ArchiveItem)
            .where(cond)
            .order_by(ArchiveItem.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        items = result.scalars().all()
        
        return [ItemSummary.model_validate(item) for item in items]
    
    async def upload_files(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_uuid: Optional[str],
        files: List[UploadFile]
    ) -> List[Dict[str, Any]]:
        """Handle file uploads using unified upload service"""
        results = []
        
        for file in files:
            try:
                # Validate file
                if not file.filename:
                    results.append({
                        "filename": "unknown",
                        "success": False,
                        "error": "No filename provided"
                    })
                    continue
                
                # Use unified upload service
                upload_result = await unified_upload_service.upload_file(
                    file=file,
                    user_uuid=user_uuid,
                    module_type="archive",
                    folder_uuid=folder_uuid
                )
                
                if upload_result["success"]:
                    # Create archive item
                    item = await self.create_item(
                        db=db,
                        user_uuid=user_uuid,
                        name=upload_result["name"],
                        description=None,
                        folder_uuid=folder_uuid,
                        original_filename=file.filename,
                        stored_filename=upload_result["stored_filename"],
                        file_path=upload_result["file_path"],
                        file_size=upload_result["file_size"],
                        mime_type=upload_result["mime_type"],
                        metadata_json=upload_result.get("metadata", {})
                    )
                    
                    results.append({
                        "filename": file.filename,
                        "success": True,
                        "item_uuid": item.uuid,
                        "item_name": item.name
                    })
                else:
                    results.append({
                        "filename": file.filename,
                        "success": False,
                        "error": upload_result.get("error", "Upload failed")
                    })
            
            except Exception as e:
                logger.exception("Error uploading file %s", file.filename)
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "error": str(e)
                })
        
        return results
    
    async def commit_upload(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        commit_request: CommitUploadRequest
    ) -> ItemResponse:
        """Commit chunked upload and create archive item"""
        try:
            # Commit the upload
            commit_result = await unified_upload_service.commit_upload(
                db=db,
                upload_id=commit_request.file_id,
                module="archive",
                created_by=user_uuid,
                metadata=commit_request.model_dump(exclude_none=True)
            )

            if not commit_result:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Upload commit failed"
                )
            
            # unified service already created the ArchiveItem; return it
            return ItemResponse.model_validate(commit_result)
            
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Error committing upload %s", commit_request.file_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to commit upload"
            ) from e
    
    async def download_item(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        item_uuid: str
    ) -> FileResponse:
        """Download single item (direct file response)"""
        # Get item
        result = await db.execute(
            select(ArchiveItem).where(
                and_(
                    ArchiveItem.uuid == item_uuid,
                    ArchiveItem.active_only(),  # Auto-excludes soft-deleted
                    ArchiveItem.created_by == user_uuid
                )
            )
        )
        item = result.scalar_one_or_none()
        
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )
        
        # Check if file exists
        file_path = Path(item.file_path)
        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found on disk"
            )
        
        return FileResponse(
            path=str(file_path),
            filename=item.original_filename,
            media_type=item.mime_type
        )
    
    async def extract_metadata(
        self, 
        file_path: str, 
        mime_type: str
    ) -> Dict[str, Any]:
        """Extract metadata from file"""
        metadata = {
            "mime_type": mime_type,
            "extracted_at": datetime.utcnow().isoformat()
        }
        
        try:
            # Get file stats
            file_stat = os.stat(file_path)
            metadata.update({
                "file_size": file_stat.st_size,
                "created_at": datetime.fromtimestamp(file_stat.st_ctime).isoformat(),
                "modified_at": datetime.fromtimestamp(file_stat.st_mtime).isoformat()
            })
            
            # TODO: Add more metadata extraction based on file type
            # - Image: dimensions, EXIF data
            # - Video: duration, resolution, codec
            # - Audio: duration, bitrate, codec
            # - Document: page count, author, title
            # - Archive: file count, compression type
            
            # For now, just basic file info
            if mime_type.startswith('image/'):
                metadata["type"] = "image"
            elif mime_type.startswith('video/'):
                metadata["type"] = "video"
            elif mime_type.startswith('audio/'):
                metadata["type"] = "audio"
            elif mime_type.startswith('text/'):
                metadata["type"] = "text"
            elif mime_type in ['application/pdf']:
                metadata["type"] = "document"
            elif mime_type in ['application/zip', 'application/x-rar-compressed']:
                metadata["type"] = "archive"
            else:
                metadata["type"] = "other"
        
        except Exception as e:
            logger.exception("Error extracting metadata from %s", file_path)
            metadata["error"] = str(e)
        
        return metadata
    
    async def _update_folder_stats(
        self,
        db: AsyncSession,
        user_uuid: str,
        folder_uuid: str
    ) -> None:
        """Update folder statistics (item_count, total_size) - delegates to archive_folder_service"""
        # Delegate to the existing implementation in archive_folder_service to avoid duplication
        await archive_folder_service.update_folder_stats(db, user_uuid, folder_uuid)


# Global instance
archive_item_service = ArchiveItemService()
