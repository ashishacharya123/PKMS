"""
PKMS Backend Database Configuration
SQLAlchemy async setup with session management
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.engine import make_url
from sqlalchemy import event, text, inspect
from contextlib import asynccontextmanager
import logging
import os
from pathlib import Path

from app.config import get_database_url, settings, get_data_dir

# Import Base and all models to register them with Base.metadata
# This ensures all tables are created by Base.metadata.create_all()
from app.models.base import Base
from app.models.user import User, Session, RecoveryKey
from app.models.note import Note
# NoteFile model removed - notes now use Document + note_documents association
from app.models.document import Document
from app.models.todo import Todo
from app.models.project import Project
from app.models.diary import DiaryEntry
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.tag import Tag
# Import all tag association tables
from app.models.tag_associations import (
    note_tags, document_tags, todo_tags,
    diary_entry_tags, archive_item_tags, archive_folder_tags
)

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create async engine
db_url = get_database_url()
sqlite_aiosqlite = db_url.startswith("sqlite+aiosqlite")
engine_kwargs = {
    "echo": settings.debug,  # Log SQL queries in debug mode
    "connect_args": (
        {"timeout": 20} if sqlite_aiosqlite
        else {"check_same_thread": False, "timeout": 20} if db_url.startswith("sqlite") else {}
    ),
}

if sqlite_aiosqlite and make_url(db_url).database == ":memory:":
    # StaticPool ensures the same in-memory DB across connections
    engine_kwargs["poolclass"] = StaticPool

engine = create_async_engine(db_url, **engine_kwargs)

# SQLite Foreign Key Event Listener
# Ensures PRAGMA foreign_keys = ON for every new connection
@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign keys for every SQLite connection"""
    if "sqlite" in get_database_url():
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
            logger.debug("SUCCESS: Foreign keys enabled for new connection")
        except Exception as e:
            logger.warning(f"WARNING: Failed to enable foreign keys on connection: {e}")

