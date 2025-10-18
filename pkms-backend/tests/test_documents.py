import pytest
from unittest.mock import AsyncMock

from app.routers.documents import _handle_document_tags
from app.models.document import Document


class MockQueryResult:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows

    def scalars(self):
        class ScalarIter:
            def __init__(self, rows):
                self._rows = rows

            def all(self):
                return self._rows

        return ScalarIter(self._rows)


class FakeTag:
    def __init__(self, uuid, name, usage_count=0, module_type="documents", color="#fff"):
        self.uuid = uuid
        self.name = name
        self.usage_count = usage_count
        self.module_type = module_type
        self.color = color


@pytest.mark.asyncio
async def test_handle_document_tags_usage_counts():
    """Test that tag usage counts are updated correctly and new tags are created."""
    doc = Document(id=1, uuid="doc-uuid", created_by=1, title="Doc", filename="file", file_path="path")

    existing_tag = FakeTag(uuid="tag-1", name="existing", usage_count=3)

    db = AsyncMock()

    # Mock the sequence of database queries:
    # 1. Get existing tag associations
    # 2. Fetch existing tags to update usage counts
    # 3. Find existing tag by name
    # 4. Find new tag (not found - will create)
    db.execute.side_effect = [
        MockQueryResult([(existing_tag.uuid,)]),  # Existing associations
        MockQueryResult([existing_tag]),           # Fetch existing tags
        MockQueryResult([existing_tag]),           # Find existing tag by name
        MockQueryResult([]),                       # Find new tag (not found)
    ]

    new_tags = ["existing", "new"]

    await _handle_document_tags(db, doc, new_tags, created_by=1)

    # Verify execute was called for all expected queries
    assert db.execute.await_count >= 4, "Should execute at least 4 queries"

    # Verify existing tag usage count was incremented (from 3 to 4 when reused)
    assert existing_tag.usage_count == 4, "Existing tag count should be incremented when reused"

    # Verify db.add was called for the new tag
    assert db.add.call_count >= 1, "Should add new tag to session"
    
    # Verify db.flush was called to persist changes
    assert db.flush.await_count >= 1, "Should flush changes to database"

