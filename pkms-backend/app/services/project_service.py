"""
Project Service - Unified Project Management

Handles all CRUD operations for projects including creation, reading, updating, deletion,
project management, item associations, and comprehensive project views.

Consolidates functionality from both project_crud_service.py and project_service.py
"""

import logging
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete, func, case, update
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from app.config import NEPAL_TZ
from app.models.project import Project, ProjectSectionOrder
from app.models.document import Document
from app.models.note import Note
from app.models.todo import Todo
from app.models.tag import Tag
from app.models.associations import project_items
from app.models.enums import TodoStatus
from app.models.tag_associations import project_tags
from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse, ProjectBadge, 
    ProjectSectionReorderRequest
)
from app.services.tag_service import tag_service
from app.services.search_service import search_service
from app.services.shared_utilities_service import shared_utilities_service

logger = logging.getLogger(__name__)


class ProjectService:
    """
    Unified service for handling all project operations including CRUD,
    project management, item associations, and comprehensive project views.
    """

    async def create_project(
        self, db: AsyncSession, user_uuid: str, project_data: ProjectCreate
    ) -> ProjectResponse:
        """Create a new project."""
        try:
            payload = project_data.model_dump()
            tags = payload.pop("tags", []) or []

            project = Project(**payload, created_by=user_uuid)
            db.add(project)
            await db.commit()
            await db.refresh(project)
            
            if tags:
                await tag_service.handle_tags(db, project, tags, user_uuid, None, project_tags)
            
            # Index in search and persist
            await search_service.index_item(db, project, 'project')
            await db.commit()
            
            # Invalidate dashboard cache
            
            logger.info(f"Project created: {project.name}")
            return self._convert_project_to_response(project, 0, 0)  # New project has 0 todos
            
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Error creating project")
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create project: {str(e)}"
            )

    async def list_projects(
        self,
        db: AsyncSession,
        user_uuid: str,
        archived: Optional[bool] = None,
        tag: Optional[str] = None,
    ) -> List[ProjectResponse]:
        """List all projects for the current user."""
        try:
            # Build base query
            query = select(Project).where(
                and_(
                    Project.active_only(),  # Auto-excludes soft-deleted
                    Project.created_by == user_uuid
                )
            )
            
            # Apply filters
            if archived is not None:
                query = query.where(Project.is_archived.is_(archived))
            
            if tag:
                query = query.join(project_tags).join(Tag).where(Tag.name == tag)
            
            # Execute query with eager loading for tags
            query = query.options(selectinload(Project.tag_objs))  # Eager load tags to avoid N+1
            result = await db.execute(query.order_by(Project.sort_order, Project.created_at.desc()))
            projects = result.scalars().all()
            
            # BATCH LOAD: Get all todo counts in a single query to avoid N+1
            project_uuids = [p.uuid for p in projects]
            todo_counts = await self._batch_get_project_counts(db, project_uuids, user_uuid)
            
            # Build responses
            responses = []
            for project in projects:
                todo_count, completed_count = todo_counts.get(project.uuid, (0, 0))
                responses.append(self._convert_project_to_response(project, todo_count, completed_count))
            
            return responses
            
        except Exception as e:
            logger.exception("Error listing projects")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list projects: {str(e)}"
            )

    async def list_deleted_projects(
        self,
        db: AsyncSession,
        user_uuid: str,
    ) -> List[ProjectResponse]:
        """List all soft-deleted projects for the current user."""
        try:
            # Build query for soft-deleted projects only
            query = select(Project).where(
                and_(
                    Project.deleted_only(),  # Only soft-deleted projects
                    Project.created_by == user_uuid
                )
            )
            
            # Execute query with eager loading for tags
            query = query.options(selectinload(Project.tag_objs))
            result = await db.execute(query.order_by(Project.updated_at.desc()))
            projects = result.scalars().all()
            
            # Build responses (no todo counts for deleted projects)
            responses = []
            for project in projects:
                responses.append(self._convert_project_to_response(project, 0, 0))
            
            return responses
            
        except Exception as e:
            logger.exception("Error listing deleted projects")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list deleted projects: {str(e)}"
            )

    async def get_project(
        self, db: AsyncSession, user_uuid: str, project_uuid: str
    ) -> ProjectResponse:
        """Get a specific project by UUID."""
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.active_only(),  # Auto-excludes soft-deleted
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        todo_count, completed_count = await self._get_project_counts(db, project.uuid, user_uuid)
        return self._convert_project_to_response(project, todo_count, completed_count)

    async def update_project(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, project_data: ProjectUpdate
    ) -> ProjectResponse:
        """Update project metadata and tags."""
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.active_only(),  # Auto-excludes soft-deleted
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        update_data = project_data.model_dump(exclude_unset=True)
        
        if "tags" in update_data:
            tags = update_data.pop("tags")
            await tag_service.handle_tags(db, project, tags, user_uuid, None, project_tags)

        # Update fields
        for key, value in update_data.items():
            setattr(project, key, value)
        
        await db.commit()
        await db.refresh(project)
        
        # Index in search and persist
        await search_service.index_item(db, project, 'project')
        await db.commit()
        
        # Invalidate dashboard cache
        
        todo_count, completed_count = await self._get_project_counts(db, project.uuid, user_uuid)
        return self._convert_project_to_response(project, todo_count, completed_count)

    async def soft_delete_project(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        project_uuid: str
    ):
        """
        Soft-deletes a project. SIMPLE operation - just set flag.
        No unlinking. Associations stay intact for easy restore.
        """
        # 1. Get project
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.active_only(),  # Auto-excludes soft-deleted
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        
        # 2. Set flag (that's it!)
        project.is_deleted = True
        project.updated_at = datetime.now(NEPAL_TZ)
        db.add(project)
        
        # 3. Commit
        await db.commit()
        
        # 4. Post-commit cleanup
        await search_service.remove_item(db, project_uuid)
        logger.info(f"Project soft-deleted: {project.name}")

    async def restore_project(self, db: AsyncSession, user_uuid: str, project_uuid: str):
        """
        Restores a soft-deleted project. SIMPLE operation.
        All associations are still intact, just flip the flag.
        """
        # 1. Get soft-deleted project
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.deleted_only(),  # Only soft-deleted
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deleted project not found")
        
        # 2. Flip flag
        project.is_deleted = False
        project.updated_at = datetime.now(NEPAL_TZ)
        db.add(project)
        
        # 3. Commit
        await db.commit()
        
        # 4. Re-index in search
        await search_service.index_item(db, project, 'project')
        logger.info(f"Project restored: {project.name}")

    async def permanent_delete_project(self, db: AsyncSession, user_uuid: str, project_uuid: str):
        """
        PERMANENTLY deletes a project. This is complex and destructive.
        1. Must be soft-deleted first
        2. Unlinks all children
        3. Checks each child for orphan status
        4. Hard-deletes orphaned children
        5. Hard-deletes the project
        """
        from app.services.association_counter_service import association_counter_service
        
        # 1. Get soft-deleted project
        project = await db.get(Project, project_uuid)
        if not project or project.created_by != user_uuid:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if not project.is_deleted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project must be soft-deleted first (move to Recycle Bin)")
        
        # 2. Get all children BEFORE unlinking
        children_result = await db.execute(
            select(project_items.c.item_type, project_items.c.item_uuid)
            .where(project_items.c.project_uuid == project_uuid)
        )
        children = children_result.all()
        
        # 3. Unlink all children (THIS IS THE KEY FIX)
        await db.execute(
            delete(project_items).where(project_items.c.project_uuid == project_uuid)
        )
        
        # 4. Check each child for orphan status and hard-delete if orphan
        for item_type, item_uuid in children:
            try:
                # Count remaining links AFTER unlinking
                link_count = await association_counter_service.get_item_link_count(db, item_type, item_uuid)
                
                if link_count == 0:
                    # It's an orphan - purge it
                    logger.info(f"Purging orphan {item_type} {item_uuid}")
                    
                    if item_type == 'Document':
                        from app.services.document_crud_service import document_crud_service
                        await document_crud_service.permanent_delete_document(db, user_uuid, item_uuid)
                    elif item_type == 'Note':
                        from app.services.note_crud_service import note_crud_service
                        await note_crud_service.hard_delete_note(db, user_uuid, item_uuid)
                    elif item_type == 'Todo':
                        from app.services.todo_crud_service import todo_crud_service
                        await todo_crud_service.hard_delete_todo(db, user_uuid, item_uuid)
                else:
                    logger.info(f"Preserving shared {item_type} {item_uuid} (still has {link_count} links)")
            except Exception:
                logger.exception("Error purging orphan %s %s", item_type, item_uuid)
                # Don't let one failure break the whole operation
        
        # 5. Hard delete the project itself
        await db.delete(project)
        await db.commit()
        
        logger.info(f"Project permanently deleted: {project.name}")

    # REMOVED: duplicate_project method - moved to dedicated DuplicationService
    # All project duplication logic now handled by app.services.duplication_service

    async def get_project_items(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, item_type: str
    ) -> Dict[str, Any]:
        """Get all items (documents, notes, todos) associated with a project using polymorphic project_items."""
        # Verify project exists and belongs to user
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.active_only(),  # Auto-excludes soft-deleted
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Map API item_type to database item_type
        item_type_map = {
            'documents': 'Document',
            'notes': 'Note',
            'todos': 'Todo'
        }
        
        db_item_type = item_type_map.get(item_type)
        if not db_item_type:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid item type")

        # Model mapping for polymorphic queries
        model_map = {
            'Document': Document,
            'Note': Note,
            'Todo': Todo
        }
        
        model_class = model_map[db_item_type]
        
        # Single query for all types using polymorphic project_items
        result = await db.execute(
            select(model_class)
            .join(project_items, model_class.uuid == project_items.c.item_uuid)
            .where(
                and_(
                    project_items.c.project_uuid == project_uuid,
                    project_items.c.item_type == db_item_type,
                    model_class.created_by == user_uuid,
                    model_class.is_deleted.is_(False)
                )
            )
            .order_by(project_items.c.sort_order)
        )
        items = result.scalars().all()
        
        # BATCH LOAD: Get all project badges in a single query to avoid N+1
        item_uuids = [item.uuid for item in items]
        project_badges_map = await shared_utilities_service.batch_get_project_badges_polymorphic(
            db, item_uuids, db_item_type
        )
        
        # Build responses
        responses = []
        for item in items:
            project_badges = project_badges_map.get(item.uuid, [])
            if db_item_type == 'Document':
                responses.append(self._convert_doc_to_response(item, project_badges))
            elif db_item_type == 'Note':
                responses.append(self._convert_note_to_response(item, project_badges))
            elif db_item_type == 'Todo':
                responses.append(self._convert_todo_to_response(item, project_badges))

        return {"items": responses, "count": len(responses)}

    async def reorder_project_items(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, item_type: str, item_uuids: List[str]
    ):
        """Reorder items within a project using polymorphic project_items."""
        # Verify project exists and belongs to user
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.active_only(),  # Auto-excludes soft-deleted
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Map API item_type to database item_type
        item_type_map = {
            'documents': 'Document',
            'notes': 'Note',
            'todos': 'Todo'
        }
        
        db_item_type = item_type_map.get(item_type)
        if not db_item_type:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid item type")

        # Update sort_order for each item
        for index, item_uuid in enumerate(item_uuids):
            await db.execute(
                update(project_items).where(
                    and_(
                        project_items.c.project_uuid == project_uuid,
                        project_items.c.item_uuid == item_uuid,
                        project_items.c.item_type == db_item_type
                    )
                ).values(sort_order=index, updated_at=datetime.now(NEPAL_TZ))
            )
        
        await db.commit()
        
        # Invalidate dashboard cache

    async def link_items_to_project(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, item_type: str, item_uuids: List[str],
        is_exclusive: bool = False
    ):
        """Link existing items to a project using polymorphic project_items."""
        # Verify project exists and belongs to user
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.active_only(),  # Auto-excludes soft-deleted
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Map API item_type to database item_type
        item_type_map = {
            'documents': 'Document',
            'notes': 'Note',
            'todos': 'Todo'
        }
        
        db_item_type = item_type_map.get(item_type)
        if not db_item_type:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid item type")

        # Model mapping for validation
        model_map = {
            'Document': Document,
            'Note': Note,
            'Todo': Todo
        }
        
        model_class = model_map[db_item_type]

        # Get current max sort_order for this project and item type
        max_order_result = await db.execute(
            select(func.max(project_items.c.sort_order)).where(
                and_(
                    project_items.c.project_uuid == project_uuid,
                    project_items.c.item_type == db_item_type
                )
            )
        )
        max_order = max_order_result.scalar() or -1

        # Link each item
        for index, item_uuid in enumerate(item_uuids):
            # Verify item exists and belongs to user
            item_result = await db.execute(
                select(model_class).where(
                    and_(
                        model_class.uuid == item_uuid,
                        model_class.created_by == user_uuid,
                        model_class.is_deleted.is_(False)
                    )
                )
            )
            if not item_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, 
                    detail=f"{db_item_type} {item_uuid} not found"
                )
            
            # Insert association
            await db.execute(
                project_items.insert().values(
                    project_uuid=project_uuid,
                    item_type=db_item_type,
                    item_uuid=item_uuid,
                    sort_order=max_order + index + 1,
                    is_exclusive=is_exclusive,  # Use parameter instead of hardcoded False
                    created_at=datetime.now(NEPAL_TZ),
                    updated_at=datetime.now(NEPAL_TZ)
                )
            )
        
        await db.commit()
        
        # Invalidate dashboard cache

    async def unlink_item_from_project(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, item_type: str, item_uuid: str
    ):
        """Unlink an item from a project using polymorphic project_items."""
        # Verify project exists and belongs to user
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.active_only(),  # Auto-excludes soft-deleted
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Map API item_type to database item_type
        item_type_map = {
            'documents': 'Document',
            'notes': 'Note',
            'todos': 'Todo'
        }
        
        db_item_type = item_type_map.get(item_type)
        if not db_item_type:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid item type")

        # Remove association
        await db.execute(
            delete(project_items).where(
                and_(
                    project_items.c.project_uuid == project_uuid,
                    project_items.c.item_uuid == item_uuid,
                    project_items.c.item_type == db_item_type
                )
            )
        )
        
        await db.commit()
        
        # Invalidate dashboard cache

    async def reorder_sections(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, reorder_data: ProjectSectionReorderRequest
    ):
        """Reorder sections within a project."""
        # Verify project exists and belongs to user
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.active_only(),  # Auto-excludes soft-deleted
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Update section order
        for index, section_type in enumerate(reorder_data.section_types):
            # Check if section order exists
            existing_result = await db.execute(
                select(ProjectSectionOrder).where(
                    and_(
                        ProjectSectionOrder.project_uuid == project_uuid,
                        ProjectSectionOrder.section_type == section_type
                    )
                )
            )
            existing = existing_result.scalar_one_or_none()
            
            if existing:
                # Update existing
                await db.execute(
                    ProjectSectionOrder.__table__.update().where(
                        and_(
                            ProjectSectionOrder.project_uuid == project_uuid,
                            ProjectSectionOrder.section_type == section_type
                        )
                    ).values(sort_order=index)
                )
            else:
                # Insert new
                await db.execute(
                    ProjectSectionOrder.__table__.insert().values(
                        project_uuid=project_uuid,
                        section_type=section_type,
                        sort_order=index
                    )
                )
        
        await db.commit()
        
        # Invalidate dashboard cache

    # ===== POLYMORPHIC ASSOCIATION METHODS =====

    async def handle_polymorphic_associations(
        self,
        db: AsyncSession,
        item: Any,
        project_uuids: List[str],
        created_by: str,
        association_table: Any,
        item_type: str,
        is_exclusive: bool = False
    ) -> None:
        """
        Handle polymorphic project associations using project_items table.
        
        Args:
            db: Database session
            item: The content item (note, document, todo)
            project_uuids: List of project UUIDs to associate
            created_by: User UUID for ownership verification
            association_table: The project_items table
            item_type: The type of item ('Note', 'Document', 'Todo')
            is_exclusive: Whether the association is exclusive
        """
        if not project_uuids:
            # Clear all associations if no projects provided
            await db.execute(
                delete(association_table).where(
                    and_(
                        association_table.c.item_type == item_type,
                        association_table.c.item_uuid == item.uuid
                    )
                )
            )
            return

        # Verify user owns all requested projects
        projects_result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid.in_(project_uuids),
                    Project.created_by == created_by
                )
            )
        )
        owned_projects = projects_result.scalars().all()
        owned_project_uuids = {p.uuid for p in owned_projects}

        # Check for invalid project UUIDs
        invalid_uuids = set(project_uuids) - owned_project_uuids
        if invalid_uuids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid project UUIDs: {list(invalid_uuids)}"
            )

        # Clear existing associations
        await db.execute(
            delete(association_table).where(
                and_(
                    association_table.c.item_type == item_type,
                    association_table.c.item_uuid == item.uuid
                )
            )
        )

        # Create new associations
        for project_uuid in project_uuids:
            await db.execute(
                association_table.insert().values(
                    project_uuid=project_uuid,
                    item_type=item_type,
                    item_uuid=item.uuid,
                    is_exclusive=is_exclusive,
                    sort_order=0,  # Default sort order
                    created_at=datetime.now(NEPAL_TZ),
                    updated_at=datetime.now(NEPAL_TZ)
                )
            )

    # REMOVED: build_badges method - legacy method no longer used
    # All badge loading now uses shared_utilities_service.batch_get_project_badges_polymorphic()

    async def get_project_counts(self, db: AsyncSession, project_uuid: str, user_uuid: str) -> Tuple[int, int]:
        """Get todo count and completed count for a project."""
        from app.services.dashboard_stats_service import dashboard_stats_service
        return await dashboard_stats_service.get_project_todo_counts(db, project_uuid, user_uuid)

    async def _batch_get_project_counts(self, db: AsyncSession, project_uuids: List[str], user_uuid: str) -> Dict[str, Tuple[int, int]]:
        """Batch load todo counts for multiple projects to avoid N+1 queries."""
        if not project_uuids:
            return {}
        
        # Single query to get all todo counts for all projects with proper filters and ownership validation
        result = await db.execute(
            select(
                project_items.c.project_uuid,
                func.count(project_items.c.item_uuid).label('total_count'),
                func.sum(case((Todo.status == TodoStatus.DONE, 1), else_=0)).label('completed_count')
            )
            .join(Todo, project_items.c.item_uuid == Todo.uuid)
            .join(Project, project_items.c.project_uuid == Project.uuid)
            .where(
                and_(
                    project_items.c.project_uuid.in_(project_uuids),
                    project_items.c.item_type == 'Todo',
                    Project.created_by == user_uuid,  # Ownership validation
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False)
                )
            )
            .group_by(project_items.c.project_uuid)
        )
        
        counts = {}
        for row in result.all():
            project_uuid = row.project_uuid
            total_count = row.total_count or 0
            completed_count = row.completed_count or 0
            counts[project_uuid] = (total_count, completed_count)
        
        # Fill in zeros for projects with no todos
        for project_uuid in project_uuids:
            if project_uuid not in counts:
                counts[project_uuid] = (0, 0)
        
        return counts

    # ===== RESPONSE CONVERSION METHODS =====

    def _convert_project_to_response(
        self, project: Project, todo_count: int = 0, completed_count: int = 0
    ) -> ProjectResponse:
        """Convert Project model to ProjectResponse with todo counts."""
        return ProjectResponse(
            uuid=project.uuid,
            name=project.name,
            description=project.description,
            sort_order=project.sort_order,
            status=project.status,
            priority=project.priority,
            is_archived=project.is_archived,
            is_favorite=project.is_favorite,
            is_deleted=project.is_deleted,
            progress_percentage=project.progress_percentage,
            start_date=project.start_date,
            due_date=project.due_date,
            completion_date=project.completion_date,
            created_by=project.created_by,
            created_at=project.created_at,
            updated_at=project.updated_at,
            todo_count=todo_count,
            completed_count=completed_count,
            document_count=0,  # Will be calculated via project_items
            note_count=0,  # Will be calculated via project_items
            tag_count=len(project.tag_objs) if project.tag_objs else 0,
            actual_progress=0,  # Will be calculated
            days_remaining=None,  # Will be calculated
            tags=[t.name for t in project.tag_objs] if project.tag_objs else []
        )

    def _convert_doc_to_response(
        self, doc: Document, project_badges: Optional[List[ProjectBadge]] = None
    ) -> Dict[str, Any]:
        """Convert Document model to response format."""
        return {
            "uuid": doc.uuid,
            "title": doc.title,
            "description": doc.description,
            "filename": doc.filename,
            "mime_type": doc.mime_type,
            "file_size": doc.file_size,
            "is_archived": doc.is_archived,
            "is_favorite": doc.is_favorite,
            "created_at": doc.created_at,
            "updated_at": doc.updated_at,
            "projects": project_badges or []
        }

    def _convert_note_to_response(
        self, note: Note, project_badges: Optional[List[ProjectBadge]] = None
    ) -> Dict[str, Any]:
        """Convert Note model to response format."""
        return {
            "uuid": note.uuid,
            "title": note.title,
            "content": note.content,
            "is_archived": note.is_archived,
            "is_favorite": note.is_favorite,
            "created_at": note.created_at,
            "updated_at": note.updated_at,
            "projects": project_badges or []
        }

    def _convert_todo_to_response(
        self, todo: Todo, project_badges: Optional[List[ProjectBadge]] = None
    ) -> Dict[str, Any]:
        """Convert Todo model to response format."""
        return {
            "uuid": todo.uuid,
            "title": todo.title,
            "description": todo.description,
            "status": todo.status,
            "priority": todo.priority,
            "is_archived": todo.is_archived,
            "is_favorite": todo.is_favorite,
            "created_at": todo.created_at,
            "updated_at": todo.updated_at,
            "projects": project_badges or []
        }


# Global instance
project_service = ProjectService()
