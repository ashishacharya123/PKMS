"""
Unified Search Service for PKMS

This service provides a simple, unified full-text search across all content types
using a single FTS5 virtual table. It replaces the complex multi-table FTS system
with a maintainable, fast, and powerful search experience.
"""

from typing import List, Dict, Optional, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from sqlalchemy.orm import selectinload
import logging
logger = logging.getLogger(__name__)

from ..models.note import Note
from ..models.document import Document
from ..models.todo import Todo
from ..models.project import Project
from ..models.diary import DiaryEntry
from ..models.link import Link
from ..models.archive import ArchiveFolder, ArchiveItem


class SearchService:
    """Unified search service for all content types."""
    
    def __init__(self):
        self.item_type_mapping = {
            'note': Note,
            'document': Document,
            'todo': Todo,
            'project': Project,
            'diary': DiaryEntry,
            'link': Link,
            'archive_folder': ArchiveFolder,
            'archive_item': ArchiveItem
        }
    
    async def index_item(self, db: AsyncSession, item: Any, item_type: str) -> None:
        """
        Index a single item into the unified FTS table.
        
        Args:
            db: Database session
            item: The content item to index
            item_type: Type of item ('note', 'todo', 'document', etc.)
        """
        try:
            # Extract common fields
            item_uuid = str(item.uuid)
            user_uuid = getattr(item, 'created_by', None)
            title = getattr(item, 'title', None) or getattr(item, 'name', None) or ''
            description = getattr(item, 'description', None) or ''
            
            # Extract tags without triggering lazy-load
            tags = ''
            model_cls = self.item_type_mapping.get(item_type)
            if model_cls is not None and hasattr(model_cls, 'tag_objs'):
                try:
                    res = await db.execute(
                        select(model_cls)
                        .options(selectinload(getattr(model_cls, 'tag_objs')))
                        .where(model_cls.uuid == item.uuid)
                    )
                    loaded = res.scalar_one_or_none()
                    if loaded and loaded.tag_objs:
                        tags = ' '.join(t.name for t in loaded.tag_objs)
                except Exception:
                    logger.debug("Tag load failed for %s %s", item_type, item_uuid)
            
            # Extract attachments (filenames) for files; persist as deterministic string
            attachments_list = await self._extract_attachments(db, item, item_type)
            attachments = "\n".join(a for a in attachments_list if a)
            
            # Format date_text for temporal context
            date_text = self._format_date_text(item.created_at)
            
            # DELETE existing FTS row for this item_uuid to prevent duplicates
            await db.execute(text("""
                DELETE FROM fts_content WHERE item_uuid = :uuid
            """), {"uuid": item_uuid})
            
            # INSERT new FTS row
            await db.execute(text("""
                INSERT INTO fts_content(item_uuid, item_type, created_by, title, description, tags, attachments, date_text)
                VALUES (:uuid, :type, :created_by, :title, :description, :tags, :attachments, :date_text)
            """), {
                "uuid": item_uuid,
                "type": item_type,
                "created_by": user_uuid,
                "title": title,
                "description": description,
                "tags": tags,
                "attachments": attachments,
                "date_text": date_text
            })
            
        except Exception:
            # Log error but don't fail the main operation
            logger.exception("Error indexing %s %s", item_type, getattr(item, "uuid", "<unknown>"))
    
    async def remove_item(self, db: AsyncSession, item_uuid: str) -> None:
        """
        Remove an item from the FTS index.
        
        Args:
            db: Database session
            item_uuid: UUID of the item to remove
        """
        try:
            await db.execute(
                text("DELETE FROM fts_content WHERE item_uuid = :uuid"), 
                {"uuid": item_uuid}
            )
        except Exception:
            logger.exception("Error removing %s from search index", item_uuid)
    
    async def search(self, db: AsyncSession, user_uuid: str, query: str, 
                    item_types: Optional[List[str]] = None, 
                    has_attachments: Optional[bool] = None,
                    limit: int = 50,
                    offset: int = 0) -> List[Dict]:
        """
        Search across all content types using the two-step process:
        1. FTS search to get candidate UUIDs
        2. Structured SQL filtering for additional criteria
        
        Args:
            db: Database session
            user_uuid: User UUID to scope search
            query: Search query string
            item_types: Optional list of item types to search
            has_attachments: Optional filter for items with attachments
            limit: Maximum number of results
            
        Returns:
            List of search results with item details
        """
        try:
            # Step 1: FTS search to get candidate UUIDs
            fts_query = self._build_fts_query(query)
            
            sql = """
                SELECT item_uuid, item_type, bm25(fts_content) AS score
                FROM fts_content
                WHERE fts_content MATCH :query AND created_by = :user_uuid
            """
            params = {"query": fts_query, "user_uuid": user_uuid}
            
            if item_types:
                sql += " AND item_type IN :types"
                params["types"] = item_types
            # Append ORDER BY/LIMIT/OFFSET after all mutations
            sql += " ORDER BY score LIMIT :limit OFFSET :offset"
            params["limit"] = limit
            params["offset"] = offset

            from sqlalchemy import bindparam
            stmt = text(sql)
            if item_types:
                stmt = stmt.bindparams(bindparam("types", expanding=True))

            result = await db.execute(stmt, params)
            fts_results = result.fetchall()
            
            if not fts_results:
                return []
            
            # Step 2: Structured SQL filtering for additional criteria
            results = []
            for row in fts_results:
                item_uuid, item_type, score = row
                
                # Get the actual item with relationships
                item = await self._get_item_with_relationships(db, item_uuid, item_type)
                if not item:
                    continue
                
                # Apply additional filters
                if has_attachments is not None:
                    has_files = await self._item_has_attachments(db, item, item_type)
                    if has_attachments != has_files:
                        continue
                
                # Build result
                result_item = {
                    "uuid": item_uuid,
                    "type": item_type,
                    "title": getattr(item, 'title', None) or getattr(item, 'name', None),
                    "description": getattr(item, 'description', None),
                    "created_at": item.created_at.isoformat() if item.created_at else None,
                    "score": score,
                    "tags": [t.name for t in getattr(item, 'tag_objs', [])] if hasattr(item, 'tag_objs') else [],
                    "attachments": await self._extract_attachments(db, item, item_type)
                }
                
                # Add type-specific fields
                if item_type == 'note':
                    result_item["content_preview"] = getattr(item, 'content', '')[:200] + '...' if getattr(item, 'content', '') else ''
                elif item_type == 'document':
                    result_item["filename"] = getattr(item, 'filename', None)
                elif item_type == 'archive_item':
                    result_item["filename"] = getattr(item, 'original_filename', None) or getattr(item, 'stored_filename', None)
                elif item_type == 'archive_folder':
                    result_item["name"] = getattr(item, 'name', None)
                elif item_type == 'todo':
                    result_item["status"] = getattr(item, 'status', None)
                elif item_type == 'project':
                    result_item["status"] = getattr(item, 'status', None)
                    result_item["progress_percentage"] = getattr(item, 'progress_percentage', None)
                
                results.append(result_item)
            
            return results
            
        except Exception:
            logger.exception("Error during search")
            return []
    
    async def _extract_attachments(self, db: AsyncSession, item: Any, item_type: str) -> List[str]:
        """Extract attachment filenames for the item."""
        attachments = []
        
        try:
            if item_type == 'note':
                # Always explicitly load files to avoid lazy-load greenlet issues
                note_with_files = await db.execute(
                    select(Note).options(selectinload(Note.files)).where(Note.uuid == item.uuid)
                )
                note = note_with_files.scalar_one_or_none()
                if note and note.files:
                    attachments.extend([f.filename for f in note.files if f.filename])
            
            elif item_type == 'document':
                filename = getattr(item, 'filename', None)
                if filename:
                    attachments.append(filename)
            elif item_type == 'archive_item':
                filename = getattr(item, 'original_filename', None) or getattr(item, 'stored_filename', None)
                if filename:
                    attachments.append(filename)
            
            elif item_type == 'diary':
                entry_with_media = await db.execute(
                    select(DiaryEntry)
                    .options(selectinload(DiaryEntry.media))
                    .where(DiaryEntry.uuid == item.uuid)
                )
                entry = entry_with_media.scalar_one_or_none()
                if entry and entry.media:
                    attachments.extend([m.filename for m in entry.media if m.filename])
        
        except Exception:
            logger.exception("Error extracting attachments for %s %s", item_type, getattr(item, "uuid", "<unknown>"))
        
        return attachments
    
    def _format_date_text(self, created_at: Optional[datetime]) -> str:
        """Format date for temporal context in search."""
        if not created_at:
            return ''
        
        # Format as "2025 January Friday" for natural language search
        return created_at.strftime("%Y %B %A")
    
    def _build_fts_query(self, query: str) -> str:
        """Build FTS5 query string with proper escaping."""
        # Simple escaping for FTS5 - remove special characters that could break the query
        escaped = query.replace('"', '""').replace("'", "''")
        return f'"{escaped}"'
    
    async def _get_item_with_relationships(self, db: AsyncSession, item_uuid: str, item_type: str) -> Optional[Any]:
        """Get the actual item with its relationships loaded."""
        try:
            model_class = self.item_type_mapping.get(item_type)
            if not model_class:
                return None
            
            # Load with tag relationships for proper tag display
            if hasattr(model_class, 'tag_objs'):
                result = await db.execute(
                    select(model_class).options(selectinload(getattr(model_class, 'tag_objs'))).where(model_class.uuid == item_uuid)
                )
            else:
                result = await db.execute(
                    select(model_class).where(model_class.uuid == item_uuid)
                )
            return result.scalar_one_or_none()
        
        except Exception:
            logger.exception("Error loading %s %s", item_type, item_uuid)
            return None
    
    async def _item_has_attachments(self, db: AsyncSession, item: Any, item_type: str) -> bool:
        """Check if item has attachments."""
        try:
            if item_type == 'note':
                # Check actual attached files for notes to avoid stale/missing counts
                return bool(await self._extract_attachments(db, item, item_type))
            elif item_type == 'document':
                return bool(getattr(item, 'filename', None))
            elif item_type == 'archive_item':
                return bool(getattr(item, 'original_filename', None) or getattr(item, 'stored_filename', None))
            elif item_type == 'diary':
                return getattr(item, 'media_count', 0) > 0
            else:
                return False
        except Exception:
            return False
    
    async def bulk_index_user_content(self, db: AsyncSession, user_uuid: str) -> None:
        """
        Bulk index all content for a user (useful for migration).

        Args:
            db: Database session
            user_uuid: User UUID to index content for
        """
        logger.info("Starting bulk index for user %s", user_uuid)

        # Index notes
        notes_result = await db.execute(
            select(Note).options(selectinload(Note.tag_objs)).where(Note.created_by == user_uuid)
        )
        for note in notes_result.scalars():
            await self.index_item(db, note, 'note')

        # Index documents
        docs_result = await db.execute(
            select(Document).options(selectinload(Document.tag_objs)).where(Document.created_by == user_uuid)
        )
        for doc in docs_result.scalars():
            await self.index_item(db, doc, 'document')

        # Index todos
        todos_result = await db.execute(
            select(Todo).options(selectinload(Todo.tag_objs)).where(Todo.created_by == user_uuid)
        )
        for todo in todos_result.scalars():
            await self.index_item(db, todo, 'todo')

        # Index projects
        projects_result = await db.execute(
            select(Project).options(selectinload(Project.tag_objs)).where(Project.created_by == user_uuid)
        )
        for project in projects_result.scalars():
            await self.index_item(db, project, 'project')

        # Index diary entries
        diary_result = await db.execute(
            select(DiaryEntry).options(selectinload(DiaryEntry.tag_objs)).where(DiaryEntry.created_by == user_uuid)
        )
        for entry in diary_result.scalars():
            await self.index_item(db, entry, 'diary')

        # Index links
        links_result = await db.execute(
            select(Link).options(selectinload(Link.tag_objs)).where(Link.created_by == user_uuid)
        )
        for link in links_result.scalars():
            await self.index_item(db, link, 'link')

        # Index archive folders
        folders_result = await db.execute(
            select(ArchiveFolder).options(selectinload(ArchiveFolder.tag_objs)).where(ArchiveFolder.created_by == user_uuid)
        )
        for folder in folders_result.scalars():
            await self.index_item(db, folder, 'archive_folder')

        # Index archive items
        items_result = await db.execute(
            select(ArchiveItem).options(selectinload(ArchiveItem.tag_objs)).where(ArchiveItem.created_by == user_uuid)
        )
        for item in items_result.scalars():
            await self.index_item(db, item, 'archive_item')

        logger.info("Completed bulk index for user %s", user_uuid)


# Global instance
search_service = SearchService()
