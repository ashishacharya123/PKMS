"""
ProjectService - Centralized project management functionality

Handles:
- Project associations (linking items to projects)
- Project badge generation (for UI display)
- Project ownership verification
- Project snapshot management
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional, Type
from fastapi import HTTPException

from app.models.project import Project
from app.models.associations import note_projects, document_projects, todo_projects
from app.schemas.project import ProjectBadge


class ProjectService:
    """Centralized service for project-related operations"""

    async def handle_associations(
        self,
        db: AsyncSession,
        item: any,
        project_uuids: List[str],
        user_id: int,
        association_table: Type,
        item_uuid_field: str
    ):
        """
        Handle project associations for any content item.
        
        Args:
            db: Database session
            item: The content item (note, document, todo)
            project_uuids: List of project UUIDs to associate
            user_id: User ID for ownership verification
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
                    Project.user_uuid == user_id
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
                    id=project.id,
                    name=project.name,
                    color=project.color,
                    is_deleted=False,
                    is_exclusive=is_exclusive
                )
            elif project_name_snapshot:
                # Deleted project snapshot
                badge = ProjectBadge(
                    id=None,  # Use None for deleted projects
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
        from app.models.todo import Todo
        
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
                Todo.status == 'done'
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
            user_uuid=user_uuid
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
                    Project.user_uuid == user_uuid
                )
            )
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Update all associated items to use snapshots
        # This preserves the project information even after deletion
        for table, item_uuid_field in [
            (note_projects, "note_uuid"),
            (document_projects, "document_uuid"),
            (todo_projects, "todo_uuid")
        ]:
            await db.execute(
                table.update().where(
                    table.c.project_uuid == project_uuid
                ).values(
                    project_uuid=None,
                    project_name_snapshot=project.name
                )
            )

        # Delete the project
        await db.delete(project)


# Create singleton instance
project_service = ProjectService()
