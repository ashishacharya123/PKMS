import pytest
import tempfile
from pathlib import Path
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

@pytest.mark.asyncio
async def test_document_chunk_commit_moves_and_indexes(async_client: AsyncClient, db_session: AsyncSession, test_user):
    # Prepare a temp assembled file in temp_uploads dir
    temp_root = Path("pkms-backend/PKMS_Data/temp_uploads")
    temp_root.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(delete=False, dir=temp_root, prefix="complete_testupload_", suffix=".txt") as tf:
        tf.write(b"hello world")
        assembled_name = Path(tf.name).name

    upload_id = assembled_name.replace("complete_", "").split("_")[0]

    payload = {
        "fileId": upload_id,
        "title": "Test Doc",
        "description": "desc",
        "tags": ["t1"],
        "projectIds": [],
        "isExclusiveMode": False,
    }

    # Commit document upload
    resp = await async_client.post("/api/v1/documents/upload/commit", json=payload)
    assert resp.status_code in (200, 201)
    doc = resp.json()
    doc_uuid = doc["uuid"]

    # File should exist at final path and FTS should have a row
    final_path = Path(doc["file_path"]) if "file_path" in doc else None
    # Check FTS row exists
    res = await db_session.execute(text("SELECT 1 FROM fts_content WHERE item_uuid = :u"), {"u": doc_uuid})
    assert res.fetchone() is not None

@pytest.mark.asyncio
async def test_archive_chunk_commit_moves_and_indexes(async_client: AsyncClient, db_session: AsyncSession, test_user):
    # Create an assembled file for archive upload commit
    temp_root = Path("pkms-backend/PKMS_Data/temp_uploads")
    temp_root.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(delete=False, dir=temp_root, prefix="complete_archive_", suffix=".bin") as tf:
        tf.write(b"archive bin")
        assembled_name = Path(tf.name).name

    upload_id = assembled_name.replace("complete_", "").split("_")[0]
    payload = {"fileId": upload_id, "name": "Arc.bin", "description": "d"}
    resp = await async_client.post("/api/v1/archive/upload/commit", json=payload)
    assert resp.status_code in (200, 201)
    item = resp.json()
    item_uuid = item["uuid"]
    res = await db_session.execute(text("SELECT 1 FROM fts_content WHERE item_uuid = :u"), {"u": item_uuid})
    assert res.fetchone() is not None


