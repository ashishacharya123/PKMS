"""
Notes Router with File Attachment Support
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Form, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, text, delete
from sqlalchemy.orm import selectinload
from app.schemas.note import NoteCreate, NoteUpdate, NoteResponse, NoteSummary, NoteFileResponse, CommitNoteFileRequest, ProjectBadge
from app.schemas.link import LinkResponse
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
import json
import logging
import uuid as uuid_lib

from app.database import get_db
from app.config import get_data_dir
from app.models.note import Note, NoteFile
from app.models.user import User
from app.models.tag import Tag
from app.models.tag_associations import note_tags
from app.models.link import Link
from app.models.todo import Project
from app.models.associations import note_projects
from app.auth.dependencies import get_current_user
from app.utils.security import sanitize_text_input, sanitize_tags
from app.services.chunk_service import chunk_manager
from app.services.file_detection import FileTypeDetectionService
from app.services.fts_service_enhanced import enhanced_fts_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["notes"])

# Initialize file type detection service
file_detector = FileTypeDetectionService()



# --- Helper Functions ---

async def _handle_note_tags(db: AsyncSession, note: Note, tag_names: List[str], user_id: int):
    """Handle note tag associations and update usage counts."""
    # Get existing tags for this note to track changes
    existing_tags_result = await db.execute(
        select(Tag).join(note_tags).where(
            and_(
                note_tags.c.note_uuid == note.uuid,
                Tag.user_id == user_id
            )
        )
    )
    existing_tags = existing_tags_result.scalars().all()
    existing_tag_names = {tag.name for tag in existing_tags}
    new_tag_names = set(tag_names)
    
    # Decrement usage count for removed tags
    removed_tag_names = existing_tag_names - new_tag_names
    for existing_tag in existing_tags:
        if existing_tag.name in removed_tag_names:
            existing_tag.usage_count = max(0, existing_tag.usage_count - 1)
    
    # Clear existing tag associations
    await db.execute(
        delete(note_tags).where(note_tags.c.note_uuid == note.uuid)
    )
    
    if not tag_names:
        return

    for tag_name in tag_names:
        # Get or create tag with proper module_type
        result = await db.execute(
            select(Tag).where(
                and_(
                    Tag.name == tag_name,
                    Tag.user_id == user_id,
                    Tag.module_type == "notes"
                )
            )
        )
        tag = result.scalar_one_or_none()
        
        if not tag:
            # Create new tag with notes module_type
            tag = Tag(
                name=tag_name,
                user_id=user_id,
                module_type="notes",
                usage_count=1,
                color="#3b82f6"  # Blue color for note tags
            )
            db.add(tag)
            await db.flush()
        else:
            # Only increment usage count for newly added tags
            if tag_name not in existing_tag_names:
                tag.usage_count += 1
        
        # Create association
        await db.execute(
            note_tags.insert().values(
                note_uuid=note.uuid,
                tag_uuid=tag.uuid
            )
        )

async def _process_note_links(db: AsyncSession, note: Note, content: str, user_id: int):
    """Extract and process links from note content."""
    import re
    
    # SECURITY: Use safer URL pattern to prevent ReDoS attacks
    # Simplified pattern that avoids catastrophic backtracking
    url_pattern = r'https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:/[^\s]*)?'
    urls = re.findall(url_pattern, content)
    
    for url in urls:
        existing_link = await db.execute(
            select(Link).where(and_(Link.url == url, Link.user_id == user_id))
        )
        
        if not existing_link.scalar_one_or_none():
            link = Link(
                title=f"Link from note: {note.title}",
                url=url,
                description=f"Found in note '{note.title}'",
                user_id=user_id
            )
            db.add(link)

async def _get_note_with_relations(db: AsyncSession, note_uuid: str, user_id: int) -> NoteResponse:
    """Get note with all related data."""
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.tag_objs), selectinload(Note.files))
        .where(and_(Note.uuid == note_uuid, Note.user_id == user_id))
    )
    note = result.scalar_one_or_none()
    
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    
    # Build project badges
    project_badges = await _build_project_badges(db, note.id, note.is_exclusive_mode)
    
    return _convert_note_to_response(note, project_badges)



async def _handle_note_projects(db: AsyncSession, note: Note, project_ids: List[int], user_id: int):
    """Link note to projects via junction table.
    
    Verifies user owns all requested projects before linking.
    """
    # SECURITY: Verify user owns all requested projects
    if project_ids:
        result = await db.execute(
            select(Project.id).where(
                and_(
                    Project.id.in_(project_ids),
                    Project.user_id == user_id
                )
            )
        )
        owned_project_ids = {row[0] for row in result.fetchall()}
        
        # Check if any requested project IDs are not owned by user
        invalid_ids = set(project_ids) - owned_project_ids
        if invalid_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have access to project(s): {', '.join(map(str, invalid_ids))}"
            )
    
    # Clear existing project links
    await db.execute(
        delete(note_projects).where(note_projects.c.note_id == note.id)
    )
    
    # Add new project links (now verified)
    if project_ids:
        for project_id in project_ids:
            await db.execute(
                note_projects.insert().values(
                    note_id=note.id,
                    project_id=project_id,
                    project_name_snapshot=None  # Will be set on project deletion
                )
            )

async def _build_project_badges(db: AsyncSession, note_id: int, is_exclusive: bool) -> List[ProjectBadge]:
    """Build project badges from junction table (live projects and deleted snapshots)."""
    from sqlalchemy import select
    
    # Query junction table for this note
    result = await db.execute(
        select(
            note_projects.c.project_id,
            note_projects.c.project_name_snapshot
        ).where(note_projects.c.note_id == note_id)
    )
    
    badges = []
    for row in result:
        project_id = row.project_id
        snapshot_name = row.project_name_snapshot
        
        if project_id is not None:
            # Live project - fetch current details
            project_result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = project_result.scalar_one_or_none()
            if project:
                badges.append(ProjectBadge(
                    id=project.id,
                    name=project.name,
                    color=project.color,
                    is_exclusive=is_exclusive,  # Note's exclusive mode applies to all its projects
                    is_deleted=False
                ))
        else:
            # Deleted project - use snapshot
            if snapshot_name:
                badges.append(ProjectBadge(
                    id=None,
                    name=snapshot_name,
                    color="#6c757d",  # Gray for deleted projects
                    is_exclusive=False,  # Was linked (survived deletion, so not exclusive)
                    is_deleted=True
                ))
    
    return badges

def _convert_note_to_response(note: Note, project_badges: Optional[List[ProjectBadge]] = None) -> NoteResponse:
    """Convert Note model to NoteResponse."""
    badges = project_badges or []
    return NoteResponse(
        id=note.id,
        uuid=note.uuid,
        title=note.title,
        content=note.content,
        file_count=note.file_count,
        is_favorite=note.is_favorite,
        is_archived=note.is_archived,
        is_exclusive_mode=note.is_exclusive_mode,
        created_at=note.created_at,
        updated_at=note.updated_at,
        tags=[t.name for t in note.tag_objs] if note.tag_objs else [],
        projects=badges
    )

# --- Note Endpoints ---

@router.get("/", response_model=List[NoteSummary])
async def list_notes(
    archived: bool = Query(False),
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    has_files: Optional[bool] = Query(None, description="Filter notes with file attachments"),
    is_favorite: Optional[bool] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List notes with filtering and pagination. Uses FTS5 for text search.
    
    Exclusive mode filtering:
    - Items with is_exclusive_mode=True are HIDDEN from main list (only in project dashboards)
    - Items with is_exclusive_mode=False are ALWAYS shown (linked mode)
    """
    
    if search:
        # Use FTS5 for full-text search
        fts_results = await enhanced_fts_service.search_all(db, search, current_user.id, content_types=["notes"], limit=limit, offset=offset)
        note_ids = [r["id"] for r in fts_results if r["type"] == "note"]
        if not note_ids:
            return []
        # Fetch notes by IDs, preserving FTS5 order
        query = select(Note).options(selectinload(Note.tag_objs)).where(
            and_(
                Note.user_id == current_user.id,
                Note.is_archived == archived,
                Note.id.in_(note_ids),
                Note.is_exclusive_mode == False  # Only show linked (non-exclusive) items
            )
        )
        if tag:
            query = query.join(Note.tag_objs).where(Tag.name == tag)
        if has_files is not None:
            query = query.where(Note.file_count > 0 if has_files else Note.file_count == 0)
        if is_favorite is not None:
            query = query.where(Note.is_favorite == is_favorite)
        result = await db.execute(query)
        notes = result.scalars().unique().all()
        # Order notes by FTS5 relevance
        notes_by_id = {n.id: n for n in notes}
        ordered_notes = [notes_by_id[nid] for nid in note_ids if nid in notes_by_id]
    else:
        # Fallback to regular query
        query = select(Note).options(selectinload(Note.tag_objs)).where(
            and_(
                Note.user_id == current_user.id,
                Note.is_archived == archived,
                Note.is_exclusive_mode == False  # Only show linked (non-exclusive) items
            )
        )
        if tag:
            query = query.join(Note.tag_objs).where(Tag.name == tag)
        if has_files is not None:
            query = query.where(Note.file_count > 0 if has_files else Note.file_count == 0)
        if is_favorite is not None:
            query = query.where(Note.is_favorite == is_favorite)
        query = query.order_by(Note.updated_at.desc()).offset(offset).limit(limit)
        result = await db.execute(query)
        ordered_notes = result.scalars().unique().all()
    summaries = []
    for note in ordered_notes:
        # SECURITY: Safe content preview with null check
        preview = ""
        if note.content:
            preview = note.content[:200] + "..." if len(note.content) > 200 else note.content
        project_badges = await _build_project_badges(db, note.id, note.is_exclusive_mode)
        summary = NoteSummary(
            id=note.id,
            uuid=note.uuid,
            title=note.title,
            file_count=note.file_count,
            is_favorite=note.is_favorite,
            is_archived=note.is_archived,
            is_exclusive_mode=note.is_exclusive_mode,
            created_at=note.created_at,
            updated_at=note.updated_at,
            tags=[t.name for t in note.tag_objs] if note.tag_objs else [],
            preview=preview,
            projects=project_badges
        )
        summaries.append(summary)
    return summaries

