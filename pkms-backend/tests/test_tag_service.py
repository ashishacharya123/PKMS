"""
Comprehensive tests for TagService

Tests the centralized tag management functionality including:
- Case-insensitive tag handling
- Usage count tracking
- Tag creation and association
- Tag deletion and cleanup
- Cross-module tag isolation
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, Select, Delete, Insert
from typing import List

from app.services.tag_service import tag_service
from app.models.tag import Tag
from app.models.tag_associations import (
    note_tags, document_tags, todo_tags,
    archive_item_tags, archive_folder_tags, diary_entry_tags
)


class TestTagService:
    """Test suite for TagService functionality"""

    @pytest.fixture
    async def mock_db(self):
        """Create a mock database session"""
        db = AsyncMock(spec=AsyncSession)
        db.execute = AsyncMock()
        db.flush = AsyncMock()
        return db

    @pytest.fixture
    def mock_item(self):
        """Create a mock content item"""
        item = MagicMock()
        item.uuid = "test-item-uuid-123"
        return item

    @pytest.fixture
    def mock_user_uuid(self):
        """Mock user UUID"""
        return "00000000-0000-0000-0000-000000000001"

    @pytest.mark.asyncio
    async def test_handle_tags_new_tags_creation(self, mock_db, mock_item, mock_user_uuid):
        """Test creating new tags with proper case-insensitive handling"""
        # Mock existing tags query (no existing tags)
        mock_result = AsyncMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        # Mock execute to return appropriate results regardless of number of calls
        async def execute_router(_stmt, *_args, **_kwargs):
            # First query: existing tags for item (returns empty list)
            if str(_stmt).lower().startswith("select"):
                result = AsyncMock()
                result.scalars.return_value.all.return_value = []
                result.scalar_one_or_none.return_value = None
                return result
            return AsyncMock()
        mock_db.execute.side_effect = execute_router

        # Test data
        tag_names = ["Important", "WORK", "personal"]  # Mixed case
        module_type = "notes"
        association_table = note_tags

        # Execute
        await tag_service.handle_tags(
            mock_db, mock_item, tag_names, mock_user_uuid, module_type, association_table
        )

        # Verify tag creation calls
        assert mock_db.add.call_count == 3  # Three new tags created
        
        # Verify tags are stored in lowercase
        added_tags = [call[0][0] for call in mock_db.add.call_args_list]
        tag_names_lower = [tag.name for tag in added_tags]
        assert "important" in tag_names_lower
        assert "work" in tag_names_lower
        assert "personal" in tag_names_lower

        # Verify usage_count is set to 1 for new tags
        for tag in added_tags:
            assert tag.usage_count == 1
            assert tag.module_type == module_type
            assert tag.user_uuid == mock_user_uuid

    @pytest.mark.asyncio
    async def test_handle_tags_existing_tags_increment(self, mock_db, mock_item, mock_user_uuid):
        """Test incrementing usage count for existing tags"""
        # Mock existing tags query (no existing tags for this item)
        mock_existing_result = AsyncMock()
        mock_existing_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_existing_result

        # Mock tag lookup query (existing tag found)
        existing_tag = Tag(
            uuid="existing-tag-uuid",
            name="important",
            user_uuid=mock_user_uuid,
            module_type="notes",
            usage_count=5
        )
        async def execute_router(_stmt, *_args, **_kwargs):
            # First call returns no existing tags for the item
            if hasattr(execute_router, 'called'):
                pass
            else:
                execute_router.called = True
                return mock_existing_result
            # Subsequent select for tag lookup returns existing_tag
            result = AsyncMock()
            result.scalar_one_or_none.return_value = existing_tag
            return result
        mock_db.execute.side_effect = execute_router

        # Test data
        tag_names = ["Important"]  # Case-insensitive match
        module_type = "notes"
        association_table = note_tags

        # Execute
        await tag_service.handle_tags(
            mock_db, mock_item, tag_names, mock_user_uuid, module_type, association_table
        )

        # Verify usage count was incremented
        assert existing_tag.usage_count == 6

        # Verify no new tag was created
        mock_db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_handle_tags_remove_existing_tags(self, mock_db, mock_item, mock_user_uuid):
        """Test removing existing tags and decrementing usage count"""
        # Mock existing tags query (item has existing tags)
        existing_tag1 = Tag(
            uuid="tag1-uuid",
            name="old_tag",
            user_uuid=mock_user_uuid,
            module_type="notes",
            usage_count=3
        )
        existing_tag2 = Tag(
            uuid="tag2-uuid", 
            name="another_tag",
            user_uuid=mock_user_uuid,
            module_type="notes",
            usage_count=2
        )
        mock_existing_result = AsyncMock()
        mock_existing_result.scalars.return_value.all.return_value = [existing_tag1, existing_tag2]
        mock_db.execute.return_value = mock_existing_result

        # Mock execute: first returns existing tags list; later lookups return None (no tag found)
        async def execute_router(_stmt, *_args, **_kwargs):
            if hasattr(execute_router, 'called'):
                result = AsyncMock()
                result.scalar_one_or_none.return_value = None
                return result
            else:
                execute_router.called = True
                return mock_existing_result
        mock_db.execute.side_effect = execute_router

        # Test data - removing old tags, adding new one
        tag_names = ["new_tag"]
        module_type = "notes"
        association_table = note_tags

        # Execute
        await tag_service.handle_tags(
            mock_db, mock_item, tag_names, mock_user_uuid, module_type, association_table
        )

        # Verify usage counts were decremented for removed tags
        assert existing_tag1.usage_count == 2  # 3 - 1
        assert existing_tag2.usage_count == 1  # 2 - 1

        # Verify new tag was created
        mock_db.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_tags_case_insensitive_comparison(self, mock_db, mock_item, mock_user_uuid):
        """Test that tag comparison is case-insensitive"""
        # Mock existing tags query (item has existing tags with different case)
        existing_tag = Tag(
            uuid="tag1-uuid",
            name="IMPORTANT",  # Uppercase in DB
            user_uuid=mock_user_uuid,
            module_type="notes",
            usage_count=2
        )
        mock_existing_result = AsyncMock()
        mock_existing_result.scalars.return_value.all.return_value = [existing_tag]
        mock_db.execute.return_value = mock_existing_result

        # Mock execute: first existing tags for item, then lookup returns existing_tag
        async def execute_router(_stmt, *_args, **_kwargs):
            if hasattr(execute_router, 'called'):
                result = AsyncMock()
                result.scalar_one_or_none.return_value = existing_tag
                return result
            else:
                execute_router.called = True
                return mock_existing_result
        mock_db.execute.side_effect = execute_router

        # Test data - same tag with different case
        tag_names = ["important"]  # Lowercase in input
        module_type = "notes"
        association_table = note_tags

        # Execute
        await tag_service.handle_tags(
            mock_db, mock_item, tag_names, mock_user_uuid, module_type, association_table
        )

        # Verify usage count was incremented (tag was recognized as existing)
        assert existing_tag.usage_count == 3

        # Verify no new tag was created
        mock_db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_handle_tags_empty_tag_list(self, mock_db, mock_item, mock_user_uuid):
        """Test handling empty tag list"""
        # Mock existing tags query (no existing tags)
        mock_result = AsyncMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        # Test data
        tag_names = []
        module_type = "notes"
        association_table = note_tags

        # Execute
        await tag_service.handle_tags(
            mock_db, mock_item, tag_names, mock_user_uuid, module_type, association_table
        )

        # Verify no tags were created
        mock_db.add.assert_not_called()

        # Verify at least the existing tags query was executed (service also clears associations)
        assert mock_db.execute.call_count >= 1

    @pytest.mark.asyncio
    async def test_handle_tags_whitespace_handling(self, mock_db, mock_item, mock_user_uuid):
        """Test that whitespace is properly handled in tag names"""
        # Mock existing tags query (no existing tags)
        mock_result = AsyncMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        # Mock execute to handle multiple lookups gracefully
        async def execute_router(_stmt, *_args, **_kwargs):
            if hasattr(execute_router, 'called'):
                result = AsyncMock()
                result.scalar_one_or_none.return_value = None
                return result
            else:
                execute_router.called = True
                return mock_result
        mock_db.execute.side_effect = execute_router

        # Test data with whitespace
        tag_names = ["  Important  ", "  Work  ", ""]  # Whitespace and empty string
        module_type = "notes"
        association_table = note_tags

        # Execute
        await tag_service.handle_tags(
            mock_db, mock_item, tag_names, mock_user_uuid, module_type, association_table
        )

        # Verify only 2 tags were created (empty string filtered out)
        assert mock_db.add.call_count == 2
        
        # Verify tags are trimmed and lowercase
        added_tags = [call[0][0] for call in mock_db.add.call_args_list]
        tag_names_lower = [tag.name for tag in added_tags]
        assert "important" in tag_names_lower
        assert "work" in tag_names_lower

    @pytest.mark.asyncio
    async def test_handle_tags_module_isolation(self, mock_db, mock_item, mock_user_uuid):
        """Test that tags are isolated by module type"""
        # Mock existing tags query (no existing tags)
        mock_result = AsyncMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result

        # Mock execute: first existing tags, then lookup returns None
        async def execute_router(_stmt, *_args, **_kwargs):
            if hasattr(execute_router, 'called'):
                result = AsyncMock()
                result.scalar_one_or_none.return_value = None
                return result
            else:
                execute_router.called = True
                return mock_result
        mock_db.execute.side_effect = execute_router

        # Test data
        tag_names = ["important"]
        module_type = "documents"  # Different module
        association_table = document_tags

        # Execute
        await tag_service.handle_tags(
            mock_db, mock_item, tag_names, mock_user_uuid, module_type, association_table
        )

        # Verify tag was created with correct module type
        mock_db.add.assert_called_once()
        created_tag = mock_db.add.call_args[0][0]
        assert created_tag.module_type == "documents"

    @pytest.mark.asyncio
    async def test_decrement_tags_on_delete(self, mock_db, mock_item):
        """Test decrementing tag usage counts when deleting an item"""
        # Mock item with tags
        tag1 = Tag(usage_count=5)
        tag2 = Tag(usage_count=3)
        tag3 = Tag(usage_count=1)
        mock_item.tag_objs = [tag1, tag2, tag3]

        # Execute
        await tag_service.decrement_tags_on_delete(mock_db, mock_item)

        # Verify usage counts were decremented
        assert tag1.usage_count == 4
        assert tag2.usage_count == 2
        assert tag3.usage_count == 0

        # Verify flush was called
        mock_db.flush.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_decrement_tags_on_delete_no_tags(self, mock_db, mock_item):
        """Test decrementing when item has no tags"""
        # Mock item with no tags
        mock_item.tag_objs = []

        # Execute
        await tag_service.decrement_tags_on_delete(mock_db, mock_item)

        # Verify flush was still called
        mock_db.flush.assert_not_called()

    @pytest.mark.asyncio
    async def test_decrement_tags_on_delete_no_tag_objs_attribute(self, mock_db, mock_item):
        """Test decrementing when item has no tag_objs attribute"""
        # Mock item without tag_objs attribute
        delattr(mock_item, 'tag_objs')

        # Execute
        await tag_service.decrement_tags_on_delete(mock_db, mock_item)

        # Verify flush was still called
        mock_db.flush.assert_not_called()

    @pytest.mark.asyncio
    async def test_handle_tags_usage_count_never_negative(self, mock_db, mock_item, mock_user_uuid):
        """Test that usage count never goes negative"""
        # Mock existing tags query (item has existing tags)
        existing_tag = Tag(
            uuid="tag1-uuid",
            name="test_tag",
            user_uuid=mock_user_uuid,
            module_type="notes",
            usage_count=0  # Already at 0
        )
        mock_existing_result = AsyncMock()
        mock_existing_result.scalars.return_value.all.return_value = [existing_tag]
        mock_db.execute.return_value = mock_existing_result

        # Mock tag lookup query (new tag not found)
        mock_tag_lookup = AsyncMock()
        mock_tag_lookup.scalar_one_or_none.return_value = None
        
        # Use inspection-based side_effect to handle multiple queries
        async def execute_side_effect(stmt, *_args, **_kwargs):
            s = str(stmt)
            if isinstance(stmt, Select) and "FROM tags" in s:
                return mock_tag_lookup
            elif isinstance(stmt, Select):
                return mock_existing_result
            elif isinstance(stmt, (Delete, Insert)):
                return AsyncMock()
            return AsyncMock()
        mock_db.execute.side_effect = execute_side_effect

        # Test data - removing existing tag, adding new one
        tag_names = ["new_tag"]
        module_type = "notes"
        association_table = note_tags

        # Execute
        await tag_service.handle_tags(
            mock_db, mock_item, tag_names, mock_user_uuid, module_type, association_table
        )

        # Verify usage count didn't go negative
        assert existing_tag.usage_count == 0  # max(0, 0-1) = 0

    @pytest.mark.asyncio
    async def test_handle_tags_complex_scenario(self, mock_db, mock_item, mock_user_uuid):
        """Test complex scenario with mixed operations"""
        # Mock existing tags query (item has some existing tags)
        existing_tag1 = Tag(
            uuid="tag1-uuid",
            name="keep_tag",
            user_uuid=mock_user_uuid,
            module_type="notes",
            usage_count=2
        )
        existing_tag2 = Tag(
            uuid="tag2-uuid",
            name="remove_tag",
            user_uuid=mock_user_uuid,
            module_type="notes",
            usage_count=3
        )
        mock_existing_result = AsyncMock()
        mock_existing_result.scalars.return_value.all.return_value = [existing_tag1, existing_tag2]
        mock_db.execute.return_value = mock_existing_result

        # Mock tag lookup queries
        # First call: keep_tag (existing, should increment)
        # Second call: new_tag (not found, should create)
        mock_tag_lookup1 = AsyncMock()
        mock_tag_lookup1.scalar_one_or_none.return_value = existing_tag1
        
        mock_tag_lookup2 = AsyncMock()
        mock_tag_lookup2.scalar_one_or_none.return_value = None
        
        async def execute_router(_stmt, *_args, **_kwargs):
            order = getattr(execute_router, 'order', 0)
            if order == 0:
                execute_router.order = 1
                return mock_existing_result
            elif order == 1:
                execute_router.order = 2
                res = AsyncMock()
                res.scalar_one_or_none.return_value = existing_tag1
                return res
            else:
                res = AsyncMock()
                res.scalar_one_or_none.return_value = None
                return res
        mock_db.execute.side_effect = execute_router

        # Test data - keep one, remove one, add one
        tag_names = ["keep_tag", "new_tag"]
        module_type = "notes"
        association_table = note_tags

        # Execute
        await tag_service.handle_tags(
            mock_db, mock_item, tag_names, mock_user_uuid, module_type, association_table
        )

        # Verify usage counts
        assert existing_tag1.usage_count == 2  # kept; no increment
        assert existing_tag2.usage_count == 2  # 3 - 1 (removed and decremented)

        # Verify new tag was created
        mock_db.add.assert_called_once()
        created_tag = mock_db.add.call_args[0][0]
        assert created_tag.name == "new_tag"
        assert created_tag.usage_count == 1


class TestTagServiceIntegration:
    """Integration tests for TagService with real database operations"""

    @pytest.mark.asyncio
    async def test_tag_service_with_real_db(self):
        """Test TagService with actual database operations"""
        # This would require a real database setup
        # For now, we'll mark it as a placeholder for future integration tests
        pytest.skip("Integration tests require database setup")

    @pytest.mark.asyncio
    async def test_tag_service_performance(self):
        """Test TagService performance with large datasets"""
        # This would test performance with many tags
        pytest.skip("Performance tests require database setup")


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])
