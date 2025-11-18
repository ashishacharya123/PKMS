#!/usr/bin/env python3
"""
Migration script to add is_deleted column to notes table
"""

import asyncio
import sys
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def run_migration():
    """Run the migration to add is_deleted column"""

    # Database connection
    engine = create_async_engine("sqlite+aiosqlite:///./data/app.db")

    try:
        async with engine.begin() as conn:
            # Check if column already exists
            result = await conn.execute(text("PRAGMA table_info(notes)"))
            columns = [row[1] for row in result.fetchall()]

            if 'is_deleted' in columns:
                print("✅ is_deleted column already exists in notes table")
                return

            print("🔄 Adding is_deleted column to notes table...")

            # Add the is_deleted column
            await conn.execute(text("""
                ALTER TABLE notes
                ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE NOT NULL
            """))

            # Create index for performance
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_notes_is_deleted
                ON notes(is_deleted)
            """))

            # Create composite index for user + deleted queries
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_notes_user_deleted
                ON notes(created_by, is_deleted)
            """))

            print("✅ Migration completed successfully!")
            print("✅ Added is_deleted column to notes table")
            print("✅ Created indexes for optimal query performance")

    except Exception as e:
        print(f"❌ Migration error: {e}")
        sys.exit(1)
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(run_migration())