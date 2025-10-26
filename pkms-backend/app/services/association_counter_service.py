"""
Association Counter Service

The "brain" that counts all associations for any item type.
Used by all CRUD services to detect orphans and check link counts.
"""

import asyncio
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.associations import project_items, note_documents, document_diary
from app.models.todo import Todo

logger = logging.getLogger(__name__)


class AssociationCounterService:
    """
    Central service for counting associations across all item types.
    This is the "brain" that determines if items are orphans.
    """
    
    async def get_document_link_count(self, db: AsyncSession, doc_uuid: str) -> int:
        """Count all associations for a Document."""
        q_proj = select(func.count(project_items.c.id)).where(
            project_items.c.item_type == 'Document',
            project_items.c.item_uuid == doc_uuid
        )
        q_note = select(func.count(note_documents.c.id)).where(
            note_documents.c.document_uuid == doc_uuid
        )
        q_diary = select(func.count(document_diary.c.id)).where(
            document_diary.c.document_uuid == doc_uuid
        )
        
        counts = await asyncio.gather(
            db.scalar(q_proj),
            db.scalar(q_note),
            db.scalar(q_diary)
        )
        return sum(c or 0 for c in counts)

    async def get_note_link_count(self, db: AsyncSession, note_uuid: str) -> int:
        """Count all associations for a Note (projects only)."""
        q_proj = select(func.count(project_items.c.id)).where(
            project_items.c.item_type == 'Note',
            project_items.c.item_uuid == note_uuid
        )
        count = (await db.execute(q_proj)).scalar() or 0
        return count

    async def get_todo_link_count(self, db: AsyncSession, todo_uuid: str) -> int:
        """Count all associations for a Todo (projects + parent check)."""
        q_proj = select(func.count(project_items.c.id)).where(
            project_items.c.item_type == 'Todo',
            project_items.c.item_uuid == todo_uuid
        )
        # Check if todo has parent (if yes, it's linked)
        q_parent = select(func.count(Todo.uuid)).where(
            Todo.uuid == todo_uuid,
            Todo.parent_uuid.is_not(None)
        )
        
        counts = await asyncio.gather(
            db.scalar(q_proj),
            db.scalar(q_parent)
        )
        return sum(c or 0 for c in counts)
    
    async def get_project_link_count(self, db: AsyncSession, project_uuid: str) -> int:
        """Count all children of a Project."""
        q = select(func.count(project_items.c.id)).where(
            project_items.c.project_uuid == project_uuid
        )
        count = (await db.execute(q)).scalar() or 0
        return count

    async def get_item_link_count(
        self, db: AsyncSession, item_type: str, item_uuid: str
    ) -> int:
        """Public wrapper to check any item type."""
        if item_type == 'Document':
            return await self.get_document_link_count(db, item_uuid)
        elif item_type == 'Note':
            return await self.get_note_link_count(db, item_uuid)
        elif item_type == 'Todo':
            return await self.get_todo_link_count(db, item_uuid)
        elif item_type == 'Project':
            return await self.get_project_link_count(db, item_uuid)
        return 0


# Global instance
association_counter_service = AssociationCounterService()
