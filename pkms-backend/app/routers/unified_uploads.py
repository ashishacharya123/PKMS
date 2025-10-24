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

from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any
import json
import io

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

# Allowed modules for file uploads
ALLOWED_UPLOAD_MODULES = {"documents", "notes", "diary", "archive"}

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/uploads", tags=["uploads"])


@router.post("/chunk")
async def upload_chunk(
    file: UploadFile = File(...),
    metadata: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """
    Handle chunked file uploads.
    
    This is the missing endpoint that the frontend coreUploadService.ts
    calls when uploading files in chunks. The frontend sends:
    - file: The chunk data
    - metadata: JSON string containing upload metadata
    
    Args:
        file: Uploaded file chunk
        metadata: JSON string with upload metadata
        current_user: Authenticated user
        
    Returns:
        Upload progress status
    """
    try:
        from app.services.chunk_service import chunk_manager
        
        # Parse metadata JSON with proper error chaining
        try:
            metadata_dict = json.loads(metadata)
        except json.JSONDecodeError as err:
            raise HTTPException(
                status_code=400,
                detail="Invalid metadata JSON format"
            ) from err

        # Extract and coerce required fields with type safety
        file_id = str(metadata_dict.get("file_id", "")).strip()
        filename = str(metadata_dict.get("filename", "")).strip()
        module = str(metadata_dict.get("module", "documents")).strip() or "documents"

        # Coerce numeric fields with error handling
        try:
            chunk_number = int(metadata_dict.get("chunk_number"))
            total_chunks = int(metadata_dict.get("total_chunks"))
            total_size = int(metadata_dict.get("total_size", 0))
        except (TypeError, ValueError) as err:
            raise HTTPException(
                status_code=400,
                detail="Invalid numeric fields in metadata (chunk_number, total_chunks, total_size must be integers)"
            ) from err

        # Validate module against whitelist
        if module not in ALLOWED_UPLOAD_MODULES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid module: {module}. Must be one of: {ALLOWED_UPLOAD_MODULES}"
            )

        # Validate field presence and ranges
        if not file_id or not filename:
            raise HTTPException(
                status_code=400,
                detail="Missing required fields: file_id and filename are required"
            )

        if total_chunks <= 0:
            raise HTTPException(
                status_code=400,
                detail="Invalid total_chunks: must be > 0"
            )

        if not (0 <= chunk_number < total_chunks):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid chunk_number: must be 0 <= chunk_number < total_chunks (got {chunk_number}, total: {total_chunks})"
            )

        if total_size < 0:
            raise HTTPException(
                status_code=400,
                detail="Invalid total_size: must be >= 0"
            )
        
        # Read chunk data as bytes and wrap in BytesIO for BinaryIO interface
        chunk_bytes = await file.read()
        chunk_data = io.BytesIO(chunk_bytes)

        # Save chunk via chunk manager
        await chunk_manager.save_chunk(
            file_id=file_id,
            chunk_number=chunk_number,
            chunk_data=chunk_data,
            metadata={
                "filename": filename,
                "total_size": total_size,
                "total_chunks": total_chunks,
                "module": module,
                "created_by": current_user.uuid,
                "mime_type": file.content_type or "application/octet-stream"
            }
        )
        
        # Check if all chunks received and auto-trigger assembly
        progress = await chunk_manager.get_progress(file_id)
        if progress and progress.get("chunks_completed", 0) >= total_chunks:
            # All chunks received, trigger assembly
            try:
                await chunk_manager.assemble_file(file_id)
            except Exception as e:
                logger.error(f"Failed to assemble file {file_id}: {str(e)}")
                # Don't raise here, let the status endpoint handle it
        
        # Return current progress
        return {
            "success": True,
            "file_id": file_id,
            "chunk_number": chunk_number,
            "progress": progress
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error handling chunk upload for file {metadata_dict.get('file_id', 'unknown')}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process chunk: {str(e)}"
        )


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