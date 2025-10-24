"""
Duplication Service - Advanced Project and Item Duplication

Handles both shallow copy (link existing items) and deep copy (create new independent items)
with user-controlled naming, error tracking, and proper dependency handling.
"""

import logging
from typing import Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from fastapi import HTTPException, status

from app.models.associations import project_items
from app.models.project import Project
from app.models.enums import TodoStatus
from app.schemas.project import ProjectDuplicateRequest, ProjectDuplicateResponse, ProjectCreate
from app.schemas.todo import TodoCreate
from app.schemas.note import NoteCreate
from app.services.project_service import project_service
from app.services.todo_crud_service import todo_crud_service
from app.services.note_crud_service import note_crud_service
from app.services.tag_service import tag_service
from app.services.search_service import search_service
from app.services.dashboard_service import dashboard_service
from app.models.associations import project_tags
from app.config import NEPAL_TZ
from datetime import datetime

logger = logging.getLogger(__name__)


class DuplicationService:
    """Advanced duplication service with shallow/deep copy support"""
    
    async def duplicate_project(
        self,
        db: AsyncSession,
        user_uuid: str,
        original_project_uuid: str,
        request: ProjectDuplicateRequest
    ) -> ProjectDuplicateResponse:
        """
        Orchestrates project duplication with shallow/deep copy support.
        
        Workflow:
        1. Validate original project exists
        2. Create new project with user-supplied name
        3. Copy tags from original
        4. Get all items from original via project_items
        5. Process each item based on duplication_mode
        6. Create new associations
        7. Commit and return response
        """
        errors = []
        items_copied = {"todos": 0, "notes": 0, "documents": 0}
        
        try:
            # 1. Validate original project exists
            try:
                original_project = await project_service.get_project(db, user_uuid, original_project_uuid)
            except HTTPException:
                raise HTTPException(status_code=404, detail="Original project not found")
            
            # 2. Create new project with user-supplied name
            project_create_data = ProjectCreate(
                name=request.new_project_name,
                description=request.description or original_project.description,
                status=original_project.status,
                priority=original_project.priority,
                start_date=original_project.start_date,
                due_date=original_project.due_date,
                tags=[]  # Will be copied separately
            )
            new_project_response = await project_service.create_project(db, user_uuid, project_create_data)
            new_project_uuid = new_project_response.uuid
            
            # 3. Copy tags from original project
            if original_project.tag_objs:
                tag_names = [tag.name for tag in original_project.tag_objs]
                await tag_service.handle_tags(
                    db, 
                    await db.get(Project, new_project_uuid), 
                    tag_names, 
                    user_uuid, 
                    None, 
                    project_tags
                )
            
            # 4. Get all items from original project via project_items
            original_items_result = await db.execute(
                select(
                    project_items.c.item_type,
                    project_items.c.item_uuid,
                    project_items.c.is_exclusive,
                    project_items.c.sort_order
                ).where(project_items.c.project_uuid == original_project_uuid)
            )
            original_items = original_items_result.all()
            
            # 5. Process each item based on duplication_mode
            for item_type, old_item_uuid, is_exclusive, sort_order in original_items:
                try:
                    new_item_uuid = None
                    
                    # Check if this item type should be included
                    should_include = False
                    if item_type == "Todo" and request.include_todos:
                        should_include = True
                    elif item_type == "Note" and request.include_notes:
                        should_include = True
                    elif item_type == "Document" and request.include_documents:
                        should_include = True
                    
                    if not should_include:
                        continue
                    
                    if request.duplication_mode == "shallow_link":
                        # Shallow copy: reuse existing item
                        new_item_uuid = old_item_uuid
                        
                    elif request.duplication_mode == "deep_copy":
                        # Deep copy: create new independent item
                        if item_type == "Todo":
                            new_item_uuid = await self._deep_copy_todo(
                                db, user_uuid, old_item_uuid, request.item_renames
                            )
                            items_copied["todos"] += 1
                            
                        elif item_type == "Note":
                            new_item_uuid = await self._deep_copy_note(
                                db, user_uuid, old_item_uuid, request.item_renames
                            )
                            items_copied["notes"] += 1
                            
                        elif item_type == "Document":
                            # Documents are always shallow-linked (hash-based deduplication)
                            new_item_uuid = old_item_uuid
                            items_copied["documents"] += 1
                    
                    # 6. Create new association
                    if new_item_uuid:
                        await db.execute(
                            project_items.insert().values(
                                project_uuid=new_project_uuid,
                                item_type=item_type,
                                item_uuid=new_item_uuid,
                                is_exclusive=is_exclusive,
                                sort_order=sort_order,
                                created_at=datetime.now(NEPAL_TZ),
                                updated_at=datetime.now(NEPAL_TZ)
                            )
                        )
                        
                except Exception as e:
                    error_msg = f"Failed to copy {item_type} {old_item_uuid}: {str(e)}"
                    errors.append(error_msg)
                    logger.error(error_msg)
                    # Continue with other items
            
            await db.commit()
            
            # Index new project in search
            await search_service.index_item(db, await db.get(Project, new_project_uuid), 'project')
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "project_duplicated")
            
            logger.info(f"Project duplicated: {original_project.name} -> {request.new_project_name}")
            
            return ProjectDuplicateResponse(
                original_uuid=original_project.uuid,
                duplicate_uuid=new_project_uuid,
                name=request.new_project_name,
                duplication_mode=request.duplication_mode,
                items_copied=items_copied,
                errors=errors
            )
            
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error duplicating project {original_project_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to duplicate project: {str(e)}"
            )
    
    async def _deep_copy_todo(
        self,
        db: AsyncSession,
        user_uuid: str,
        old_todo_uuid: str,
        renames: Dict[str, str]
    ) -> str:
        """
        Creates a new, independent Todo as a CLEAN PLACEHOLDER:
        - User-supplied name from renames dict (or original title)
        - Status reset to PENDING (fresh start)
        - NO dependencies (blocked_by_uuids=[])
        - Original description, priority, tags preserved
        
        Philosophy: Deep-copied todos are fresh starts, not exact replicas.
        Users can manually re-establish dependencies if needed.
        
        Returns: New todo UUID
        """
        try:
            # Get original todo
            original_todo = await todo_crud_service.get_todo(db, user_uuid, old_todo_uuid)
            
            # Check for user-supplied rename
            new_title = renames.get(old_todo_uuid, original_todo.title)
            
            # Create clean placeholder
            todo_create_data = TodoCreate(
                title=new_title,
                description=original_todo.description,
                priority=original_todo.priority,
                tags=original_todo.tags,
                blocked_by_uuids=[]  # NO dependencies - clean slate
            )
            
            # Use existing CRUD service
            new_todo = await todo_crud_service.create_todo(db, user_uuid, todo_create_data)
            return new_todo.uuid
            
        except Exception as e:
            logger.error(f"Failed to deep copy todo {old_todo_uuid}: {e}")
            raise
    
    async def _deep_copy_note(
        self,
        db: AsyncSession,
        user_uuid: str,
        old_note_uuid: str,
        renames: Dict[str, str]
    ) -> str:
        """
        Creates a new, independent Note with:
        - User-supplied name from renames dict (or original title)
        - Content duplicated (calls note_crud_service.create_note)
        - If large note, creates new content file automatically
        - Original tags
        
        Returns: New note UUID
        """
        try:
            # Get original note
            original_note = await note_crud_service.get_note_with_relations(db, old_note_uuid, user_uuid)
            
            # Check for user-supplied rename
            new_title = renames.get(old_note_uuid, original_note.title)
            
            # Create payload
            note_create_data = NoteCreate(
                title=new_title,
                content=original_note.content,  # The 'create_note' service will handle file/DB logic
                tags=original_note.tags,
                project_uuids=[]  # Will be associated by the main function
            )
            
            # Use existing CRUD service. This is perfect because it
            # already contains the logic to handle large content and create a new file.
            new_note = await note_crud_service.create_note(db, user_uuid, note_create_data)
            return new_note.uuid
            
        except Exception as e:
            logger.error(f"Failed to deep copy note {old_note_uuid}: {e}")
            raise


# Global instance
duplication_service = DuplicationService()
