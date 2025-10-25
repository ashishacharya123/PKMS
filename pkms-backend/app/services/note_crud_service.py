"""
Note CRUD Service

Handles all CRUD operations for notes including creation, reading, updating, deletion,
file operations integration, and search indexing.
"""

import logging
import re
import uuid as uuid_lib
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, delete
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from fastapi.responses import FileResponse

from app.config import get_file_storage_dir
from pathlib import Path
from app.models.note import Note
# NoteFile model removed - notes now use Document + note_documents association
from app.models.document import Document
from app.models.associations import note_documents, project_items
from app.models.tag import Tag
from app.models.tag_associations import note_tags
from app.models.project import Project
# REMOVED: note_projects import - now using polymorphic project_items
from app.models.enums import ModuleType
from app.schemas.note import NoteCreate, NoteUpdate, NoteResponse, NoteSummary, NoteFile
# NoteFile schemas removed - notes now use Document + note_documents association
from app.schemas.project import ProjectBadge
from app.utils.security import sanitize_text_input, sanitize_tags
from app.services.tag_service import tag_service
from app.services.project_service import project_service
from app.services.unified_upload_service import unified_upload_service
from app.services.search_service import search_service
from app.services.chunk_service import chunk_manager
from app.services.shared_utilities_service import shared_utilities_service
# Import dashboard cache invalidation function directly
from app.services.dashboard_service import dashboard_service

logger = logging.getLogger(__name__)


