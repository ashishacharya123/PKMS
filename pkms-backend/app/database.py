"""
PKMS Backend Database Configuration
SQLAlchemy async setup with session management
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.pool import StaticPool
from contextlib import asynccontextmanager
import logging
from sqlalchemy import text, inspect
import os
from pathlib import Path

from app.config import get_database_url, settings, get_data_dir
from app.services.fts_service import fts_service

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create async engine
engine = create_async_engine(
    get_database_url(),
    echo=settings.debug,  # Log SQL queries in debug mode
    poolclass=StaticPool,  # Better for SQLite
    connect_args={"check_same_thread": False, "timeout": 20} if "sqlite" in get_database_url() else {}
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for all models
Base = declarative_base()


async def get_db() -> AsyncSession:
    """Dependency to get database session"""
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
                text(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'")
            )
            if result.fetchone():
                logger.info(f"✅ Table '{table_name}' exists")
            else:
                logger.warning(f"⚠️ Table '{table_name}' not found")
    except Exception as e:
        logger.error(f"❌ Error verifying table '{table_name}': {e}")


async def init_db():
    """Initialize database and create tables"""
    
    try:
        # Ensure data directory exists
        data_dir = get_data_dir()
        data_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"📁 Data directory: {data_dir}")
        
        # Enable foreign keys and other SQLite optimizations
        async with get_db_session() as session:
            # Enable foreign keys
            await session.execute(text("PRAGMA foreign_keys = ON;"))
            
            # Performance optimizations
            await session.execute(text("PRAGMA journal_mode = WAL;"))
            await session.execute(text("PRAGMA synchronous = NORMAL;"))
            await session.execute(text("PRAGMA cache_size = -64000;"))  # 64MB cache
            await session.execute(text("PRAGMA temp_store = memory;"))
            await session.execute(text("PRAGMA mmap_size = 268435456;"))  # 256MB mmap
            
            await session.commit()
            logger.info("✅ SQLite optimizations applied")
        
        # Create tables
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            
            # Create indexes for better search performance (execute each separately for SQLite)
            index_statements = [
                "CREATE INDEX IF NOT EXISTS idx_archive_items_name ON archive_items(name)",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_description ON archive_items(description)",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_mime_type ON archive_items(mime_type)",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_created ON archive_items(created_at)",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_updated ON archive_items(updated_at)",
                "CREATE INDEX IF NOT EXISTS idx_archive_folders_name ON archive_folders(name)",
                "CREATE INDEX IF NOT EXISTS idx_archive_folders_path ON archive_folders(path)"
            ]
            
            for statement in index_statements:
                await conn.execute(text(statement))
            
            # Temporarily disable FTS5 to test for segfault
            # -- Enable FTS5 extension (using external content table)
            # CREATE VIRTUAL TABLE IF NOT EXISTS archive_items_fts USING fts5(
            #     uuid UNINDEXED,
            #     name, 
            #     description,
            #     extracted_text,
            #     tokenize='porter unicode61',
            #     prefix='2,3'
            # );
            
            # -- Create triggers to keep FTS index up to date
            # CREATE TRIGGER IF NOT EXISTS archive_items_ai AFTER INSERT ON archive_items BEGIN
            #     INSERT INTO archive_items_fts(uuid, name, description, extracted_text)
            #     VALUES (new.uuid, new.name, new.description, new.extracted_text);
            # END;
            
            # CREATE TRIGGER IF NOT EXISTS archive_items_ad AFTER DELETE ON archive_items BEGIN
            #     DELETE FROM archive_items_fts WHERE uuid = old.uuid;
            # END;
            
            # CREATE TRIGGER IF NOT EXISTS archive_items_au AFTER UPDATE ON archive_items BEGIN
            #     DELETE FROM archive_items_fts WHERE uuid = old.uuid;
            #     INSERT INTO archive_items_fts(uuid, name, description, extracted_text)
            #     VALUES (new.uuid, new.name, new.description, new.extracted_text);
            # END;
            
            logger.info("✅ Database initialized successfully (FTS5 disabled for testing)")
            
        # Initialize FTS5 tables
        logger.info("🔍 Initializing FTS5 full-text search...")
        async with get_db_session() as session:
            fts_success = await fts_service.initialize_fts_tables(session)
            if fts_success:
                # Populate FTS tables with existing data
                populate_success = await fts_service.populate_fts_tables(session)
                if populate_success:
                    logger.info("✅ FTS5 initialization completed successfully")
                else:
                    logger.warning("⚠️ FTS5 tables created but population failed")
            else:
                logger.warning("⚠️ FTS5 initialization failed - search performance will be limited")
        
        # Create essential indexes for better performance
        async with get_db_session() as session:
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_notes_user_area ON notes(user_id, area);",
                "CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);",
                "CREATE INDEX IF NOT EXISTS idx_documents_user_mime ON documents(user_id, mime_type);",
                "CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_folder ON archive_items(folder_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_archive_items_user ON archive_items(user_id);",
                "CREATE INDEX IF NOT EXISTS idx_archive_folders_parent ON archive_folders(parent_uuid);",
                "CREATE INDEX IF NOT EXISTS idx_todos_user_status ON todos(user_id, status);",
                "CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);",
                "CREATE INDEX IF NOT EXISTS idx_diary_entries_user_date ON diary_entries(user_id, date);",
                "CREATE INDEX IF NOT EXISTS idx_tags_module_type ON tags(module_type, name);",
            ]
            
            for index_sql in indexes:
                try:
                    await session.execute(text(index_sql))
                    logger.debug(f"✅ Index created: {index_sql.split('idx_')[1].split(' ')[0]}")
                except Exception as e:
                    logger.warning(f"⚠️ Index creation failed: {e}")
            
            await session.commit()
            logger.info("✅ Database indexes created/verified")
        
        logger.info("🎉 Database initialization completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {str(e)}")
        raise


async def close_db():
    """Close database connections"""
    await engine.dispose()
    logger.info("🔌 Database connections closed") 