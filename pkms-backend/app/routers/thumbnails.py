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
            Document.is_deleted == False
        )
        doc_result = await db.execute(doc_query)
        document = doc_result.scalar_one_or_none()
        
        if document and document.thumbnail_path:
            # Document has thumbnail
            thumbnail_full_path = Path(settings.DATA_DIR) / document.thumbnail_path
            
            if thumbnail_full_path.exists():
                # Determine media type from file extension
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
        
        # Second, check ArchiveItem table
        archive_query = select(ArchiveItem).where(
            ArchiveItem.uuid == file_uuid,
            ArchiveItem.created_by == current_user.uuid,
            ArchiveItem.is_deleted == False
        )
        archive_result = await db.execute(archive_query)
        archive_item = archive_result.scalar_one_or_none()
        
        if archive_item and archive_item.thumbnail_path:
            # Archive item has thumbnail
            thumbnail_full_path = Path(settings.DATA_DIR) / archive_item.thumbnail_path
            
            if thumbnail_full_path.exists():
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
    current_user: User = Depends(get_current_user)
):
    """
    Build missing thumbnails for all user files. Safe to run multiple times.
    Returns counts for created/existing/failed.
    """
    try:
        storage_dir = get_file_storage_dir()
        thumbs_dir = storage_dir / "thumbnails"
        thumbs_dir.mkdir(parents=True, exist_ok=True)

        created = 0
        existing = 0
        failed = 0

        # Walk storage for common file areas (simple local scan)
        candidates = []
        for sub in [storage_dir]:
            for path in sub.rglob("*"):
                if not path.is_file():
                    continue
                # Skip thumbnails directory itself
                if path.is_relative_to(thumbs_dir):
                    continue
                candidates.append(path)

        for f in candidates:
            thumb_path = thumbnail_service.get_thumbnail_path(f, thumbs_dir, size)
            if thumb_path:
                existing += 1
                continue
            result = await thumbnail_service.generate_thumbnail(f, thumbs_dir, size)
            if result:
                created += 1
            else:
                failed += 1

        return {
            "status": "ok",
            "size": size,
            "created": created,
            "existing": existing,
            "failed": failed,
            "total_scanned": len(candidates)
        }
    except Exception as e:
        logger.error(f"Thumbnail build failed: {e}")
        raise HTTPException(status_code=500, detail="Thumbnail build failed")