class NoteCRUDService:
    """Service for note CRUD operations and file management"""
    
    def __init__(self):
        pass
    
    def _get_note_content_path(self, user_uuid: str, note_uuid: str) -> Path:
        """Returns the standardized path for a large note's content file."""
        # Example: .../storage/USER_UUID/notes/NOTE_UUID.txt
        storage_dir = get_file_storage_dir()
        note_dir = storage_dir / user_uuid / "notes"
        note_dir.mkdir(parents=True, exist_ok=True)
        return note_dir / f"{note_uuid}.txt"

    async def _write_note_content_to_file(self, content: str, file_path: Path):
        """Asynchronously write string content to a file."""
        import aiofiles
        try:
            async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
                await f.write(content)
        except Exception as e:
            logger.error(f"Failed to write note content to {file_path}: {e}")
            raise

    async def _read_note_content_from_file(self, file_path: Path) -> str:
        """Asynchronously read string content from a file."""
        import aiofiles
        try:
            async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
                return await f.read()
        except FileNotFoundError:
            logger.warning(f"Note content file not found: {file_path}")
            return "[Content file not found]"
        except Exception as e:
            logger.error(f"Failed to read note content from {file_path}: {e}")
            return f"[Error reading content: {e}]"
    
    async def create_note(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        note_data: NoteCreate
    ) -> NoteResponse:
        """Create a new note with content processing and validation"""
        try:
            # Sanitize inputs
            sanitized_title = sanitize_text_input(note_data.title)
            sanitized_content = sanitize_text_input(note_data.content)
            sanitized_tags = sanitize_tags(note_data.tags) if note_data.tags else []
            
            # Create note with large content handling
            MAX_DB_CONTENT_SIZE = 5120  # 5KB threshold - keep it short and sweet
            content_size_bytes = len(sanitized_content.encode('utf-8'))
            
            note = Note(
                uuid=str(uuid_lib.uuid4()),
                title=sanitized_title,
                is_favorite=note_data.is_favorite or False,
                created_by=user_uuid,
                size_bytes=content_size_bytes  # Store the full size
            )
            
            if content_size_bytes > MAX_DB_CONTENT_SIZE or note_data.force_file_storage:
                # Content is large OR user wants file storage: save to file
                file_path = self._get_note_content_path(user_uuid, note.uuid)
                await self._write_note_content_to_file(sanitized_content, file_path)
                note.content_file_path = str(file_path.relative_to(get_file_storage_dir()))
                note.content = None  # Don't store in DB
            else:
                # Content is small: save to DB
                note.content = sanitized_content
                note.content_file_path = None
            
            db.add(note)
            await db.flush()  # Get the UUID
            
            # Handle tags
            if sanitized_tags:
                await tag_service.handle_tags(
                    db, note, sanitized_tags, user_uuid, ModuleType.NOTE, note_tags
                )
            
            # Handle project associations
            if note_data.project_uuids:
                await project_service.handle_polymorphic_associations(
                    db=db,
                    item=note,
                    project_uuids=note_data.project_uuids,
                    created_by=user_uuid,
                    association_table=project_items,
                    item_type='Note',
                    is_exclusive=note_data.are_projects_exclusive or False
                )
            
            # Content processing removed - analysis was unused
            
            # Index in search
            await search_service.index_item(db, note, 'note')
            
            await db.commit()
            await db.refresh(note)
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "note_created")
            
            # Get note with relations for response
            return await self.get_note_with_relations(db, note.uuid, user_uuid)
            
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error creating note for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create note: {str(e)}"
            )
    
    async def list_notes(
        self, 
        db: AsyncSession, 
        user_uuid: str,
        search: Optional[str] = None,
        tags: Optional[List[str]] = None,
        is_favorite: Optional[bool] = None,
        project_uuid: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[NoteSummary]:
        """List notes with filters and pagination"""
        try:
            # Build query conditions
            cond = and_(Note.created_by == user_uuid)
            
            if search:
                cond = and_(cond, or_(
                    Note.title.ilike(f"%{search}%"),
                    Note.content.ilike(f"%{search}%")
                ))
            
            if is_favorite is not None:
                cond = and_(cond, Note.is_favorite == is_favorite)
            
            if project_uuid:
                # Join with project_items to filter by project
                cond = and_(cond, Note.uuid.in_(
                    select(project_items.c.item_uuid).where(
                        and_(
                            project_items.c.project_uuid == project_uuid,
                            project_items.c.item_type == 'Note'
                        )
                    )
                ))
            
            # Execute query with eager loading for tags
            result = await db.execute(
                select(Note)
                .options(selectinload(Note.tag_objs))  # Eager load tags to avoid N+1
                .where(cond)
                .order_by(Note.updated_at.desc())
                .limit(limit)
                .offset(offset)
            )
            notes = result.scalars().all()
            
            # Filter by tags if specified
            if tags:
                notes = [note for note in notes if any(tag.name in tags for tag in note.tag_objs)]
            
            # BATCH LOAD: Get all project badges in a single query to avoid N+1
            note_uuids = [note.uuid for note in notes]
            project_badges_map = await shared_utilities_service.batch_get_project_badges_polymorphic(
                db, note_uuids, 'Note'
            )
            
            # Convert to response format
            note_summaries = []
            for note in notes:
                project_badges = project_badges_map.get(note.uuid, [])
                
                note_summaries.append(NoteSummary(
                    uuid=note.uuid,
                    title=note.title,
                    preview=self.extract_preview(note.content),
                    file_count=note.file_count,
                    is_favorite=note.is_favorite,
                    # REMOVED: is_project_exclusive - exclusivity now handled in project_items association
                    tags=[tag.name for tag in note.tag_objs],
                    projects=project_badges,
                    created_at=note.created_at,
                    updated_at=note.updated_at
                ))
            
            return note_summaries
            
        except Exception as e:
            logger.exception(f"Error listing notes for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list notes: {str(e)}"
            )
    
    async def get_note_with_relations(
        self, 
        db: AsyncSession, 
        note_uuid: str, 
        user_uuid: str
    ) -> NoteResponse:
        """Get note with all related data (tags, files, project badges)"""
        try:
            result = await db.execute(
                select(Note)
                .options(selectinload(Note.tag_objs), selectinload(Note.documents))
                .where(and_(Note.uuid == note_uuid, Note.created_by == user_uuid))
            )
            note = result.scalar_one_or_none()
            
            if not note:
                raise HTTPException(status_code=404, detail="Note not found")
            
            # Check if content is stored in a file
            if note.content_file_path:
                full_path = get_file_storage_dir() / note.content_file_path
                note.content = await self._read_note_content_from_file(full_path)
            
            # OPTIMIZED: Use batch badge loading for single item to avoid N+1
            project_badges_map = await shared_utilities_service.batch_get_project_badges_polymorphic(
                db, [note.uuid], 'Note'
            )
            project_badges = project_badges_map.get(note.uuid, [])
            
            return self._convert_note_to_response(note, project_badges)
            
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Error getting note {note_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get note: {str(e)}"
            )
    
    async def update_note(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        note_uuid: str, 
        update_data: NoteUpdate
    ) -> NoteResponse:
        """Update note with content processing and validation"""
        try:
            # Get existing note
            result = await db.execute(
                select(Note).where(
                    and_(Note.uuid == note_uuid, Note.created_by == user_uuid)
                )
            )
            note = result.scalar_one_or_none()
            
            if not note:
                raise HTTPException(status_code=404, detail="Note not found")
            
            # Update fields
            if update_data.title is not None:
                note.title = sanitize_text_input(update_data.title)
            
            if update_data.content is not None:
                sanitized_content = sanitize_text_input(update_data.content)
                content_size_bytes = len(sanitized_content.encode('utf-8'))
                note.size_bytes = content_size_bytes

                MAX_DB_CONTENT_SIZE = 5120  # 5KB threshold - keep it short and sweet

                if content_size_bytes > MAX_DB_CONTENT_SIZE or update_data.force_file_storage:
                    # Content is large OR user wants file storage: save to file
                    file_path = self._get_note_content_path(user_uuid, note_uuid)
                    await self._write_note_content_to_file(sanitized_content, file_path)
                    note.content_file_path = str(file_path.relative_to(get_file_storage_dir()))
                    note.content = None
                else:
                    # Content is small: save to DB
                    note.content = sanitized_content
                    # If it was previously file-based, delete the old file
                    if note.content_file_path:
                        old_file_path = get_file_storage_dir() / note.content_file_path
                        if old_file_path.exists():
                            old_file_path.unlink()  # Delete old file
                    note.content_file_path = None
            
            if update_data.is_favorite is not None:
                note.is_favorite = update_data.is_favorite
            
            # REMOVED: is_project_exclusive field - exclusivity now handled in project_items association
            
            # Handle tags
            if update_data.tags is not None:
                sanitized_tags = sanitize_tags(update_data.tags)
                await tag_service.handle_tags(
                    db, note, sanitized_tags, user_uuid, ModuleType.NOTE, note_tags
                )
            
            # Handle project associations
            if update_data.project_uuids is not None:
                await project_service.handle_polymorphic_associations(
                    db=db,
                    item=note,
                    project_uuids=update_data.project_uuids,
                    created_by=user_uuid,
                    association_table=project_items,
                    item_type='Note',
                    is_exclusive=update_data.are_projects_exclusive or False
                )
            
            # Update search index
            await search_service.index_item(db, note, 'note')
            
            await db.commit()
            await db.refresh(note)
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "note_updated")
            
            # Get updated note with relations
            return await self.get_note_with_relations(db, note.uuid, user_uuid)
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error updating note {note_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update note: {str(e)}"
            )
    
    async def delete_note(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        note_uuid: str
    ) -> None:
        """Delete note and all associated data"""
        try:
            # Get note to verify ownership
            result = await db.execute(
                select(Note).where(
                    and_(Note.uuid == note_uuid, Note.created_by == user_uuid)
                )
            )
            note = result.scalar_one_or_none()
            
            if not note:
                raise HTTPException(status_code=404, detail="Note not found")
            
            # Delete content file if it exists
            if note.content_file_path:
                full_path = get_file_storage_dir() / note.content_file_path
                if full_path.exists():
                    try:
                        full_path.unlink()
                    except Exception as e:
                        logger.warning(f"Could not delete note content file {full_path}: {e}")
            
            # Remove from search index
            await search_service.remove_item(db, note_uuid, 'note')
            
            # Soft delete note (consistent with other services)
            note.is_deleted = True
            await db.add(note)
            
            await db.commit()
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "note_deleted")
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error deleting note {note_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete note: {str(e)}"
            )
    
    async def archive_note(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        note_uuid: str
    ) -> None:
        """Archive note (soft delete)"""
        try:
            result = await db.execute(
                select(Note).where(
                    and_(Note.uuid == note_uuid, Note.created_by == user_uuid)
                )
            )
            note = result.scalar_one_or_none()
            
            if not note:
                raise HTTPException(status_code=404, detail="Note not found")
            
            # Soft delete by setting archived flag
            note.is_archived = True
            
            # Remove from search index
            await search_service.remove_item(db, note_uuid, 'note')
            
            await db.commit()
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "note_archived")
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error archiving note {note_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to archive note: {str(e)}"
            )
    
    async def get_note_documents(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        note_uuid: str
    ) -> List[Document]:
        """Get all documents attached to a note via note_documents association"""
        try:
            # Verify note ownership
            note_result = await db.execute(
                select(Note).where(
                    and_(Note.uuid == note_uuid, Note.created_by == user_uuid)
                )
            )
            note = note_result.scalar_one_or_none()
            
            if not note:
                raise HTTPException(status_code=404, detail="Note not found")
            
            # Get documents via note_documents association
            result = await db.execute(
                select(Document)
                .join(note_documents, Document.uuid == note_documents.c.document_uuid)
                .where(
                    and_(
                        note_documents.c.note_uuid == note_uuid,
                        Document.is_deleted == False
                    )
                )
                .order_by(note_documents.c.sort_order, Document.created_at.desc())
            )
            documents = result.scalars().all()
            
            return documents
            
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Error getting documents for note {note_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get note documents: {str(e)}"
            )
    
    # NoteFile methods removed - file handling now done via Document + note_documents association
    # Use unified upload service and document_crud_service for file operations
    
    # delete_note_file method removed - use document_crud_service.delete_document() instead
    
    
    def _convert_note_to_response(
        self, 
        note: Note, 
        project_badges: Optional[List[ProjectBadge]] = None
    ) -> NoteResponse:
        """Convert Note model to NoteResponse"""
        badges = project_badges or []
        return NoteResponse(
            uuid=note.uuid,
            title=note.title,
            content=note.content,
            file_count=note.file_count,
            thumbnail_path=note.thumbnail_path,
            is_favorite=note.is_favorite,
            # REMOVED: is_project_exclusive - exclusivity now handled in project_items association
            tags=[tag.name for tag in note.tag_objs],
            projects=badges,
            created_at=note.created_at,
            updated_at=note.updated_at
        )
    



    def extract_preview(self, content: str, max_length: int = 200) -> str:
        """
        Extract a clean preview of the content.
        
        Args:
            content: Original content
            max_length: Maximum length of preview
            
        Returns:
            Clean preview text
        """
        if not content:
            return ""
        
        # Remove extra whitespace
        clean_content = re.sub(r'\s+', ' ', content.strip())
        
        # Truncate if needed
        if len(clean_content) <= max_length:
            return clean_content
        
        # Find a good break point (word boundary)
        truncated = clean_content[:max_length]
        last_space = truncated.rfind(' ')
        
        if last_space > max_length * 0.8:  # Break at word if possible
            return truncated[:last_space] + "..."
        else:
            return truncated + "..."

    def validate_content_length(self, content: str) -> bool:
        """Simple content length validation (100KB limit)"""
        return len(content) <= 100000

    async def get_note_files(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        note_uuid: str
    ) -> List[NoteFile]:
        """Get all files attached to a note"""
        try:
            # Verify note ownership first
            note_result = await db.execute(
                select(Note).where(
                    and_(Note.uuid == note_uuid, Note.created_by == user_uuid)
                )
            )
            note = note_result.scalar_one_or_none()
            
            if not note:
                raise HTTPException(status_code=404, detail="Note not found")
            
            # Get all documents linked to this note
            result = await db.execute(
                select(Document, note_documents.c.is_exclusive, note_documents.c.sort_order)
                .join(note_documents, Document.uuid == note_documents.c.document_uuid)
                .where(
                    and_(
                        note_documents.c.note_uuid == note_uuid,
                        Document.is_deleted.is_(False)
                    )
                )
                .order_by(note_documents.c.sort_order)
            )
            documents = result.fetchall()
            
            return [
                NoteFile(
                    uuid=doc.uuid,
                    note_uuid=note_uuid,
                    filename=doc.filename,
                    original_name=doc.original_name,  # CamelCaseModel converts to originalName
                    file_size=doc.file_size,  # CamelCaseModel converts to fileSize
                    mime_type=doc.mime_type,  # CamelCaseModel converts to mimeType
                    description=doc.description,
                    is_deleted=doc.is_deleted,  # CamelCaseModel converts to isDeleted
                    created_at=doc.created_at.isoformat()  # CamelCaseModel converts to createdAt
                )
                for doc, is_exclusive, sort_order in documents
            ]
            
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Error getting files for note {note_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get note files: {str(e)}"
            )


# Global instance
note_crud_service = NoteCRUDService()
