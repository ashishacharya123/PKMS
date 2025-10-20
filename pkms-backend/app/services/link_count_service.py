"""
Link Count Service - Unified service for checking item deletion safety

Handles all types of relationships:
- DiaryFile: Always exclusive (cascade delete)
- NoteFile: Can be exclusive or shared across notes
- Document: Can be linked to projects and notes
- Note: Can be linked to projects
- Todo: Can be linked to projects
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
import logging

from app.models.document import Document
from app.models.note import Note, NoteFile
from app.models.todo import Todo
# DiaryFile removed - diary files now use Document + document_diary
from app.models.project import Project
from app.models.associations import document_projects, note_projects, todo_projects

logger = logging.getLogger(__name__)


class LinkCountService:
    """Unified service for checking item deletion safety across all relationship types"""

    async def get_delete_preflight(
        self,
        db: AsyncSession,
        item_type: str,
        item_uuid: str,
        user_uuid: str
    ) -> Dict[str, Any]:
        """
        Get preflight information for any item type deletion.
        
        Args:
            db: Database session
            item_type: Type of item ('document', 'note', 'todo', 'note_file', 'diary_file')
            item_uuid: UUID of the item to check
            user_uuid: UUID of the user making the request
            
        Returns:
            Dict with can_delete, link_count, linked_items, warning_message
        """
        
        # Verify item exists and user owns it
        item = await self._verify_item_ownership(db, item_type, item_uuid, user_uuid)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{item_type.title()} not found")

        # Get all links for this item
        links = await self._get_all_links(db, item_type, item_uuid, user_uuid)
        
        # Build response
        total_links = sum(len(link_group['items']) for link_group in links.values())
        
        warning_message = None
        if total_links > 0:
            warning_parts = []
            for link_type, link_data in links.items():
                if link_data['items']:
                    count = len(link_data['items'])
                    names = ', '.join(link_data['items'][:3])  # Show first 3 names
                    if count > 3:
                        names += f" and {count - 3} more"
                    warning_parts.append(f"{count} {link_type}(s): {names}")
            
            warning_message = f"This {item_type.replace('_', ' ')} is linked to {', '.join(warning_parts)}"

        return {
            "can_delete": True,  # Always can delete, just with warning
            "link_count": total_links,
            "linked_items": links,
            "warning_message": warning_message
        }

    async def _verify_item_ownership(
        self,
        db: AsyncSession,
        item_type: str,
        item_uuid: str,
        user_uuid: str
    ) -> Optional[Any]:
        """Verify item exists and user owns it"""
        
        if item_type == "document":
            item = await db.get(Document, item_uuid)
            return item if item and item.created_by == user_uuid else None
            
        elif item_type == "note":
            item = await db.get(Note, item_uuid)
            return item if item and item.created_by == user_uuid else None
            
        elif item_type == "todo":
            item = await db.get(Todo, item_uuid)
            return item if item and item.created_by == user_uuid else None
            
        elif item_type == "note_file":
            item = await db.get(NoteFile, item_uuid)
            if not item:
                return None
            # Check ownership through parent note
            note = await db.get(Note, item.note_uuid)
            return item if note and note.created_by == user_uuid else None
            
        # DiaryFile removed - diary files now use Document + document_diary
        # No separate diary_file type needed
            
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown item type: {item_type}")

    async def _get_all_links(
        self,
        db: AsyncSession,
        item_type: str,
        item_uuid: str,
        user_uuid: str
    ) -> Dict[str, Dict[str, Any]]:
        """Get all links for an item across all relationship types"""
        
        links = {
            "projects": {"items": [], "count": 0},
            "notes": {"items": [], "count": 0}
        }

        if item_type == "document":
            # Check project links
            project_links = await self._get_project_links(db, item_uuid, "document", user_uuid)
            links["projects"] = project_links
            
            # Check note links (if documents can be linked to notes)
            note_links = await self._get_note_links(db, item_uuid, "document", user_uuid)
            links["notes"] = note_links

        elif item_type == "note":
            # Check project links
            project_links = await self._get_project_links(db, item_uuid, "note", user_uuid)
            links["projects"] = project_links

        elif item_type == "todo":
            # Check project links
            project_links = await self._get_project_links(db, item_uuid, "todo", user_uuid)
            links["projects"] = project_links

        elif item_type == "note_file":
            # Check if file is used in other notes (if note files can be shared)
            note_links = await self._get_note_file_links(db, item_uuid, user_uuid)
            links["notes"] = note_links

        elif item_type == "diary_file":
            # Diary files are always exclusive, no links to check
            pass

        return links

    async def _get_project_links(
        self,
        db: AsyncSession,
        item_uuid: str,
        item_type: str,
        user_uuid: str
    ) -> Dict[str, Any]:
        """Get project links for an item"""
        
        if item_type == "document":
            association_table = document_projects
            item_uuid_col = document_projects.c.document_uuid
        elif item_type == "note":
            association_table = note_projects
            item_uuid_col = note_projects.c.note_uuid
        elif item_type == "todo":
            association_table = todo_projects
            item_uuid_col = todo_projects.c.todo_uuid
        else:
            return {"items": [], "count": 0}

        # Count links
        count_query = select(func.count()).select_from(association_table).where(
            item_uuid_col == item_uuid
        )
        count_result = await db.execute(count_query)
        count = count_result.scalar() or 0

        # Get project names
        project_names = []
        if count > 0:
            projects_query = select(Project.name).select_from(
                Project.__table__.join(association_table)
            ).where(
                and_(
                    item_uuid_col == item_uuid,
                    Project.created_by == user_uuid
                )
            )
            projects_result = await db.execute(projects_query)
            project_names = [row[0] for row in projects_result.fetchall()]

        return {"items": project_names, "count": count}

    async def _get_note_links(
        self,
        db: AsyncSession,
        item_uuid: str,
        item_type: str,
        user_uuid: str
    ) -> Dict[str, Any]:
        """Get note links for an item (if documents can be linked to notes)"""
        
        # TODO: Implement when document-note linking is added
        # For now, return empty
        return {"items": [], "count": 0}

    async def _get_note_file_links(
        self,
        db: AsyncSession,
        note_file_uuid: str,
        user_uuid: str
    ) -> Dict[str, Any]:
        """Get note links for a note file (if note files can be shared)"""
        
        # TODO: Implement when note file sharing is added
        # For now, return empty (note files are exclusive)
        return {"items": [], "count": 0}


# Create singleton instance
link_count_service = LinkCountService()
