"""
Notes Router with File Attachment Support

Thin router that delegates all business logic to NoteCRUDService and NoteContentService.
Handles only HTTP concerns: request/response mapping, authentication, error handling.

Refactored to follow "thin router, thick service" architecture pattern.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import logging

from app.database import get_db
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.schemas.note import NoteCreate, NoteUpdate, NoteResponse, NoteSummary
from app.schemas.document import CommitDocumentUploadRequest as CommitNoteFileRequest
from app.services.note_crud_service import note_crud_service
from app.services.chunk_service import chunk_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["notes"])


@router.get("/", response_model=List[NoteSummary])
async def list_notes(
    search: Optional[str] = Query(None, description="Search term for note content"),
    tags: Optional[List[str]] = Query(None, description="Filter by tag names"),
    is_favorite: Optional[bool] = Query(None, description="Filter by favorite status"),
    is_template: Optional[bool] = Query(None, description="Filter by template status"),
    template_uuid: Optional[str] = Query(None, description="Filter notes created from specific template UUID"),
    project_uuid: Optional[str] = Query(None, description="Filter by project UUID"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of notes to return"),
    offset: int = Query(0, ge=0, description="Number of notes to skip"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List notes with filters and pagination"""
    try:
        return await note_crud_service.list_notes(
            db, current_user.uuid, search, tags, is_favorite, is_template, template_uuid, project_uuid, limit, offset
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing notes for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list notes: {str(e)}"
        )


@router.post("/{note_uuid}/create-from-template")
async def create_note_from_template(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new note from an existing template"""
    try:
        # Get the template note
        template_note = await note_crud_service.get_note(db, note_uuid, current_user.uuid)
        if not template_note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Template note not found"
            )
        
        if not template_note.is_template:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Note is not a template"
            )
        
        # Create new note from template
        new_note_data = NoteCreate(
            title=template_note.title,
            content=template_note.content,
            description=template_note.description,
            tags=template_note.tags,
            is_template=False,
            from_template_id=note_uuid
        )
        
        return await note_crud_service.create_note(db, new_note_data, current_user.uuid)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error creating note from template {note_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create note from template"
        )


@router.post("/{note_uuid}/save-as-template")
async def save_note_as_template(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Save an existing note as a template"""
    try:
        # Get the note
        note = await note_crud_service.get_note(db, note_uuid, current_user.uuid)
        if not note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Note not found"
            )
        
        # Update note to be a template
        await note_crud_service.update_note(
            db, note_uuid, current_user.uuid, NoteUpdate(is_template=True)
        )
        
        return {"message": "Note saved as template successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error saving note {note_uuid} as template for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save note as template"
        )


