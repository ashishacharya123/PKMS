"""
Document Router for PKMS

Thin router that delegates all business logic to DocumentCRUDService.
Handles only HTTP concerns: request/response mapping, authentication, error handling.

Refactored to follow "thin router, thick service" architecture pattern.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
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

logger = logging.getLogger(__name__)
router = APIRouter(tags=["documents"])


@router.post("/upload/commit", response_model=DocumentResponse)
async def commit_document_upload(
    payload: CommitDocumentUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Finalize a previously chunk-uploaded document file and create DB record."""
    try:
        return await document_crud_service.commit_document_upload(db, current_user.uuid, payload)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error committing document upload for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to commit document upload: {str(e)}"
        )


@router.get("/", response_model=List[DocumentResponse])
async def list_documents(
    search: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    mime_type: Optional[str] = Query(None),
    archived: Optional[bool] = Query(False),
    is_favorite: Optional[bool] = Query(None),
    project_only: Optional[bool] = Query(False, description="Only documents attached to a project"),
    unassigned_only: Optional[bool] = Query(False, description="Only documents without project associations"),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List documents with filtering and pagination. Uses FTS5 for text search."""
    try:
        return await document_crud_service.list_documents(
            db, current_user.uuid, search, tag, mime_type, archived, 
            is_favorite, project_only, unassigned_only, limit, offset
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing documents for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list documents: {str(e)}"
        )


@router.get("/{document_uuid}", response_model=DocumentResponse)
async def get_document(
    document_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific document by UUID."""
    try:
        return await document_crud_service.get_document(db, current_user.uuid, document_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting document {document_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve document: {str(e)}"
        )


@router.put("/{document_uuid}", response_model=DocumentResponse)
async def update_document(
    document_uuid: str,
    document_data: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update document metadata and tags."""
    try:
        return await document_crud_service.update_document(
            db, current_user.uuid, document_uuid, document_data
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating document {document_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update document: {str(e)}"
        )


@router.delete("/{document_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a document and its associated file."""
    try:
        await document_crud_service.delete_document(db, current_user.uuid, document_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting document {document_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {str(e)}"
        )


@router.get("/{document_uuid}/download")
async def download_document(
    document_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download a document file."""
    try:
        return await document_crud_service.download_document(db, current_user.uuid, document_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error downloading document {document_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download document: {str(e)}"
        )