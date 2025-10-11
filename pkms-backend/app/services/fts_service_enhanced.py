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
from ..models.todo import Project

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
        
        # FTS5 table configurations - eliminates redundancy
        self.fts_tables = {
            'notes': {
                'table_name': 'fts_notes_enhanced',
                'model': Note,
                'columns': ['id', 'title', 'tags_text', 'user_id', 'created_at', 'updated_at', 'is_favorite'],
                'search_columns': ['id', 'title', 'tags_text', 'raw_score'],
                'id_column': 'id'
            },
            'documents': {
                'table_name': 'fts_documents_enhanced',
                'model': Document,
                'columns': ['uuid', 'title', 'filename', 'original_name', 'description', 'tags_text', 'user_id', 'mime_type', 'file_size', 'created_at', 'updated_at', 'is_favorite', 'is_archived'],
                'search_columns': ['uuid', 'title', 'filename', 'original_name', 'description', 'tags_text', 'raw_score'],
                'id_column': 'uuid'
            },
            'todos': {
                'table_name': 'fts_todos_enhanced',
                'model': Todo,
                'columns': ['id', 'title', 'description', 'tags_text', 'status', 'priority', 'user_id', 'project_id', 'created_at', 'updated_at', 'is_archived'],
                'search_columns': ['id', 'title', 'description', 'tags_text', 'status', 'priority', 'raw_score'],
                'id_column': 'id'
            },
            'diary': {
                'table_name': 'fts_diary_entries_enhanced',
                'model': DiaryEntry,
                'columns': ['id', 'uuid', 'title', 'tags_text', 'mood', 'weather_code', 'location', 'user_id', 'created_at', 'updated_at', 'is_template'],
                'search_columns': ['uuid', 'title', 'tags_text', 'mood', 'weather_code', 'location', 'raw_score'],
                'id_column': 'uuid'
            },
            'archive_items': {
                'table_name': 'fts_archive_items_enhanced',
                'model': ArchiveItem,
                'columns': ['uuid', 'name', 'description', 'original_filename', 'metadata_json', 'tags_text', 'user_id', 'folder_uuid', 'created_at', 'updated_at', 'is_favorite'],
                'search_columns': ['uuid', 'name', 'description', 'original_filename', 'metadata_json', 'tags_text', 'raw_score'],
                'id_column': 'uuid'
            },
            'archive_folders': {
                'table_name': 'fts_folders_enhanced',
                'model': ArchiveFolder,
                'columns': ['uuid', 'name', 'description', 'tags_text', 'user_id', 'parent_uuid', 'created_at', 'updated_at', 'is_archived'],
                'search_columns': ['uuid', 'name', 'description', 'tags_text', 'raw_score'],
                'id_column': 'uuid'
            },
            'projects': {
                'table_name': 'fts_projects_enhanced',
                'model': Project,
                'columns': ['uuid', 'name', 'description', 'tags_text', 'user_id', 'created_at', 'updated_at', 'is_archived'],
                'search_columns': ['uuid', 'name', 'description', 'tags_text', 'raw_score'],
                'id_column': 'uuid'
            }
        }

    async def initialize_enhanced_fts_tables(self, db: AsyncSession) -> bool:
        """Initialize enhanced FTS5 virtual tables with embedded tags"""
        try:
            # Create all FTS5 tables using configuration
            for table_key, config in self.fts_tables.items():
                await self._create_fts_table(db, config)
            
            # Create triggers to keep FTS5 tables in sync
            await self._create_fts_triggers(db)
            
            self.tables_initialized = True
            logger.info("Enhanced FTS5 virtual tables initialized successfully")
            return True
            
        except Exception:
            logger.exception("Failed to initialize enhanced FTS5 tables")
            return False

    async def _create_fts_table(self, db: AsyncSession, config: Dict[str, Any]) -> None:
        """Create a single FTS5 table using configuration"""
        table_name = config['table_name']
        columns = config['columns']
        
        # Build column definitions
        column_defs = []
        for col in columns:
            if col in ['user_id', 'created_at', 'updated_at', 'id', 'uuid', 'mime_type', 'file_size', 
                      'is_favorite', 'is_archived', 'status', 'priority', 'project_id', 'folder_uuid', 
                      'parent_uuid', 'mood', 'weather_code', 'location', 'is_template']:
                column_defs.append(f"{col} UNINDEXED")
            else:
                column_defs.append(col)
        
        columns_sql = ",\n                    ".join(column_defs)
        
        await db.execute(text(f"""
            CREATE VIRTUAL TABLE IF NOT EXISTS {table_name} USING fts5(
                {columns_sql}
            );
        """))

    async def _create_fts_triggers(self, db: AsyncSession) -> None:
        """Create triggers to keep FTS5 tables synchronized with main tables"""
        try:
            # Table name mappings for triggers
            table_mappings = {
                'notes': 'notes',
                'documents': 'documents', 
                'todos': 'todos',
                'diary': 'diary_entries',
                'archive_items': 'archive_items',
                'archive_folders': 'archive_folders',
                'projects': 'projects'
            }
            
            for table_key, config in self.fts_tables.items():
                main_table = table_mappings[table_key]
                fts_table = config['table_name']
                columns = config['columns']
                id_column = config['id_column']
                
                # Create INSERT trigger
                columns_list = ", ".join(columns)
                values_list = ", ".join([f"NEW.{col}" for col in columns])
                
                await db.execute(text(f"""
                    CREATE TRIGGER IF NOT EXISTS {main_table}_ai AFTER INSERT ON {main_table} BEGIN
                        INSERT INTO {fts_table} ({columns_list}) VALUES ({values_list});
                    END;
                """))
                
                # Create DELETE trigger
                await db.execute(text(f"""
                    CREATE TRIGGER IF NOT EXISTS {main_table}_ad AFTER DELETE ON {main_table} BEGIN
                        DELETE FROM {fts_table} WHERE {id_column} = OLD.{id_column};
                    END;
                """))
                
                # Create UPDATE trigger for all configured modules to keep FTS rows in sync
                update_set = ", ".join([f"{col} = NEW.{col}" for col in columns if col != id_column])
                await db.execute(text(f"""
                    CREATE TRIGGER IF NOT EXISTS {main_table}_au AFTER UPDATE ON {main_table} BEGIN
                        UPDATE {fts_table} SET {update_set} WHERE {id_column} = OLD.{id_column};
                    END;
                """))
            
            logger.info("FTS5 triggers created successfully")
            
        except Exception:
            logger.exception("Failed to create FTS5 triggers")
            raise

    async def populate_enhanced_fts_tables(self, db: AsyncSession) -> bool:
        """Populate enhanced FTS5 tables with existing data"""
        try:
            if not self.tables_initialized:
                await self.initialize_enhanced_fts_tables(db)
            
            logger.info("Populating enhanced FTS5 tables with existing data...")
            
            # Populate all tables using configuration
            for table_key, config in self.fts_tables.items():
                await self._populate_table(db, config)
            
            await db.commit()
            logger.info("Enhanced FTS5 tables populated with existing data")
            return True
            
        except Exception:
            logger.exception("Failed to populate enhanced FTS5 tables")
            await db.rollback()
            return False

    async def _populate_table(self, db: AsyncSession, config: Dict[str, Any]) -> None:
        """Populate a single FTS5 table with existing data"""
        model = config['model']
        table_name = config['table_name']
        columns = config['columns']
        
        # Get all records with tags
        records = await db.execute(
            select(model).options(selectinload(model.tag_objs))
        )
        
        for record in records.scalars():
            # Extract tags
            tag_names = [tag.name for tag in record.tag_objs]
            tags_text = " ".join(tag_names)
            
            # Build named bindings for text()
            values = {}
            placeholders = []
            for col in columns:
                if col == 'tags_text':
                    values[col] = tags_text
                else:
                    values[col] = getattr(record, col)
                placeholders.append(f":{col}")
            
            # Insert into FTS5 table
            columns_list = ", ".join(columns)
            placeholders_list = ", ".join(placeholders)
            
            await db.execute(
                text(f"INSERT OR REPLACE INTO {table_name} ({columns_list}) VALUES ({placeholders_list})"),
                values
            )

    async def search_enhanced(self, db: AsyncSession, query: str, user_id: int, 
                             module_filter: Optional[str] = None, 
                             limit: int = 50) -> List[Dict[str, Any]]:
        """Search across all content types using enhanced FTS5 with proper ranking"""
        try:
            if not self.tables_initialized:
                logger.warning("FTS5 tables not initialized, falling back to regular search")
                return []
            
            # Prepare query for FTS5
            prepared_query = self._prepare_fts_query(query)
            
            all_results = []
            
            # Search all modules using configuration
            module_mappings = {
                'notes': ('notes', 'note'),
                'documents': ('documents', 'document'),
                'todos': ('todos', 'todo'),
                'diary': ('diary', 'diary_entry'),
                'archive': ('archive_items', 'archive_item'),
                'archive_folders': ('folders', 'archive_folder'),
                'projects': ('projects', 'project')
            }
            
            for table_key, config in self.fts_tables.items():
                module_name, type_name = module_mappings[table_key]
                
                # Check if this module should be searched
                if not module_filter or module_filter == module_name:
                    results = await self._search_table(db, config, prepared_query, user_id, limit)
                    for row in results:
                        identifier = row.get(config['id_column'])
                        if identifier is None:
                            logger.warning("Skipping %s result without %s", table_key, config['id_column'])
                            continue
                        all_results.append({
                            **row,
                            'module': module_name,
                            'type': type_name,
                            'id': identifier,  # Restore 'id' for backward compatibility
                        })
            
            # Normalize scores across modules and sort by relevance
            normalized_results = self._normalize_scores(all_results)
            sorted_results = sorted(normalized_results, key=lambda x: x['normalized_score'], reverse=True)
            
            logger.info(f"Enhanced FTS5 search completed: '{query}' - {len(sorted_results)} results for user {user_id}")
            return sorted_results[:limit]
            
        except Exception:
            logger.exception("Enhanced FTS5 search failed")
            return []

    async def _search_table(self, db: AsyncSession, config: Dict[str, Any], query: str, user_id: int, limit: int) -> List[Dict[str, Any]]:
        """Generic search method for any FTS5 table"""
        try:
            table_name = config['table_name']
            search_columns = config['search_columns']
            
            # Build SELECT clause
            select_columns = ", ".join(search_columns[:-1])  # Exclude raw_score
            select_columns += f", bm25({table_name}) as raw_score"
            
            result = await db.execute(text(f"""
                SELECT {select_columns}
                FROM {table_name}
                WHERE {table_name} MATCH :query AND user_id = :user_id
                ORDER BY raw_score ASC
                LIMIT :limit
            """), {"query": query, "user_id": user_id, "limit": limit})
            
            return [dict(row._mapping) for row in result]
            
        except Exception:
            logger.exception(f"Failed to search {config['table_name']}")
            return []

    def _prepare_fts_query(self, query: str) -> str:
        """Prepare query string for FTS5 with proper escaping and hashtag support"""
        # Remove special characters that could break FTS5
        cleaned_query = re.sub(r'[^\w\s#]', ' ', query)
        
        # Handle hashtags (convert #tag to tag)
        cleaned_query = re.sub(r'#(\w+)', r'\1', cleaned_query)
        
        # Remove extra whitespace
        cleaned_query = ' '.join(cleaned_query.split())
        
        return cleaned_query

    def _normalize_scores(self, results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Normalize scores across different modules for fair comparison"""
        if not results:
            return results
        
        # Find min and max scores for normalization
        min_score = min(r.get('raw_score', 0) for r in results)
        max_score = max(r.get('raw_score', 0) for r in results)
        score_range = max_score - min_score if max_score != min_score else 1
        
        normalized_results = []
        for result in results:
            raw_score = result.get('raw_score', 0)
            
            # Invert BM25 (lower is better) to 0..1 range where 1 is best
            normalized_score = 1 - ((raw_score - min_score) / score_range) if score_range > 0 else 1
            
            # Apply module weight
            module = result.get('module', 'general')
            weight = self.module_weights.get(module, 1.0)
            final_score = normalized_score * weight
            
            result['normalized_score'] = final_score
            normalized_results.append(result)
        
        return normalized_results

    async def optimize_enhanced_fts_tables(self, db: AsyncSession) -> bool:
        """Optimize enhanced FTS5 tables for better performance"""
        try:
            if not self.tables_initialized:
                return False
            
            # Optimize all FTS5 tables using configuration
            for config in self.fts_tables.values():
                table_name = config['table_name']
                await db.execute(text(f"INSERT INTO {table_name}({table_name}) VALUES('optimize')"))
            
            await db.commit()
            logger.info("Enhanced FTS5 tables optimized")
            return True
            
        except Exception:
            logger.exception("Failed to optimize enhanced FTS5 tables")
            return False

    async def get_enhanced_fts_stats(self, db: AsyncSession) -> Dict[str, Any]:
        """Get statistics about enhanced FTS5 tables"""
        try:
            if not self.tables_initialized:
                return {}
            
            stats = {}
            
            # Get stats for all tables using configuration
            for config in self.fts_tables.values():
                table_name = config['table_name']
                try:
                    # Get row count
                    result = await db.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                    count = result.scalar()
                    
                    # Get table size info
                    result = await db.execute(text(f"SELECT * FROM {table_name} LIMIT 1"))
                    columns = result.keys() if result.rowcount > 0 else []
                    
                    stats[table_name] = {
                        'row_count': count,
                        'columns': list(columns),
                        'status': 'active'
                    }
                except Exception as e:
                    stats[table_name] = {
                        'row_count': 0,
                        'columns': [],
                        'status': f'error: {str(e)}'
                    }
            
            return stats
            
        except Exception:
            logger.exception("Failed to get enhanced FTS5 stats")
            return {}


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
                SELECT uuid, bm25(fts_archive_items_enhanced) as rank
                FROM fts_archive_items_enhanced
                WHERE fts_archive_items_enhanced MATCH :query AND user_id = :user_id
                ORDER BY rank
                LIMIT :limit OFFSET :offset
            """)
            
            result = await db.execute(fts_sql, {
                "query": search_query,
                "user_id": user_id,
                "limit": limit,
                "offset": offset
            })
            
            return [row[0] for row in result.fetchall()]
            
        except Exception:
            logger.exception("Error searching archive items")
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
                SELECT uuid, bm25(fts_folders_enhanced) as rank
                FROM fts_folders_enhanced
                WHERE fts_folders_enhanced MATCH :query AND user_id = :user_id
                ORDER BY rank
                LIMIT :limit OFFSET :offset
            """)
            
            result = await db.execute(fts_sql, {
                "query": search_query,
                "user_id": user_id,
                "limit": limit,
                "offset": offset
            })
            
            return [row[0] for row in result.fetchall()]
            
        except Exception:
            logger.exception("Error searching archive folders")
            return []

    async def search_diary_entries(self, db: AsyncSession, query: str, user_id: int, 
                                 limit: int = 50, offset: int = 0) -> List[str]:
        """Search diary entries and return UUIDs in relevance order"""
        if not self.tables_initialized:
            logger.warning("FTS5 tables not initialized")
            return []
        
        try:
            search_query = self._prepare_fts_query(query)
            
            fts_sql = text("""
                SELECT uuid, bm25(fts_diary_entries_enhanced) as rank
                FROM fts_diary_entries_enhanced
                WHERE fts_diary_entries_enhanced MATCH :query AND user_id = :user_id
                ORDER BY rank
                LIMIT :limit OFFSET :offset
            """)
            
            result = await db.execute(fts_sql, {
                "query": search_query,
                "user_id": user_id,
                "limit": limit,
                "offset": offset
            })
            
            return [row[0] for row in result.fetchall()]
            
        except Exception:
            logger.exception("Error searching diary entries")
            return []

    async def search_all(self, db: AsyncSession, query: str, user_id: int,
                        content_types: Optional[List[str]] = None,
                        limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """Search across all content types - compatibility method"""
        return await self.search_enhanced(db, query, user_id,
                                        module_filter=content_types[0] if content_types else None,
                                        limit=limit)

    async def get_search_suggestions(self, db: AsyncSession, user_id: int,
                                   query: str, modules: Optional[List[str]] = None,
                                   limit: int = 10) -> List[Dict[str, Any]]:
        """Get real-time search suggestions with typeahead functionality"""
        try:
            if not self.tables_initialized or len(query.strip()) < 2:
                return []

            # Prepare prefix search query for typeahead
            prefix_query = self._prepare_fts_query(query)

            # Filter modules if specified
            active_modules = modules if modules else list(self.fts_tables.keys())
            suggestions = []

            for module in active_modules:
                if module not in self.fts_tables:
                    continue

                config = self.fts_tables[module]
                table_name = config['table_name']

                # Use prefix matching for suggestions
                suggestion_sql = text(f"""
                    SELECT DISTINCT
                        title,
                        substr(title, 1, 100) as suggestion,
                        '{module}' as module,
                        bm25({table_name}) as score
                    FROM {table_name}
                    WHERE {table_name} MATCH :prefix_query || '*'
                      AND user_id = :user_id
                    ORDER BY score DESC, title ASC
                    LIMIT :module_limit
                """)

                result = await db.execute(suggestion_sql, {
                    'prefix_query': prefix_query,
                    'user_id': user_id,
                    'module_limit': max(2, limit // len(active_modules))
                })

                module_suggestions = [
                    {
                        'text': row.suggestion,
                        'module': row.module,
                        'score': float(row.score) if row.score else 0.0,
                        'type': self._get_suggestion_type(module)
                    }
                    for row in result.fetchall()
                    if row.suggestion and row.suggestion.strip()
                ]

                suggestions.extend(module_suggestions)

            # Sort by relevance and limit results
            suggestions.sort(key=lambda x: (x['score'], x['text']), reverse=True)
            return suggestions[:limit]

        except Exception:
            logger.exception("Search suggestions error")
            return []

    def _get_suggestion_type(self, module: str) -> str:
        """Get human-readable type for suggestion"""
        type_map = {
            'notes': 'Note',
            'documents': 'Document',
            'todos': 'Task',
            'diary': 'Diary Entry',
            'archive': 'Archive Item',
            'folders': 'Folder'
        }
        return type_map.get(module, 'Item')

# Global instance
enhanced_fts_service = EnhancedFTS5SearchService()
