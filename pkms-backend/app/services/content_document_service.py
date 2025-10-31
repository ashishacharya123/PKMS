"""
Content Document Service

Unified service for managing content documents across different modules.
Handles encrypted/unencrypted content storage, file management, and associations.
"""

import logging
import base64
import hashlib
import uuid as uuid_lib
import aiofiles
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pathlib import Path

from app.config import get_file_storage_dir
from app.services.unified_upload_service import get_user_storage_path
from app.models.document import Document

logger = logging.getLogger(__name__)


class ContentDocumentService:
  @staticmethod
  async def create_content_document(
    db: AsyncSession,
    item_uuid: str,
    user_uuid: str,
    content_blob: str,
    module: str,
    options: dict | None = None,
  ) -> str:
    options = options or {}
    is_encrypted = bool(options.get('is_encrypted', False))
    title = options.get('title', f"{module.title()} Content - {item_uuid}")
    description = options.get('description', f"{module.title()} content")

    # Generate identifiers and paths
    document_uuid = str(uuid_lib.uuid4())
    storage_dir: Path = get_user_storage_path(user_uuid, 'documents') / module
    storage_dir.mkdir(parents=True, exist_ok=True)

    extension = 'dat' if is_encrypted else 'txt'
    filename = f"{item_uuid}_content.{extension}"
    file_path = storage_dir / filename

    # Decode and write
    raw = base64.b64decode(content_blob)
    async with aiofiles.open(file_path, 'wb') as f:
      await f.write(raw)

    # Hash and record
    file_hash = hashlib.sha256(raw).hexdigest()
    relative_path = str(file_path.relative_to(get_file_storage_dir()))

    doc = Document(
      uuid=document_uuid,
      title=title,
      original_name=filename,
      filename=filename,
      file_path=relative_path,
      file_size=len(raw),
      file_hash=file_hash,
      mime_type='application/octet-stream' if is_encrypted else 'text/plain',
      description=description,
      is_favorite=False,
      is_archived=False,
      created_by=user_uuid,
    )
    db.add(doc)
    await db.flush()

    logger.info("Created content document %s for %s item %s", document_uuid, module, item_uuid)
    return document_uuid

  @staticmethod
  async def update_content_document(
    db: AsyncSession,
    document_uuid: str,
    content_blob: str,
  ) -> None:
    result = await db.execute(select(Document).where(Document.uuid == document_uuid))
    document = result.scalar_one_or_none()
    if not document:
      raise ValueError(f"Document {document_uuid} not found")

    full_path = get_file_storage_dir() / document.file_path
    raw = base64.b64decode(content_blob)
    async with aiofiles.open(full_path, 'wb') as f:
      await f.write(raw)

    document.file_size = len(raw)
    document.file_hash = hashlib.sha256(raw).hexdigest()
    await db.flush()

    logger.info("Updated content document %s", document_uuid)


content_document_service = ContentDocumentService()


