"""
Thumbnail Router
Serves thumbnails for files
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging
from pathlib import Path

from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.document import Document
from app.models.archive import ArchiveItem
from app.config import get_file_storage_dir, settings
from app.database import get_db
from app.services.thumbnail_service import thumbnail_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/thumbnails", tags=["thumbnails"])


def _serve_thumbnail(thumbnail_path: str, data_dir: Path) -> FileResponse | None:
    """
    Helper to serve thumbnail file with proper media type.
    
    Args:
        thumbnail_path: Relative path to thumbnail file
        data_dir: Base data directory (typically settings.DATA_DIR)
    
    Returns:
        FileResponse if thumbnail exists, None otherwise (frontend handles 404 → icon fallback)
    """
    thumbnail_full_path = data_dir / thumbnail_path
    
    if not thumbnail_full_path.exists():
        return None
    
    ext = thumbnail_full_path.suffix.lower()
    media_type_map = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    }
    media_type = media_type_map.get(ext, 'image/jpeg')
    
    return FileResponse(
        str(thumbnail_full_path),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=3600"}
    )

@router.get("/{file_uuid}")
async def get_thumbnail(
    file_uuid: str,
    size: str = Query("medium", regex="^(small|medium|large)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get thumbnail for a file by UUID.
    
    Searches both Document and ArchiveItem tables for the file.
    Returns thumbnail if exists, otherwise 404.
    
    Args:
        file_uuid: UUID of the file
        size: Thumbnail size (small, medium, large) - note: currently returns stored thumbnail
        current_user: Current authenticated user
        db: Database session
    """
    try:
        # First, check Document table
        doc_query = select(Document).where(
            Document.uuid == file_uuid,
            Document.created_by == current_user.uuid,
            ~Document.is_deleted
        )
        doc_result = await db.execute(doc_query)
        document = doc_result.scalar_one_or_none()
        
        if document and document.thumbnail_path:
            result = _serve_thumbnail(document.thumbnail_path, Path(settings.DATA_DIR))
            if result:
                return result
        
        # Second, check ArchiveItem table
        archive_query = select(ArchiveItem).where(
            ArchiveItem.uuid == file_uuid,
            ArchiveItem.created_by == current_user.uuid,
            ~ArchiveItem.is_deleted
        )
        archive_result = await db.execute(archive_query)
        archive_item = archive_result.scalar_one_or_none()
        
        if archive_item and archive_item.thumbnail_path:
            # ArchiveItem thumbnails are relative to file parent (e.g., "thumbnails/hash.jpg")
            # Construct full path: storage_dir / file_path_parent / thumbnail_path
            file_parent = (Path(settings.DATA_DIR) / archive_item.file_path).parent
            result = _serve_thumbnail(archive_item.thumbnail_path, file_parent)
            if result:
                return result
        
        # File not found or no thumbnail
        raise HTTPException(
            status_code=404,
            detail=f"Thumbnail not found for file {file_uuid}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get thumbnail for {file_uuid}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get thumbnail")

@router.get("/file/{file_path:path}")
async def get_thumbnail_by_path(
    file_path: str,
    size: str = Query("medium", regex="^(small|medium|large)$"),
    current_user: User = Depends(get_current_user)
):
    """
    Get thumbnail for a file by path
    
    Args:
        file_path: Path to the file (relative to storage)
        size: Thumbnail size (small, medium, large)
        current_user: Current authenticated user
    """
    try:
        # Construct full file path
        storage_dir = get_file_storage_dir()
        full_file_path = storage_dir / file_path
        
        if not full_file_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # Check if thumbnail exists
        thumbnail_dir = storage_dir / "thumbnails"
        thumbnail_path = thumbnail_service.get_thumbnail_path(
            full_file_path, 
            thumbnail_dir, 
            size
        )
        
        if thumbnail_path and thumbnail_path.exists():
            return FileResponse(
                thumbnail_path,
                media_type="image/jpeg",
                filename=f"thumbnail_{size}.jpg"
            )
        
        # Generate thumbnail if it doesn't exist
        thumbnail_path = await thumbnail_service.generate_thumbnail(
            full_file_path,
            thumbnail_dir,
            size
        )
        
        if thumbnail_path and thumbnail_path.exists():
            return FileResponse(
                thumbnail_path,
                media_type="image/jpeg",
                filename=f"thumbnail_{size}.jpg"
            )
        
        raise HTTPException(status_code=404, detail="Thumbnail not available")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get thumbnail for {file_path}: {e}")
        raise HTTPException(status_code=500, detail="Failed to get thumbnail")


@router.post("/build")
async def build_missing_thumbnails(
    size: str = Query("medium", regex="^(small|medium|large)$"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Build missing thumbnails for all user files (Documents + ArchiveItems).
    Queries database for accurate file tracking and updates thumbnail_path in DB.
    Safe to run multiple times.
    
    Returns counts for created/existing/failed.
    """
    try:
        storage_dir = get_file_storage_dir()
        thumbs_dir = storage_dir / "thumbnails"
        thumbs_dir.mkdir(parents=True, exist_ok=True)

        created = 0
        existing = 0
        failed = 0

        # Query database for Documents (more accurate than filesystem scan)
        doc_query = select(Document).where(
            Document.created_by == current_user.uuid,
            ~Document.is_deleted
        )
        doc_result = await db.execute(doc_query)
        documents = doc_result.scalars().all()
        
        # Query database for ArchiveItems
        archive_query = select(ArchiveItem).where(
            ArchiveItem.created_by == current_user.uuid,
            ~ArchiveItem.is_deleted
        )
        archive_result = await db.execute(archive_query)
        archive_items = archive_result.scalars().all()
        
        # Process Documents (use central thumbnails directory)
        for doc in documents:
            file_path = Path(storage_dir) / doc.file_path
            if not file_path.exists():
                continue
                
            # Check if thumbnail already exists
            if doc.thumbnail_path:
                thumb_path = Path(storage_dir) / doc.thumbnail_path
                if thumb_path.exists():
                    existing += 1
                    continue
            
            # Generate thumbnail
            result = await thumbnail_service.generate_thumbnail(file_path, thumbs_dir, size)
            if result:
                # Update document with thumbnail path (relative to storage_dir)
                doc.thumbnail_path = str(result.relative_to(storage_dir))
                created += 1
            else:
                failed += 1
        
        # Process ArchiveItems (use subdirectory thumbnails)
        for item in archive_items:
            file_path = Path(storage_dir) / item.file_path
            if not file_path.exists():
                continue
                
            # Check if thumbnail already exists
            # ArchiveItem thumbnails are relative to file parent (e.g., "thumbnails/hash.jpg")
            if item.thumbnail_path:
                thumb_path = file_path.parent / item.thumbnail_path
                if thumb_path.exists():
                    existing += 1
                    continue
            
            # Generate thumbnail in subdirectory (archive items use local thumbnails)
            thumbnail_dir = file_path.parent / "thumbnails"
            result = await thumbnail_service.generate_thumbnail(file_path, thumbnail_dir, size)
            if result:
                # Update archive item with thumbnail path (relative to file parent for subdirectory structure)
                item.thumbnail_path = str(result.relative_to(file_path.parent))
                created += 1
            else:
                failed += 1
        
        # Commit all thumbnail_path updates
        await db.commit()
        
        return {
            "status": "ok",
            "size": size,
            "created": created,
            "existing": existing,
            "failed": failed,
            "total_scanned": len(documents) + len(archive_items)
        }
    except Exception as e:
        await db.rollback()
        logger.error(f"Thumbnail build failed: {e}")
        raise HTTPException(status_code=500, detail="Thumbnail build failed")
