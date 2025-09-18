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
                    updated_at UNINDEXED
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
                    updated_at UNINDEXED
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
                    updated_at UNINDEXED
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
                    updated_at UNINDEXED
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
                    updated_at UNINDEXED
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
                    updated_at UNINDEXED
                );
            """))

            # Create FTS5 virtual table for projects
            await db.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS fts_projects USING fts5(
                    id UNINDEXED,
                    name,
                    description,
                    tags_text,
                    user_id UNINDEXED,
                    created_at UNINDEXED,
                    updated_at UNINDEXED
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
        # First, drop any existing triggers so we replace stale definitions created by older versions
        drop_statements = [
            # Notes
            "DROP TRIGGER IF EXISTS notes_fts_insert;",
            "DROP TRIGGER IF EXISTS notes_fts_update;",
            "DROP TRIGGER IF EXISTS notes_fts_delete;",
            # Documents
            "DROP TRIGGER IF EXISTS documents_fts_insert;",
            "DROP TRIGGER IF EXISTS documents_fts_update;",
            "DROP TRIGGER IF EXISTS documents_fts_delete;",
            # Archive items
            "DROP TRIGGER IF EXISTS archive_items_fts_insert;",
            "DROP TRIGGER IF EXISTS archive_items_fts_update;",
            "DROP TRIGGER IF EXISTS archive_items_fts_delete;",
            # Todos
            "DROP TRIGGER IF EXISTS todos_fts_insert;",
            "DROP TRIGGER IF EXISTS todos_fts_update;",
            "DROP TRIGGER IF EXISTS todos_fts_delete;",
            # Diary entries
            "DROP TRIGGER IF EXISTS diary_entries_fts_insert;",
            "DROP TRIGGER IF EXISTS diary_entries_fts_update;",
            "DROP TRIGGER IF EXISTS diary_entries_fts_delete;",
            # Archive folders
            "DROP TRIGGER IF EXISTS folders_fts_insert;",
            "DROP TRIGGER IF EXISTS folders_fts_update;",
            "DROP TRIGGER IF EXISTS folders_fts_delete;",
            # Projects
            "DROP TRIGGER IF EXISTS projects_fts_insert;",
            "DROP TRIGGER IF EXISTS projects_fts_update;",
            "DROP TRIGGER IF EXISTS projects_fts_delete;",
        ]
        for stmt in drop_statements:
            try:
                await db.execute(text(stmt))
            except Exception:
                # Ignore individual drop errors to keep initialization resilient
                pass

        
        # Notes triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
                INSERT INTO fts_notes(id, title, content, tags, user_id, created_at, updated_at)
                VALUES (new.id, new.title, new.content, 
                       COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM note_tags nt 
                                JOIN tags t ON nt.tag_uuid = t.uuid 
                                WHERE nt.note_uuid = new.uuid), ''),
                       new.user_id, new.created_at, new.updated_at);
            END;
        """))
        
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE ON notes BEGIN
                UPDATE fts_notes SET 
                    title = new.title,
                    content = new.content,
                    tags = COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM note_tags nt 
                                    JOIN tags t ON nt.tag_uuid = t.uuid 
                                    WHERE nt.note_uuid = new.uuid), ''),
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
                              JOIN tags t ON dt.tag_uuid = t.uuid 
                              WHERE dt.diary_entry_uuid = new.uuid), ''),
                    new.metadata_json, new.user_id, new.created_at, new.updated_at);
            END;
        """))
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS diary_entries_fts_update AFTER UPDATE ON diary_entries BEGIN
                UPDATE fts_diary_entries SET 
                    title = new.title,
                    tags = COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM diary_tags dt 
                                     JOIN tags t ON dt.tag_uuid = t.uuid 
                                     WHERE dt.diary_entry_uuid = new.uuid), ''),
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

        # Projects triggers
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS projects_fts_insert AFTER INSERT ON projects BEGIN
                INSERT INTO fts_projects(
                    id, name, description, tags_text, user_id, created_at, updated_at
                )
                VALUES (
                    new.id,
                    new.name,
                    new.description,
                    COALESCE((SELECT GROUP_CONCAT(t.name, ' ')
                              FROM project_tags pt
                              JOIN tags t ON pt.tag_uuid = t.uuid
                              WHERE pt.project_uuid = new.uuid), ''),
                    new.user_id,
                    new.created_at,
                    new.updated_at
                );
            END;
        """))
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS projects_fts_update AFTER UPDATE ON projects BEGIN
                UPDATE fts_projects SET
                    name = new.name,
                    description = new.description,
                    tags_text = COALESCE((SELECT GROUP_CONCAT(t.name, ' ')
                                          FROM project_tags pt
                                          JOIN tags t ON pt.tag_uuid = t.uuid
                                          WHERE pt.project_uuid = new.uuid), ''),
                    updated_at = new.updated_at
                WHERE id = new.id;
            END;
        """))
        await db.execute(text("""
            CREATE TRIGGER IF NOT EXISTS projects_fts_delete AFTER DELETE ON projects BEGIN
                DELETE FROM fts_projects WHERE id = old.id;
            END;
        """))

    async def populate_fts_tables(self, db: AsyncSession) -> bool:
        """Populate FTS tables with existing data"""
        try:
            # Populate notes
            await db.execute(text("""
                INSERT INTO fts_notes(id, title, content, tags, user_id, created_at, updated_at)
                SELECT n.id, n.title, n.content,
                       COALESCE((SELECT GROUP_CONCAT(t.name, ' ') FROM note_tags nt 
                                JOIN tags t ON nt.tag_uuid = t.uuid 
                                WHERE nt.note_uuid = n.uuid), '') as tags,
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
                                JOIN tags t ON dt.tag_uuid = t.uuid 
                                WHERE dt.diary_entry_uuid = d.uuid), '') as tags,
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

            # Populate projects
            await db.execute(text("""
                INSERT INTO fts_projects(id, name, description, tags_text, user_id, created_at, updated_at)
                SELECT p.id, p.name, p.description,
                       COALESCE((SELECT GROUP_CONCAT(t.name, ' ')
                                 FROM project_tags pt
                                 JOIN tags t ON pt.tag_uuid = t.uuid
                                 WHERE pt.project_uuid = p.uuid), ''),
                       p.user_id, p.created_at, p.updated_at
                FROM projects p
                WHERE p.id NOT IN (SELECT id FROM fts_projects);
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
            content_types = ['notes', 'documents', 'archive', 'todos', 'diary', 'folders']
        
        try:
            # Search notes
            if 'notes' in content_types:
                notes_sql = text("""
                    SELECT 'note' as type, n.id, n.title, n.content, n.created_at, n.updated_at,
                           bm25(fts_notes) as rank,
                           snippet(fts_notes, 1, '<mark>', '</mark>', '...', 32) as content_snippet,
                           snippet(fts_notes, 0, '<mark>', '</mark>', '...', 16) as title_snippet,
                           COALESCE(GROUP_CONCAT(t.name, ' '), '') as tags_text
                    FROM fts_notes fn
                    JOIN notes n ON fn.id = n.id
                    LEFT JOIN note_tags nt ON n.uuid = nt.note_uuid
                    LEFT JOIN tags t ON nt.tag_uuid = t.uuid
                    WHERE fts_notes MATCH :query AND fn.user_id = :user_id
                    GROUP BY n.id, n.title, n.content, n.created_at, n.updated_at, rank, content_snippet, title_snippet
                    ORDER BY rank ASC
                    LIMIT :limit OFFSET :offset
                """)
                
                result = await db.execute(notes_sql, {
                    'query': search_query, 
                    'user_id': user_id, 
                    'limit': limit, 
                    'offset': offset
                })
                
                for row in result.fetchall():
                    # Convert BM25 rank (smaller is better) to relevance score (higher is better)
                    relevance_score = 1.0 / (1.0 + float(row.rank)) if row.rank else 0.0
                    
                    results.append({
                        'type': row.type,
                        'module': 'notes',
                        'id': row.id,
                        'title': row.title,
                        'title_highlighted': row.title_snippet or row.title,
                        'content': row.content[:300] + '...' if len(row.content) > 300 else row.content,
                        'content_highlighted': row.content_snippet or (row.content[:200] + '...' if len(row.content) > 200 else row.content),
                        'tags': row.tags_text.split() if row.tags_text else [],
                        'created_at': row.created_at,
                        'updated_at': row.updated_at,
                        'relevance_score': relevance_score,
                        'raw_bm25_rank': float(row.rank) if row.rank else 0.0
                    })
            
            # Search documents
            if 'documents' in content_types:
                docs_sql = text("""
                    SELECT 'document' as type, d.uuid, d.title, d.filename, d.original_name, 
                           d.description, d.created_at, d.updated_at, d.mime_type, d.file_size,
                           bm25(fts_documents) as rank,
                           snippet(fts_documents, 0, '<mark>', '</mark>', '...', 16) as title_snippet,
                           snippet(fts_documents, 2, '<mark>', '</mark>', '...', 32) as description_snippet,
                           COALESCE(GROUP_CONCAT(t.name, ' '), '') as tags_text
                    FROM fts_documents fd
                    JOIN documents d ON fd.uuid = d.uuid
                    LEFT JOIN document_tags dt ON d.uuid = dt.document_uuid
                    LEFT JOIN tags t ON dt.tag_uuid = t.uuid
                    WHERE fts_documents MATCH :query AND fd.user_id = :user_id
                    GROUP BY d.uuid, d.title, d.filename, d.original_name, d.description, 
                             d.created_at, d.updated_at, d.mime_type, d.file_size, rank, title_snippet, description_snippet
                    ORDER BY rank ASC
                    LIMIT :limit OFFSET :offset
                """)
                
                result = await db.execute(docs_sql, {
                    'query': search_query, 
                    'user_id': user_id, 
                    'limit': limit, 
                    'offset': offset
                })
                
                for row in result.fetchall():
                    # Convert BM25 rank (smaller is better) to relevance score (higher is better)
                    relevance_score = 1.0 / (1.0 + float(row.rank)) if row.rank else 0.0
                    
                    results.append({
                        'type': row.type,
                        'module': 'documents',
                        'id': row.uuid,
                        'uuid': row.uuid,
                        'title': row.title or row.original_name,
                        'title_highlighted': row.title_snippet or (row.title or row.original_name),
                        'filename': row.filename,
                        'original_name': row.original_name,
                        'description': row.description,
                        'description_highlighted': row.description_snippet or row.description,
                        'mime_type': row.mime_type,
                        'file_size': row.file_size,
                        'tags': row.tags_text.split() if row.tags_text else [],
                        'created_at': row.created_at,
                        'updated_at': row.updated_at,
                        'relevance_score': relevance_score,
                        'raw_bm25_rank': float(row.rank) if row.rank else 0.0
                    })
            
            # Search archive items
            if 'archive' in content_types or 'archive_items' in content_types:
                archive_sql = text("""
                    SELECT 'archive_item' as type, a.uuid, a.name, a.description, 
                           a.original_filename, a.metadata_json, a.folder_uuid,
                           a.created_at, a.updated_at, bm25(fts_archive_items) as rank,
                           COALESCE(GROUP_CONCAT(t.name, ' '), '') as tags_text
                    FROM fts_archive_items fa
                    JOIN archive_items a ON fa.uuid = a.uuid
                    LEFT JOIN archive_tags at ON a.uuid = at.item_uuid
                    LEFT JOIN tags t ON at.tag_uuid = t.uuid
                    WHERE fts_archive_items MATCH :query AND fa.user_id = :user_id
                    GROUP BY a.uuid, a.name, a.description, a.original_filename, 
                             a.metadata_json, a.folder_uuid, a.created_at, a.updated_at, rank
                    ORDER BY rank ASC
                    LIMIT :limit OFFSET :offset
                """)
                
                result = await db.execute(archive_sql, {
                    'query': search_query, 
                    'user_id': user_id, 
                    'limit': limit, 
                    'offset': offset
                })
                
                for row in result.fetchall():
                    # Convert BM25 rank (smaller is better) to relevance score (higher is better)
                    relevance_score = 1.0 / (1.0 + float(row.rank)) if row.rank else 0.0
                    
                    results.append({
                        'type': row.type,
                        'module': 'archive',
                        'id': row.uuid,
                        'uuid': row.uuid,
                        'title': row.name,
                        'name': row.name,
                        'description': row.description,
                        'original_filename': row.original_filename,
                        'metadata': row.metadata_json,
                        'folder_uuid': row.folder_uuid,
                        'tags': row.tags_text.split() if row.tags_text else [],
                        'created_at': row.created_at,
                        'updated_at': row.updated_at,
                        'relevance_score': relevance_score,
                        'raw_bm25_rank': float(row.rank) if row.rank else 0.0
                    })
            
            # Search todos
            if 'todos' in content_types:
                todos_sql = text("""
                    SELECT 'todo' as type, t.id, t.title, t.description, t.project_id,
                           t.priority, t.due_date, t.created_at, t.updated_at,
                           bm25(fts_todos) as rank,
                           COALESCE(GROUP_CONCAT(tg.name, ' '), '') as tags_text
                    FROM fts_todos ft
                    JOIN todos t ON ft.id = t.id
                    LEFT JOIN todo_tags tt ON t.uuid = tt.todo_uuid
                    LEFT JOIN tags tg ON tt.tag_uuid = tg.uuid
                    WHERE fts_todos MATCH :query AND ft.user_id = :user_id
                    GROUP BY t.id, t.title, t.description, t.project_id, t.priority,
                             t.due_date, t.created_at, t.updated_at, rank
                    ORDER BY rank ASC
                    LIMIT :limit OFFSET :offset
                """)
                
                result = await db.execute(todos_sql, {
                    'query': search_query, 
                    'user_id': user_id, 
                    'limit': limit, 
                    'offset': offset
                })
                
                for row in result.fetchall():
                    # Convert BM25 rank (smaller is better) to relevance score (higher is better)
                    relevance_score = 1.0 / (1.0 + float(row.rank)) if row.rank else 0.0
                    
                    results.append({
                        'type': row.type,
                        'module': 'todos',
                        'id': row.id,
                        'title': row.title,
                        'description': row.description,
                        'content': row.description or '',
                        'project_id': row.project_id,
                        'status': row.status,
                        'priority': row.priority,
                        'due_date': row.due_date,
                        'tags': row.tags_text.split() if row.tags_text else [],
                        'created_at': row.created_at,
                        'updated_at': row.updated_at,
                        'relevance_score': relevance_score,
                        'raw_bm25_rank': float(row.rank) if row.rank else 0.0
                    })

            # Search diary entries
            if 'diary' in content_types or 'diary_entries' in content_types:
                diary_sql = text("""
                    SELECT 'diary_entry' as type, d.id, d.title, d.content, d.mood,
                           d.created_at, d.updated_at, bm25(fts_diary_entries) as rank,
                           COALESCE(GROUP_CONCAT(t.name, ' '), '') as tags_text,
                           (SELECT COUNT(*) > 0 FROM diary_media dm WHERE dm.diary_entry_uuid = d.uuid) as has_media
                    FROM fts_diary_entries fd
                    JOIN diary_entries d ON fd.id = d.id
                    LEFT JOIN diary_tags dt ON d.uuid = dt.diary_entry_uuid
                    LEFT JOIN tags t ON dt.tag_uuid = t.uuid
                    WHERE fts_diary_entries MATCH :query AND fd.user_id = :user_id
                    GROUP BY d.id, d.title, d.content, d.created_at, d.updated_at, rank
                    ORDER BY rank ASC
                    LIMIT :limit OFFSET :offset
                """)
                
                result = await db.execute(diary_sql, {
                    'query': search_query, 
                    'user_id': user_id, 
                    'limit': limit, 
                    'offset': offset
                })
                
                for row in result.fetchall():
                    # Convert BM25 rank (smaller is better) to relevance score (higher is better)
                    relevance_score = 1.0 / (1.0 + float(row.rank)) if row.rank else 0.0
                    
                    results.append({
                        'type': row.type,
                        'module': 'diary',
                        'id': row.id,
                        'title': row.title,
                        'content': row.content[:300] + '...' if row.content and len(row.content) > 300 else (row.content or ''),
                        'mood': row.mood,
                        'weather': row.weather,
                        'has_media': bool(row.has_media),
                        'tags': row.tags_text.split() if row.tags_text else [],
                        'created_at': row.created_at,
                        'updated_at': row.updated_at,
                        'relevance_score': relevance_score,
                        'raw_bm25_rank': float(row.rank) if row.rank else 0.0
                    })

            # Search archive folders
            if 'folders' in content_types:
                folders_sql = text("""
                    SELECT 'folder' as type, f.uuid, f.name, f.description, f.parent_uuid,
                           f.created_at, f.updated_at, bm25(fts_folders) as rank,
                           '' as tags_text
                    FROM fts_folders ff
                    JOIN archive_folders f ON ff.uuid = f.uuid
                    WHERE fts_folders MATCH :query AND ff.user_id = :user_id
                    ORDER BY rank ASC
                    LIMIT :limit OFFSET :offset
                """)
                
                result = await db.execute(folders_sql, {
                    'query': search_query, 
                    'user_id': user_id, 
                    'limit': limit, 
                    'offset': offset
                })
                
                for row in result.fetchall():
                    # Convert BM25 rank (smaller is better) to relevance score (higher is better)
                    relevance_score = 1.0 / (1.0 + float(row.rank)) if row.rank else 0.0
                    
                    results.append({
                        'type': row.type,
                        'module': 'folders',
                        'id': row.uuid,
                        'uuid': row.uuid,
                        'title': row.name,
                        'name': row.name,
                        'description': row.description,
                        'parent_uuid': row.parent_uuid,
                        'tags': row.tags_text.split() if row.tags_text else [],
                        'created_at': row.created_at,
                        'updated_at': row.updated_at,
                        'relevance_score': relevance_score,
                        'raw_bm25_rank': float(row.rank) if row.rank else 0.0
                    })
            
            # Search projects
            if 'projects' in content_types:
                projects_sql = text("""
                    SELECT 'project' as type, p.id, p.name, p.description,
                           p.created_at, p.updated_at, bm25(fts_projects) as rank,
                           fp.tags_text
                    FROM fts_projects fp
                    JOIN projects p ON fp.id = p.id
                    WHERE fts_projects MATCH :query AND fp.user_id = :user_id
                    ORDER BY rank ASC
                    LIMIT :limit OFFSET :offset
                """)
                result = await db.execute(projects_sql, {
                    'query': search_query,
                    'user_id': user_id,
                    'limit': limit,
                    'offset': offset
                })
                for row in result.fetchall():
                    relevance_score = 1.0 / (1.0 + float(row.rank)) if row.rank else 0.0
                    results.append({
                        'type': row.type,
                        'module': 'projects',
                        'id': row.id,
                        'title': row.name,
                        'description': row.description,
                        'tags': row.tags_text.split() if row.tags_text else [],
                        'created_at': row.created_at,
                        'updated_at': row.updated_at,
                        'relevance_score': relevance_score,
                        'raw_bm25_rank': float(row.rank) if row.rank else 0.0
                    })

            # Sort all results by relevance score (higher is better now)
            results.sort(key=lambda x: x['relevance_score'], reverse=True)
            
            return results[:limit]
            
        except Exception as e:
            logger.error(f"❌ FTS5 search failed: {e}")
            return []

    def _prepare_fts_query(self, query: str) -> str:
        """Prepare query string for FTS5 with proper escaping and hashtag support"""
        import re
        
        # Handle hashtag queries (#tag) by extracting them for tag search
        hashtag_pattern = r'#(\w+)'
        hashtags = re.findall(hashtag_pattern, query)
        
        # Remove hashtags from main query for now (they'll be handled by tag filtering)
        cleaned_query = re.sub(hashtag_pattern, '', query)
        
        # Remove other special characters that could break FTS5
        cleaned_query = re.sub(r'[\"\'\^\*\:\(\)\-]', ' ', cleaned_query)
        
        # Split into terms and add prefix matching
        terms = cleaned_query.strip().split()
        
        # Add hashtags back as tag search terms
        for hashtag in hashtags:
            terms.append(hashtag)  # Add hashtag content as search term
        
        if not terms:
            return '""'
        
        # Use prefix matching for better results
        fts_terms = []
        for term in terms:
            if len(term) >= 2:  # Only add meaningful terms
                fts_terms.append(f'"{term}"*')
        
        return ' OR '.join(fts_terms) if fts_terms else '""'

    async def search_archive_items(self, db: AsyncSession, query: str, user_id: int, 
                                 tag: Optional[str] = None, limit: int = 50, offset: int = 0) -> List[str]:
        """Search archive items and return UUIDs in relevance order"""
        if not self.tables_initialized:
            logger.warning("FTS5 tables not initialized")
            return []
        
        try:
            # Prepare search query, including tag if provided
            if tag:
                combined_query = f"{query} {tag}"
                search_query = self._prepare_fts_query(combined_query)
            else:
                search_query = self._prepare_fts_query(query)
            
            fts_sql = text("""
                SELECT uuid, bm25(fts_archive_items) as rank
                FROM fts_archive_items
                WHERE fts_archive_items MATCH :query AND user_id = :user_id
                ORDER BY rank
                LIMIT :limit OFFSET :offset
            """)
            
            result = await db.execute(fts_sql, {
                'query': search_query,
                'user_id': user_id,
                'limit': limit,
                'offset': offset
            })
            
            return [row.uuid for row in result.fetchall()]
            
        except Exception as e:
            logger.error(f"❌ Archive items FTS search failed: {e}")
            return []

    async def search_archive_folders(self, db: AsyncSession, query: str, user_id: int, 
                                   limit: int = 50, offset: int = 0) -> List[str]:
        """Search archive folders and return UUIDs in relevance order"""
        if not self.tables_initialized:
            logger.warning("FTS5 tables not initialized")
            return []
        
        try:
            search_query = self._prepare_fts_query(query)
            
            fts_sql = text("""
                SELECT uuid, bm25(fts_folders) as rank
                FROM fts_folders
                WHERE fts_folders MATCH :query AND user_id = :user_id
                ORDER BY rank
                LIMIT :limit OFFSET :offset
            """)
            
            result = await db.execute(fts_sql, {
                'query': search_query,
                'user_id': user_id,
                'limit': limit,
                'offset': offset
            })
            
            return [row.uuid for row in result.fetchall()]
            
        except Exception as e:
            logger.error(f"❌ Archive folders FTS search failed: {e}")
            return []

    async def search_diary_entries(self, db: AsyncSession, query: str, user_id: int, 
                                 limit: int = 50, offset: int = 0) -> List[int]:
        """Search diary entries and return IDs in relevance order"""
        if not self.tables_initialized:
            logger.warning("FTS5 tables not initialized")
            return []
        
        try:
            search_query = self._prepare_fts_query(query)
            
            fts_sql = text("""
                SELECT id, bm25(fts_diary_entries) as rank
                FROM fts_diary_entries
                WHERE fts_diary_entries MATCH :query AND user_id = :user_id
                ORDER BY rank
                LIMIT :limit OFFSET :offset
            """)
            
            result = await db.execute(fts_sql, {
                'query': search_query,
                'user_id': user_id,
                'limit': limit,
                'offset': offset
            })
            
            return [row.id for row in result.fetchall()]
            
        except Exception as e:
            logger.error(f"❌ Diary entries FTS search failed: {e}")
            return []

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