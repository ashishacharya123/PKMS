"""
Unified Download Router for PKMS

This router provides consistent download endpoints across all modules,
using the unified download service while maintaining module-specific
functionality like authentication and encryption requirements.

Benefits:
- Single download endpoint (/api/v1/downloads/{module}/{file_uuid})
- Consistent error handling and response headers
- Reduced code duplication
- Easy to maintain and extend
"""

from fastapi import APIRouter, HTTPException, Depends, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.services.unified_download_service import unified_download_service
from app.services.diary_crypto_service import DiaryCryptoService
from app.routers.diary import _diary_sessions, _diary_sessions_lock
from app.models.diary import DiaryFile, DiaryEntry
from sqlalchemy import and_, select
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/downloads", tags=["downloads"])

# Initialize diary crypto service
diary_crypto_service = DiaryCryptoService(_diary_sessions, _diary_sessions_lock)


@router.get("/{module}/{file_uuid}")
async def download_file(
    module: str,
    file_uuid: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Unified download endpoint for all modules except diary.

    Args:
        module: Module name ("documents", "notes", "archive")
        file_uuid: UUID of the file to download
        current_user: Authenticated user
        db: Database session

    Returns:
        FileResponse with appropriate headers
    """
    try:
        # Validate module
        if module not in ["documents", "notes", "archive", "diary"]:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported module: {module}. Supported modules: documents, notes, archive, diary"
            )

        return await unified_download_service.download_file(
            db=db,
            file_uuid=file_uuid,
            module=module,
            user_uuid=current_user.uuid,
            request=request
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error downloading file from {module}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download file: {str(e)}"
        )


@router.get("/diary/{media_uuid}")
async def download_diary_media(
    media_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Download diary media with decryption.

    Uses the dedicated diary encryption service for secure decryption.
    """
    try:
        # Get media record with ownership verification
        result = await db.execute(
            select(DiaryFile)
            .join(DiaryEntry)
            .where(
                and_(
                    DiaryFile.uuid == media_uuid,
                    DiaryEntry.created_by == current_user.uuid
                )
            )
        )
        media = result.scalar_one_or_none()
        if not media:
            raise HTTPException(status_code=404, detail="Media file not found")

        # Get file path
        from pathlib import Path
        file_path = Path(media.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Media file not found on disk")

        # Decrypt and return file
        decrypted_content, original_extension = await diary_crypto_service.decrypt_media_file(
            media_uuid=media_uuid,
            file_path=file_path,
            user_uuid=current_user.uuid
        )

        # Determine filename and media type
        original_filename = media.original_name or f"media_{media_uuid}"
        if original_extension and not original_filename.endswith(f".{original_extension}"):
            original_filename += f".{original_extension}"

        # Create temporary file for download
        import tempfile
        from fastapi.responses import FileResponse

        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_file.write(decrypted_content)
            temp_file_path = temp_file.name

        try:
            # Determine media type
            media_type = media.mime_type
            if not media_type or media_type == "application/octet-stream":
                # Simple media type detection based on extension
                extension_map = {
                    "jpg": "image/jpeg",
                    "jpeg": "image/jpeg",
                    "png": "image/png",
                    "gif": "image/gif",
                    "mp4": "video/mp4",
                    "mov": "video/quicktime",
                    "mp3": "audio/mpeg",
                    "wav": "audio/wav"
                }
                media_type = extension_map.get(original_extension.lower(), "application/octet-stream")

            response = FileResponse(
                path=temp_file_path,
                filename=original_filename,
                media_type=media_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{original_filename}"',
                    "X-File-Size": str(len(decrypted_content)),
                    "X-Module": "diary",
                    "X-Media-UUID": media_uuid,
                    "X-Original-Extension": original_extension
                }
            )

            logger.info(f"Diary media downloaded successfully: {original_filename}")
            return response

        finally:
            # Clean up temporary file asynchronously
            import asyncio
            asyncio.create_task(_cleanup_temp_file(temp_file_path))

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error downloading diary media")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download diary media: {str(e)}"
        )


@router.get("/{module}/{file_uuid}/info")
async def get_file_info(
    module: str,
    file_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get file metadata without downloading the actual file.

    Args:
        module: Module name ("documents", "notes", "archive")
        file_uuid: UUID of the file
        current_user: Authenticated user
        db: Database session

    Returns:
        File metadata dictionary
    """
    try:
        # Validate module
        if module not in ["documents", "notes", "archive", "diary"]:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported module: {module}. Supported modules: documents, notes, archive, diary"
            )

        return await unified_download_service.get_file_info(
            db=db,
            file_uuid=file_uuid,
            module=module,
            user_uuid=current_user.uuid
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting file info from {module}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get file info: {str(e)}"
        )


async def _cleanup_temp_file(temp_path: str) -> None:
    """Clean up temporary file after download response is sent."""
    try:
        import asyncio
        await asyncio.sleep(1)  # Give time for the file to be served
        from pathlib import Path
        Path(temp_path).unlink(missing_ok=True)
    except Exception as e:
        logger.warning(f"Failed to cleanup temporary file {temp_path}: {e}")


@router.get("/modules")
async def get_supported_modules():
    """
    Get list of supported download modules and their capabilities.
    """
    return {
        "modules": {
            "documents": {
                "name": "Documents",
                "description": "Document file downloads",
                "supports_encryption": False,
                "supported_formats": ["pdf", "doc", "docx", "txt", "image", "video", "audio"]
            },
            "notes": {
                "name": "Notes",
                "description": "Note file attachment downloads",
                "supports_encryption": False,
                "supported_formats": ["image", "pdf", "doc", "txt", "audio", "video"]
            },
            "archive": {
                "name": "Archive",
                "description": "Hierarchical archive file downloads",
                "supports_encryption": False,
                "supported_formats": ["*"]  # All file types supported
            },
            "diary": {
                "name": "Diary",
                "description": "Encrypted diary media downloads",
                "supports_encryption": True,
                "supported_formats": ["photo", "video", "voice"],
                "note": "Requires diary to be unlocked for decryption"
            }
        }
    }