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

from app.config import get_database_url, settings

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create async engine
engine = create_async_engine(
    get_database_url(),
    echo=settings.debug,  # Log SQL queries in debug mode
    poolclass=StaticPool,  # Better for SQLite
    connect_args={"check_same_thread": False} if "sqlite" in get_database_url() else {}
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
        async with engine.begin() as conn:
            # Get table info
            result = await conn.execute(text(f"PRAGMA table_info({table_name})"))
            columns = result.fetchall()
            
            logger.info(f"\n=== Table Schema for {table_name} ===")
            for col in columns:
                logger.info(f"Column: {col[1]}, Type: {col[2]}, Nullable: {not col[3]}, Default: {col[4]}")
            logger.info("=" * 40)
            
    except Exception as e:
        logger.error(f"Error verifying table schema: {e}")
        raise


async def init_db():
    """Initialize database and create tables"""
    
    try:
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
            
    except Exception as e:
        logger.error(f"❌ Database initialization failed: {str(e)}")
        raise


async def close_db():
    """Close database connections"""
    await engine.dispose()
    logger.info("🔌 Database connections closed") 