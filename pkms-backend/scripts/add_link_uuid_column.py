"""
Migration script to add UUID column to links table and update link_tags association table
"""

import asyncio
from uuid import uuid4
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import async_session_maker


async def migrate_links_to_uuid():
    """
    Add UUID column to links table and update link_tags table to use UUIDs
    """
    async with async_session_maker() as db:
        try:
            # Start transaction
            await db.execute(text("BEGIN"))
            
            # 1. Add UUID column to links table
            await db.execute(text("""
                ALTER TABLE links 
                ADD COLUMN uuid VARCHAR(36);
            """))
            
            # 2. Generate UUIDs for existing links
            # Generate UUIDs for all links without one
            result = await db.execute(text("SELECT id FROM links WHERE uuid IS NULL"))
            links_without_uuid = result.fetchall()
            
            for row in links_without_uuid:
                link_id = row[0]
                new_uuid = str(uuid4())
                await db.execute(
                    text("UPDATE links SET uuid = :uuid WHERE id = :id"),
                    {"uuid": new_uuid, "id": link_id}
                )
            
            # 3. Make uuid column NOT NULL
            await db.execute(text("""
                ALTER TABLE links 
                ALTER COLUMN uuid SET NOT NULL;
            """))
            
            # 4. Create new link_tags table with UUID
            await db.execute(text("""
                CREATE TABLE link_tags_new (
                    link_uuid VARCHAR(36) NOT NULL REFERENCES links(uuid) ON DELETE CASCADE,
                    tag_uuid VARCHAR(36) NOT NULL REFERENCES tags(uuid) ON DELETE CASCADE,
                    PRIMARY KEY (link_uuid, tag_uuid)
                );
            """))
            
            # 5. Migrate existing link_tags data
            await db.execute(text("""
                INSERT INTO link_tags_new (link_uuid, tag_uuid)
                SELECT l.uuid, t.uuid
                FROM link_tags lt
                JOIN links l ON lt.link_id = l.id
                JOIN tags t ON lt.tag_uuid = t.uuid;
            """))
            
            # 6. Drop old table and rename new one
            await db.execute(text("DROP TABLE link_tags;"))
            await db.execute(text("ALTER TABLE link_tags_new RENAME TO link_tags;"))
            
            # 7. Create indexes for link_tags
            await db.execute(text("""
                CREATE INDEX ix_link_tags_link_uuid ON link_tags(link_uuid);
                CREATE INDEX ix_link_tags_tag_uuid ON link_tags(tag_uuid);
            """))
            
            # Commit transaction
            await db.execute(text("COMMIT"))
            print("Migration completed successfully!")
            
        except Exception as e:
            await db.execute(text("ROLLBACK"))
            print(f"Error during migration: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(migrate_links_to_uuid())
