import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.search_service import search_service
from app.models.document import Document
from app.models.note import Note



@pytest.mark.asyncio
async def test_unified_search_empty(async_client: AsyncClient, test_user):
    # With no data, unified search should return empty list and 200 OK
    resp = await async_client.get(
        "/api/v1/search",
        params={"q": "test", "item_types": ["note", "document"], "limit": 10, "offset": 0},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 0


@pytest.mark.asyncio
async def test_unified_search_item_types_and_offset(async_client: AsyncClient, db_session: AsyncSession, test_user):
    # Seed two documents and two notes, index them, verify offset/limit and item_types
    doc1 = Document(uuid="doc-1", created_by=test_user.uuid, title="Alpha Doc", filename="a.pdf", file_path="assets/documents/a.pdf", file_size=10, mime_type="application/pdf")
    doc2 = Document(uuid="doc-2", created_by=test_user.uuid, title="Beta Doc", filename="b.pdf", file_path="assets/documents/b.pdf", file_size=10, mime_type="application/pdf")
    note1 = Note(uuid="note-1", created_by=test_user.uuid, title="Alpha Note")
    note2 = Note(uuid="note-2", created_by=test_user.uuid, title="Beta Note")
    db_session.add_all([doc1, doc2, note1, note2])
    await db_session.commit()

    # Index items into FTS via service (best-effort)
    await search_service.index_item(db_session, doc1, 'document')
    await search_service.index_item(db_session, doc2, 'document')
    await search_service.index_item(db_session, note1, 'note')
    await search_service.index_item(db_session, note2, 'note')
    await db_session.commit()

    # Query only documents, first page
    resp = await async_client.get(
        "/api/v1/search",
        params={"q": "Doc", "item_types": ["document"], "limit": 1, "offset": 0},
    )
    assert resp.status_code == 200
    items = resp.json()
    assert all(i["type"] == "document" for i in items)
    assert len(items) == 1

    # Next page via offset
    resp2 = await async_client.get(
        "/api/v1/search",
        params={"q": "Doc", "item_types": ["document"], "limit": 1, "offset": 1},
    )
    assert resp2.status_code == 200
    items2 = resp2.json()
    assert len(items2) == 1
    # Combined should represent two unique docs
    uuids = {items[0]["uuid"], items2[0]["uuid"]}
    assert uuids == {"doc-1", "doc-2"}


@pytest.mark.asyncio
async def test_unified_search_has_attachments_for_documents(async_client: AsyncClient, db_session: AsyncSession, test_user):
    # Seed: doc with filename (attachment) and one without (edge)
    doc_with = Document(uuid="doc-a", created_by=test_user.uuid, title="Doc A", filename="a.pdf", file_path="assets/documents/a.pdf", file_size=10, mime_type="application/pdf")
    doc_without = Document(uuid="doc-b", created_by=test_user.uuid, title="Doc B", filename="", file_path="", file_size=0, mime_type="application/pdf")
    db_session.add_all([doc_with, doc_without])
    await db_session.commit()

    await search_service.index_item(db_session, doc_with, 'document')
    await search_service.index_item(db_session, doc_without, 'document')
    await db_session.commit()

    # has_attachments True should return only doc_with
    r_true = await async_client.get(
        "/api/v1/search",
        params={"q": "Doc", "item_types": ["document"], "has_attachments": True, "limit": 10},
    )
    assert r_true.status_code == 200
    uuids_true = {i["uuid"] for i in r_true.json()}
    assert "doc-a" in uuids_true and "doc-b" not in uuids_true

    # has_attachments False should return only doc_without
    r_false = await async_client.get(
        "/api/v1/search",
        params={"q": "Doc", "item_types": ["document"], "has_attachments": False, "limit": 10},
    )
    assert r_false.status_code == 200
    uuids_false = {i["uuid"] for i in r_false.json()}
    assert "doc-b" in uuids_false and "doc-a" not in uuids_false



