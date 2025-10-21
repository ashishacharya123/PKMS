"""
Unified Upload Router for PKMS

This router provides a single, consistent endpoint for committing uploads
across all modules, replacing the individual upload commit endpoints
in documents.py, notes.py, archive.py, and diary.py routers.

Benefits:
- Single upload commit endpoint (/api/v1/uploads/commit)
- Consistent validation and error handling
- Reduced code duplication
- Easier to maintain and extend
"""

from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.services.unified_upload_service import unified_upload_service
from app.schemas.unified_upload import (
    BaseCommitUploadRequest,
    DocumentCommitUploadRequest,
    NoteCommitUploadRequest,
    ArchiveCommitUploadRequest,
    DiaryCommitUploadRequest,
    UnifiedCommitResponse,
    UploadStatusResponse
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/uploads", tags=["uploads"])


@router.post("/commit/{module}", response_model=UnifiedCommitResponse)
async def commit_unified_upload(
    module: str,
    request_data: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Unified upload commit endpoint for all modules.

    Args:
        module: Module name ("documents", "notes", "archive", "diary")
        request_data: Module-specific upload data
        current_user: Authenticated user
        db: Database session

    Returns:
        Unified commit response with file information
    """
    try:
        # Validate module
        if module not in ["documents", "notes", "archive", "diary"]:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported module: {module}. Supported modules: documents, notes, archive, diary"
            )

        # Convert to appropriate schema based on module
        if module == "documents":
            schema = DocumentCommitUploadRequest(**request_data)
        elif module == "notes":
            schema = NoteCommitUploadRequest(**request_data)
        elif module == "archive":
            schema = ArchiveCommitUploadRequest(**request_data)
        elif module == "diary":
            schema = DiaryCommitUploadRequest(**request_data)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported module: {module}")

        # Prepare metadata for unified service
        metadata = schema.model_dump()
        metadata["uuid"] = str(metadata.get("uuid", ""))  # Add UUID if not present
        metadata["original_name"] = metadata.get("original_name", "")
        metadata["mime_type"] = metadata.get("mime_type", "application/octet-stream")

        # Commit upload through unified service
        record = await unified_upload_service.commit_upload(
            db=db,
            upload_id=schema.file_id,
            module=module,
            created_by=current_user.uuid,
            metadata=metadata
        )

        # Prepare response
        response_data = {
            "success": True,
            "message": f"File successfully committed to {module}",
            "upload_id": schema.file_id,
            "file_uuid": record.uuid,
            "module": module
        }

        # Add module-specific UUID to response
        if module == "documents":
            response_data["document_uuid"] = record.uuid
        elif module == "notes":
            response_data["note_file_uuid"] = record.uuid
        elif module == "archive":
            response_data["archive_item_uuid"] = record.uuid
        elif module == "diary":
            response_data["diary_file_uuid"] = record.uuid

        return UnifiedCommitResponse(**response_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error committing upload to {module}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to commit upload: {str(e)}"
        )


@router.get("/status/{upload_id}", response_model=UploadStatusResponse)
async def get_upload_status(
    upload_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Check upload status for any upload ID.

    This endpoint is used by the frontend to track upload progress
    and determine when to call the commit endpoint.
    """
    try:
        from app.services.chunk_service import chunk_manager

        status_obj = await chunk_manager.get_upload_status(upload_id)
        
        # Check if upload exists
        if not status_obj:
            raise HTTPException(
                status_code=404,
                detail="Upload not found"
            )
        
        # Verify ownership
        if status_obj.get("created_by") != current_user.uuid:
            raise HTTPException(
                status_code=404,
                detail="Upload not found"
            )

        return UploadStatusResponse(
            upload_id=upload_id,
            status=str(status_obj.get("status", "unknown")),
            progress=status_obj.get("progress"),
            chunks_total=status_obj.get("chunks_total"),
            chunks_completed=status_obj.get("chunks_completed"),
            file_size=status_obj.get("file_size"),
            mime_type=status_obj.get("mime_type"),
            error=status_obj.get("error")
        )

    except Exception as e:
        logger.exception(f"Error getting upload status for {upload_id}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get upload status: {str(e)}"
        )


@router.delete("/cleanup/{upload_id}")
async def cleanup_upload(
    upload_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Clean up upload data for failed or completed uploads.

    This endpoint is used to clean up temporary files and data
    when uploads are cancelled or no longer needed.
    """
    try:
        from app.services.chunk_service import chunk_manager

        # First check if upload exists and verify ownership
        status_obj = await chunk_manager.get_upload_status(upload_id)
        
        if not status_obj:
            raise HTTPException(
                status_code=404,
                detail="Upload not found"
            )
        
        # Verify ownership
        if status_obj.get("created_by") != current_user.uuid:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to clean up this upload"
            )

        # Clean up the upload
        success = await chunk_manager.cleanup_upload(upload_id)
        
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to clean up upload"
            )

        return {
            "success": True,
            "message": f"Upload {upload_id} cleaned up successfully",
            "upload_id": upload_id
        }

    except Exception as e:
        logger.exception(f"Error cleaning up upload {upload_id}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to cleanup upload: {str(e)}"
        )


@router.get("/modules")
async def get_supported_modules():
    """
    Get list of supported upload modules and their capabilities.

    This endpoint helps the frontend understand what features
    are available for each module.
    """
    return {
        "modules": {
            "documents": {
                "name": "Documents",
                "description": "Document storage and management",
                "features": {
                    "title_field": True,
                    "description_field": True,
                    "tags": True,
                    "projects": True,
                    "file_types": ["pdf", "doc", "docx", "txt", "image", "video", "audio"]
                }
            },
            "notes": {
                "name": "Notes",
                "description": "Note file attachments",
                "features": {
                    "title_field": False,
                    "description_field": True,
                    "tags": True,
                    "projects": True,
                    "file_types": ["image", "pdf", "doc", "txt", "audio", "video"]
                }
            },
            "archive": {
                "name": "Archive",
                "description": "Hierarchical file organization",
                "features": {
                    "title_field": False,
                    "description_field": True,
                    "tags": True,
                    "projects": False,
                    "folders": True,
                    "file_types": ["*"]  # All file types supported
                }
            },
            "diary": {
                "name": "Diary",
                "description": "Encrypted personal journaling",
                "features": {
                    "title_field": False,
                    "description_field": True,
                    "tags": False,
                    "projects": False,
                    "encryption": True,
                    "media_types": ["photo", "video", "voice"]
                }
            }
        }
    }