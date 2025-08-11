"""
Enhanced FTS5 Full-Text Search Service
Provides high-performance full-text search with proper BM25 ranking, cross-module normalization,
embedded tags, and comprehensive filtering
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from sqlalchemy.orm import selectinload
from datetime import datetime, date
import json
import re

from ..models.note import Note
from ..models.document import Document
from ..models.todo import Todo
from ..models.archive import ArchiveItem, ArchiveFolder
from ..models.diary import DiaryEntry
from ..models.tag import Tag

logger = logging.getLogger(__name__)

class EnhancedFTS5SearchService:
    """Enhanced FTS5 service with proper ranking, normalization, and filtering"""

    def __init__(self):
        self.tables_initialized = False
        # Module weights for cross-module normalization
        self.module_weights = {
            'notes': 1.0,
            'documents': 0.9, 
            'todos': 0.8,
            'diary': 0.95,
            'archive': 0.7,
            'folders': 0.6
        }

    async def initialize_enhanced_fts_tables(self, db: AsyncSession) -> bool:
        """Initialize enhanced FTS5 virtual tables with embedded tags"""
        try:
            # Enhanced FTS5 virtual table for notes with embedded tags
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_notes_enhanced USING fts5(
                    id UNINDEXED,
                    title,
                    content,
                    tags_text,
                    area UNINDEXED,
                    user_id UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED,
                    is_favorite UNINDEXED
                );
            """))
            
            # Enhanced FTS5 virtual table for documents with embedded tags
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_documents_enhanced USING fts5(
                    uuid UNINDEXED,
                    title,
                    filename,
                    original_name,
                    description,
                    tags_text,
                    user_id UNINDEXED,
                    mime_type UNINDEXED,
                    file_size UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED,
                    is_favorite UNINDEXED,
                    is_archived UNINDEXED
                );
            """))
            
            # Enhanced FTS5 virtual table for archive items with embedded tags
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_archive_items_enhanced USING fts5(
                    uuid UNINDEXED,
                    name,
                    description,
                    original_filename,
                    metadata_json,
                    tags_text,
                    user_id UNINDEXED,
                    folder_uuid UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED,
                    is_favorite UNINDEXED
                );
            """))
            
            # Enhanced FTS5 virtual table for todos with embedded tags
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_todos_enhanced USING fts5(
                    id UNINDEXED,
                    title,
                    description,
                    tags_text,
                    user_id UNINDEXED,
                    project_id UNINDEXED,
                    status UNINDEXED,
                    priority UNINDEXED,
                    due_date UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED
                );
            """))
            
            # Enhanced FTS5 virtual table for diary entries with embedded tags
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_diary_entries_enhanced USING fts5(
                    id UNINDEXED,
                    title,
                    content,
                    tags_text,
                    mood UNINDEXED,
                    weather UNINDEXED,
                    user_id UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED,
                    has_media UNINDEXED
                );
            """))
            
            # Enhanced FTS5 virtual table for archive folders
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_folders_enhanced USING fts5(
                    uuid UNINDEXED,
                    name,
                    description,
                    tags_text,
                    parent_uuid UNINDEXED,
                    user_id UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED,
                    is_favorite UNINDEXED
                );
            """))
            
            # Create enhanced sync triggers
            await self._create_enhanced_sync_triggers(db)
            
            await db.commit()
            self.tables_initialized = True
            logger.info("✅ Enhanced FTS5 virtual tables initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize enhanced FTS5 tables: {e}")
            await db.rollback()
            return False

    async def _create_enhanced_sync_triggers(self, db: AsyncSession):
        """Create enhanced triggers to keep FTS tables synchronized with content tables"""
        
        # Notes triggers with tag embedding
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS notes_fts_enhanced_insert AFTER INSERT ON notes
            BEGIN
                INSERT INTO fts_notes_enhanced (
                    id, title, content, tags_text, area, user_id, created_at, updated_at, is_favorite
                )
                VALUES (
                    NEW.id, NEW.title, NEW.content,
                    (SELECT COALESCE(GROUP_CONCAT(t.name, ' '), '') FROM tags t 
                     JOIN note_tags nt ON t.id = nt.tag_id 
                     WHERE nt.note_id = NEW.id),
                    NEW.area, NEW.user_id, NEW.created_at, NEW.updated_at, NEW.is_favorite
                );
            END;
        """))
        
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS notes_fts_enhanced_update AFTER UPDATE ON notes
            BEGIN
                UPDATE fts_notes_enhanced SET
                    title = NEW.title,
                    content = NEW.content,
                    tags_text = (SELECT COALESCE(GROUP_CONCAT(t.name, ' '), '') FROM tags t 
                                 JOIN note_tags nt ON t.id = nt.tag_id 
                                 WHERE nt.note_id = NEW.id),
                    area = NEW.area,
                    updated_at = NEW.updated_at,
                    is_favorite = NEW.is_favorite
                WHERE id = NEW.id;
            END;
        """))
        
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS notes_fts_enhanced_delete AFTER DELETE ON notes
            BEGIN
                DELETE FROM fts_notes_enhanced WHERE id = OLD.id;
            END;
        """))

        # Documents triggers with tag embedding
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS documents_fts_enhanced_insert AFTER INSERT ON documents
            BEGIN
                INSERT INTO fts_documents_enhanced (
                    uuid, title, filename, original_name, description, tags_text,
                    user_id, mime_type, file_size, created_at, updated_at, is_favorite, is_archived
                )
                VALUES (
                    NEW.uuid, NEW.title, NEW.filename, NEW.original_name, NEW.description,
                    (SELECT COALESCE(GROUP_CONCAT(t.name, ' '), '') FROM tags t 
                     JOIN document_tags dt ON t.id = dt.tag_id 
                     WHERE dt.document_uuid = NEW.uuid),
                    NEW.user_id, NEW.mime_type, NEW.file_size, NEW.created_at, NEW.updated_at, 
                    NEW.is_favorite, NEW.is_archived
                );
            END;
        """))

        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS documents_fts_enhanced_update AFTER UPDATE ON documents
            BEGIN
                UPDATE fts_documents_enhanced SET
                    title = NEW.title,
                    filename = NEW.filename,
                    original_name = NEW.original_name,
                    description = NEW.description,
                    tags_text = (SELECT COALESCE(GROUP_CONCAT(t.name, ' '), '') FROM tags t 
                                 JOIN document_tags dt ON t.id = dt.tag_id 
                                 WHERE dt.document_uuid = NEW.uuid),
                    mime_type = NEW.mime_type,
                    file_size = NEW.file_size,
                    updated_at = NEW.updated_at,
                    is_favorite = NEW.is_favorite,
                    is_archived = NEW.is_archived
                WHERE uuid = NEW.uuid;
            END;
        """))

        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS documents_fts_enhanced_delete AFTER DELETE ON documents
            BEGIN
                DELETE FROM fts_documents_enhanced WHERE uuid = OLD.uuid;
            END;
        """))

        # Similar triggers for other tables...
        # Archive items triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS archive_items_fts_enhanced_insert AFTER INSERT ON archive_items
            BEGIN
                INSERT INTO fts_archive_items_enhanced (
                    uuid, name, description, original_filename, metadata_json, tags_text,
                    user_id, folder_uuid, created_at, updated_at, is_favorite
                )
                VALUES (
                    NEW.uuid, NEW.name, NEW.description, NEW.original_filename, NEW.metadata_json,
                    (SELECT COALESCE(GROUP_CONCAT(t.name, ' '), '') FROM tags t 
                     JOIN archive_tags at ON t.id = at.tag_id 
                     WHERE at.archive_item_uuid = NEW.uuid),
                    NEW.user_id, NEW.folder_uuid, NEW.created_at, NEW.updated_at, NEW.is_favorite
                );
            END;
        """))

        # Todos triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS todos_fts_enhanced_insert AFTER INSERT ON todos
            BEGIN
                INSERT INTO fts_todos_enhanced (
                    id, title, description, tags_text, user_id, project_id,
                    status, priority, due_date, created_at, updated_at
                )
                VALUES (
                    NEW.id, NEW.title, NEW.description,
                    (SELECT COALESCE(GROUP_CONCAT(t.name, ' '), '') FROM tags t 
                     JOIN todo_tags tt ON t.id = tt.tag_id 
                     WHERE tt.todo_id = NEW.id),
                    NEW.user_id, NEW.project_id, NEW.status, NEW.priority, NEW.due_date,
                    NEW.created_at, NEW.updated_at
                );
            END;
        """))

        # Diary entries triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS diary_entries_fts_enhanced_insert AFTER INSERT ON diary_entries
            BEGIN
                INSERT INTO fts_diary_entries_enhanced (
                    id, title, content, tags_text, mood, weather, user_id,
                    created_at, updated_at, has_media
                )
                VALUES (
                    NEW.id, NEW.title, NEW.content,
                    (SELECT COALESCE(GROUP_CONCAT(t.name, ' '), '') FROM tags t 
                     JOIN diary_tags dt ON t.id = dt.tag_id 
                     WHERE dt.diary_entry_id = NEW.id),
                    NEW.mood, NEW.weather, NEW.user_id, NEW.created_at, NEW.updated_at,
                    (SELECT COUNT(*) > 0 FROM diary_media WHERE diary_entry_id = NEW.id)
                );
            END;
        """))

        # Archive folders triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS archive_folders_fts_enhanced_insert AFTER INSERT ON archive_folders
            BEGIN
                INSERT INTO fts_folders_enhanced (
                    uuid, name, description, tags_text, parent_uuid, user_id,
                    created_at, updated_at, is_favorite
                )
                VALUES (
                    NEW.uuid, NEW.name, NEW.description,
                    (SELECT COALESCE(GROUP_CONCAT(t.name, ' '), '') FROM tags t 
                     JOIN folder_tags ft ON t.id = ft.tag_id 
                     WHERE ft.folder_uuid = NEW.uuid),
                    NEW.parent_uuid, NEW.user_id, NEW.created_at, NEW.updated_at, NEW.is_favorite
                );
            END;
        """))

    def _prepare_fts_query(self, query: str) -> str:
        """Prepare FTS5 query with proper sanitization and optimization"""
        if not query or not query.strip():
            return ""
        
        # Clean the query
        query = query.strip()
        
        # Handle quoted phrases
        if '"' in query:
            return query  # Let FTS5 handle quoted phrases directly
        
        # Split into terms and add prefix matching
        terms = re.findall(r'\w+', query.lower())
        if not terms:
            return ""
        
        # Create FTS5 query with prefix matching
        fts_terms = []
        for term in terms:
            if len(term) >= 2:
                fts_terms.append(f"{term}*")  # Prefix matching
        
        return " AND ".join(fts_terms) if fts_terms else ""

    async def enhanced_search_all(self, db: AsyncSession, query: str, user_id: int,
                                 modules: Optional[List[str]] = None,
                                 include_tags: Optional[List[str]] = None,
                                 exclude_tags: Optional[List[str]] = None,
                                 date_from: Optional[date] = None,
                                 date_to: Optional[date] = None,
                                 favorites_only: bool = False,
                                 include_archived: bool = True,
                                 sort_by: str = "relevance",
                                 sort_order: str = "desc",
                                 limit: int = 50, 
                                 offset: int = 0) -> Dict[str, Any]:
        """Enhanced search with proper BM25 ranking, normalization, and filtering"""
        
        if not self.tables_initialized:
            logger.warning("Enhanced FTS5 tables not initialized")
            return {"results": [], "total": 0, "modules_searched": []}
        
        # Determine modules to search
        if not modules:
            modules = ['notes', 'documents', 'archive_items', 'todos', 'diary_entries', 'folders']
        
        search_query = self._prepare_fts_query(query)
        if not search_query:
            return {"results": [], "total": 0, "modules_searched": modules}
        
        all_results = []
        modules_searched = []
        
        try:
            # Search each module with proper BM25 ranking (ORDER BY rank ASC)
            if 'notes' in modules:
                notes_results = await self._search_notes_enhanced(
                    db, search_query, user_id, include_tags, exclude_tags,
                    date_from, date_to, favorites_only, limit
                )
                all_results.extend(notes_results)
                modules_searched.append('notes')
            
            if 'documents' in modules:
                docs_results = await self._search_documents_enhanced(
                    db, search_query, user_id, include_tags, exclude_tags,
                    date_from, date_to, favorites_only, include_archived, limit
                )
                all_results.extend(docs_results)
                modules_searched.append('documents')
            
            if 'archive_items' in modules:
                archive_results = await self._search_archive_items_enhanced(
                    db, search_query, user_id, include_tags, exclude_tags,
                    date_from, date_to, favorites_only, limit
                )
                all_results.extend(archive_results)
                modules_searched.append('archive_items')
            
            if 'todos' in modules:
                todos_results = await self._search_todos_enhanced(
                    db, search_query, user_id, include_tags, exclude_tags,
                    date_from, date_to, limit
                )
                all_results.extend(todos_results)
                modules_searched.append('todos')
            
            if 'diary_entries' in modules or 'diary' in modules:
                diary_results = await self._search_diary_enhanced(
                    db, search_query, user_id, include_tags, exclude_tags,
                    date_from, date_to, limit
                )
                all_results.extend(diary_results)
                modules_searched.append('diary_entries')
            
            if 'folders' in modules:
                folders_results = await self._search_folders_enhanced(
                    db, search_query, user_id, include_tags, exclude_tags,
                    date_from, date_to, favorites_only, limit
                )
                all_results.extend(folders_results)
                modules_searched.append('folders')
            
            # Apply cross-module normalization
            normalized_results = self._normalize_cross_module_scores(all_results)
            
            # Apply sorting
            sorted_results = self._apply_sorting(normalized_results, sort_by, sort_order)
            
            # Apply pagination
            total_results = len(sorted_results)
            paginated_results = sorted_results[offset:offset + limit]
            
            return {
                "results": paginated_results,
                "total": total_results,
                "modules_searched": modules_searched,
                "query": query,
                "search_type": "enhanced_fts5"
            }
            
        except Exception as e:
            logger.error(f"❌ Enhanced FTS5 search failed: {e}")
            return {"results": [], "total": 0, "modules_searched": []}

    async def _search_notes_enhanced(self, db: AsyncSession, search_query: str, user_id: int,
                                   include_tags: Optional[List[str]], exclude_tags: Optional[List[str]],
                                   date_from: Optional[date], date_to: Optional[date],
                                   favorites_only: bool, limit: int) -> List[Dict[str, Any]]:
        """Search notes with enhanced filtering"""
        
        # Build SQL with proper filtering
        base_sql = """
            SELECT 'note' as type, id, title, content, tags_text, area,
                   created_at, updated_at, is_favorite,
                   bm25(fts_notes_enhanced) as raw_score
            FROM fts_notes_enhanced 
            WHERE fts_notes_enhanced MATCH :query AND user_id = :user_id
        """
        
        # Add filtering conditions
        conditions = []
        params = {'query': search_query, 'user_id': user_id}
        
        if include_tags:
            for i, tag in enumerate(include_tags):
                conditions.append(f"tags_text LIKE :include_tag_{i}")
                params[f'include_tag_{i}'] = f'%{tag}%'
        
        if exclude_tags:
            for i, tag in enumerate(exclude_tags):
                conditions.append(f"tags_text NOT LIKE :exclude_tag_{i}")
                params[f'exclude_tag_{i}'] = f'%{tag}%'
        
        if date_from:
            conditions.append("date(created_at) >= :date_from")
            params['date_from'] = date_from.isoformat()
        
        if date_to:
            conditions.append("date(created_at) <= :date_to")
            params['date_to'] = date_to.isoformat()
        
        if favorites_only:
            conditions.append("is_favorite = 1")
        
        if conditions:
            base_sql += " AND " + " AND ".join(conditions)
        
        base_sql += " ORDER BY raw_score ASC LIMIT :limit"  # Fixed BM25 ordering
        params['limit'] = limit
        
        try:
            result = await db.execute(text(base_sql), params)
            results = []
            
            for row in result.fetchall():
                results.append({
                    'type': row.type,
                    'module': 'notes',
                    'id': row.id,
                    'title': row.title,
                    'content': row.content[:300] + '...' if len(row.content) > 300 else row.content,
                    'tags': row.tags_text.split() if row.tags_text else [],
                    'area': row.area,
                    'created_at': row.created_at,
                    'updated_at': row.updated_at,
                    'is_favorite': bool(row.is_favorite),
                    'raw_score': float(row.raw_score) if row.raw_score else 0.0,
                    'url': f"/notes/{row.id}"
                })
            
            return results
            
        except Exception as e:
            logger.error(f"❌ Enhanced notes search failed: {e}")
            return []

    async def _search_documents_enhanced(self, db: AsyncSession, search_query: str, user_id: int,
                                       include_tags: Optional[List[str]], exclude_tags: Optional[List[str]],
                                       date_from: Optional[date], date_to: Optional[date],
                                       favorites_only: bool, include_archived: bool, limit: int) -> List[Dict[str, Any]]:
        """Search documents with enhanced filtering"""
        
        base_sql = """
            SELECT 'document' as type, uuid, title, filename, original_name, description, tags_text,
                   mime_type, file_size, created_at, updated_at, is_favorite, is_archived,
                   bm25(fts_documents_enhanced) as raw_score
            FROM fts_documents_enhanced 
            WHERE fts_documents_enhanced MATCH :query AND user_id = :user_id
        """
        
        conditions = []
        params = {'query': search_query, 'user_id': user_id}
        
        if include_tags:
            for i, tag in enumerate(include_tags):
                conditions.append(f"tags_text LIKE :include_tag_{i}")
                params[f'include_tag_{i}'] = f'%{tag}%'
        
        if exclude_tags:
            for i, tag in enumerate(exclude_tags):
                conditions.append(f"tags_text NOT LIKE :exclude_tag_{i}")
                params[f'exclude_tag_{i}'] = f'%{tag}%'
        
        if date_from:
            conditions.append("date(created_at) >= :date_from")
            params['date_from'] = date_from.isoformat()
        
        if date_to:
            conditions.append("date(created_at) <= :date_to")
            params['date_to'] = date_to.isoformat()
        
        if favorites_only:
            conditions.append("is_favorite = 1")
        
        if not include_archived:
            conditions.append("is_archived = 0")
        
        if conditions:
            base_sql += " AND " + " AND ".join(conditions)
        
        base_sql += " ORDER BY raw_score ASC LIMIT :limit"  # Fixed BM25 ordering
        params['limit'] = limit
        
        try:
            result = await db.execute(text(base_sql), params)
            results = []
            
            for row in result.fetchall():
                results.append({
                    'type': row.type,
                    'module': 'documents',
                    'uuid': row.uuid,
                    'title': row.title,
                    'filename': row.filename,
                    'original_name': row.original_name,
                    'description': row.description,
                    'tags': row.tags_text.split() if row.tags_text else [],
                    'mime_type': row.mime_type,
                    'file_size': row.file_size,
                    'created_at': row.created_at,
                    'updated_at': row.updated_at,
                    'is_favorite': bool(row.is_favorite),
                    'is_archived': bool(row.is_archived),
                    'raw_score': float(row.raw_score) if row.raw_score else 0.0,
                    'url': f"/documents/{row.uuid}"
                })
            
            return results
            
        except Exception as e:
            logger.error(f"❌ Enhanced documents search failed: {e}")
            return []

    async def _search_archive_items_enhanced(self, db: AsyncSession, search_query: str, user_id: int,
                                           include_tags: Optional[List[str]], exclude_tags: Optional[List[str]],
                                           date_from: Optional[date], date_to: Optional[date],
                                           favorites_only: bool, limit: int) -> List[Dict[str, Any]]:
        """Search archive items with enhanced filtering"""
        
        base_sql = """
            SELECT 'archive_item' as type, uuid, name, description, original_filename, 
                   metadata_json, tags_text, folder_uuid, created_at, updated_at, is_favorite,
                   bm25(fts_archive_items_enhanced) as raw_score
            FROM fts_archive_items_enhanced 
            WHERE fts_archive_items_enhanced MATCH :query AND user_id = :user_id
        """
        
        conditions = []
        params = {'query': search_query, 'user_id': user_id}
        
        if include_tags:
            for i, tag in enumerate(include_tags):
                conditions.append(f"tags_text LIKE :include_tag_{i}")
                params[f'include_tag_{i}'] = f'%{tag}%'
        
        if exclude_tags:
            for i, tag in enumerate(exclude_tags):
                conditions.append(f"tags_text NOT LIKE :exclude_tag_{i}")
                params[f'exclude_tag_{i}'] = f'%{tag}%'
        
        if date_from:
            conditions.append("date(created_at) >= :date_from")
            params['date_from'] = date_from.isoformat()
        
        if date_to:
            conditions.append("date(created_at) <= :date_to")
            params['date_to'] = date_to.isoformat()
        
        if favorites_only:
            conditions.append("is_favorite = 1")
        
        if conditions:
            base_sql += " AND " + " AND ".join(conditions)
        
        base_sql += " ORDER BY raw_score ASC LIMIT :limit"  # Fixed BM25 ordering
        params['limit'] = limit
        
        try:
            result = await db.execute(text(base_sql), params)
            results = []
            
            for row in result.fetchall():
                results.append({
                    'type': row.type,
                    'module': 'archive',
                    'uuid': row.uuid,
                    'name': row.name,
                    'description': row.description,
                    'original_filename': row.original_filename,
                    'metadata': json.loads(row.metadata_json) if row.metadata_json else {},
                    'tags': row.tags_text.split() if row.tags_text else [],
                    'folder_uuid': row.folder_uuid,
                    'created_at': row.created_at,
                    'updated_at': row.updated_at,
                    'is_favorite': bool(row.is_favorite),
                    'raw_score': float(row.raw_score) if row.raw_score else 0.0,
                    'url': f"/archive/items/{row.uuid}"
                })
            
            return results
            
        except Exception as e:
            logger.error(f"❌ Enhanced archive items search failed: {e}")
            return []

    async def _search_todos_enhanced(self, db: AsyncSession, search_query: str, user_id: int,
                                   include_tags: Optional[List[str]], exclude_tags: Optional[List[str]],
                                   date_from: Optional[date], date_to: Optional[date],
                                   limit: int) -> List[Dict[str, Any]]:
        """Search todos with enhanced filtering"""
        
        base_sql = """
            SELECT 'todo' as type, id, title, description, tags_text, status, priority,
                   due_date, created_at, updated_at,
                   bm25(fts_todos_enhanced) as raw_score
            FROM fts_todos_enhanced 
            WHERE fts_todos_enhanced MATCH :query AND user_id = :user_id
        """
        
        conditions = []
        params = {'query': search_query, 'user_id': user_id}
        
        if include_tags:
            for i, tag in enumerate(include_tags):
                conditions.append(f"tags_text LIKE :include_tag_{i}")
                params[f'include_tag_{i}'] = f'%{tag}%'
        
        if exclude_tags:
            for i, tag in enumerate(exclude_tags):
                conditions.append(f"tags_text NOT LIKE :exclude_tag_{i}")
                params[f'exclude_tag_{i}'] = f'%{tag}%'
        
        if date_from:
            conditions.append("date(created_at) >= :date_from")
            params['date_from'] = date_from.isoformat()
        
        if date_to:
            conditions.append("date(created_at) <= :date_to")
            params['date_to'] = date_to.isoformat()
        
        if conditions:
            base_sql += " AND " + " AND ".join(conditions)
        
        base_sql += " ORDER BY raw_score ASC LIMIT :limit"  # Fixed BM25 ordering
        params['limit'] = limit
        
        try:
            result = await db.execute(text(base_sql), params)
            results = []
            
            for row in result.fetchall():
                results.append({
                    'type': row.type,
                    'module': 'todos',
                    'id': row.id,
                    'title': row.title,
                    'description': row.description,
                    'tags': row.tags_text.split() if row.tags_text else [],
                    'status': row.status,
                    'priority': row.priority,
                    'due_date': row.due_date,
                    'created_at': row.created_at,
                    'updated_at': row.updated_at,
                    'raw_score': float(row.raw_score) if row.raw_score else 0.0,
                    'url': f"/todos/{row.id}"
                })
            
            return results
            
        except Exception as e:
            logger.error(f"❌ Enhanced todos search failed: {e}")
            return []

    async def _search_diary_enhanced(self, db: AsyncSession, search_query: str, user_id: int,
                                   include_tags: Optional[List[str]], exclude_tags: Optional[List[str]],
                                   date_from: Optional[date], date_to: Optional[date],
                                   limit: int) -> List[Dict[str, Any]]:
        """Search diary entries with enhanced filtering"""
        
        base_sql = """
            SELECT 'diary_entry' as type, id, title, content, tags_text, mood, weather,
                   created_at, updated_at, has_media,
                   bm25(fts_diary_entries_enhanced) as raw_score
            FROM fts_diary_entries_enhanced 
            WHERE fts_diary_entries_enhanced MATCH :query AND user_id = :user_id
        """
        
        conditions = []
        params = {'query': search_query, 'user_id': user_id}
        
        if include_tags:
            for i, tag in enumerate(include_tags):
                conditions.append(f"tags_text LIKE :include_tag_{i}")
                params[f'include_tag_{i}'] = f'%{tag}%'
        
        if exclude_tags:
            for i, tag in enumerate(exclude_tags):
                conditions.append(f"tags_text NOT LIKE :exclude_tag_{i}")
                params[f'exclude_tag_{i}'] = f'%{tag}%'
        
        if date_from:
            conditions.append("date(created_at) >= :date_from")
            params['date_from'] = date_from.isoformat()
        
        if date_to:
            conditions.append("date(created_at) <= :date_to")
            params['date_to'] = date_to.isoformat()
        
        if conditions:
            base_sql += " AND " + " AND ".join(conditions)
        
        base_sql += " ORDER BY raw_score ASC LIMIT :limit"  # Fixed BM25 ordering
        params['limit'] = limit
        
        try:
            result = await db.execute(text(base_sql), params)
            results = []
            
            for row in result.fetchall():
                results.append({
                    'type': row.type,
                    'module': 'diary',
                    'id': row.id,
                    'title': row.title,
                    'content': row.content[:300] + '...' if row.content and len(row.content) > 300 else row.content or '',
                    'tags': row.tags_text.split() if row.tags_text else [],
                    'mood': row.mood,
                    'weather': row.weather,
                    'created_at': row.created_at,
                    'updated_at': row.updated_at,
                    'has_media': bool(row.has_media),
                    'raw_score': float(row.raw_score) if row.raw_score else 0.0,
                    'url': f"/diary/{row.id}"
                })
            
            return results
            
        except Exception as e:
            logger.error(f"❌ Enhanced diary search failed: {e}")
            return []

    async def _search_folders_enhanced(self, db: AsyncSession, search_query: str, user_id: int,
                                     include_tags: Optional[List[str]], exclude_tags: Optional[List[str]],
                                     date_from: Optional[date], date_to: Optional[date],
                                     favorites_only: bool, limit: int) -> List[Dict[str, Any]]:
        """Search archive folders with enhanced filtering"""
        
        base_sql = """
            SELECT 'folder' as type, uuid, name, description, tags_text, parent_uuid,
                   created_at, updated_at, is_favorite,
                   bm25(fts_folders_enhanced) as raw_score
            FROM fts_folders_enhanced 
            WHERE fts_folders_enhanced MATCH :query AND user_id = :user_id
        """
        
        conditions = []
        params = {'query': search_query, 'user_id': user_id}
        
        if include_tags:
            for i, tag in enumerate(include_tags):
                conditions.append(f"tags_text LIKE :include_tag_{i}")
                params[f'include_tag_{i}'] = f'%{tag}%'
        
        if exclude_tags:
            for i, tag in enumerate(exclude_tags):
                conditions.append(f"tags_text NOT LIKE :exclude_tag_{i}")
                params[f'exclude_tag_{i}'] = f'%{tag}%'
        
        if date_from:
            conditions.append("date(created_at) >= :date_from")
            params['date_from'] = date_from.isoformat()
        
        if date_to:
            conditions.append("date(created_at) <= :date_to")
            params['date_to'] = date_to.isoformat()
        
        if favorites_only:
            conditions.append("is_favorite = 1")
        
        if conditions:
            base_sql += " AND " + " AND ".join(conditions)
        
        base_sql += " ORDER BY raw_score ASC LIMIT :limit"  # Fixed BM25 ordering
        params['limit'] = limit
        
        try:
            result = await db.execute(text(base_sql), params)
            results = []
            
            for row in result.fetchall():
                results.append({
                    'type': row.type,
                    'module': 'folders',
                    'uuid': row.uuid,
                    'name': row.name,
                    'description': row.description,
                    'tags': row.tags_text.split() if row.tags_text else [],
                    'parent_uuid': row.parent_uuid,
                    'created_at': row.created_at,
                    'updated_at': row.updated_at,
                    'is_favorite': bool(row.is_favorite),
                    'raw_score': float(row.raw_score) if row.raw_score else 0.0,
                    'url': f"/archive/folders/{row.uuid}"
                })
            
            return results
            
        except Exception as e:
            logger.error(f"❌ Enhanced folders search failed: {e}")
            return []

    def _normalize_cross_module_scores(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Apply cross-module score normalization for fair ranking"""
        
        if not results:
            return results
        
        # Group results by module
        module_groups = {}
        for result in results:
            module = result.get('module', 'unknown')
            if module not in module_groups:
                module_groups[module] = []
            module_groups[module].append(result)
        
        normalized_results = []
        
        for module, module_results in module_groups.items():
            if not module_results:
                continue
            
            # Get raw scores for this module
            raw_scores = [r['raw_score'] for r in module_results if r.get('raw_score') is not None]
            
            if not raw_scores:
                # No scores, assign default
                for result in module_results:
                    result['relevance_score'] = 0.5
                    normalized_results.extend(module_results)
                continue
            
            # Normalize BM25 scores (smaller is better) to 0-1 range (larger is better)
            min_score = min(raw_scores)
            max_score = max(raw_scores)
            score_range = max_score - min_score if max_score > min_score else 1.0
            
            module_weight = self.module_weights.get(module, 0.5)
            
            for result in module_results:
                raw_score = result.get('raw_score', max_score)
                # Invert BM25 score and normalize to 0-1
                normalized_score = 1.0 - ((raw_score - min_score) / score_range)
                # Apply module weight
                result['relevance_score'] = normalized_score * module_weight
                result['normalized_score'] = normalized_score  # Keep original normalized score
                
            normalized_results.extend(module_results)
        
        return normalized_results

    def _apply_sorting(self, results: List[Dict[str, Any]], sort_by: str, sort_order: str) -> List[Dict[str, Any]]:
        """Apply sorting to search results"""
        
        reverse = sort_order.lower() == 'desc'
        
        if sort_by == 'relevance':
            return sorted(results, key=lambda x: x.get('relevance_score', 0), reverse=reverse)
        elif sort_by == 'date':
            return sorted(results, key=lambda x: x.get('created_at', ''), reverse=reverse)
        elif sort_by == 'title':
            return sorted(results, key=lambda x: (x.get('title') or x.get('name', '')).lower(), reverse=reverse)
        elif sort_by == 'module':
            return sorted(results, key=lambda x: x.get('module', ''), reverse=reverse)
        else:
            # Default to relevance
            return sorted(results, key=lambda x: x.get('relevance_score', 0), reverse=True)

    async def optimize_enhanced_fts_tables(self, db: AsyncSession) -> bool:
        """Optimize enhanced FTS5 tables for better performance"""
        try:
            tables = [
                'fts_notes_enhanced', 
                'fts_documents_enhanced', 
                'fts_archive_items_enhanced', 
                'fts_todos_enhanced',
                'fts_diary_entries_enhanced',
                'fts_folders_enhanced'
            ]
            
            for table in tables:
                await db.execute(text(f"INSERT INTO {table}({table}) VALUES('optimize');"))
            
            await db.commit()
            logger.info("✅ Enhanced FTS5 tables optimized")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to optimize enhanced FTS5 tables: {e}")
            await db.rollback()
            return False

# Create global enhanced instance
enhanced_fts_service = EnhancedFTS5SearchService()