# Create async session factory (SQLAlchemy 2.0 syntax)
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncSession:
    """Dependency to get database session for FastAPI endpoints"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        # Note: session.close() is handled by AsyncSessionLocal context manager


@asynccontextmanager
async def get_db_ensured():
    """Database session with guaranteed cleanup"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_session() -> AsyncSession:
    """Context manager for database sessions"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            await session.close()


async def verify_table_schema(table_name: str) -> None:
    """Verify the schema of a specific table"""
    try:
        async with get_db_session() as session:
            result = await session.execute(
                text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"),
                {"name": table_name},
            )
            if result.fetchone():
                logger.info("SUCCESS: Table '%s' exists", table_name)
            else:
                logger.warning("WARNING: Table '%s' not found", table_name)
    except Exception:
        logger.exception("ERROR: Error verifying table '%s'", table_name)


async def init_db():
    """Initialize database and create all tables, indexes, FTS tables, and triggers"""
    
    try:
        # Ensure data directory exists
        data_dir = get_data_dir()
        data_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"INFO: Data directory: {data_dir}")
        
        # Phase 1: Configure SQLite with optimizations and fallbacks
        logger.info("Phase 1: Configuring SQLite optimizations...")
        async with get_db_session() as session:
            # Enable foreign keys first (this is critical and usually works)
            try:
                await session.execute(text("PRAGMA foreign_keys = ON;"))
                logger.info("SUCCESS: Foreign keys enabled")
            except Exception as e:
                logger.warning(f"WARNING: Could not enable foreign keys: {e}")

            # --- Journal mode with full fallback ---
            # Try each mode with graceful degradation to ensure startup success
            journal_mode = "default"
            for mode in ["WAL", "TRUNCATE", "DELETE"]:
                try:
                    await session.execute(text(f"PRAGMA journal_mode = {mode};"))
                    journal_mode = mode
                    logger.info(f"SUCCESS: Journal mode set to {mode}")
                    break
                except Exception as e:
                    logger.warning(f"WARNING: Journal mode {mode} failed: {e}")
                    continue
            
            if journal_mode == "default":
                logger.warning("WARNING: All journal modes failed, using SQLite default")

            # Other optimizations (with individual fallbacks)
            optimizations = [
                ("PRAGMA synchronous = NORMAL;", "synchronous mode"),
                ("PRAGMA cache_size = -64000;", "cache size"),
                ("PRAGMA temp_store = memory;", "temp store"),
                ("PRAGMA mmap_size = 268435456;", "memory mapping"),
                ("PRAGMA busy_timeout = 30000;", "busy timeout"),
                ("PRAGMA wal_autocheckpoint = 1000;", "WAL autocheckpoint")
            ]
            
            for pragma_sql, description in optimizations:
                try:
                    await session.execute(text(pragma_sql))
                    logger.debug(f"SUCCESS: {description} optimization applied")
                except Exception as e:
                    logger.warning(f"WARNING: {description} optimization failed: {e}")
            
            logger.info("SUCCESS: SQLite configuration completed")
        
        # Phase 2: Create all tables from SQLAlchemy models
        logger.info("Phase 2: Creating database tables...")
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            logger.info("SUCCESS: All tables created successfully")
        
        # Note: We intentionally do NOT run implicit database changes here.
        
        # Phase 3: Create performance indexes
        logger.info("Phase 3: Creating performance indexes...")
        async with get_db_session() as session:
            indexes = [
                # User & Auth indexes
                "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);",
                "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);",
                "CREATE INDEX IF NOT EXISTS idx_sessions_created_by ON sessions(created_by);",
                "CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);",
                "CREATE INDEX IF NOT EXISTS idx_recovery_keys_created_by ON recovery_keys(created_by);",
                
                # Notes indexes
                "CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by);",
                "CREATE INDEX IF NOT EXISTS idx_notes_user_created ON notes(created_by, created_at DESC);",
                "CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);",
                "CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);",
                "CREATE INDEX IF NOT EXISTS idx_notes_user_search ON notes(created_by, title);",
                "CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes(is_archived);",
                "CREATE INDEX IF NOT EXISTS idx_note_files_note_uuid ON note_files(note_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_note_files_created_by ON note_files(created_by);",
                
                # Documents indexes
                "CREATE INDEX IF NOT EXISTS idx_documents_created_by ON documents(created_by);",
                "CREATE INDEX IF NOT EXISTS idx_documents_user_mime ON documents(created_by, mime_type);",
                "CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);",
                "CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at DESC);",
                "CREATE INDEX IF NOT EXISTS idx_documents_user_mime_created ON documents(created_by, mime_type, created_at DESC);",
                "CREATE INDEX IF NOT EXISTS idx_documents_uuid ON documents(uuid);",
                "CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title);",
                "CREATE INDEX IF NOT EXISTS idx_documents_archived ON documents(is_archived);",

                # Document model composite indexes for optimal performance
                "CREATE INDEX IF NOT EXISTS idx_doc_user_archived_exclusive ON documents(created_by, is_archived, is_project_exclusive, is_diary_exclusive);",
                "CREATE INDEX IF NOT EXISTS idx_doc_user_deleted ON documents(created_by, is_deleted);",
                "CREATE INDEX IF NOT EXISTS idx_doc_user_created_desc ON documents(created_by, created_at DESC);",
                "CREATE INDEX IF NOT EXISTS idx_doc_user_favorite ON documents(created_by, is_favorite);",
                "CREATE INDEX IF NOT EXISTS idx_doc_mime_type ON documents(mime_type, created_by);",
                
                # Todos indexes
                "CREATE INDEX IF NOT EXISTS idx_todos_created_by ON todos(created_by);",
                "CREATE INDEX IF NOT EXISTS idx_todos_user_status ON todos(created_by, status);",
                "CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority);",
                "CREATE INDEX IF NOT EXISTS idx_todos_user_status_priority ON todos(created_by, status, priority);",
                "CREATE INDEX IF NOT EXISTS idx_todos_user_priority_date ON todos(created_by, priority DESC, created_at DESC);",
                "CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);",
                # project_id removed; projects are via association now
                "CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(created_by);",
                "CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects(is_archived);",
                
                # Diary indexes
                "CREATE INDEX IF NOT EXISTS idx_diary_entries_created_by ON diary_entries(created_by);",
                "CREATE INDEX IF NOT EXISTS idx_diary_entries_user_date ON diary_entries(created_by, date);",
                "CREATE INDEX IF NOT EXISTS idx_diary_entries_date ON diary_entries(date);",
                "CREATE INDEX IF NOT EXISTS idx_diary_entries_mood ON diary_entries(mood);",
                "CREATE INDEX IF NOT EXISTS idx_diary_entries_location ON diary_entries(location);",
                "CREATE INDEX IF NOT EXISTS idx_diary_entries_user_is_template_date ON diary_entries(created_by, is_template, date DESC);",
                # Diary media now links via document_diary association
                "CREATE INDEX IF NOT EXISTS idx_document_diary_entry_uuid ON document_diary(diary_entry_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_document_diary_document_uuid ON document_diary(document_uuid);",
                
                # Archive indexes
                "CREATE INDEX IF NOT EXISTS idx_archive_folders_created_by ON archive_folders(created_by);",
                "CREATE INDEX IF NOT EXISTS idx_archive_folders_parent ON archive_folders(parent_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_archive_folders_name ON archive_folders(name);",
                "CREATE INDEX IF NOT EXISTS idx_archive_folders_archived ON archive_folders(is_archived);",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_created_by ON archive_items(created_by);",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_folder ON archive_items(folder_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_name ON archive_items(name);",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_mime_type ON archive_items(mime_type);",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_created ON archive_items(created_at);",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_archived ON archive_items(is_archived);",
                
                # Tags indexes
                "CREATE INDEX IF NOT EXISTS idx_tags_created_by ON tags(created_by);",
                "CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);",
                "CREATE INDEX IF NOT EXISTS idx_tags_name_user ON tags(name, created_by);",
                "CREATE INDEX IF NOT EXISTS idx_tags_usage_count ON tags(usage_count DESC);",
                
                # Tag association indexes
                "CREATE INDEX IF NOT EXISTS idx_note_tags_note_uuid ON note_tags(note_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_note_tags_tag_uuid ON note_tags(tag_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_document_tags_document_uuid ON document_tags(document_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_document_tags_tag_uuid ON document_tags(tag_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_todo_tags_todo_uuid ON todo_tags(todo_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_todo_tags_tag_uuid ON todo_tags(tag_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_diary_entry_tags_entry_uuid ON diary_entry_tags(diary_entry_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_diary_entry_tags_tag_uuid ON diary_entry_tags(tag_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_archive_item_tags_item_uuid ON archive_item_tags(item_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_archive_item_tags_tag_uuid ON archive_item_tags(tag_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_archive_folder_tags_folder_uuid ON archive_folder_tags(folder_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_archive_folder_tags_tag_uuid ON archive_folder_tags(tag_uuid);",
                # link_tags table removed with Links module; indexes deleted
            ]
            
            created_count = 0
            for index_sql in indexes:
                try:
                    await session.execute(text(index_sql))
                    created_count += 1
                    index_name = index_sql.split('idx_')[1].split(' ')[0] if 'idx_' in index_sql else 'unknown'
                    logger.debug(f"SUCCESS: Index ensured: {index_name}")
                except Exception as e:
                    logger.warning(f"WARNING: Index creation failed: {e}")
            
            logger.info(f"SUCCESS: {created_count} performance indexes created/verified")
        
        # Phase 4: Initialize FTS5 full-text search (unified approach)
        logger.info("Phase 4: Initializing FTS5 full-text search...")
        async with get_db_session() as session:
            try:
                # Create the unified fts_content table using the schema from tables_schema.sql
                await session.execute(text("""
                    CREATE VIRTUAL TABLE IF NOT EXISTS fts_content USING fts5(
                        item_uuid UNINDEXED,
                        item_type UNINDEXED,
                        created_by UNINDEXED,
                        title,
                        description,
                        tags,
                        attachments,
                        date_text,
                        tokenize='porter unicode61'
                    );
                """))

                logger.info("SUCCESS: FTS5 unified table created successfully")

                # Note: We don't populate existing data here to avoid slowing down startup
                # Data will be indexed on-demand through the search_service

            except Exception:
                # TODO: Narrow exception type; broad catch is temporary during recovery
                logger.exception("ERROR: FTS5 initialization error")
                logger.warning("WARNING: Search functionality will be limited")
        
        # Phase 5: Create essential data directories
        logger.info("Phase 5: Creating essential data directories...")
        essential_dirs = [
            data_dir / "secure" / "entries" / "text",
            data_dir / "secure" / "entries" / "media", 
            data_dir / "assets" / "documents",
            data_dir / "assets" / "images",
            data_dir / "archive",
            data_dir / "backups",
            data_dir / "temp_uploads"
        ]
        
        for dir_path in essential_dirs:
            try:
                dir_path.mkdir(parents=True, exist_ok=True)
                logger.debug(f"SUCCESS: Directory ensured: {dir_path.relative_to(data_dir)}")
            except Exception as e:
                logger.warning(f"WARNING: Could not create directory {dir_path}: {e}")
        
        logger.info("SUCCESS: Essential directories created")
        
        # Phase 6: Database integrity and optimization
        logger.info("Phase 6: Running database integrity checks...")
        async with get_db_session() as session:
            try:
                # Run integrity check
                result = await session.execute(text("PRAGMA integrity_check;"))
                integrity_result = result.fetchone()
                if integrity_result and integrity_result[0] == "ok":
                    logger.info("SUCCESS: Database integrity check passed")
                else:
                    logger.warning(f"WARNING: Database integrity check result: {integrity_result}")
                
                # Optimize database
                await session.execute(text("PRAGMA optimize;"))
                logger.info("SUCCESS: Database optimization completed")
                
            except Exception as e:
                logger.warning(f"WARNING: Database integrity/optimization error: {e}")
        
        logger.info("Database initialization completed successfully!")
        logger.info("=" * 60)
        logger.info("SUCCESS: PKMS Database is ready for use")
        logger.info("=" * 60)
        
    except Exception:
        logger.exception("ERROR: Database initialization failed")
        logger.error("This is a critical error - the application cannot start without a working database")
        raise


async def close_db():
    """Close database connections"""
    await engine.dispose()
    logger.info("Database connections closed") 