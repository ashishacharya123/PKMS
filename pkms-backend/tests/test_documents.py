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
async def test_handle_document_tags_usage_counts(monkeypatch):
    doc = Document(id=1, uuid="doc-uuid", user_id=1, title="Doc", filename="file", file_path="path")

    existing_tag = FakeTag(uuid="tag-1", name="existing", usage_count=3)

    db = AsyncMock()

    db.execute.side_effect = [
        MockQueryResult([(existing_tag.uuid,)]),
        MockQueryResult([existing_tag]),
        MockQueryResult([(FakeTag(uuid="tag-2", name="new", usage_count=1),)]),
    ]

    new_tags = ["existing", "new"]

    await _handle_document_tags(db, doc, new_tags, user_id=1)

    assert db.execute.await_count >= 3

