"""
ProjectService - Centralized project management functionality

Handles:
- Project associations (linking items to projects)
- Project badge generation (for UI display)
- Project ownership verification
- Project snapshot management
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_, func
from sqlalchemy.orm import selectinload
from typing import List, Optional, Type
from fastapi import HTTPException
from pathlib import Path

from app.models.project import Project
from app.models.associations import note_projects, document_projects, todo_projects
from app.models.note import Note
from app.models.document import Document
from app.models.todo import Todo
from app.schemas.document import ProjectBadge
from app.services.tag_service import tag_service
from app.services.search_service import search_service
from app.config import get_file_storage_dir


class ProjectService:
    """Centralized service for project-related operations"""

    async def handle_associations(
        self,
        db: AsyncSession,
        item: any,
        project_uuids: List[str],
        user_uuid: str,
        association_table: Type,
        item_uuid_field: str
    ):
        """
        Handle project associations for any content item.
        
        Args:
            db: Database session
            item: The content item (note, document, todo)
            project_uuids: List of project UUIDs to associate
            user_uuid: User UUID for ownership verification
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
                    Project.created_by == user_uuid
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
                    color=project.color,
                    is_deleted=False,
                    is_exclusive=is_exclusive
                )
            elif project_name_snapshot:
                # Deleted project snapshot
                badge = ProjectBadge(
                    uuid=None,  # Use None for deleted projects
                    name=project_name_snapshot,
                    color="#6c757d",  # Default gray for deleted projects
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
        user_uuid: str
    ) -> Project:
        """
        Create a new project.
        
        Args:
            db: Database session
            name: Project name
            description: Project description
            color: Project color
            user_id: User ID
            
        Returns:
            Created Project object
        """
        project = Project(
            name=name,
            description=description,
            color=color,
            created_by=user_uuid
        )
        db.add(project)
        await db.flush()
        return project

    async def delete_project(
        self,
        db: AsyncSession,
        project_uuid: str,
        user_uuid: str
    ):
        """
        Delete a project with proper cleanup.
        
        Args:
            db: Database session
            project_uuid: Project UUID to delete
            user_id: User ID for ownership verification
        """
        # Verify ownership
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

        # Step 1: Snapshot project name in all junction records BEFORE deletion
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

        # Step 2: Hard delete exclusive items and their associated files
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
                for note_file in note.files:
                    try:
                        file_path = get_file_storage_dir() / note_file.file_path
                        if file_path.exists():
                            file_path.unlink()
                    except Exception as e:
                        print(f"⚠️ Failed to delete file for note {note.uuid}: {str(e)}") # Using print for now
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
            if doc.file_path and Path(doc.file_path).exists():
                try:
                    Path(doc.file_path).unlink()
                except Exception as e:
                    print(f"⚠️ Failed to delete file for document {doc.uuid}: {str(e)}") # Using print for now
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
            await tag_service.decrement_tags_on_delete(db, todo)
            await db.delete(todo)
        
        # Remove from search index BEFORE deleting project
        await search_service.remove_item(db, project_uuid)
        
        # Step 3: Delete project (SET NULL will set project_uuid=NULL in junction tables)
        # Linked items (is_exclusive_mode=False) survive with project_name_snapshot
        await db.delete(project)


# Create singleton instance
project_service = ProjectService()
