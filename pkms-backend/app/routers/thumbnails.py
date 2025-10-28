"""
Thumbnail Router
Serves thumbnails for files
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import FileResponse
import logging

from app.auth.dependencies import get_current_user
from app.models.user import User
from app.config import get_file_storage_dir
from app.services.thumbnail_service import thumbnail_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/thumbnails", tags=["thumbnails"])

@router.get("/{file_uuid}")
async def get_thumbnail(
    file_uuid: str,
    size: str = Query("medium", regex="^(small|medium|large)$"),
    current_user: User = Depends(get_current_user)
):
    """
    Get thumbnail for a file
    
    Args:
        file_uuid: UUID of the file
        size: Thumbnail size (small, medium, large)
        current_user: Current authenticated user
    """
    try:
        # For now, we'll need to find the file by UUID
        # This is a simplified version - in practice, you'd query the database
        # to get the actual file path from the UUID
        
        # TODO: Implement proper file lookup by UUID
        # For now, return a placeholder response
        raise HTTPException(
            status_code=501, 
            detail="Thumbnail lookup by UUID not yet implemented"
        )
        
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
