"""
Shared Utilities Service

Consolidates common utility functions that were duplicated across multiple services.
This eliminates code duplication and provides a single source of truth for shared operations.
"""

import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, update
from sqlalchemy.orm import selectinload

from app.schemas.project import ProjectBadge
from app.models.project import Project
from app.models.note import Note
from app.models.document import Document
from app.models.associations import note_documents
from app.models.diary import DiaryEntry
from app.models.associations import document_diary

logger = logging.getLogger(__name__)


class SharedUtilitiesService:
    """
    Shared utility functions used across multiple services.
    
    Consolidates duplicated methods to eliminate code duplication and ensure consistency.
    """

    async def batch_get_project_badges(
        self, 
        db: AsyncSession, 
        item_uuids: List[str], 
        association_table, 
        uuid_column: str
    ) -> Dict[str, List[ProjectBadge]]:
        """
        Batch load project badges for multiple items to avoid N+1 queries.
        
        Args:
            db: Database session
            item_uuids: List of item UUIDs to get badges for
            association_table: SQLAlchemy table for the association (e.g., note_projects)
            uuid_column: Column name for the item UUID (e.g., 'note_uuid')
            
        Returns:
            Dictionary mapping item_uuid -> List[ProjectBadge]
        """
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
                        is_project_exclusive=assoc._mapping.get("is_project_exclusive", False),
                        is_deleted=False
                    ))
                elif assoc._mapping.get("project_name_snapshot"):
                    # Deleted project (snapshot)
                    project_badges.append(ProjectBadge(
                        uuid=None,
                        name=assoc._mapping["project_name_snapshot"],
                        is_project_exclusive=assoc._mapping.get("is_project_exclusive", False),
                        is_deleted=True
                    ))
            
            badges_map[item_uuid] = project_badges
        
        return badges_map

    async def update_file_count(
        self, 
        db: AsyncSession, 
        entity_type: str, 
        entity_uuid: str
    ) -> None:
        """
        Update file count for an entity (note, diary entry, etc.).
        
        Args:
            db: Database session
            entity_type: Type of entity ('note', 'diary_entry')
            entity_uuid: UUID of the entity to update
        """
        if entity_type == "note":
            await self._update_note_document_count(db, entity_uuid)
        elif entity_type == "diary_entry":
            await self._update_diary_entry_file_count(db, entity_uuid)
        else:
            logger.warning(f"Unknown entity type for file count update: {entity_type}")

    async def _update_note_document_count(self, db: AsyncSession, note_uuid: str) -> None:
        """Update document count for a note via note_documents association"""
        count_result = await db.execute(
            select(func.count(note_documents.c.document_uuid))
            .join(Document, note_documents.c.document_uuid == Document.uuid)
            .where(
                and_(
                    note_documents.c.note_uuid == note_uuid,
                    Document.is_deleted == False
                )
            )
        )
        document_count = count_result.scalar() or 0
        
        await db.execute(
            update(Note)
            .where(Note.uuid == note_uuid)
            .values(file_count=document_count)
        )

    async def _update_diary_entry_file_count(self, db: AsyncSession, diary_entry_uuid: str) -> None:
        """Update file count for a diary entry"""
        count_result = await db.execute(
            select(func.count(document_diary.c.document_uuid))
            .where(document_diary.c.diary_entry_uuid == diary_entry_uuid)
        )
        file_count = count_result.scalar() or 0
        
        await db.execute(
            update(DiaryEntry)
            .where(DiaryEntry.uuid == diary_entry_uuid)
            .values(file_count=file_count)
        )

    async def build_project_badges(
        self, 
        db: AsyncSession, 
        item_uuid: str, 
        item_type: str, 
        association_table
    ) -> List[ProjectBadge]:
        """
        Build project badges for a single item.
        
        Args:
            db: Database session
            item_uuid: UUID of the item
            item_type: Type of item ('note', 'document', 'todo')
            association_table: SQLAlchemy table for the association
            
        Returns:
            List of ProjectBadge objects
        """
        # Get associations for this item
        result = await db.execute(
            select(association_table)
            .where(getattr(association_table.c, f"{item_type}_uuid") == item_uuid)
        )
        associations = result.fetchall()
        
        if not associations:
            return []
        
        # Collect project UUIDs
        project_uuids = [assoc._mapping["project_uuid"] for assoc in associations if assoc._mapping["project_uuid"]]
        
        if not project_uuids:
            return []
        
        # Get projects
        project_result = await db.execute(
            select(Project).where(Project.uuid.in_(project_uuids))
        )
        projects = project_result.scalars().all()
        project_map = {p.uuid: p for p in projects}
        
        # Build badges
        project_badges = []
        for assoc in associations:
            project_uuid = assoc._mapping["project_uuid"]
            if project_uuid and project_uuid in project_map:
                project = project_map[project_uuid]
                project_badges.append(ProjectBadge(
                    uuid=project.uuid,
                    name=project.name,
                    is_project_exclusive=assoc._mapping.get("is_project_exclusive", False),
                    is_deleted=False
                ))
            elif assoc._mapping.get("project_name_snapshot"):
                # Deleted project (snapshot)
                project_badges.append(ProjectBadge(
                    uuid=None,
                    name=assoc._mapping["project_name_snapshot"],
                    is_project_exclusive=assoc._mapping.get("is_project_exclusive", False),
                    is_deleted=True
                ))
        
        return project_badges
    
    async def batch_get_project_badges_polymorphic(
        self,
        db: AsyncSession,
        item_uuids: List[str],
        item_type: str  # 'Todo', 'Document', 'Note'
    ) -> Dict[str, List[ProjectBadge]]:
        """
        Batch load project badges for items using polymorphic project_items table.
        
        Replaces module-specific association tables (todo_projects, document_projects)
        with the unified polymorphic approach.
        
        Args:
            db: Database session
            item_uuids: List of item UUIDs
            item_type: Type of items ('Todo', 'Document', 'Note')
        
        Returns:
            Dict mapping item_uuid -> list of ProjectBadge
        """
        from app.models.associations import project_items
        from app.models.project import Project
        
        if not item_uuids:
            return {}
        
        # Query project_items for all items at once (N+1 prevention)
        result = await db.execute(
            select(
                project_items.c.item_uuid,
                project_items.c.project_uuid,
                project_items.c.is_exclusive
            ).where(
                and_(
                    project_items.c.item_type == item_type,
                    project_items.c.item_uuid.in_(item_uuids)
                )
            )
        )
        
        associations = result.fetchall()
        
        if not associations:
            return {uuid: [] for uuid in item_uuids}
        
        # Group by item_uuid and collect project UUIDs
        item_associations = {}
        project_uuids_set = set()
        
        for item_uuid, project_uuid, is_exclusive in associations:
            if item_uuid not in item_associations:
                item_associations[item_uuid] = []
            item_associations[item_uuid].append((project_uuid, is_exclusive))
            if project_uuid:
                project_uuids_set.add(project_uuid)
        
        # Fetch all projects at once (batch query)
        if project_uuids_set:
            projects_result = await db.execute(
                select(Project).where(Project.uuid.in_(list(project_uuids_set)))
            )
            projects_map = {p.uuid: p for p in projects_result.scalars().all()}
        else:
            projects_map = {}
        
        # Build badges
        result_map = {}
        for item_uuid in item_uuids:
            badges = []
            for project_uuid, is_exclusive in item_associations.get(item_uuid, []):
                if project_uuid in projects_map:
                    project = projects_map[project_uuid]
                    badge = ProjectBadge(
                        uuid=project.uuid,
                        name=project.name,
                        is_deleted=False,
                        is_project_exclusive=is_exclusive  # Per-association exclusivity
                    )
                    badges.append(badge)
            result_map[item_uuid] = badges
        
        return result_map


# Create singleton instance
shared_utilities_service = SharedUtilitiesService()
