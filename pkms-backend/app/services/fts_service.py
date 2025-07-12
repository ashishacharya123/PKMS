"""
FTS5 Full-Text Search Service
Provides high-performance full-text search using SQLite FTS5
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime

logger = logging.getLogger(__name__)

class FTS5SearchService:
    """Service for managing FTS5 full-text search"""

    def __init__(self):
        self.tables_initialized = False

    async def initialize_fts_tables(self, db: AsyncSession) -> bool:
        """Initialize FTS5 virtual tables"""
        try:
            # Create FTS5 virtual table for notes
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_notes USING fts5(
                    id UNINDEXED,
                    title,
                    content,
                    tags,
                    user_id UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED,
                    content='notes',
                    content_rowid='id'
                );
            """))
            
            # Create FTS5 virtual table for documents
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_documents USING fts5(
                    uuid UNINDEXED,
                    title,
                    filename,
                    original_name,
                    description,
                    user_id UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED,
                    content='documents',
                    content_rowid='uuid'
                );
            """))
            
            # Create FTS5 virtual table for archive items
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_archive_items USING fts5(
                    uuid UNINDEXED,
                    name,
                    description,
                    original_filename,
                    metadata_json,
                    user_id UNINDEXED,
                    folder_uuid UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED,
                    content='archive_items',
                    content_rowid='uuid'
                );
            """))
            
            # Create FTS5 virtual table for todos
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_todos USING fts5(
                    id UNINDEXED,
                    title,
                    description,
                    user_id UNINDEXED,
                    project_id UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED,
                    content='todos',
                    content_rowid='id'
                );
            """))
            
            # Create FTS5 virtual table for diary entries
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_diary_entries USING fts5(
                    id UNINDEXED,
                    title,
                    tags,
                    metadata_json,
                    user_id UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED,
                    content='diary_entries',
                    content_rowid='id'
                );
            """))
            
            # Create FTS5 virtual table for archive folders
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_folders USING fts5(
                    uuid UNINDEXED,
                    name,
                    description,
                    parent_uuid UNINDEXED,
                    user_id UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED,
                    content='archive_folders',
                    content_rowid='uuid'
                );
            """))
            
            # Create triggers to keep FTS tables in sync
            await self._create_sync_triggers(db)
            
            await db.commit()
            self.tables_initialized = True
            logger.info("✅ FTS5 virtual tables initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize FTS5 tables: {e}")
            await db.rollback()
            return False

    async def _create_sync_triggers(self, db: AsyncSession):
        """Create triggers to keep FTS tables synchronized with content tables"""
        
        # Notes triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
                INSERT INTO fts_notes(id, title, content, tags, user_id, created_at, updated_at)
                VALUES (new.id, new.title, new.content, 
                       COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM note_tags nt 
                                JOIN tags t ON nt.tag_id = t.id 
                                WHERE nt.note_id = new.id), ''),
                       new.user_id, new.created_at, new.updated_at);
            END;
        """))
        
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
                UPDATE fts_notes SET 
                    title = new.title,
                    content = new.content,
                    tags = COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM note_tags nt 
                                    JOIN tags t ON nt.tag_id = t.id 
                                    WHERE nt.note_id = new.id), ''),
                    updated_at = new.updated_at
                WHERE id = new.id;
            END;
        """))
        
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
                DELETE FROM fts_notes WHERE id = old.id;
            END;
        """))
        
        # Documents triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS documents_fts_insert AFTER INSERT ON documents BEGIN
                INSERT INTO fts_documents(uuid, title, filename, original_name, description, 
                                        user_id, created_at, updated_at)
                VALUES (new.uuid, new.title, new.filename, new.original_name, new.description,
                       new.user_id, new.created_at, new.updated_at);
            END;
        """))
        
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS documents_fts_update AFTER UPDATE ON documents BEGIN
                UPDATE fts_documents SET 
                    title = new.title,
                    filename = new.filename,
                    original_name = new.original_name,
                    description = new.description,
                    updated_at = new.updated_at
                WHERE uuid = new.uuid;
            END;
        """))
        
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS documents_fts_delete AFTER DELETE ON documents BEGIN
                DELETE FROM fts_documents WHERE uuid = old.uuid;
            END;
        """))
        
        # Archive items triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS archive_items_fts_insert AFTER INSERT ON archive_items BEGIN
                INSERT INTO fts_archive_items(uuid, name, description, original_filename, 
                                            metadata_json, user_id, 
                                            folder_uuid, created_at, updated_at)
                VALUES (new.uuid, new.name, new.description, new.original_filename,
                       new.metadata_json, new.user_id,
                       new.folder_uuid, new.created_at, new.updated_at);
            END;
        """))
        
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS archive_items_fts_update AFTER UPDATE ON archive_items BEGIN
                UPDATE fts_archive_items SET 
                    name = new.name,
                    description = new.description,
                    original_filename = new.original_filename,
                    metadata_json = new.metadata_json,
                    folder_uuid = new.folder_uuid,
                    updated_at = new.updated_at
                WHERE uuid = new.uuid;
            END;
        """))
        
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS archive_items_fts_delete AFTER DELETE ON archive_items BEGIN
                DELETE FROM fts_archive_items WHERE uuid = old.uuid;
            END;
        """))
        
        # Todos triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS todos_fts_insert AFTER INSERT ON todos BEGIN
                INSERT INTO fts_todos(id, title, description, user_id, project_id, created_at, updated_at)
                VALUES (new.id, new.title, new.description, new.user_id, 
                       new.project_id, new.created_at, new.updated_at);
            END;
        """))
        
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS todos_fts_update AFTER UPDATE ON todos BEGIN
                UPDATE fts_todos SET 
                    title = new.title,
                    description = new.description,
                    project_id = new.project_id,
                    updated_at = new.updated_at
                WHERE id = new.id;
            END;
        """))
        
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS todos_fts_delete AFTER DELETE ON todos BEGIN
                DELETE FROM fts_todos WHERE id = old.id;
            END;
        """))

        # Diary entries triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS diary_entries_fts_insert AFTER INSERT ON diary_entries BEGIN
                INSERT INTO fts_diary_entries(id, title, tags, metadata_json, user_id, created_at, updated_at)
                VALUES (new.id, new.title,
                    COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM diary_tags dt 
                              JOIN tags t ON dt.tag_id = t.id 
                              WHERE dt.diary_entry_id = new.id), ''),
                    new.metadata_json, new.user_id, new.created_at, new.updated_at);
            END;
        """))
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS diary_entries_fts_update AFTER UPDATE ON diary_entries BEGIN
                UPDATE fts_diary_entries SET 
                    title = new.title,
                    tags = COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM diary_tags dt 
                                     JOIN tags t ON dt.tag_id = t.id 
                                     WHERE dt.diary_entry_id = new.id), ''),
                    metadata_json = new.metadata_json,
                    updated_at = new.updated_at
                WHERE id = new.id;
            END;
        """))
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS diary_entries_fts_delete AFTER DELETE ON diary_entries BEGIN
                DELETE FROM fts_diary_entries WHERE id = old.id;
            END;
        """))

        # Archive folders triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS folders_fts_insert AFTER INSERT ON archive_folders BEGIN
                INSERT INTO fts_folders(uuid, name, description, parent_uuid, user_id, created_at, updated_at)
                VALUES (new.uuid, new.name, new.description, new.parent_uuid, new.user_id, new.created_at, new.updated_at);
            END;
        """))
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS folders_fts_update AFTER UPDATE ON archive_folders BEGIN
                UPDATE fts_folders SET 
                    name = new.name,
                    description = new.description,
                    parent_uuid = new.parent_uuid,
                    updated_at = new.updated_at
                WHERE uuid = new.uuid;
            END;
        """))
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS folders_fts_delete AFTER DELETE ON archive_folders BEGIN
                DELETE FROM fts_folders WHERE uuid = old.uuid;
            END;
        """))

    async def populate_fts_tables(self, db: AsyncSession) -> bool:
        """Populate FTS tables with existing data"""
        try:
            # Populate notes
            await db.execute(text("""
                INSERT INTO fts_notes(id, title, content, area, tags, user_id, created_at, updated_at)
                SELECT n.id, n.title, n.content, n.area,
                       COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM note_tags nt 
                                JOIN tags t ON nt.tag_id = t.id 
                                WHERE nt.note_id = n.id), '') as tags,
                       n.user_id, n.created_at, n.updated_at
                FROM notes n
                WHERE n.id NOT IN (SELECT id FROM fts_notes);
            """))
            
            # Populate documents
            await db.execute(text("""
                INSERT INTO fts_documents(uuid, filename, original_name, description, 
                                        user_id, created_at, updated_at)
                SELECT uuid, filename, original_name, description,
                       user_id, created_at, updated_at
                FROM documents
                WHERE uuid NOT IN (SELECT uuid FROM fts_documents);
            """))
            
            # Populate archive items
            await db.execute(text("""
                INSERT INTO fts_archive_items(uuid, name, description, original_filename, 
                                            metadata_json, user_id, 
                                            folder_uuid, created_at, updated_at)
                SELECT uuid, name, description, original_filename, metadata_json,
                       user_id, folder_uuid, created_at, updated_at
                FROM archive_items
                WHERE uuid NOT IN (SELECT uuid FROM fts_archive_items);
            """))
            
            # Populate todos
            await db.execute(text("""
                INSERT INTO fts_todos(id, title, description, user_id, project_id, created_at, updated_at)
                SELECT id, title, description, user_id, project_id, created_at, updated_at
                FROM todos
                WHERE id NOT IN (SELECT id FROM fts_todos);
            """))
            
            # Populate diary entries
            await db.execute(text("""
                INSERT INTO fts_diary_entries(id, title, tags, metadata_json, user_id, created_at, updated_at)
                SELECT d.id, d.title,
                       COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM diary_tags dt 
                                JOIN tags t ON dt.tag_id = t.id 
                                WHERE dt.diary_entry_id = d.id), '') as tags,
                       d.metadata_json, d.user_id, d.created_at, d.updated_at
                FROM diary_entries d
                WHERE d.id NOT IN (SELECT id FROM fts_diary_entries);
            """))
            
            # Populate archive folders
            await db.execute(text("""
                INSERT INTO fts_folders(uuid, name, description, parent_uuid, user_id, created_at, updated_at)
                SELECT uuid, name, description, parent_uuid, user_id, created_at, updated_at
                FROM archive_folders
                WHERE uuid NOT IN (SELECT uuid FROM fts_folders);
            """))
            
            await db.commit()
            logger.info("✅ FTS5 tables populated with existing data")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to populate FTS5 tables: {e}")
            await db.rollback()
            return False

    async def search_all(self, db: AsyncSession, query: str, user_id: int, 
                        content_types: Optional[List[str]] = None,
                        limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Search across all content types using FTS5"""
        
        if not self.tables_initialized:
            logger.warning("FTS5 tables not initialized, falling back to regular search")
            return []
        
        results = []
        search_query = self._prepare_fts_query(query)
        
        # Determine which content types to search
        if not content_types:
            content_types = ['notes', 'documents', 'archive_items', 'todos']
        
        try:
            # Search notes
            if 'notes' in content_types:
                notes_sql = text("""
                    SELECT 'note' as type, id, title, content, area, created_at, updated_at,
                           bm25(fts_notes) as rank
                    FROM fts_notes 
                    WHERE fts_notes MATCH :query AND user_id = :user_id
                    ORDER BY rank
                    LIMIT :limit OFFSET :offset
                """)
                
                result = await db.execute(notes_sql, {
                    'query': search_query, 
                    'user_id': user_id, 
                    'limit': limit, 
                    'offset': offset
                })
                
                for row in result.fetchall():
                    results.append({
                        'type': row.type,
                        'id': row.id,
                        'title': row.title,
                        'content': row.content[:300] + '...' if len(row.content) > 300 else row.content,
                        'area': row.area,
                        'created_at': row.created_at,
                        'updated_at': row.updated_at,
                        'relevance_score': float(row.rank) if row.rank else 0.0
                    })
            
            # Search documents
            if 'documents' in content_types:
                docs_sql = text("""
                    SELECT 'document' as type, uuid, filename, original_name, 
                           description, created_at, updated_at,
                           bm25(fts_documents) as rank
                    FROM fts_documents 
                    WHERE fts_documents MATCH :query AND user_id = :user_id
                    ORDER BY rank
                    LIMIT :limit OFFSET :offset
                """)
                
                result = await db.execute(docs_sql, {
                    'query': search_query, 
                    'user_id': user_id, 
                    'limit': limit, 
                    'offset': offset
                })
                
                for row in result.fetchall():
                    results.append({
                        'type': row.type,
                        'id': row.uuid,
                        'title': row.original_name,
                        'content': '', # Remove extracted_text
                        'filename': row.filename,
                        'created_at': row.created_at,
                        'updated_at': row.updated_at,
                        'relevance_score': float(row.rank) if row.rank else 0.0
                    })
            
            # Search archive items
            if 'archive_items' in content_types:
                archive_sql = text("""
                    SELECT 'archive_item' as type, uuid, name, description, 
                           original_filename, metadata_json, folder_uuid,
                           created_at, updated_at, bm25(fts_archive_items) as rank
                    FROM fts_archive_items 
                    WHERE fts_archive_items MATCH :query AND user_id = :user_id
                    ORDER BY rank
                    LIMIT :limit OFFSET :offset
                """)
                
                result = await db.execute(archive_sql, {
                    'query': search_query, 
                    'user_id': user_id, 
                    'limit': limit, 
                    'offset': offset
                })
                
                for row in result.fetchall():
                    results.append({
                        'type': row.type,
                        'id': row.uuid,
                        'title': row.name,
                        'content': '', # Remove extracted_text
                        'filename': row.original_filename,
                        'folder_uuid': row.folder_uuid,
                        'created_at': row.created_at,
                        'updated_at': row.updated_at,
                        'relevance_score': float(row.rank) if row.rank else 0.0
                    })
            
            # Search todos
            if 'todos' in content_types:
                todos_sql = text("""
                    SELECT 'todo' as type, id, title, description, project_id,
                           created_at, updated_at, bm25(fts_todos) as rank
                    FROM fts_todos 
                    WHERE fts_todos MATCH :query AND user_id = :user_id
                    ORDER BY rank
                    LIMIT :limit OFFSET :offset
                """)
                
                result = await db.execute(todos_sql, {
                    'query': search_query, 
                    'user_id': user_id, 
                    'limit': limit, 
                    'offset': offset
                })
                
                for row in result.fetchall():
                    results.append({
                        'type': row.type,
                        'id': row.id,
                        'title': row.title,
                        'content': row.description or '',
                        'project_id': row.project_id,
                        'created_at': row.created_at,
                        'updated_at': row.updated_at,
                        'relevance_score': float(row.rank) if row.rank else 0.0
                    })
            
            # Sort all results by relevance score
            results.sort(key=lambda x: x['relevance_score'], reverse=True)
            
            return results[:limit]
            
        except Exception as e:
            logger.error(f"❌ FTS5 search failed: {e}")
            return []

    def _prepare_fts_query(self, query: str) -> str:
        """Prepare query string for FTS5 with proper escaping and operators"""
        # Remove special characters that could break FTS5
        cleaned_query = ''.join(c for c in query if c.isalnum() or c.isspace())
        
        # Split into terms and add prefix matching
        terms = cleaned_query.strip().split()
        if not terms:
            return '""'
        
        # Use prefix matching for better results
        fts_terms = []
        for term in terms:
            if len(term) >= 2:  # Only add meaningful terms
                fts_terms.append(f'"{term}"*')
        
        return ' OR '.join(fts_terms) if fts_terms else '""'

    async def optimize_fts_tables(self, db: AsyncSession) -> bool:
        """Optimize FTS5 tables for better performance"""
        try:
            tables = ['fts_notes', 'fts_documents', 'fts_archive_items', 'fts_todos']
            
            for table in tables:
                await db.execute(text(f"INSERT INTO {table}({table}) VALUES('optimize');"))
            
            await db.commit()
            logger.info("✅ FTS5 tables optimized")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to optimize FTS5 tables: {e}")
            return False

# Create global instance
fts_service = FTS5SearchService() 