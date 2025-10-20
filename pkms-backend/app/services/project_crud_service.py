"""
Project CRUD Service

Handles all CRUD operations for projects including creation, reading, updating, deletion,
project management, item associations, and comprehensive project views.
"""

import logging
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, delete, func, case
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.config import NEPAL_TZ
from app.models.project import Project, ProjectSectionOrder
from app.models.document import Document
from app.models.note import Note
from app.models.todo import Todo
from app.models.tag import Tag
from app.models.associations import todo_projects, document_projects, note_projects
from app.models.enums import TodoStatus, TaskPriority
from app.models.tag_associations import project_tags
from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse, ProjectBadge, 
    ProjectDuplicateRequest, ProjectDuplicateResponse,
    ProjectDocumentsReorderRequest, ProjectDocumentsLinkRequest, ProjectDocumentUnlinkRequest,
    ProjectSectionReorderRequest
)
from app.services.tag_service import tag_service
from app.services.search_service import search_service
from app.services.dashboard_service import dashboard_service

logger = logging.getLogger(__name__)


class ProjectCRUDService:
    """
    Service for handling CRUD operations for projects, including project management,
    item associations, and comprehensive project views.
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
            dashboard_service.invalidate_user_cache(user_uuid, "project_created")
            
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
                    Project.created_by == user_uuid,
                    Project.is_deleted.is_(False)
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
            todo_counts = await self._batch_get_project_counts(db, project_uuids)
            
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

    async def get_project(
        self, db: AsyncSession, user_uuid: str, project_uuid: str
    ) -> ProjectResponse:
        """Get a specific project by UUID."""
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid,
                    Project.is_deleted.is_(False)
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        todo_count, completed_count = await self._get_project_counts(db, project.uuid)
        return self._convert_project_to_response(project, todo_count, completed_count)

    async def update_project(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, project_data: ProjectUpdate
    ) -> ProjectResponse:
        """Update project metadata and tags."""
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid,
                    Project.is_deleted.is_(False)
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
        dashboard_service.invalidate_user_cache(user_uuid, "project_updated")
        
        todo_count, completed_count = await self._get_project_counts(db, project.uuid)
        return self._convert_project_to_response(project, todo_count, completed_count)

    async def delete_project(self, db: AsyncSession, user_uuid: str, project_uuid: str):
        """Delete a project (soft delete)."""
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid,
                    Project.is_deleted.is_(False)
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Soft delete
        project.is_deleted = True
        project.updated_at = datetime.now(NEPAL_TZ)
        
        await db.commit()
        
        # Remove from search index
        await search_service.remove_item(db, project_uuid, 'project')
        
        # Invalidate dashboard cache
        dashboard_service.invalidate_user_cache(user_uuid, "project_deleted")
        
        logger.info(f"Project deleted: {project.name}")

    async def duplicate_project(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, duplicate_data: ProjectDuplicateRequest
    ) -> ProjectDuplicateResponse:
        """Duplicate a project with all its associations."""
        # Get original project
        result = await db.execute(
            select(Project).options(
                selectinload(Project.tag_objs),
                selectinload(Project.todos_multi),
                selectinload(Project.documents_multi),
                selectinload(Project.notes)
            ).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid,
                    Project.is_deleted.is_(False)
                )
            )
        )
        original_project = result.scalar_one_or_none()
        if not original_project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        try:
            # Create new project
            new_project_data = {
                "name": duplicate_data.name,
                "description": duplicate_data.description or original_project.description,
                "status": original_project.status,
                "priority": original_project.priority,
                "start_date": original_project.start_date,
                "end_date": original_project.end_date,
                "due_date": original_project.due_date,
                "created_by": user_uuid
            }
            
            new_project = Project(**new_project_data)
            db.add(new_project)
            await db.flush()  # Get UUID for associations
            
            # Copy tags
            if original_project.tag_objs:
                tag_names = [tag.name for tag in original_project.tag_objs]
                await tag_service.handle_tags(db, new_project, tag_names, user_uuid, None, project_tags)
            
            # Copy associations based on duplicate_data settings
            if duplicate_data.include_todos and original_project.todos_multi:
                for todo in original_project.todos_multi:
                    # Create association in todo_projects table
                    await db.execute(
                        todo_projects.insert().values(
                            todo_uuid=todo.uuid,
                            project_uuid=new_project.uuid,
                            sort_order=0,  # Default sort order
                            created_at=datetime.now(NEPAL_TZ),
                            updated_at=datetime.now(NEPAL_TZ)
                        )
                    )
            
            if duplicate_data.include_documents and original_project.documents_multi:
                for doc in original_project.documents_multi:
                    # Create association in document_projects table
                    await db.execute(
                        document_projects.insert().values(
                            document_uuid=doc.uuid,
                            project_uuid=new_project.uuid,
                            sort_order=0,  # Default sort order
                            created_at=datetime.now(NEPAL_TZ),
                            updated_at=datetime.now(NEPAL_TZ)
                        )
                    )
            
            if duplicate_data.include_notes and original_project.notes:
                for note in original_project.notes:
                    # Create association in note_projects table
                    await db.execute(
                        note_projects.insert().values(
                            note_uuid=note.uuid,
                            project_uuid=new_project.uuid,
                            sort_order=0,  # Default sort order
                            created_at=datetime.now(NEPAL_TZ),
                            updated_at=datetime.now(NEPAL_TZ)
                        )
                    )
            
            await db.commit()
            await db.refresh(new_project)
            
            # Index in search
            await search_service.index_item(db, new_project, 'project')
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "project_duplicated")
            
            logger.info(f"Project duplicated: {original_project.name} -> {new_project.name}")
            
            return ProjectDuplicateResponse(
                original_uuid=original_project.uuid,
                duplicate_uuid=new_project.uuid,
                name=new_project.name,
                items_copied={
                    "todos": len(original_project.todos_multi) if duplicate_data.include_todos else 0,
                    "documents": len(original_project.documents_multi) if duplicate_data.include_documents else 0,
                    "notes": len(original_project.notes) if duplicate_data.include_notes else 0,
                }
            )
            
        except Exception as e:
            logger.exception("Error duplicating project")
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to duplicate project: {str(e)}"
            )

    async def get_project_items(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, item_type: str
    ) -> Dict[str, Any]:
        """Get all items (documents, notes, todos) associated with a project."""
        # Verify project exists and belongs to user
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid,
                    Project.is_deleted.is_(False)
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        items = []
        
        if item_type == "documents":
            result = await db.execute(
                select(Document).join(document_projects).where(
                    and_(
                        document_projects.c.project_uuid == project_uuid,
                        Document.created_by == user_uuid
                    )
                ).order_by(document_projects.c.sort_order)
            )
            documents = result.scalars().all()
            
            # BATCH LOAD: Get all project badges in a single query to avoid N+1
            doc_uuids = [doc.uuid for doc in documents]
            project_badges_map = await self._batch_get_project_badges(db, doc_uuids, document_projects, "document_uuid")
            
            # Build project badges for each document
            for doc in documents:
                project_badges = project_badges_map.get(doc.uuid, [])
                items.append(self._convert_doc_to_response(doc, project_badges))
                
        elif item_type == "notes":
            result = await db.execute(
                select(Note).join(note_projects).where(
                    and_(
                        note_projects.c.project_uuid == project_uuid,
                        Note.created_by == user_uuid
                    )
                ).order_by(note_projects.c.sort_order)
            )
            notes = result.scalars().all()
            
            # BATCH LOAD: Get all project badges in a single query to avoid N+1
            note_uuids = [note.uuid for note in notes]
            project_badges_map = await self._batch_get_project_badges(db, note_uuids, note_projects, "note_uuid")
            
            # Build project badges for each note
            for note in notes:
                project_badges = project_badges_map.get(note.uuid, [])
                items.append(self._convert_note_to_response(note, project_badges))
                
        elif item_type == "todos":
            result = await db.execute(
                select(Todo).join(todo_projects).where(
                    and_(
                        todo_projects.c.project_uuid == project_uuid,
                        Todo.created_by == user_uuid
                    )
                ).order_by(todo_projects.c.sort_order)
            )
            todos = result.scalars().all()
            
            # BATCH LOAD: Get all project badges in a single query to avoid N+1
            todo_uuids = [todo.uuid for todo in todos]
            project_badges_map = await self._batch_get_project_badges(db, todo_uuids, todo_projects, "todo_uuid")
            
            # Build project badges for each todo
            for todo in todos:
                project_badges = project_badges_map.get(todo.uuid, [])
                items.append(self._convert_todo_to_response(todo, project_badges))
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid item type")

        return {"items": items, "count": len(items)}

    async def reorder_documents(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, reorder_data: ProjectDocumentsReorderRequest
    ):
        """Reorder documents within a project."""
        # Verify project exists and belongs to user
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid,
                    Project.is_deleted.is_(False)
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Update sort_order for each document
        for index, document_uuid in enumerate(reorder_data.document_uuids):
            await db.execute(
                document_projects.update().where(
                    and_(
                        document_projects.c.project_uuid == project_uuid,
                        document_projects.c.document_uuid == document_uuid
                    )
                ).values(sort_order=index, updated_at=datetime.now(NEPAL_TZ))
            )
        
        await db.commit()
        
        # Invalidate dashboard cache
        dashboard_service.invalidate_user_cache(user_uuid, "project_documents_reordered")

    async def link_documents_to_project(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, link_data: ProjectDocumentsLinkRequest
    ):
        """Link existing documents to a project."""
        # Verify project exists and belongs to user
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid,
                    Project.is_deleted.is_(False)
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Get current max sort_order for this project
        max_order_result = await db.execute(
            select(func.max(document_projects.c.sort_order)).where(
                document_projects.c.project_uuid == project_uuid
            )
        )
        max_order = max_order_result.scalar() or -1

        # Link each document
        for index, document_uuid in enumerate(link_data.document_uuids):
            # Verify document exists and belongs to user
            doc_result = await db.execute(
                select(Document).where(
                    and_(
                        Document.uuid == document_uuid,
                        Document.created_by == user_uuid
                    )
                )
            )
            if not doc_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, 
                    detail=f"Document {document_uuid} not found"
                )
            
            # Insert association
            await db.execute(
                document_projects.insert().values(
                    document_uuid=document_uuid,
                    project_uuid=project_uuid,
                    sort_order=max_order + index + 1,
                    created_at=datetime.now(NEPAL_TZ),
                    updated_at=datetime.now(NEPAL_TZ)
                )
            )
        
        await db.commit()
        
        # Invalidate dashboard cache
        dashboard_service.invalidate_user_cache(user_uuid, "project_documents_linked")

    async def unlink_document_from_project(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, unlink_data: ProjectDocumentUnlinkRequest
    ):
        """Unlink a document from a project."""
        # Verify project exists and belongs to user
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid,
                    Project.is_deleted.is_(False)
                )
            )
        )
        project = result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Remove association
        await db.execute(
            document_projects.delete().where(
                and_(
                    document_projects.c.project_uuid == project_uuid,
                    document_projects.c.document_uuid == unlink_data.document_uuid
                )
            )
        )
        
        await db.commit()
        
        # Invalidate dashboard cache
        dashboard_service.invalidate_user_cache(user_uuid, "project_document_unlinked")

    async def reorder_sections(
        self, db: AsyncSession, user_uuid: str, project_uuid: str, reorder_data: ProjectSectionReorderRequest
    ):
        """Reorder sections within a project."""
        # Verify project exists and belongs to user
        result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid,
                    Project.is_deleted.is_(False)
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
        dashboard_service.invalidate_user_cache(user_uuid, "project_sections_reordered")

    async def _get_project_counts(self, db: AsyncSession, project_uuid: str) -> Tuple[int, int]:
        """Get todo count and completed count for a project."""
        from app.services.dashboard_stats_service import dashboard_stats_service
        return await dashboard_stats_service.get_project_todo_counts(db, project_uuid)

    async def _batch_get_project_counts(self, db: AsyncSession, project_uuids: List[str]) -> Dict[str, Tuple[int, int]]:
        """Batch load todo counts for multiple projects to avoid N+1 queries."""
        if not project_uuids:
            return {}
        
        # Single query to get all todo counts for all projects
        result = await db.execute(
            select(
                todo_projects.c.project_uuid,
                func.count(todo_projects.c.todo_uuid).label('total_count'),
                func.sum(case((Todo.status == TodoStatus.COMPLETED, 1), else_=0)).label('completed_count')
            )
            .join(Todo, todo_projects.c.todo_uuid == Todo.uuid)
            .where(todo_projects.c.project_uuid.in_(project_uuids))
            .group_by(todo_projects.c.project_uuid)
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

    async def _batch_get_project_badges(
        self, db: AsyncSession, item_uuids: List[str], association_table, uuid_column: str
    ) -> Dict[str, List[ProjectBadge]]:
        """Batch load project badges for multiple items to avoid N+1 queries."""
        if not item_uuids:
            return {}
        
        # Single query to get all associations
        result = await db.execute(
            select(association_table)
            .where(getattr(association_table.c, uuid_column).in_(item_uuids))
        )
        associations = result.fetchall()
        
        # Collect all project UUIDs
        project_uuids = set()
        for assoc in associations:
            project_uuid = assoc._mapping["project_uuid"]
            if project_uuid:
                project_uuids.add(project_uuid)
        
        # Single query to get all projects
        projects = []
        if project_uuids:
            project_result = await db.execute(
                select(Project).where(Project.uuid.in_(project_uuids))
            )
            projects = project_result.scalars().all()
        
        # Create project lookup map
        project_map = {p.uuid: p for p in projects}
        
        # Group associations by item UUID
        associations_by_item: Dict[str, list] = {}
        for assoc in associations:
            item_uuid = assoc._mapping[uuid_column]
            if item_uuid not in associations_by_item:
                associations_by_item[item_uuid] = []
            associations_by_item[item_uuid].append(assoc)
        
        # Build project badges for each item
        badges_map = {}
        for item_uuid in item_uuids:
            item_associations = associations_by_item.get(item_uuid, [])
            project_badges = []
            
            for assoc in item_associations:
                project_uuid = assoc._mapping["project_uuid"]
                if project_uuid and project_uuid in project_map:
                    project = project_map[project_uuid]
                    project_badges.append(ProjectBadge(
                        uuid=project.uuid,
                        name=project.name,
                        is_exclusive=assoc._mapping.get("is_exclusive", False),
                        is_deleted=False
                    ))
                elif assoc._mapping.get("project_name_snapshot"):
                    # Deleted project (snapshot)
                    project_badges.append(ProjectBadge(
                        uuid=None,
                        name=assoc._mapping["project_name_snapshot"],
                        is_exclusive=assoc._mapping.get("is_exclusive", False),
                        is_deleted=True
                    ))
            
            badges_map[item_uuid] = project_badges
        
        return badges_map

    async def _build_document_project_badges(
        self, db: AsyncSession, document_uuid: str, is_exclusive_mode: bool
    ) -> List[ProjectBadge]:
        """Build project badges for a document."""
        from app.services.project_service import project_service
        return await project_service.build_badges(db, document_uuid, is_exclusive_mode, document_projects, "document_uuid")

    async def _build_note_project_badges(
        self, db: AsyncSession, note_uuid: str, is_exclusive_mode: bool
    ) -> List[ProjectBadge]:
        """Build project badges for a note."""
        from app.services.project_service import project_service
        return await project_service.build_badges(db, note_uuid, is_exclusive_mode, note_projects, "note_uuid")

    async def _build_todo_project_badges(
        self, db: AsyncSession, todo_uuid: str, is_exclusive_mode: bool
    ) -> List[ProjectBadge]:
        """Build project badges for a todo."""
        from app.services.project_service import project_service
        return await project_service.build_badges(db, todo_uuid, is_exclusive_mode, todo_projects, "todo_uuid")

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
            end_date=project.end_date,
            due_date=project.due_date,
            completion_date=project.completion_date,
            created_by=project.created_by,
            created_at=project.created_at,
            updated_at=project.updated_at,
            todo_count=todo_count,
            completed_count=completed_count,
            document_count=len(project.documents_multi) if project.documents_multi else 0,
            note_count=len(project.notes) if project.notes else 0,
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
            "upload_status": doc.upload_status,
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
project_crud_service = ProjectCRUDService()
