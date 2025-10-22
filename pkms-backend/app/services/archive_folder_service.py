"""
Archive Folder Service
Handles folder CRUD operations, tree structure, and bulk operations
"""

import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, update, delete
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse
import logging
import zipfile
import io
from pathlib import Path

from app.models.archive import ArchiveFolder, ArchiveItem
from app.schemas.archive import FolderCreate, FolderUpdate, FolderResponse, FolderTree, BulkMoveRequest
from app.services.archive_path_service import archive_path_service

logger = logging.getLogger(__name__)


class ArchiveFolderService:
    """Service for handling archive folder operations"""
    
    def __init__(self):
        self.path_service = archive_path_service
    
    async def create_folder(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_data: FolderCreate
    ) -> FolderResponse:
        """Create a new folder with validation and stats"""
        # Validate folder name
        name_validation = self.path_service.validate_folder_name(folder_data.name)
        if not name_validation["valid"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid folder name: {', '.join(name_validation['errors'])}"
            )
        
        sanitized_name = name_validation["sanitized_name"]
        
        # Check name uniqueness
        is_unique = await self.path_service.validate_folder_name_uniqueness(
            sanitized_name, folder_data.parent_uuid, db, user_uuid
        )
        if not is_unique:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Folder name already exists in this location"
            )
        
        # Check for cycles if parent is specified
        if folder_data.parent_uuid:
            has_cycle = await self.path_service.detect_cycle(
                "", folder_data.parent_uuid, db, user_uuid
            )
            if has_cycle:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot create folder: would create circular reference"
                )
        
        # Calculate depth
        depth = 0
        if folder_data.parent_uuid:
            parent_result = await db.execute(
                select(ArchiveFolder).where(
                    and_(
                        ArchiveFolder.uuid == folder_data.parent_uuid,
                        ArchiveFolder.created_by == user_uuid,
                        ArchiveFolder.is_deleted.is_(False)
                    )
                )
            )
            parent_folder = parent_result.scalar_one_or_none()
            if parent_folder:
                depth = parent_folder.depth + 1
            else:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Parent folder not found"
                )
        
        # Create folder
        folder = ArchiveFolder(
            uuid=str(uuid.uuid4()),
            name=sanitized_name,
            description=folder_data.description,
            parent_uuid=folder_data.parent_uuid,
            is_favorite=getattr(folder_data, 'is_favorite', False),
            depth=depth,
            created_by=user_uuid
        )
        
        db.add(folder)
        await db.commit()
        await db.refresh(folder)
        
        # Get folder with stats
        return await self.get_folder(db, user_uuid, folder.uuid)
    
    async def list_folders(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        parent_uuid: Optional[str] = None,
        search: Optional[str] = None,
        is_favorite: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[FolderResponse]:
        """List folders with filters and pagination"""
        cond = and_(
            ArchiveFolder.created_by == user_uuid,
            ArchiveFolder.is_deleted.is_(False)
        )
        
        if parent_uuid is not None:
            cond = and_(cond, ArchiveFolder.parent_uuid == parent_uuid)
        
        if search:
            cond = and_(cond, ArchiveFolder.name.ilike(f"%{search}%"))
        
        if is_favorite is not None:
            cond = and_(cond, ArchiveFolder.is_favorite == is_favorite)
        
        result = await db.execute(
            select(ArchiveFolder)
            .where(cond)
            .order_by(ArchiveFolder.name)
            .limit(limit)
            .offset(offset)
        )
        folders = result.scalars().all()
        
        # BATCH LOAD: Get all folder stats in a single query to avoid N+1
        if folders:
            folder_uuids = [folder.uuid for folder in folders]
            folder_stats = await self._batch_get_folder_stats(db, user_uuid, folder_uuids)
            
            # Batch subfolder counts
            sub_counts = await self._batch_get_subfolder_counts(db, user_uuid, folder_uuids)
            
            # Build responses with pre-loaded stats
            responses = []
            for folder in folders:
                stats = folder_stats.get(folder.uuid, {"item_count": 0, "total_size": 0})
                # Build display path from breadcrumb
                breadcrumb = await self.path_service.get_folder_breadcrumb(folder.uuid, db, user_uuid)
                path = "/".join([b["name"] for b in breadcrumb]) if breadcrumb else folder.name
                response = FolderResponse(
                    uuid=folder.uuid,
                    name=folder.name,
                    description=folder.description,
                    parent_uuid=folder.parent_uuid,
                    is_favorite=folder.is_favorite,
                    depth=folder.depth,
                    path=path,
                    subfolder_count=sub_counts.get(folder.uuid, 0),
                    item_count=stats["item_count"],
                    total_size=stats["total_size"],
                    created_at=folder.created_at,
                    updated_at=folder.updated_at
                )
                responses.append(response)
            return responses
        
        return []
    
    async def _batch_get_subfolder_counts(
        self, db: AsyncSession, user_uuid: str, folder_uuids: List[str]
    ) -> Dict[str, int]:
        """Return count of direct subfolders per folder UUID."""
        if not folder_uuids:
            return {}
        result = await db.execute(
            select(ArchiveFolder.parent_uuid, func.count(ArchiveFolder.uuid))
            .where(
                and_(
                    ArchiveFolder.parent_uuid.in_(folder_uuids),
                    ArchiveFolder.created_by == user_uuid,
                    ArchiveFolder.is_deleted.is_(False),
                )
            )
            .group_by(ArchiveFolder.parent_uuid)
        )
        return {parent_uuid: cnt for parent_uuid, cnt in result.all()}
    
    async def get_folder_tree(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        parent_uuid: Optional[str] = None,
        max_depth: Optional[int] = None
    ) -> List[FolderTree]:
        """Build folder tree structure with lazy loading support"""
        hierarchy = await self.path_service.build_hierarchy(
            db, user_uuid, parent_uuid, max_depth
        )
        
        return [FolderTree(**folder_data) for folder_data in hierarchy]
    
    async def get_folder(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_uuid: str
    ) -> FolderResponse:
        """Get single folder with stats"""
        result = await db.execute(
            select(ArchiveFolder)
            .where(
                and_(
                    ArchiveFolder.uuid == folder_uuid,
                    ArchiveFolder.created_by == user_uuid,
                    ArchiveFolder.is_deleted.is_(False)
                )
            )
        )
        folder = result.scalar_one_or_none()
        
        if not folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found"
            )
        
        # Get folder stats in batch to avoid N+1
        folder_stats = await self._batch_get_folder_stats(db, user_uuid, [folder.uuid])
        stats = folder_stats.get(folder.uuid, {"item_count": 0, "total_size": 0})
        
        # Compute subfolder_count and path
        sub_counts = await self._batch_get_subfolder_counts(db, user_uuid, [folder.uuid])
        breadcrumb = await self.path_service.get_folder_breadcrumb(folder.uuid, db, user_uuid)
        path = "/".join([b["name"] for b in breadcrumb]) if breadcrumb else folder.name
        
        return FolderResponse(
            uuid=folder.uuid,
            name=folder.name,
            description=folder.description,
            parent_uuid=folder.parent_uuid,
            is_favorite=folder.is_favorite,
            depth=folder.depth,
            path=path,
            subfolder_count=sub_counts.get(folder.uuid, 0),
            item_count=stats["item_count"],
            total_size=stats["total_size"],
            created_at=folder.created_at,
            updated_at=folder.updated_at
        )
    
    async def update_folder(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_uuid: str, 
        update_data: FolderUpdate
    ) -> FolderResponse:
        """Update folder with validation"""
        # Get existing folder
        result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.uuid == folder_uuid,
                    ArchiveFolder.created_by == user_uuid,
                    ArchiveFolder.is_deleted.is_(False)
                )
            )
        )
        folder = result.scalar_one_or_none()
        
        if not folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found"
            )
        
        # Validate name if provided
        if update_data.name is not None:
            name_validation = self.path_service.validate_folder_name(update_data.name)
            if not name_validation["valid"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid folder name: {', '.join(name_validation['errors'])}"
                )
            
            sanitized_name = name_validation["sanitized_name"]
            
            # Check name uniqueness
            is_unique = await self.path_service.validate_folder_name_uniqueness(
                sanitized_name, folder.parent_uuid, db, user_uuid, folder_uuid
            )
            if not is_unique:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Folder name already exists in this location"
                )
            
            folder.name = sanitized_name
        
        # Update other fields
        if update_data.description is not None:
            folder.description = update_data.description
        
        if update_data.is_favorite is not None:
            folder.is_favorite = update_data.is_favorite
        
        # Handle parent change
        if update_data.parent_uuid is not None:
            # Check for cycles
            has_cycle = await self.path_service.detect_cycle(
                folder_uuid, update_data.parent_uuid, db, user_uuid
            )
            if has_cycle:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot move folder: would create circular reference"
                )
            
            # Calculate new depth
            new_depth = 0
            if update_data.parent_uuid:
                parent_result = await db.execute(
                    select(ArchiveFolder).where(
                        and_(
                            ArchiveFolder.uuid == update_data.parent_uuid,
                            ArchiveFolder.created_by == user_uuid,
                            ArchiveFolder.is_deleted.is_(False)
                        )
                    )
                )
                parent_folder = parent_result.scalar_one_or_none()
                if parent_folder:
                    new_depth = parent_folder.depth + 1
                else:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Parent folder not found"
                    )
            
            folder.parent_uuid = update_data.parent_uuid
            folder.depth = new_depth
            
            # Update depth for all descendants
            await self._update_descendant_depths(db, folder_uuid, new_depth + 1)
        
        await db.commit()
        await db.refresh(folder)
        
        return await self.get_folder(db, user_uuid, folder.uuid)
    
    async def delete_folder(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_uuid: str
    ) -> None:
        """Delete folder and all contents (soft delete)"""
        # Get folder with all descendants
        result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.uuid == folder_uuid,
                    ArchiveFolder.created_by == user_uuid,
                    ArchiveFolder.is_deleted.is_(False)
                )
            )
        )
        folder = result.scalar_one_or_none()
        
        if not folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found"
            )
        
        # Get all descendant folders
        descendant_uuids = await self._get_descendant_uuids(db, folder_uuid, user_uuid)
        all_folder_uuids = [folder_uuid] + descendant_uuids
        
        # Soft delete all folders
        await db.execute(
            update(ArchiveFolder)
            .where(
                and_(
                    ArchiveFolder.uuid.in_(all_folder_uuids),
                    ArchiveFolder.created_by == user_uuid
                )
            )
            .values(is_deleted=True)
        )
        
        # Soft delete all items in these folders
        await db.execute(
            update(ArchiveItem)
            .where(
                and_(
                    ArchiveItem.folder_uuid.in_(all_folder_uuids),
                    ArchiveItem.created_by == user_uuid
                )
            )
            .values(is_deleted=True)
        )
        
        await db.commit()
    
    async def get_breadcrumb(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_uuid: str
    ) -> List[Dict[str, str]]:
        """Get folder breadcrumb path for navigation"""
        return await self.path_service.get_folder_breadcrumb(
            folder_uuid, db, user_uuid
        )
    
    async def bulk_move_items(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        move_request: BulkMoveRequest
    ) -> Dict[str, Any]:
        """Move multiple items to new folder (atomic operation)"""
        # Validate destination folder
        if move_request.destination_folder_uuid:
            dest_result = await db.execute(
                select(ArchiveFolder).where(
                    and_(
                        ArchiveFolder.uuid == move_request.destination_folder_uuid,
                        ArchiveFolder.created_by == user_uuid,
                        ArchiveFolder.is_deleted.is_(False)
                    )
                )
            )
            dest_folder = dest_result.scalar_one_or_none()
            if not dest_folder:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Destination folder not found"
                )
        
        # Move folders with cycle prevention and depth recalculation
        if move_request.folder_uuids:
            # Validate folder existence and collect current data
            folder_results = await db.execute(
                select(ArchiveFolder.uuid, ArchiveFolder.parent_uuid, ArchiveFolder.depth)
                .where(
                    and_(
                        ArchiveFolder.uuid.in_(move_request.folder_uuids),
                        ArchiveFolder.created_by == user_uuid,
                        ArchiveFolder.is_deleted.is_(False)
                    )
                )
            )
            existing_folders = folder_results.all()

            if not existing_folders:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No valid folders found to move"
                )

            existing_folder_uuids = {row.uuid for row in existing_folders}
            moved_uuids = existing_folder_uuids

            # Get destination folder depth
            dest_depth = 0
            if move_request.destination_folder_uuid:
                dest_result = await db.execute(
                    select(ArchiveFolder.depth)
                    .where(
                        and_(
                            ArchiveFolder.uuid == move_request.destination_folder_uuid,
                            ArchiveFolder.created_by == user_uuid,
                            ArchiveFolder.is_deleted.is_(False)
                        )
                    )
                )
                dest_depth = dest_result.scalar() or 0

                # Check for cycles: destination cannot be inside any moved folder subtree
                for folder_uuid in moved_uuids:
                    has_cycle = await self.path_service.detect_cycle(
                        folder_uuid, move_request.destination_folder_uuid, db, user_uuid
                    )
                    if has_cycle:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Cannot move folder {folder_uuid}: would create circular reference"
                        )

            # Calculate depth changes for each folder
            folder_depth_updates = []
            for row in existing_folders:
                old_depth = row.depth
                new_parent_uuid = move_request.destination_folder_uuid

                # Calculate new depth
                if new_parent_uuid:
                    # Get destination folder depth
                    new_depth = dest_depth + 1
                else:
                    new_depth = 0  # Moving to root

                depth_delta = new_depth - old_depth
                folder_depth_updates.append((row.uuid, new_parent_uuid, new_depth, depth_delta))

            # Apply parent_uuid changes
            for folder_uuid, new_parent_uuid, new_depth, depth_delta in folder_depth_updates:
                await db.execute(
                    update(ArchiveFolder)
                    .where(ArchiveFolder.uuid == folder_uuid)
                    .values(parent_uuid=new_parent_uuid, depth=new_depth)
                )

            # Update depths for all descendants
            for folder_uuid, new_parent_uuid, new_depth, depth_delta in folder_depth_updates:
                if depth_delta != 0:
                    await self._update_descendant_depths_by_delta(db, folder_uuid, depth_delta)
        
        # Move items
        if move_request.item_uuids:
            await db.execute(
                update(ArchiveItem)
                .where(
                    and_(
                        ArchiveItem.uuid.in_(move_request.item_uuids),
                        ArchiveItem.created_by == user_uuid,
                        ArchiveItem.is_deleted.is_(False)
                    )
                )
                .values(folder_uuid=move_request.destination_folder_uuid)
            )
        
        await db.commit()
        
        # Update folder stats for affected folders
        affected_folders = set()
        if move_request.folder_uuids:
            affected_folders.update(move_request.folder_uuids)
        if move_request.destination_folder_uuid:
            affected_folders.add(move_request.destination_folder_uuid)
        
        # BATCH UPDATE: Update all affected folder stats in batch to avoid N+1
        if affected_folders:
            await self._batch_update_folder_stats(db, user_uuid, list(affected_folders))
        
        return {
            "moved_folders": len(move_request.folder_uuids or []),
            "moved_items": len(move_request.item_uuids or []),
            "destination_folder": move_request.destination_folder_uuid
        }
    
    async def update_folder_stats(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_uuid: str
    ) -> None:
        """Update derived columns for folder (item_count, total_size)"""
        await self._update_folder_stats(db, user_uuid, folder_uuid)
    
    async def download_folder(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_uuid: str
    ) -> StreamingResponse:
        """Download single folder as ZIP"""
        # Get folder
        folder = await self.get_folder(db, user_uuid, folder_uuid)
        
        # Get all items in folder and subfolders
        all_items = await self._get_all_items_recursive(db, user_uuid, folder_uuid)
        
        if not all_items:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No items found in folder"
            )
        
        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for item in all_items:
                # Build relative path within ZIP
                relative_path = self._build_zip_path(item, folder.name)
                
                # Add file to ZIP
                try:
                    file_path = Path(item.file_path)
                    if file_path.exists():
                        zip_file.write(file_path, relative_path)
                    else:
                        logger.warning(f"File not found: {item.file_path}")
                except Exception as e:
                    logger.error(f"Error adding file to ZIP: {e}")
        
        zip_buffer.seek(0)
        
        return StreamingResponse(
            io.BytesIO(zip_buffer.read()),
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={folder.name}.zip"}
        )
    
    async def download_multiple_folders(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_uuids: List[str]
    ) -> StreamingResponse:
        """Download multiple folders as ZIP"""
        if not folder_uuids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No folders specified"
            )
        
        # Get all folders
        folders = []
        for folder_uuid in folder_uuids:
            try:
                folder = await self.get_folder(db, user_uuid, folder_uuid)
                folders.append(folder)
            except HTTPException:
                continue  # Skip non-existent folders
        
        if not folders:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No valid folders found"
            )
        
        # Create ZIP in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for folder in folders:
                # Get all items in folder
                all_items = await self._get_all_items_recursive(db, user_uuid, folder.uuid)
                
                for item in all_items:
                    # Build relative path within ZIP
                    relative_path = self._build_zip_path(item, folder.name)
                    
                    # Add file to ZIP
                    try:
                        file_path = Path(item.file_path)
                        if file_path.exists():
                            zip_file.write(file_path, relative_path)
                        else:
                            logger.warning(f"File not found: {item.file_path}")
                    except Exception:
                        logger.exception("Error adding file to ZIP")
        
        zip_buffer.seek(0)
        
        return StreamingResponse(
            io.BytesIO(zip_buffer.read()),
            media_type="application/zip",
            headers={"Content-Disposition": "attachment; filename=archive_folders.zip"}
        )
    
    async def _update_descendant_depths(
        self, 
        db: AsyncSession, 
        parent_uuid: str, 
        new_depth: int
    ) -> None:
        """Update depth for all descendant folders"""
        # Get direct children
        result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.parent_uuid == parent_uuid,
                    ArchiveFolder.is_deleted.is_(False)
                )
            )
        )
        children = result.scalars().all()
        
        for child in children:
            # Update child depth
            await db.execute(
                update(ArchiveFolder)
                .where(ArchiveFolder.uuid == child.uuid)
                .values(depth=new_depth)
            )
            
            # Recursively update descendants
            await self._update_descendant_depths(db, child.uuid, new_depth + 1)

    async def _update_descendant_depths_by_delta(
        self,
        db: AsyncSession,
        parent_uuid: str,
        depth_delta: int
    ) -> None:
        """Update depth for all descendant folders by applying a depth delta"""
        if depth_delta == 0:
            return

        # Get all descendant UUIDs recursively
        descendant_uuids = await self._get_descendant_uuids(db, parent_uuid)

        if descendant_uuids:
            # Apply depth delta to all descendants in a single query
            await db.execute(
                update(ArchiveFolder)
                .where(ArchiveFolder.uuid.in_(descendant_uuids))
                .values(depth=ArchiveFolder.depth + depth_delta)
            )

    async def _get_descendant_uuids(
        self, 
        db: AsyncSession, 
        parent_uuid: str, 
        user_uuid: str
    ) -> List[str]:
        """Get all descendant folder UUIDs"""
        descendant_uuids = []
        
        # Get direct children
        result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.parent_uuid == parent_uuid,
                    ArchiveFolder.created_by == user_uuid,
                    ArchiveFolder.is_deleted.is_(False)
                )
            )
        )
        children = result.scalars().all()
        
        for child in children:
            descendant_uuids.append(child.uuid)
            # Recursively get descendants
            child_descendants = await self._get_descendant_uuids(
                db, child.uuid, user_uuid
            )
            descendant_uuids.extend(child_descendants)
        
        return descendant_uuids
    
    async def _update_folder_stats(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_uuid: str
    ) -> None:
        """Update folder statistics (item_count, total_size)"""
        # Count items in this folder
        item_count_result = await db.execute(
            select(func.count(ArchiveItem.uuid))
            .where(
                and_(
                    ArchiveItem.folder_uuid == folder_uuid,
                    ArchiveItem.created_by == user_uuid,
                    ArchiveItem.is_deleted.is_(False)
                )
            )
        )
        item_count = item_count_result.scalar() or 0
        
        # Sum file sizes in this folder
        total_size_result = await db.execute(
            select(func.coalesce(func.sum(ArchiveItem.file_size), 0))
            .where(
                and_(
                    ArchiveItem.folder_uuid == folder_uuid,
                    ArchiveItem.created_by == user_uuid,
                    ArchiveItem.is_deleted.is_(False)
                )
            )
        )
        total_size = total_size_result.scalar() or 0
        
        # Update folder
        await db.execute(
            update(ArchiveFolder)
            .where(
                and_(
                    ArchiveFolder.uuid == folder_uuid,
                    ArchiveFolder.created_by == user_uuid
                )
            )
            .values(item_count=item_count, total_size=total_size)
        )
    
    async def _get_all_items_recursive(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        folder_uuid: str
    ) -> List[ArchiveItem]:
        """Get all items in folder and subfolders recursively - OPTIMIZED to avoid N+1 queries"""
        # BATCH LOAD: Get ALL subfolders in the entire tree in a single query
        all_subfolder_uuids = await self._get_all_subfolder_uuids_recursive(db, user_uuid, [folder_uuid])
        
        # BATCH LOAD: Get ALL items for the root folder + all subfolders in a single query
        all_folder_uuids = [folder_uuid] + all_subfolder_uuids
        
        result = await db.execute(
            select(ArchiveItem).where(
                and_(
                    ArchiveItem.folder_uuid.in_(all_folder_uuids),
                    ArchiveItem.created_by == user_uuid,
                    ArchiveItem.is_deleted.is_(False)
                )
            )
        )
        all_items = result.scalars().all()
        
        return all_items
    
    async def _get_all_subfolder_uuids_recursive(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        parent_uuids: List[str]
    ) -> List[str]:
        """Get all subfolder UUIDs recursively using batch queries to avoid N+1"""
        if not parent_uuids:
            return []
        
        # BATCH LOAD: Get all direct children of the parent folders
        result = await db.execute(
            select(ArchiveFolder.uuid, ArchiveFolder.parent_uuid).where(
                and_(
                    ArchiveFolder.parent_uuid.in_(parent_uuids),
                    ArchiveFolder.created_by == user_uuid,
                    ArchiveFolder.is_deleted.is_(False)
                )
            )
        )
        direct_children = result.fetchall()
        
        if not direct_children:
            return []
        
        # Get UUIDs of direct children
        direct_child_uuids = [child.uuid for child in direct_children]
        
        # Recursively get children of children
        deeper_children = await self._get_all_subfolder_uuids_recursive(
            db, user_uuid, direct_child_uuids
        )
        
        # Combine direct children with deeper children
        return direct_child_uuids + deeper_children

    async def _batch_get_folder_stats(
        self, db: AsyncSession, user_uuid: str, folder_uuids: List[str]
    ) -> Dict[str, Dict[str, int]]:
        """Batch load folder statistics to avoid N+1 queries."""
        if not folder_uuids:
            return {}
        
        # Single query to get all folder stats
        result = await db.execute(
            select(
                ArchiveItem.folder_uuid,
                func.count(ArchiveItem.uuid).label('item_count'),
                func.coalesce(func.sum(ArchiveItem.file_size), 0).label('total_size')
            )
            .where(
                and_(
                    ArchiveItem.folder_uuid.in_(folder_uuids),
                    ArchiveItem.created_by == user_uuid,
                    ArchiveItem.is_deleted.is_(False)
                )
            )
            .group_by(ArchiveItem.folder_uuid)
        )
        
        stats_map = {}
        for row in result.all():
            folder_uuid = row.folder_uuid
            stats_map[folder_uuid] = {
                "item_count": row.item_count or 0,
                "total_size": row.total_size or 0
            }
        
        # Fill in zeros for folders with no items
        for folder_uuid in folder_uuids:
            if folder_uuid not in stats_map:
                stats_map[folder_uuid] = {"item_count": 0, "total_size": 0}
        
        return stats_map

    async def _batch_update_folder_stats(
        self, db: AsyncSession, user_uuid: str, folder_uuids: List[str]
    ) -> None:
        """Batch update folder statistics to avoid N+1 queries."""
        if not folder_uuids:
            return
        
        # Get all stats in batch
        stats_map = await self._batch_get_folder_stats(db, user_uuid, folder_uuids)
        
        # Update all folders in batch
        for folder_uuid, stats in stats_map.items():
            await db.execute(
                update(ArchiveFolder)
                .where(
                    and_(
                        ArchiveFolder.uuid == folder_uuid,
                        ArchiveFolder.created_by == user_uuid
                    )
                )
                .values(
                    item_count=stats["item_count"],
                    total_size=stats["total_size"]
                )
            )
        
        await db.commit()
    
    def _build_zip_path(self, item: ArchiveItem, root_folder_name: str) -> str:
        """Build relative path for item within ZIP"""
        # For now, just use the item name
        # TODO: Build proper hierarchy path if needed
        return f"{root_folder_name}/{item.original_filename}"


# Global instance
archive_folder_service = ArchiveFolderService()
