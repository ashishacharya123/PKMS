"""
ProjectService - Centralized project management functionality

Handles:
- Project associations (linking items to projects)
- Project badge generation (for UI display)
- Project ownership verification
- Project snapshot management
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_, func, update
from sqlalchemy.orm import selectinload
from typing import List, Optional, Type
from fastapi import HTTPException
from pathlib import Path
import logging

# Set up logger
logger = logging.getLogger(__name__)

from app.models.project import Project
from app.models.associations import note_projects, document_projects, todo_projects
from app.models.note import Note
from app.models.document import Document
from app.models.todo import Todo
from app.schemas.project import ProjectBadge
from app.services.tag_service import tag_service
from app.services.search_service import search_service
from app.config import get_file_storage_dir, get_data_dir


class ProjectService:
    """Centralized service for project-related operations"""

    async def handle_associations(
        self,
        db: AsyncSession,
        item: any,
        project_uuids: List[str],
        created_by: str,
        association_table: Type,
        item_uuid_field: str
    ):
        """
        Handle project associations for any content item.
        
        Args:
            db: Database session
            item: The content item (note, document, todo)
            project_uuids: List of project UUIDs to associate
            created_by: User UUID for ownership verification
            association_table: The junction table (note_projects, document_projects, todo_projects)
            item_uuid_field: The field name for the item UUID in the association table
        """
        if not project_uuids:
            # Clear all associations if no projects provided
            await db.execute(
                delete(association_table).where(
                    getattr(association_table.c, item_uuid_field) == item.uuid
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
                status_code=400,
                detail=f"Invalid or inaccessible project UUIDs: {list(invalid_uuids)}"
            )

        # Clear existing associations
        await db.execute(
            delete(association_table).where(
                getattr(association_table.c, item_uuid_field) == item.uuid
            )
        )

        # Create new associations
        for project_uuid in project_uuids:
            await db.execute(
                association_table.insert().values(
                    **{item_uuid_field: item.uuid, "project_uuid": project_uuid}
                )
            )

    async def build_badges(
        self,
        db: AsyncSession,
        item_uuid: str,
        is_exclusive: bool,
        association_table: Type,
        item_uuid_field: str
    ) -> List[ProjectBadge]:
        """
        Build project badges for any content item.
        
        Args:
            db: Database session
            item_uuid: The content item UUID
            is_exclusive: Whether the item is in exclusive mode
            association_table: The junction table (note_projects, document_projects, todo_projects)
            item_uuid_field: The field name for the item UUID in the association table
            
        Returns:
            List of ProjectBadge objects
        """
        # Query junction table for this item
        result = await db.execute(
            select(
                association_table.c.project_uuid,
                association_table.c.project_name_snapshot
            ).where(
                getattr(association_table.c, item_uuid_field) == item_uuid
            )
        )
        associations = result.fetchall()

        if not associations:
            return []

        badges = []
        project_uuids = [assoc[0] for assoc in associations if assoc[0] is not None]

        # Fetch live project details for non-snapshot associations
        if project_uuids:
            projects_result = await db.execute(
                select(Project).where(Project.uuid.in_(project_uuids))
            )
            live_projects = {p.uuid: p for p in projects_result.scalars().all()}
        else:
            live_projects = {}

        # Build badges from live projects and snapshots
        for project_uuid, project_name_snapshot in associations:
            if project_uuid and project_uuid in live_projects:
                # Live project
                project = live_projects[project_uuid]
                badge = ProjectBadge(
                    uuid=project.uuid,
                    name=project.name,
                    # color removed - project color field deleted
                    is_deleted=False,
                    is_exclusive=is_exclusive
                )
            elif project_name_snapshot:
                # Deleted project snapshot
                badge = ProjectBadge(
                    uuid=None,  # deleted/snapshotted project
                    name=project_name_snapshot,
                    is_deleted=True,
                    is_exclusive=is_exclusive
                )
            else:
                # Skip invalid associations
                continue

            badges.append(badge)

        return badges

    async def get_project_counts(
        self,
        db: AsyncSession,
        project_uuid: str
    ) -> tuple[int, int]:
        """
        Get todo counts for a project (total and completed).
        
        Args:
            db: Database session
            project_uuid: The project UUID
            
        Returns:
            Tuple of (total_count, completed_count)
        """
        from app.models.todo import Todo, TodoStatus
        
        # Get total count via junction table
        total_result = await db.execute(
            select(func.count(todo_projects.c.todo_uuid)).where(todo_projects.c.project_uuid == project_uuid)
        )
        total_count = total_result.scalar() or 0
        
        # Get completed count via junction table
        completed_result = await db.execute(
            select(func.count(todo_projects.c.todo_uuid))
            .join(Todo, Todo.uuid == todo_projects.c.todo_uuid)
            .where(and_(
                todo_projects.c.project_uuid == project_uuid,
                Todo.status == TodoStatus.DONE
            ))
        )
        completed_count = completed_result.scalar() or 0
        
        return total_count, completed_count

    async def create_project(
        self,
        db: AsyncSession,
        name: str,
        description: Optional[str],
        color: str,
        created_by: str
    ) -> Project:
        """
        Create a new project.
        
        Args:
            db: Database session
            name: Project name
            description: Project description
            color: Project color
            created_by: User UUID
            
        Returns:
            Created Project object
        """
        project = Project(
            name=name,
            description=description,
            color=color,
            created_by=created_by
        )
        db.add(project)
        await db.flush()
        return project

    async def delete_project(
        self,
        db: AsyncSession,
        project_uuid: str,
        created_by: str
    ):
        """
        Delete a project with proper cleanup.
        
        Args:
            db: Database session
            project_uuid: Project UUID to delete
            created_by: User UUID for ownership verification
        """
        # Verify ownership
        project_result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == created_by
                )
            )
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Step 1: Get exclusive items BEFORE nulling project_uuid
        # This preserves the project name for linked (non-exclusive) items
        # Get exclusive notes linked to this project
        exclusive_notes_result = await db.execute(
            select(Note)
            .options(selectinload(Note.files))
            .join(note_projects, Note.uuid == note_projects.c.note_uuid)
            .where(
                and_(
                    note_projects.c.project_uuid == project.uuid,
                    Note.is_exclusive_mode.is_(True)
                )
            )
        )
        exclusive_notes = exclusive_notes_result.scalars().all()
        for note in exclusive_notes:
            if note.files:
                base_dir = get_file_storage_dir().resolve()
                for note_file in note.files:
                    try:
                        resolved_path = self._resolve_path(note_file.file_path).resolve()
                        # Security Check: Prevent path traversal
                        if str(resolved_path).startswith(str(base_dir)):
                            if resolved_path.exists():
                                resolved_path.unlink()
                        else:
                            logger.warning(f"Skipping deletion of note file due to potential path traversal: {note_file.file_path}")
                    except Exception as e:
                        logger.warning(f"Failed to delete file for note {note.uuid}: {str(e)}")
            await search_service.remove_item(db, note.uuid)
            await tag_service.decrement_tags_on_delete(db, note)
            await db.delete(note)
        
        # Get exclusive documents linked to this project
        exclusive_docs_result = await db.execute(
            select(Document)
            .join(document_projects, Document.uuid == document_projects.c.document_uuid)
            .where(
                and_(
                    document_projects.c.project_uuid == project.uuid,
                    Document.is_exclusive_mode.is_(True)
                )
            )
        )
        exclusive_docs = exclusive_docs_result.scalars().all()
        for doc in exclusive_docs:
            if doc.file_path:
                base_dir = get_file_storage_dir().resolve()
                try:
                    resolved_path = self._resolve_path(doc.file_path).resolve()
                    # Security Check: Prevent path traversal
                    if str(resolved_path).startswith(str(base_dir)):
                        if resolved_path.exists():
                            resolved_path.unlink()
                    else:
                        logger.warning(f"Skipping deletion of document file due to potential path traversal: {doc.file_path}")
                except Exception as e:
                    logger.warning(f"Failed to delete file for document {doc.uuid}: {str(e)}")
            await search_service.remove_item(db, doc.uuid)
            await tag_service.decrement_tags_on_delete(db, doc)
            await db.delete(doc)
        
        # Get exclusive todos linked to this project
        exclusive_todos_result = await db.execute(
            select(Todo)
            .join(todo_projects, Todo.uuid == todo_projects.c.todo_uuid)
            .where(
                and_(
                    todo_projects.c.project_uuid == project.uuid,
                    Todo.is_exclusive_mode.is_(True)
                )
            )
        )
        exclusive_todos = exclusive_todos_result.scalars().all()
        for todo in exclusive_todos:
            await search_service.remove_item(db, todo.uuid)
            await tag_service.decrement_tags_on_delete(db, todo)
            await db.delete(todo)
        
        # Step 2: Snapshot project name in all junction records AFTER deleting exclusives
        # This preserves the project name for linked (non-exclusive) items
        for table in [note_projects, document_projects, todo_projects]:
            await db.execute(
                table.update()
                .where(table.c.project_uuid == project_uuid)
                .values(
                    project_uuid=None,
                    project_name_snapshot=project.name
                )
            )
        
        # Remove from search index BEFORE deleting project
        await search_service.remove_item(db, project_uuid)
        
        # Step 3: Soft delete the project by setting the is_deleted flag.
        # The project's status remains unchanged, preserving its state for historical reference.
        project.is_deleted = True
        db.add(project)
        await db.commit()

    def _resolve_path(self, p: str) -> Path:
        """Resolve DB-stored file path to an absolute path under data_dir when appropriate."""
        path = Path(p)
        if path.is_absolute():
            return path
        # allow leading "/" as virtual root under data_dir
        return (get_data_dir() / p.lstrip("/")).resolve()

    async def reorder_documents(
        self,
        db: AsyncSession,
        project_uuid: str,
        user_uuid: str,
        document_uuids: List[str],
        if_unmodified_since: Optional[str] = None
    ):
        """Reorder documents within a project (atomic)."""
        # Verify project ownership
        project_result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Optional optimistic locking
        if if_unmodified_since:
            from datetime import datetime
            try:
                since = datetime.fromisoformat(if_unmodified_since.replace('Z', '+00:00'))
                if project.updated_at <= since:
                    raise HTTPException(status_code=412, detail="Project was modified")
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid if_unmodified_since format")

        # Verify all documents exist and are linked to this project
        existing_result = await db.execute(
            select(document_projects.c.document_uuid)
            .where(document_projects.c.project_uuid == project_uuid)
        )
        existing_uuids = {row[0] for row in existing_result.fetchall()}

        if set(document_uuids) != existing_uuids:
            raise HTTPException(
                status_code=400,
                detail="Document list must match existing project documents exactly"
            )

        # Atomic reorder: update sort_order for all documents
        for idx, doc_uuid in enumerate(document_uuids):
            await db.execute(
                update(document_projects)
                .where(
                    and_(
                        document_projects.c.project_uuid == project_uuid,
                        document_projects.c.document_uuid == doc_uuid
                    )
                )
                .values(sort_order=idx)
            )

        # Update project timestamp
        project.updated_at = func.now()
        await db.commit()

    async def link_documents(
        self,
        db: AsyncSession,
        project_uuid: str,
        user_uuid: str,
        document_uuids: List[str]
    ):
        """Link existing documents to a project (append at end)."""
        # Verify project ownership
        project_result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Verify documents exist and user owns them
        docs_result = await db.execute(
            select(Document).where(
                and_(
                    Document.uuid.in_(document_uuids),
                    Document.created_by == user_uuid,
                    Document.is_deleted.is_(False)
                )
            )
        )
        owned_docs = {doc.uuid for doc in docs_result.scalars().all()}
        invalid_uuids = set(document_uuids) - owned_docs
        if invalid_uuids:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid or inaccessible document UUIDs: {list(invalid_uuids)}"
            )

        # Get current max sort_order
        max_order_result = await db.execute(
            select(func.max(document_projects.c.sort_order))
            .where(document_projects.c.project_uuid == project_uuid)
        )
        max_order = max_order_result.scalar() or -1

        # Link documents (skip if already linked)
        for idx, doc_uuid in enumerate(document_uuids):
            # Check if already linked
            existing_result = await db.execute(
                select(document_projects.c.id)
                .where(
                    and_(
                        document_projects.c.project_uuid == project_uuid,
                        document_projects.c.document_uuid == doc_uuid
                    )
                )
            )
            if existing_result.scalar_one_or_none():
                continue  # Skip already linked

            await db.execute(
                document_projects.insert().values(
                    project_uuid=project_uuid,
                    document_uuid=doc_uuid,
                    sort_order=max_order + 1 + idx
                )
            )

        await db.commit()

    async def unlink_document(
        self,
        db: AsyncSession,
        project_uuid: str,
        user_uuid: str,
        document_uuid: str
    ):
        """Unlink a document from a project."""
        # Verify project ownership
        project_result = await db.execute(
            select(Project).where(
                and_(
                    Project.uuid == project_uuid,
                    Project.created_by == user_uuid
                )
            )
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Remove association
        result = await db.execute(
            delete(document_projects).where(
                and_(
                    document_projects.c.project_uuid == project_uuid,
                    document_projects.c.document_uuid == document_uuid
                )
            )
        )

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Document not linked to project")

        await db.commit()

    # Preflight methods removed - use unified LinkCountService instead
    # See: app/services/link_count_service.py

    async def reorder_sections(
        self,
        db: AsyncSession,
        project_uuid: str,
        user_uuid: str,
        section_types: List[str]
    ):
        """Reorder sections within a project (atomic)."""
        # Verify project exists and user owns it
        project = await db.get(Project, project_uuid)
        if not project or project.created_by != user_uuid:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

        # Validate section types
        valid_types = {'documents', 'notes', 'todos'}
        if not all(section in valid_types for section in section_types):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid section type. Must be one of: {valid_types}")
        
        if len(section_types) != len(set(section_types)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Section types must be unique")

        # Delete existing section order
        from app.models.project import ProjectSectionOrder
        delete_query = delete(ProjectSectionOrder).where(
            ProjectSectionOrder.project_uuid == project_uuid
        )
        await db.execute(delete_query)

        # Insert new section order
        for sort_order, section_type in enumerate(section_types):
            new_section_order = ProjectSectionOrder(
                project_uuid=project_uuid,
                section_type=section_type,
                sort_order=sort_order
            )
            db.add(new_section_order)

        await db.commit()


# Create singleton instance
project_service = ProjectService()
