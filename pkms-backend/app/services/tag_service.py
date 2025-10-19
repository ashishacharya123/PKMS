"""
Service for handling tag-related business logic.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, Table
from typing import List, Type, Optional

from app.models.tag import Tag
from app.models.base import Base
from app.models.enums import ModuleType

class TagService:
    async def handle_tags(
        self,
        db: AsyncSession,
        item: Base,
        new_tag_names: List[str],
        created_by: str,
        module_type: Optional[ModuleType],  # Now optional - tags are universal
        association_table: Table
    ):
        """
        Handles the association and usage count of tags for a given item.
        This is a generic handler for any model with a many-to-many tag relationship.
        Tags are case-insensitive - all stored in lowercase.
        """
        # Normalize tag names to lowercase for case-insensitive handling
        normalized_new_tags = [tag.strip().lower() for tag in new_tag_names if tag and tag.strip()]
        
        # Resolve the item UUID column dynamically from the association table
        # Pick the first *_uuid column that is not 'tag_uuid'
        uuid_cols = [col.name for col in association_table.c if col.name.endswith("_uuid") and col.name != "tag_uuid"]
        if not uuid_cols:
            raise ValueError("Association table does not contain an item *_uuid column")
        item_uuid_col = getattr(association_table.c, uuid_cols[0])

        # 1. Get current tags for the item
        existing_tags_query = select(Tag).join(association_table).where(
            item_uuid_col == item.uuid
        )
        existing_tags_result = await db.execute(existing_tags_query)
        existing_tags = existing_tags_result.scalars().all()
        existing_tag_names = {tag.name.lower() for tag in existing_tags}

        # 2. Determine which tags to add and which to remove (case-insensitive)
        new_tags_set = set(normalized_new_tags)
        tags_to_add = new_tags_set - existing_tag_names
        tags_to_remove = existing_tag_names - new_tags_set

        # 3. Decrement usage_count for removed tags
        if tags_to_remove:
            for tag in existing_tags:
                if tag.name.lower() in tags_to_remove:
                    tag.usage_count = max(0, tag.usage_count - 1)

        # 4. Clear existing associations for the item
        await db.execute(delete(association_table).where(item_uuid_col == item.uuid))

        if not normalized_new_tags:
            return

        # 5. Handle the new set of tags
        for tag_name in normalized_new_tags:
            # Get or create the tag (case-insensitive lookup) - universal tags now
            tag_query = select(Tag).where(
                func.lower(Tag.name) == tag_name,
                Tag.created_by == created_by
                # module_type removed - tags are now universal
            )
            tag_result = await db.execute(tag_query)
            tag = tag_result.scalar_one_or_none()

            if not tag:
                tag = Tag(
                    name=tag_name,  # Store in lowercase
                    created_by=created_by,
                    # module_type removed - tags are now universal
                    usage_count=1
                )
                db.add(tag)
                # Ensure tag row exists before association insert
                await db.flush([tag])
            else:
                # Only increment if it's a newly added tag for this item
                if tag.name.lower() in tags_to_add:
                    tag.usage_count += 1

            # Create new association
            await db.execute(
                association_table.insert().values(
                    **{item_uuid_col.name: item.uuid, 'tag_uuid': tag.uuid}
                )
            )
        await db.flush()

    async def decrement_tags_on_delete(self, db: AsyncSession, item: Base):
        """
        Decrements the usage count of tags associated with a deleted item.
        Assumes the item object has its 'tag_objs' relationship loaded.
        """
        if not hasattr(item, 'tag_objs') or not item.tag_objs:
            return

        for tag in item.tag_objs:
            tag.usage_count = max(0, tag.usage_count - 1)
        await db.flush()

tag_service = TagService()