@router.post("/", response_model=NoteResponse)
async def create_note(
    note_data: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new note with optional project linkage."""
    try:
        # SECURITY: Sanitize user input to prevent XSS attacks
        sanitized_title = sanitize_text_input(note_data.title, 200)
        sanitized_content = sanitize_text_input(note_data.content, 100000)  # 100KB limit
        
        note = Note(
            title=sanitized_title,
            content=sanitized_content,
            is_exclusive_mode=note_data.is_exclusive_mode or False,
            user_id=current_user.id
        )
        db.add(note)
        await db.flush()
        
        # Handle tags
        if note_data.tags:
            # SECURITY: Sanitize tags to prevent XSS injection
            sanitized_tags = sanitize_tags(note_data.tags)
            await _handle_note_tags(db, note, sanitized_tags, current_user.id)
        
        # Handle projects
        if note_data.project_ids:
            await _handle_note_projects(db, note, note_data.project_ids, current_user.id)
        
        # Process links in content
        await _process_note_links(db, note, note_data.content, current_user.id)
        
        await db.commit()
        
        # Reload note with tags to avoid lazy loading issues in response conversion
        result = await db.execute(
            select(Note).options(selectinload(Note.tag_objs)).where(
                Note.id == note.id
            )
        )
        note_with_tags = result.scalar_one()
        
        # Build project badges
        project_badges = await _build_project_badges(db, note_with_tags.id, note_with_tags.is_exclusive_mode)
        
        return _convert_note_to_response(note_with_tags, project_badges)
    except Exception as e:
        await db.rollback()
        logger.exception("Error creating note")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create note: {str(e)}"
        )

@router.get("/{note_uuid}", response_model=NoteResponse)
async def get_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific note by UUID."""
    return await _get_note_with_relations(db, note_uuid, current_user.id)

@router.put("/{note_uuid}", response_model=NoteResponse)
async def update_note(
    note_uuid: str,
    note_data: NoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing note."""
    result = await db.execute(
        select(Note).options(selectinload(Note.tag_objs)).where(
            and_(Note.uuid == note_uuid, Note.user_id == current_user.id)
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    update_data = note_data.model_dump(exclude_unset=True)
    
    # Handle tags if provided
    if "tags" in update_data:
        # SECURITY: Sanitize tags to prevent XSS injection
        raw_tags = update_data.pop("tags")
        sanitized_tags = sanitize_tags(raw_tags)
        await _handle_note_tags(db, note, sanitized_tags, current_user.id)

    # Handle projects if provided
    if "project_ids" in update_data:
        await _handle_note_projects(db, note, update_data.pop("project_ids"), current_user.id)

    # SECURITY: Validate and sanitize update fields
    for key, value in update_data.items():
        if key in ['title', 'content'] and value is not None:
            if key == 'title':
                if not value or len(value.strip()) == 0:
                    raise HTTPException(status_code=400, detail="Title cannot be empty")
                value = sanitize_text_input(value, 200)
            elif key == 'content':
                value = sanitize_text_input(value, 100000)  # 100KB limit
        setattr(note, key, value)

    # Process links if content was updated
    if note_data.content:
        await _process_note_links(db, note, note_data.content, current_user.id)

    await db.commit()
    
    # Reload note with tags to avoid lazy loading issues in response conversion
    result = await db.execute(
        select(Note).options(selectinload(Note.tag_objs)).where(
            Note.id == note.id
        )
    )
    note_with_tags = result.scalar_one()
    
    # Build project badges
    project_badges = await _build_project_badges(db, note_with_tags.id, note_with_tags.is_exclusive_mode)
    
    return _convert_note_to_response(note_with_tags, project_badges)

@router.delete("/{note_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a note and its associated files."""
    result = await db.execute(
        select(Note).options(selectinload(Note.files), selectinload(Note.tag_objs)).where(
            and_(Note.uuid == note_uuid, Note.user_id == current_user.id)
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        logger.warning(f"Attempted to delete non-existent note with UUID: {note_uuid} for user: {current_user.id}")
        raise HTTPException(status_code=404, detail="Note not found")

    logger.info(f"Attempting to delete note with UUID: {note_uuid} for user: {current_user.id}")

    try:
        # Delete associated files from disk
        if note.files:
            logger.info(f"Deleting {len(note.files)} associated files for note UUID: {note_uuid}")
            for note_file in note.files:
                try:
                    file_path = get_data_dir() / note_file.file_path
                    if file_path.exists():
                        file_path.unlink()
                        logger.info(f"🗑️ Deleted note file: {file_path}")
                    else:
                        logger.warning(f"File not found, cannot delete: {file_path}")
                except Exception as e:
                    logger.error(f"⚠️ Could not delete file {note_file.file_path}: {e}")

        # Decrement tag usage counts BEFORE deleting note (associations will cascade)
        if note.tag_objs:
            logger.info(f"Decrementing usage count for {len(note.tag_objs)} tags")
            for tag in note.tag_objs:
                tag.usage_count = max(0, tag.usage_count - 1)
                logger.debug(f"Tag '{tag.name}' usage count: {tag.usage_count + 1} -> {tag.usage_count}")

        # Delete note (cascade will handle note_tags associations automatically)
        logger.info(f"Deleting note record with UUID: {note_uuid} from the database.")
        await db.delete(note)
        await db.commit()
        logger.info(f"✅ Successfully deleted note with UUID: {note_uuid}")
        
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Failed to delete note with UUID: {note_uuid}. Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete note due to an internal error: {str(e)}")

@router.patch("/{note_uuid}/archive", response_model=NoteResponse)
async def archive_note(
    note_uuid: str,
    archive: bool = True,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Archive or unarchive a note"""
    try:
        # Get note
        result = await db.execute(
            select(Note).where(and_(Note.uuid == note_uuid, Note.user_id == current_user.id))
        )
        note = result.scalar_one_or_none()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        
        # Update archive status
        note.is_archived = archive
        await db.commit()
        await db.refresh(note)
        
        action = "archived" if archive else "unarchived"
        logger.info(f"✅ Successfully {action} note '{note.title}' for user {current_user.username}")
        
        # Include project badges for consistency
        project_badges = await _build_project_badges(db, note.id, note.is_exclusive_mode)
        return _convert_note_to_response(note, project_badges)
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Error archiving note: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to archive note. Please try again."
        )

# --- File Attachment Endpoints ---

@router.get("/{note_uuid}/files", response_model=List[NoteFileResponse])
async def get_note_files(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all files attached to a note."""
    # First get the note to verify it exists and get the UUID
    note_result = await db.execute(
        select(Note).where(
            and_(Note.uuid == note_uuid, Note.user_id == current_user.id)
        )
    )
    note = note_result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Get files using note UUID
    files_result = await db.execute(
        select(NoteFile).where(NoteFile.note_uuid == note.uuid).order_by(NoteFile.created_at.desc())
    )
    files = files_result.scalars().all()
    
    return [
        NoteFileResponse(
            uuid=f.uuid,
            note_uuid=f.note_uuid,
            filename=f.filename,
            original_name=f.original_name,
            file_size=f.file_size,
            mime_type=f.mime_type,
            description=f.description,
            created_at=f.created_at
        )
        for f in files
    ]

@router.post("/files/upload/commit", response_model=NoteFileResponse)
async def commit_note_file_upload(
    payload: CommitNoteFileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Finalize a previously chunk-uploaded file and attach it to a note.
    
    Uses the core chunk upload service for efficient uploading.
    """
    try:
        logger.info(f"📎 Committing note file upload for note {payload.note_uuid}")
        
        # Check assembled file status
        status_obj = await chunk_manager.get_upload_status(payload.file_id)
        if not status_obj or status_obj.get("status") != "completed":
            raise HTTPException(status_code=400, detail="File not yet assembled")

        # Locate assembled file path
        temp_dir = Path(get_data_dir()) / "temp_uploads"
        assembled = next(temp_dir.glob(f"complete_{payload.file_id}_*"), None)
        if not assembled:
            raise HTTPException(status_code=404, detail="Assembled file not found")

        # Verify note exists and belongs to user
        note_result = await db.execute(
            select(Note).where(
                and_(Note.uuid == payload.note_uuid, Note.user_id == current_user.id)
            )
        )
        note = note_result.scalar_one_or_none()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        # Prepare destination directory
        files_dir = get_data_dir() / "assets" / "notes" / "files"
        files_dir.mkdir(parents=True, exist_ok=True)

        # Generate unique filename
        file_uuid = str(uuid_lib.uuid4())
        file_extension = assembled.suffix
        stored_filename = f"{file_uuid}{file_extension}"
        dest_path = files_dir / stored_filename

        # Move assembled file to final location
        assembled.rename(dest_path)

        # Get file info before database operations to avoid sync I/O in async context
        file_size = dest_path.stat().st_size
        file_path_relative = str(dest_path.relative_to(get_data_dir()))
        
        # Detect file type
        detection_result = await file_detector.detect_file_type(
            file_path=dest_path,
            file_content=None
        )

        # Create NoteFile record
        note_file = NoteFile(
            note_uuid=payload.note_uuid,
            user_id=current_user.id,
            filename=stored_filename,
            original_name=assembled.name,
            file_path=file_path_relative,
            file_size=file_size,
            mime_type=detection_result["mime_type"],
            description=payload.description
        )
        
        db.add(note_file)
        await db.flush()

        # Update note file count
        file_count_result = await db.execute(
            select(func.count(NoteFile.uuid)).where(NoteFile.note_uuid == payload.note_uuid)
        )
        new_file_count = file_count_result.scalar() or 0
        note.file_count = new_file_count

        await db.commit()
        await db.refresh(note_file)

        # Clean up temporary file tracking
        if payload.file_id in chunk_manager.uploads:
            del chunk_manager.uploads[payload.file_id]

        logger.info(f"✅ Note file committed successfully: {stored_filename}")
        
        return NoteFileResponse(
            uuid=note_file.uuid,
            note_uuid=note_file.note_uuid,
            filename=note_file.filename,
            original_name=note_file.original_name,
            file_size=note_file.file_size,
            mime_type=note_file.mime_type,
            description=note_file.description,
            created_at=note_file.created_at
        )
        
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Error committing note file upload: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to commit file upload"
        )

@router.get("/files/{file_uuid}/download")
async def download_note_file(
    file_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download a note file attachment."""
    result = await db.execute(
        select(NoteFile)
        .join(Note)
        .where(
            and_(
                NoteFile.uuid == file_uuid,
                Note.user_id == current_user.id
            )
        )
    )
    note_file = result.scalar_one_or_none()
    if not note_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = get_data_dir() / note_file.file_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    return FileResponse(
        path=str(file_path),
        filename=note_file.original_name,
        media_type=note_file.mime_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{note_file.original_name}\"",
            "X-File-Size": str(note_file.file_size)
        }
    )

@router.delete("/files/{file_uuid}")
async def delete_note_file(
    file_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a note file attachment."""
    result = await db.execute(
        select(NoteFile)
        .join(Note)
        .where(
            and_(
                NoteFile.uuid == file_uuid,
                Note.user_id == current_user.id
            )
        )
    )
    note_file = result.scalar_one_or_none()
    if not note_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    note_uuid = note_file.note_uuid
    
    # Delete the physical file
    try:
        file_path = get_data_dir() / note_file.file_path
        if file_path.exists():
            file_path.unlink()
            logger.info(f"🗑️ Deleted note file: {file_path}")
    except Exception as e:
        logger.warning(f"⚠️ Could not delete file {note_file.file_path}: {e}")
    
    # Delete the database record
    await db.delete(note_file)
    
    # Update note file count
    file_count_result = await db.execute(
        select(func.count(NoteFile.uuid)).where(NoteFile.note_uuid == note_uuid)
    )
    new_file_count = file_count_result.scalar() or 0
    
    note_result = await db.execute(select(Note).where(Note.uuid == note_uuid))
    note = note_result.scalar_one_or_none()
    if note:
        note.file_count = new_file_count
    
    await db.commit()
    
    return {"message": "File deleted successfully"}

@router.get("/{note_uuid}/links", response_model=List[LinkResponse])
async def get_note_links(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get links extracted from a note's content."""
    # Verify note exists and belongs to user
    note_result = await db.execute(
        select(Note.content).where(
            and_(Note.uuid == note_uuid, Note.user_id == current_user.id)
        )
    )
    note = note_result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Extract URLs from content
    import re
    url_pattern = r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
    urls = re.findall(url_pattern, note)
    
    # Get existing Link records for these URLs
    if urls:
        result = await db.execute(
            select(Link).where(
                and_(Link.url.in_(urls), Link.user_id == current_user.id)
            )
        )
        existing_links = result.scalars().all()
        return existing_links
    
    return [] 