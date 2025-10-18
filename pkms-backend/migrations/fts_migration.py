"""
FTS5 Migration Script

This script migrates from the old multi-table FTS system to the new unified FTS system.
It should be run once during the transition period.

Usage:
    python -m migrations.fts_migration
"""

import asyncio
import sys
from pathlib import Path

# Add the parent directory to the path so we can import from app
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import text
from app.database import engine, get_db
from app.services.search_service import search_service
from app.models.user import User
from sqlalchemy import select
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def drop_old_fts_tables():
    """Drop the old FTS tables and triggers."""
    # Use the shared engine from database module
    
    async with engine.begin() as conn:
        logger.info("Dropping old FTS tables and triggers...")
        
        # Drop old FTS tables
        old_tables = [
            "notes_fts",
            "documents_fts", 
            "todos_fts",
            "projects_fts",
            "diary_entries_fts",
            "links_fts"
        ]
        
        for table in old_tables:
            try:
                await conn.execute(text(f"DROP TABLE IF EXISTS {table}"))
                logger.info(f"Dropped {table}")
            except Exception as e:
                logger.warning(f"Could not drop {table}: {e}")
        
        # Drop old FTS triggers
        old_triggers = [
            "notes_fts_insert", "notes_fts_update", "notes_fts_delete",
            "documents_fts_insert", "documents_fts_update", "documents_fts_delete",
            "todos_fts_insert", "todos_fts_update", "todos_fts_delete",
            "projects_fts_insert", "projects_fts_update", "projects_fts_delete",
            "diary_entries_fts_insert", "diary_entries_fts_update", "diary_entries_fts_delete",
            "links_fts_insert", "links_fts_update", "links_fts_delete"
        ]
        
        for trigger in old_triggers:
            try:
                await conn.execute(text(f"DROP TRIGGER IF EXISTS {trigger}"))
                logger.info(f"Dropped {trigger}")
            except Exception as e:
                logger.warning(f"Could not drop {trigger}: {e}")


async def create_new_fts_table():
    """Create the new unified FTS table."""
    # Use the shared engine from database module
    
    async with engine.begin() as conn:
        logger.info("Creating new unified FTS table...")
        
        # Create the unified FTS table
        await conn.execute(text("""
            CREATE VIRTUAL TABLE IF NOT EXISTS fts_content USING fts5(
                item_uuid UNINDEXED,   -- UUID of the original item
                item_type UNINDEXED,   -- 'note', 'todo', 'document', 'project', 'diary', 'link', 'archive'
                created_by UNINDEXED,   -- To scope searches by user
                title,                 -- Title/name from any item
                description,           -- Description (not full content)
                tags,                  -- Space-separated list of tags
                attachments,           -- Space-separated attachment filenames
                date_text,             -- e.g., "2025 October Friday" for date context
                tokenize='porter unicode61'
            )
        """))
        
        logger.info("Created unified fts_content table")


async def bulk_index_existing_content():
    """Bulk index all existing content into the new FTS table."""
    logger.info("Starting bulk index of existing content...")
    
    # Get database session
    async for db in get_db():
        try:
            # Get all users
            users_result = await db.execute(select(User))
            users = users_result.scalars().all()
            
            total_users = len(users)
            logger.info(f"Found {total_users} users to index")
            
            for i, user in enumerate(users, 1):
                logger.info(f"Indexing content for user {user.uuid} ({i}/{total_users})")
                await search_service.bulk_index_user_content(db, user.uuid)
                await db.commit()
                logger.info(f"Completed indexing for user {user.uuid}")
            
            logger.info("Bulk indexing completed successfully!")
            break
            
        except Exception:
            logger.exception("Error during bulk indexing")
            raise
        finally:
            # Session lifecycle managed by get_db(); do not close explicitly here
            pass


async def verify_migration():
    """Verify that the migration was successful."""
    # Use the shared engine from database module
    
    async with engine.begin() as conn:
        logger.info("Verifying migration...")
        
        # Check if new FTS table exists and has content
        result = await conn.execute(text("SELECT COUNT(*) FROM fts_content"))
        count = result.scalar()
        
        if count > 0:
            logger.info(f"Migration successful! {count} items indexed in fts_content")
            
            # Show breakdown by type
            type_result = await conn.execute(text("""
                SELECT item_type, COUNT(*) as count 
                FROM fts_content 
                GROUP BY item_type 
                ORDER BY count DESC
            """))
            
            logger.info("Content breakdown by type:")
            for row in type_result:
                logger.info(f"  {row[0]}: {row[1]} items")
        else:
            logger.warning("No content found in fts_content table")


async def main():
    """Main migration function."""
    logger.info("Starting FTS5 migration...")
    
    try:
        # Step 1: Drop old FTS tables
        await drop_old_fts_tables()
        
        # Step 2: Create new unified FTS table
        await create_new_fts_table()
        
        # Step 3: Bulk index existing content
        await bulk_index_existing_content()
        
        # Step 4: Verify migration
        await verify_migration()
        
        logger.info("FTS5 migration completed successfully!")
        
    except Exception:
        logger.exception("Migration failed")
        raise


if __name__ == "__main__":
    asyncio.run(main())