@router.post("/", response_model=NoteResponse)
async def create_note(
    note_data: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new note with content processing"""
    try:
        return await note_crud_service.create_note(db, current_user.uuid, note_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error creating note for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create note: {str(e)}"
        )


@router.get("/deleted", response_model=List[NoteSummary])
async def list_deleted_notes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all soft-deleted notes for the current user."""
    try:
        return await note_crud_service.list_deleted_notes(db, current_user.uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error listing deleted notes for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list deleted notes"
        ) from e


@router.get("/{note_uuid}", response_model=NoteResponse)
async def get_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get single note with all related data"""
    try:
        return await note_crud_service.get_note_with_relations(db, note_uuid, current_user.uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting note {note_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get note: {str(e)}"
        )


@router.put("/{note_uuid}", response_model=NoteResponse)
async def update_note(
    note_uuid: str,
    update_data: NoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update note with content processing"""
    try:
        return await note_crud_service.update_note(db, current_user.uuid, note_uuid, update_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating note {note_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update note: {str(e)}"
        )


@router.delete("/{note_uuid}")
async def delete_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete note and all associated data"""
    try:
        await note_crud_service.delete_note(db, current_user.uuid, note_uuid)
        return {"message": "Note deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting note {note_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete note: {str(e)}"
        )


@router.post("/{note_uuid}/restore")
async def restore_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Restore a soft-deleted note from Recycle Bin."""
    try:
        await note_crud_service.restore_note(db, current_user.uuid, note_uuid)
        return {"message": "Note restored successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error restoring note %s", note_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to restore note"
        ) from e


@router.post("/{note_uuid}/archive")
async def archive_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Archive note (soft delete)"""
    try:
        await note_crud_service.archive_note(db, current_user.uuid, note_uuid)
        return {"message": "Note archived successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error archiving note {note_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to archive note: {str(e)}"
        )

@router.delete("/{note_uuid}/permanent")
async def hard_delete_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete note (hard delete) - WARNING: Cannot be undone!"""
    try:
        await note_crud_service.hard_delete_note(db, current_user.uuid, note_uuid)
        return {"message": "Note permanently deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error permanently deleting note %s", note_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to permanently delete note"
        ) from e


# Note file endpoints removed - file handling now done via Document + note_documents association
# Note file handling now done via Document + note_documents association
# Use document endpoints instead of note-specific file endpoints


@router.post("/{note_uuid}/files/upload")
async def upload_note_file(
    note_uuid: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload files to a note using chunked upload"""
    try:
        # Start chunked upload for each file
        upload_ids = []
        for file in files:
            if not file.filename:
                continue
            
            # Start chunked upload
            upload_result = await chunk_manager.start_upload(
                filename=file.filename,
                file_size=getattr(file, "size", 0) or 0,
                user_uuid=current_user.uuid,
                module="note"
            )
            
            if upload_result["success"]:
                upload_ids.append(upload_result["upload_id"])
        
        return {
            "message": "Upload started successfully",
            "upload_ids": upload_ids,
            "instructions": "Use the upload_ids with the chunk upload endpoints to complete the upload"
        }
    except Exception as e:
        logger.exception(f"Error starting file upload for note {note_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start file upload: {str(e)}"
        )


@router.post("/{note_uuid}/files/commit", response_model=NoteResponse)
async def commit_note_file_upload(
    note_uuid: str,
    commit_request: CommitNoteFileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Commit chunked file upload and attach to note"""
    try:
        # Set the note_uuid in the commit request
        commit_request = commit_request.model_copy(update={"note_uuid": note_uuid})
        
        return await note_crud_service.commit_note_file_upload(
            db, current_user.uuid, commit_request
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error committing file upload for note %s", note_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to commit file upload"
        ) from e


@router.post("/{note_uuid}/duplicate", response_model=NoteResponse)
async def duplicate_note(
    note_uuid: str,
    new_title: Optional[str] = Query(None, description="Optional new title for the duplicated note"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Duplicate a single note.
    
    - Creates a new, independent note
    - Content duplicated (including large content files)
    - Original tags copied
    - Can optionally provide a new title
    """
    from app.services.duplication_service import duplication_service
    
    try:
        # Use the same _deep_copy_note helper from duplication_service
        renames = {note_uuid: new_title} if new_title else {}
        new_note_uuid = await duplication_service._deep_copy_note(
            db=db,
            user_uuid=current_user.uuid,
            old_note_uuid=note_uuid,
            renames=renames
        )
        
        # Return the new note
        return await note_crud_service.get_note_with_relations(db, new_note_uuid, current_user.uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error duplicating note {note_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to duplicate note: {str(e)}"
        )


@router.get("/{note_uuid}/files", response_model=List[NoteResponse])
async def get_note_files(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all files attached to a note"""
    try:
        return await note_crud_service.get_note_files(db, current_user.uuid, note_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting files for note {note_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get note files: {str(e)}"
        )


@router.delete("/files/{file_uuid}")
async def delete_note_file(
    file_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a file attached to a note"""
    try:
        await note_crud_service.delete_note_file(db, current_user.uuid, file_uuid)
        return {"message": "File deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting file {file_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete file: {str(e)}"
        )

