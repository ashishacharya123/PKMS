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
from app.models.note import Note
# NoteFile model removed - notes now use Document + note_documents association
from app.models.tag import Tag
from app.models.tag_associations import note_tags
from app.models.project import Project
from app.models.associations import note_projects
from app.models.enums import ModuleType
from app.schemas.note import NoteCreate, NoteUpdate, NoteResponse, NoteSummary, NoteFileResponse, CommitNoteFileRequest
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
            
            # Create note
            note = Note(
                uuid=str(uuid_lib.uuid4()),
                title=sanitized_title,
                content=sanitized_content,
                is_favorite=note_data.is_favorite or False,
                is_project_exclusive=note_data.is_project_exclusive or False,
                created_by=user_uuid
            )
            
            db.add(note)
            await db.flush()  # Get the UUID
            
            # Handle tags
            if sanitized_tags:
                await tag_service.handle_tags(
                    db, note, sanitized_tags, user_uuid, ModuleType.NOTE, note_tags
                )
            
            # Handle project associations
            if note_data.project_uuids:
                await project_service.link_items_to_projects(
                    db, user_uuid, note_data.project_uuids, [note.uuid], note_projects, "note_uuid"
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
                # Join with note_projects to filter by project
                cond = and_(cond, Note.uuid.in_(
                    select(note_projects.c.note_uuid).where(
                        note_projects.c.project_uuid == project_uuid
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
            project_badges_map = await shared_utilities_service.batch_get_project_badges(db, note_uuids, note_projects, "note_uuid")
            
            # Convert to response format
            note_summaries = []
            for note in notes:
                project_badges = project_badges_map.get(note.uuid, [])
                
                note_summaries.append(NoteSummary(
                    uuid=note.uuid,
                    title=note.title,
                    content_preview=note.content[:200] + "..." if len(note.content) > 200 else note.content,
                    file_count=note.file_count,
                    is_favorite=note.is_favorite,
                    is_project_exclusive=note.is_project_exclusive,
                    tags=[tag.name for tag in note.tag_objs],
                    project_badges=project_badges,
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
                .options(selectinload(Note.tag_objs), selectinload(Note.files))
                .where(and_(Note.uuid == note_uuid, Note.created_by == user_uuid))
            )
            note = result.scalar_one_or_none()
            
            if not note:
                raise HTTPException(status_code=404, detail="Note not found")
            
            # OPTIMIZED: Use batch badge loading for single item to avoid N+1
            project_badges = await shared_utilities_service.batch_get_project_badges(
                db, [note.uuid], note_projects, "note_uuid"
            )
            project_badges = project_badges.get(note.uuid, [])
            
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
                note.content = sanitize_text_input(update_data.content)
                # Content processing removed - analysis was unused
            
            if update_data.is_favorite is not None:
                note.is_favorite = update_data.is_favorite
            
            if update_data.is_project_exclusive is not None:
                note.is_project_exclusive = update_data.is_project_exclusive
            
            # Handle tags
            if update_data.tags is not None:
                sanitized_tags = sanitize_tags(update_data.tags)
                await tag_service.handle_tags(
                    db, note, sanitized_tags, user_uuid, ModuleType.NOTE, note_tags
                )
            
            # Handle project associations
            if update_data.project_uuids is not None:
                # Remove existing associations
                await db.execute(
                    delete(note_projects).where(note_projects.c.note_uuid == note_uuid)
                )
                
                # Add new associations
                if update_data.project_uuids:
                    await project_service.link_items_to_projects(
                        db, user_uuid, update_data.project_uuids, [note.uuid], note_projects, "note_uuid"
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
            
            # Remove from search index
            await search_service.remove_item(db, note_uuid, 'note')
            
            # Delete note (cascade will handle files and associations)
            await db.execute(
                delete(Note).where(Note.uuid == note_uuid)
            )
            
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
            note.archived_at = datetime.utcnow()
            
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
    
    async def get_note_files(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        note_uuid: str
    ) -> List[NoteFileResponse]:
        """Get all files attached to a note"""
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
            
            # Get files
            result = await db.execute(
                select(NoteFile)
                .where(and_(NoteFile.note_uuid == note_uuid, NoteFile.is_deleted == False))
                .order_by(NoteFile.created_at.desc())
            )
            files = result.scalars().all()
            
            return [NoteFileResponse.from_orm(file) for file in files]
            
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Error getting files for note {note_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get note files: {str(e)}"
            )
    
    async def commit_note_file_upload(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        commit_request: CommitNoteFileRequest
    ) -> NoteFileResponse:
        """Commit chunked file upload and attach to note"""
        try:
            # Verify note ownership
            note_result = await db.execute(
                select(Note).where(
                    and_(Note.uuid == commit_request.note_uuid, Note.created_by == user_uuid)
                )
            )
            note = note_result.scalar_one_or_none()
            
            if not note:
                raise HTTPException(status_code=404, detail="Note not found")
            
            # Commit the upload using unified service
            commit_result = await unified_upload_service.commit_upload(
                db=db,
                upload_id=commit_request.upload_id,
                module="note",
                created_by=user_uuid,
                metadata={"note_uuid": commit_request.note_uuid}
            )
            
            if not commit_result:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Upload commit failed"
                )
            
            # Update note file count
            await shared_utilities_service.update_file_count(db, "note", commit_request.note_uuid)
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "note_file_uploaded")
            
            return NoteFileResponse.from_orm(commit_result)
            
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Error committing file upload for note {commit_request.note_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to commit file upload: {str(e)}"
            )
    
    async def delete_note_file(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        file_uuid: str
    ) -> None:
        """Delete a file attached to a note"""
        try:
            # Get file with note verification
            result = await db.execute(
                select(NoteFile)
                .join(Note, NoteFile.note_uuid == Note.uuid)
                .where(
                    and_(
                        NoteFile.uuid == file_uuid,
                        Note.created_by == user_uuid,
                        NoteFile.is_deleted == False
                    )
                )
            )
            file = result.scalar_one_or_none()
            
            if not file:
                raise HTTPException(status_code=404, detail="File not found")
            
            # Soft delete file
            file.is_deleted = True
            file.deleted_at = datetime.utcnow()
            
            # Update note file count
            await self._update_note_file_count(db, file.note_uuid)
            
            await db.commit()
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "note_file_deleted")
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error deleting file {file_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete file: {str(e)}"
            )
    
    
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
            is_project_exclusive=note.is_project_exclusive,
            tags=[tag.name for tag in note.tag_objs],
            project_badges=badges,
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


# Global instance
note_crud_service = NoteCRUDService()
