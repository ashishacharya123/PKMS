"""
Document Router for PKMS

Thin router that delegates all business logic to DocumentCRUDService.
Handles only HTTP concerns: request/response mapping, authentication, error handling.

Refactored to follow "thin router, thick service" architecture pattern.
"""

from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from pydantic.types import UUID4
import logging

from app.database import get_db
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.schemas.document import (
    DocumentResponse,
    CommitDocumentUploadRequest,
    DocumentUpdate,
)
from app.services.document_crud_service import document_crud_service
from app.decorators.error_handler import handle_api_errors

logger = logging.getLogger(__name__)
router = APIRouter(tags=["documents"])


@router.post("/upload/commit", response_model=DocumentResponse)
@handle_api_errors("commit document upload")
async def commit_document_upload(
    payload: CommitDocumentUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Finalize a previously chunk-uploaded document file and create DB record."""
    return await document_crud_service.commit_document_upload(db, current_user.uuid, payload)


@router.get("/", response_model=List[DocumentResponse])
@handle_api_errors("list documents")
async def list_documents(
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    mime_type: Optional[str] = Query(None),
    archived: Optional[bool] = Query(False),
    is_favorite: Optional[bool] = Query(None),
    project_only: Optional[bool] = Query(False, description="Only documents attached to a project"),
    unassigned_only: Optional[bool] = Query(False, description="Only documents without project associations"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of documents to return"),
    offset: int = Query(0, ge=0, description="Number of documents to skip"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List documents with filtering and pagination. Uses FTS5 for text search."""
    return await document_crud_service.list_documents(
        db, current_user.uuid, search, tag, mime_type, archived, 
        is_favorite, project_only, unassigned_only, limit, offset
    )


@router.get("/deleted", response_model=List[DocumentResponse])
@handle_api_errors("list deleted documents")
async def list_deleted_documents(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List deleted documents for Recycle Bin."""
    return await document_crud_service.list_deleted_documents(db, current_user.uuid)


@router.get("/{document_uuid}", response_model=DocumentResponse)
@handle_api_errors("get document")
async def get_document(
    document_uuid: UUID4,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific document by UUID."""
    return await document_crud_service.get_document(db, current_user.uuid, document_uuid)


@router.put("/{document_uuid}", response_model=DocumentResponse)
@handle_api_errors("update document")
async def update_document(
    document_uuid: UUID4,
    document_data: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update document metadata and tags."""
    return await document_crud_service.update_document(
        db, current_user.uuid, document_uuid, document_data
    )


@router.delete("/{document_uuid}", status_code=status.HTTP_204_NO_CONTENT)
@handle_api_errors("delete document")
async def delete_document(
    document_uuid: UUID4,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a document and its associated file."""
    await document_crud_service.delete_document(db, current_user.uuid, document_uuid)


@router.post("/{document_uuid}/restore")
@handle_api_errors("restore document")
async def restore_document(
    document_uuid: UUID4,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Restore a soft-deleted document from Recycle Bin."""
    await document_crud_service.restore_document(db, current_user.uuid, document_uuid)
    return {"message": "Document restored successfully"}


@router.delete("/{document_uuid}/permanent")
@handle_api_errors("hard delete document")
async def permanent_delete_document(
    document_uuid: UUID4,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete document (hard delete) - WARNING: Cannot be undone!"""
    await document_crud_service.permanent_delete_document(db, current_user.uuid, document_uuid)
    return {"message": "Document permanently deleted"}


@router.get("/{document_uuid}/download")
@handle_api_errors("download document")
async def download_document(
    document_uuid: UUID4,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download a document file."""
    return await document_crud_service.download_document(db, current_user.uuid, document_uuid)