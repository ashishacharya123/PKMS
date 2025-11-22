"""
Association Counter Service

The "brain" that counts all associations for any item type.
Used by all CRUD services to detect orphans and check link counts.
"""

import asyncio
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.models.associations import project_items, note_documents, document_diary
from app.models.todo import Todo
from app.models.note import Note
from app.models.document import Document
from app.models.project import Project
from app.models.diary import DiaryEntry

logger = logging.getLogger(__name__)


class AssociationCounterService:
    """
    Central service for counting associations across all item types.
    This is the "brain" that determines if items are orphans.
    """
    
    async def get_document_link_count(self, db: AsyncSession, doc_uuid: str) -> int:
        """Count all associations for a Document (excluding deleted items)."""
        # Project associations - join with Project to filter deleted projects
        q_proj = select(func.count(project_items.c.id)).select_from(
            project_items.join(Project, project_items.c.project_uuid == Project.uuid)
        ).where(
            project_items.c.item_type == 'Document',
            project_items.c.item_uuid == doc_uuid,
            Project.active_only()  # Only count active projects
        )

        # Note associations - join with Note to filter deleted notes
        q_note = select(func.count(note_documents.c.id)).select_from(
            note_documents.join(Note, note_documents.c.note_uuid == Note.uuid)
        ).where(
            note_documents.c.document_uuid == doc_uuid,
            Note.active_only()  # Only count active notes
        )

        # Diary associations - join with DiaryEntry to filter deleted entries
        q_diary = select(func.count(document_diary.c.id)).select_from(
            document_diary.join(DiaryEntry, document_diary.c.diary_entry_uuid == DiaryEntry.uuid)
        ).where(
            document_diary.c.document_uuid == doc_uuid,
            DiaryEntry.active_only()  # Only count active diary entries
        )

        counts = await asyncio.gather(
            db.scalar(q_proj),
            db.scalar(q_note),
            db.scalar(q_diary)
        )
        return sum(c or 0 for c in counts)

    async def get_note_link_count(self, db: AsyncSession, note_uuid: str) -> int:
        """Count all associations for a Note (projects only, excluding deleted projects)."""
        # Project associations - join with Project model to filter deleted projects
        q_proj = select(func.count(project_items.c.id)).select_from(
            project_items.join(Project, project_items.c.project_uuid == Project.uuid)
        ).where(
            project_items.c.item_type == 'Note',
            project_items.c.item_uuid == note_uuid,
            Project.active_only()
        )
        count = (await db.execute(q_proj)).scalar() or 0
        return count

    async def get_todo_link_count(self, db: AsyncSession, todo_uuid: str) -> int:
        """Count all associations for a Todo (projects + parent check, excluding deleted items)."""
        # Project associations - join with Project model to filter deleted projects
        q_proj = select(func.count(project_items.c.id)).select_from(
            project_items.join(Project, project_items.c.project_uuid == Project.uuid)
        ).where(
            project_items.c.item_type == 'Todo',
            project_items.c.item_uuid == todo_uuid,
            Project.active_only()
        )

        # Check if todo has active parent (only if todo itself is active)
        from sqlalchemy.orm import aliased
        ParentTodo = aliased(Todo)
        q_parent = select(func.count(ParentTodo.uuid)).select_from(
            Todo.join(ParentTodo, Todo.parent_uuid == ParentTodo.uuid)
        ).where(
            Todo.uuid == todo_uuid,
            Todo.active_only(),      # Todo itself must be active
            ParentTodo.active_only() # Parent must be active
        )

        counts = await asyncio.gather(
            db.scalar(q_proj),
            db.scalar(q_parent)
        )
        project_count = counts[0] or 0
        has_parent = (counts[1] or 0) > 0

        return project_count + (1 if has_parent else 0)
    
    async def get_project_link_count(self, db: AsyncSession, project_uuid: str) -> int:
        """Count all children of a Project (excluding deleted items)."""
        # Note associations - join with Note to filter deleted notes
        q_notes = select(func.count(project_items.c.id)).select_from(
            project_items.join(Note, and_(
                project_items.c.item_type == 'Note',
                project_items.c.item_uuid == Note.uuid
            ))
        ).where(
            project_items.c.project_uuid == project_uuid,
            Note.active_only()  # Only count active notes
        )

        # Todo associations - join with Todo to filter deleted todos
        q_todos = select(func.count(project_items.c.id)).select_from(
            project_items.join(Todo, and_(
                project_items.c.item_type == 'Todo',
                project_items.c.item_uuid == Todo.uuid
            ))
        ).where(
            project_items.c.project_uuid == project_uuid,
            Todo.active_only()  # Only count active todos
        )

        # Document associations - join with Document to filter deleted documents
        q_documents = select(func.count(project_items.c.id)).select_from(
            project_items.join(Document, and_(
                project_items.c.item_type == 'Document',
                project_items.c.item_uuid == Document.uuid
            ))
        ).where(
            project_items.c.project_uuid == project_uuid,
            Document.active_only()  # Only count active documents
        )

        counts = await asyncio.gather(
            db.scalar(q_notes),
            db.scalar(q_todos),
            db.scalar(q_documents)
        )
        return sum(c or 0 for c in counts)

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
