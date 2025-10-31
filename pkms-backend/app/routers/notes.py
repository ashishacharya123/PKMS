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
from app.schemas.document import CommitDocumentUploadRequest as CommitNoteFileRequest, DocumentResponse
from app.services.note_crud_service import note_crud_service
from app.services.chunk_service import chunk_manager
from app.decorators.error_handler import handle_api_errors

logger = logging.getLogger(__name__)
router = APIRouter(tags=["notes"])
@router.post("/reserve")
async def reserve_note(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reserve a new note UUID and create a minimal owner-scoped row."""
    try:
        new_uuid = await note_crud_service.reserve_note(db, current_user.uuid)
        return {"uuid": new_uuid}
    except HTTPException:
        raise
    except Exception:
        logger.exception(f"Error reserving note for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reserve note"
        )



@router.get("/", response_model=List[NoteSummary])
@handle_api_errors("list notes")
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
    return await note_crud_service.list_notes(
        db, current_user.uuid, search, tags, is_favorite, is_template, template_uuid, project_uuid, limit, offset
    )


@router.post("/{note_uuid}/create-from-template")
@handle_api_errors("create note from template")
async def create_note_from_template(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new note from an existing template"""
    try:
        # Get the template note with relations to handle file-based content
        template_note = await note_crud_service.get_note_with_relations(db, note_uuid, current_user.uuid)
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
        
        # Load content from file if stored externally
        content = template_note.content
        if not content:
            # Content is in file storage, load it
            from app.services.note_crud_service import note_crud_service as service
            content = await service._load_note_content(db, note_uuid, current_user.uuid)
        
        # Create new note from template
        new_note_data = NoteCreate(
            title=template_note.title,
            content=content,
            description=template_note.description,
            tags=template_note.tags,
            is_template=False,
            from_template_id=note_uuid
        )
        
        return await note_crud_service.create_note(db, current_user.uuid, new_note_data)
        
    except HTTPException:
        raise


@router.post("/{note_uuid}/save-as-template")
@handle_api_errors("save note as template")
async def save_note_as_template(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Save an existing note as a template"""
    try:
        # Get the note with relations for consistency
        note = await note_crud_service.get_note_with_relations(db, note_uuid, current_user.uuid)
        if not note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Note not found"
            )
        
        # Update note to be a template
        await note_crud_service.update_note(
            db, current_user.uuid, note_uuid, NoteUpdate(is_template=True)
        )
        
        return {"message": "Note saved as template successfully"}
        
    except HTTPException:
        raise


@router.post("/", response_model=NoteResponse)
@handle_api_errors("create note")
async def create_note(
    note_data: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new note with content processing"""
    return await note_crud_service.create_note(db, current_user.uuid, note_data)


@router.get("/deleted", response_model=List[NoteSummary])
@handle_api_errors("list deleted notes")
async def list_deleted_notes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all soft-deleted notes for the current user."""
    return await note_crud_service.list_deleted_notes(db, current_user.uuid)


@router.get("/{note_uuid}", response_model=NoteResponse)
@handle_api_errors("get note")
async def get_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get single note with all related data"""
    return await note_crud_service.get_note_with_relations(db, note_uuid, current_user.uuid)


@router.put("/{note_uuid}", response_model=NoteResponse)
@handle_api_errors("update note")
async def update_note(
    note_uuid: str,
    update_data: NoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update note with content processing"""
    return await note_crud_service.update_note(db, current_user.uuid, note_uuid, update_data)


@router.delete("/{note_uuid}")
@handle_api_errors("delete note")
async def delete_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete note and all associated data"""
    await note_crud_service.delete_note(db, current_user.uuid, note_uuid)
    return {"message": "Note deleted successfully"}


@router.post("/{note_uuid}/restore")
@handle_api_errors("restore note")
async def restore_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Restore a soft-deleted note from Recycle Bin."""
    await note_crud_service.restore_note(db, current_user.uuid, note_uuid)
    return {"message": "Note restored successfully"}


@router.post("/{note_uuid}/archive")
@handle_api_errors("archive note")
async def archive_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Archive note (soft delete)"""
    await note_crud_service.archive_note(db, current_user.uuid, note_uuid)
    return {"message": "Note archived successfully"}

@router.delete("/{note_uuid}/permanent")
@handle_api_errors("hard delete note")
async def hard_delete_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete note (hard delete) - WARNING: Cannot be undone!"""
    await note_crud_service.hard_delete_note(db, current_user.uuid, note_uuid)
    return {"message": "Note permanently deleted"}


# Note file endpoints removed - file handling now done via Document + note_documents association
# Note file handling now done via Document + note_documents association
# Use document endpoints instead of note-specific file endpoints


@router.post("/{note_uuid}/files/upload")
@handle_api_errors("start file upload for note")
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
        # Let decorator capture generic exceptions
        raise e


@router.post("/{note_uuid}/files/commit", response_model=DocumentResponse)
@handle_api_errors("commit file upload for note")
async def commit_note_file_upload(
    note_uuid: str,
    commit_request: CommitNoteFileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Commit chunked file upload and attach to note"""
    from app.services.document_crud_service import document_crud_service
    return await document_crud_service.commit_document_upload(
        db=db,
        user_uuid=current_user.uuid,
        upload_request=commit_request,
        note_uuid=note_uuid
    )


@router.post("/{note_uuid}/duplicate", response_model=NoteResponse)
@handle_api_errors("duplicate note")
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


@router.get("/{note_uuid}/files", response_model=List[DocumentResponse])
@handle_api_errors("get note files")
async def get_note_files(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all files attached to a note"""
    return await note_crud_service.get_note_files(db, current_user.uuid, note_uuid)


@router.delete("/files/{file_uuid}")
@handle_api_errors("delete note file")
async def delete_note_file(
    file_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a file attached to a note"""
    from app.services.document_crud_service import document_crud_service
    await document_crud_service.delete_document(db, current_user.uuid, file_uuid)
    return {"message": "File deleted successfully"}

