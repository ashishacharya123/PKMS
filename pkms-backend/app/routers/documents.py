"""
Document Router with Core Upload Service Integration
"""

import os
import shutil
from pathlib import Path
import asyncio
from typing import List, Optional, Dict, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select, and_, or_, func, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
import json
import logging
import uuid as uuid_lib

from app.database import get_db
from app.config import NEPAL_TZ, get_data_dir, get_file_storage_dir
from app.models.document import Document
from app.models.tag import Tag
from app.models.user import User
from app.models.project import Project
from app.models.tag_associations import document_tags
from app.models.associations import document_projects
from app.services.tag_service import tag_service
from app.auth.dependencies import get_current_user
from app.utils.security import sanitize_text_input, sanitize_tags
from app.services.chunk_service import chunk_manager
from app.services.file_detection import FileTypeDetectionService
from app.services.project_service import project_service
from app.services.file_management_service import file_management_service
from app.services.search_service import search_service
from app.schemas.document import (
    DocumentResponse,
    CommitDocumentUploadRequest,
    DocumentUpdate,
    ArchiveDocumentRequest,
    ProjectBadge,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["documents"])

# Initialize file type detection service
file_detector = FileTypeDetectionService()

# Pydantic Models
# Models are now in app/schemas/document.py

# Helper Functions (legacy helpers removed in favor of services)

def _convert_doc_to_response(doc: Document, project_badges: Optional[List[ProjectBadge]] = None) -> DocumentResponse:
    """Convert Document model to DocumentResponse with relational tags."""
    return DocumentResponse(
        uuid=doc.uuid,
        title=doc.title,
        original_name=doc.original_name,
        filename=doc.filename,
        file_path=doc.file_path,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        description=doc.description,
        is_favorite=doc.is_favorite,
        is_archived=doc.is_archived,
        is_exclusive_mode=doc.is_exclusive_mode,
        upload_status=doc.upload_status,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        tags=[t.name for t in doc.tag_objs] if doc.tag_objs else [],
        projects=project_badges or []
    )

# Document Endpoints
@router.post("/upload/commit", response_model=DocumentResponse)
async def commit_document_upload(
    payload: CommitDocumentUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Finalize a previously chunk-uploaded document file and create DB record.
    
    Uses the centralized FileManagementService for atomic file operations.
    """
    try:
        logger.info(f"Committing document upload: {payload.title}")
        
        # Use centralized FileManagementService for document upload
        document_with_tags = await file_management_service.commit_document_upload(
            db=db,
            upload_id=payload.file_id,
            title=payload.title,
            description=payload.description,
            tags=payload.tags,
            project_ids=payload.project_ids,
            is_exclusive_mode=payload.is_exclusive_mode,
            user_uuid=current_user.uuid,
            document_model=Document,
            tag_service=tag_service,
            project_service=project_service,
            document_tags=document_tags,
            document_projects=document_projects
        )

        # Index in search and persist
        await search_service.index_item(db, document_with_tags, 'document')
        await db.commit()

        # Build project badges
        project_badges = await project_service.build_badges(db, document_with_tags.uuid, document_with_tags.is_exclusive_mode, document_projects, "document_uuid")

        logger.info(f"Document committed successfully: {document_with_tags.filename}")
        return _convert_doc_to_response(document_with_tags, project_badges)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error committing document upload")
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
    """
    List documents with filtering and pagination. Uses FTS5 for text search.
    
    Exclusive mode filtering:
    - Items with is_exclusive_mode=True are HIDDEN from main list (only in project dashboards)
    - Items with is_exclusive_mode=False are ALWAYS shown (linked mode)
    """
    try:
        logger.info(f"Listing documents for user {current_user.uuid} - archived: {archived}, search: {search}, tag: {tag}")
        
        if search:
            # Use unified FTS5 search with native offset
            from app.utils.security import sanitize_search_query
            q = sanitize_search_query(search)
            fts_results = await search_service.search(
                db, current_user.uuid, q, item_types=["document"], limit=limit, offset=offset
            )

            # Collect document UUIDs in FTS order (bm25 ASC = better first)
            doc_uuids: List[str] = []
            for r in fts_results:
                if r["type"] == "document":
                    doc_uuids.append(r["uuid"])

            # Offset applied at search_service; keep order as returned
            
            logger.info(f"FTS5 search returned {len(doc_uuids)} document UUIDs with scores")
            
            if not doc_uuids:
                return []
            
            # Fetch documents by UUIDs
            query = select(Document).options(selectinload(Document.tag_objs)).where(
                and_(
                    Document.created_by == current_user.uuid,
                    Document.is_archived == archived,
                    Document.uuid.in_(doc_uuids),
                    Document.is_exclusive_mode.is_(False)  # Only show linked (non-exclusive) items
                )
            )
            # Apply filters
            if tag:
                query = query.join(Document.tag_objs).where(Tag.name == tag)
            if mime_type:
                query = query.where(Document.mime_type.like(f"{mime_type}%"))
            if is_favorite is not None:
                query = query.where(Document.is_favorite == is_favorite)
            if project_only:
                # Filter documents that have project associations
                query = query.join(document_projects, Document.uuid == document_projects.c.document_uuid)
            elif unassigned_only:
                # Filter documents that have NO project associations
                query = query.outerjoin(document_projects, Document.uuid == document_projects.c.document_uuid)
                query = query.where(document_projects.c.document_uuid.is_(None))
            result = await db.execute(query.order_by(Document.is_favorite.desc(), Document.created_at.desc()))
            documents = result.scalars().unique().all()
            logger.info(f"FTS5 query returned {len(documents)} documents")
            
            # Preserve FTS order as returned by search_service
            docs_by_uuid = {d.uuid: d for d in documents}
            ordered_docs = [docs_by_uuid[u] for u in doc_uuids if u in docs_by_uuid]
            
            logger.info(f"Final ordered result: {len(ordered_docs)} documents (ordered by FTS relevance)")
        else:
            # Fallback to regular query
            logger.info(f"Using regular query for archived={archived}")
            query = select(Document).options(selectinload(Document.tag_objs)).where(
                and_(
                    Document.created_by == current_user.uuid,
                    Document.is_archived == archived,
                    Document.is_exclusive_mode.is_(False)  # Only show linked (non-exclusive) items
                )
            )
            # Apply filters
            if tag:
                query = query.join(Document.tag_objs).where(Tag.name == tag)
            if mime_type:
                query = query.where(Document.mime_type.like(f"{mime_type}%"))
            if is_favorite is not None:
                query = query.where(Document.is_favorite == is_favorite)
            if project_only:
                # Filter documents that have project associations
                query = query.join(document_projects, Document.uuid == document_projects.c.document_uuid)
            elif unassigned_only:
                # Filter documents that have NO project associations
                query = query.outerjoin(document_projects, Document.uuid == document_projects.c.document_uuid)
                query = query.where(document_projects.c.document_uuid.is_(None))
            query = query.order_by(Document.is_favorite.desc(), Document.created_at.desc()).offset(offset).limit(limit)
            result = await db.execute(query)
            ordered_docs = result.scalars().unique().all()
            logger.info(f"Regular query returned {len(ordered_docs)} documents")
        
        # Build responses with project badges - batch load to avoid N+1 queries
        response: List[DocumentResponse] = []
        if ordered_docs:
            # Collect all document UUIDs
            doc_uuids2 = [d.uuid for d in ordered_docs]
        
            # Single query to fetch all document-project junctions
            junction_result = await db.execute(
                select(document_projects)
                .where(document_projects.c.document_uuid.in_(doc_uuids2))
            )
            junctions = junction_result.fetchall()
        
            # Collect all project UUIDs (both live and deleted)
            project_uuids = set()
            for junction in junctions:
                pj = junction._mapping["project_uuid"]
                if pj:
                    project_uuids.add(pj)

            # Single query to fetch all live projects
            projects = []
            if project_uuids:
                project_result = await db.execute(
                    select(Project)
                    .where(Project.uuid.in_(project_uuids))
                )
                projects = project_result.scalars().all()

            # Create project lookup map
            project_map = {p.uuid: p for p in projects}

            # Group junctions by document_uuid
            junctions_by_doc: Dict[str, list] = {}
            for junction in junctions:
                doc_uuid = junction._mapping["document_uuid"]
                if doc_uuid not in junctions_by_doc:
                    junctions_by_doc[doc_uuid] = []
                junctions_by_doc[doc_uuid].append(junction)
        
            # Build project badges for each document
            for d in ordered_docs:
                doc_junctions = junctions_by_doc.get(d.uuid, [])
                project_badges: List[ProjectBadge] = []
                
                for junction in doc_junctions:
                    if junction.project_uuid and junction.project_uuid in project_map:
                        # Live project
                        project = project_map[junction.project_uuid]
                        project_badges.append(ProjectBadge(
                            uuid=project.uuid,
                            name=project.name,
                            color=project.color,
                            is_exclusive=junction.is_exclusive,
                            is_deleted=False
                        ))
                    elif junction.project_name_snapshot:
                        # Deleted project (snapshot)
                        project_badges.append(ProjectBadge(
                            uuid=None,
                            name=junction.project_name_snapshot,
                            color="#6c757d",  # Gray for deleted
                            is_exclusive=junction.is_exclusive,
                            is_deleted=True
                        ))
                
                response.append(_convert_doc_to_response(d, project_badges))
    
        logger.info(f"Returning {len(response)} documents in response")
        return response
    except Exception as e:
        logger.exception("Error listing documents")
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
    result = await db.execute(
        select(Document).options(selectinload(Document.tag_objs)).where(
            and_(Document.uuid == document_uuid, Document.created_by == current_user.uuid)
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    # Build project badges
    project_badges = await project_service.build_badges(db, doc.uuid, doc.is_exclusive_mode, document_projects, "document_uuid")
    
    return _convert_doc_to_response(doc, project_badges)

@router.get("/{document_uuid}/download")
async def download_document(
    document_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download a document file."""
    result = await db.execute(
        select(Document).where(
            and_(Document.uuid == document_uuid, Document.created_by == current_user.uuid)
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    file_path = get_file_storage_dir() / doc.file_path
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")
    
    return FileResponse(
        path=str(file_path),
        filename=doc.original_name,
        media_type=doc.mime_type,
        headers={
            "Content-Disposition": f"attachment; filename=\"{doc.original_name}\"",
            "X-File-Size": str(doc.file_size)
        }
    )

@router.put("/{document_uuid}", response_model=DocumentResponse)
async def update_document(
    document_uuid: str,
    document_data: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update document metadata and tags."""
    result = await db.execute(
        select(Document).options(selectinload(Document.tag_objs)).where(
            and_(Document.uuid == document_uuid, Document.created_by == current_user.uuid)
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    update_data = document_data.model_dump(exclude_unset=True)
    
    if "tags" in update_data:
        # SECURITY: Sanitize tags to prevent XSS injection
        raw_tags = update_data.pop("tags")
        sanitized_tags = sanitize_tags(raw_tags)
        await tag_service.handle_tags(db, doc, sanitized_tags, current_user.uuid, "documents", document_tags)

    # Handle projects if provided (with ownership verification)
    if "project_ids" in update_data:
        await project_service.handle_associations(db, doc, update_data.pop("project_ids"), current_user.uuid, document_projects, "document_uuid")

    # SECURITY: Validate and sanitize update fields
    for key, value in update_data.items():
        if key in ['title', 'description'] and value is not None:
            if key == 'title':
                if not value or len(value.strip()) == 0:
                    raise HTTPException(status_code=400, detail="Title cannot be empty")
                value = sanitize_text_input(value, 200)
            elif key == 'description':
                value = sanitize_text_input(value, 1000)
        setattr(doc, key, value)
        
    await db.commit()
    await db.refresh(doc)
    
    # Index in search and persist
    await search_service.index_item(db, doc, 'document')
    await db.commit()
    
    # Build project badges
    project_badges = await project_service.build_badges(db, doc.uuid, doc.is_exclusive_mode, document_projects, "document_uuid")
    
    return _convert_doc_to_response(doc, project_badges)


@router.delete("/{document_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a document and its associated file.
    
    Note: If the document was archived, this only deletes the original document.
    The archived copy in the Archive module remains intact and accessible.
    """
    result = await db.execute(
        select(Document).options(selectinload(Document.tag_objs)).where(
            and_(Document.uuid == document_uuid, Document.created_by == current_user.uuid)
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    # Log archive status for clarity
    if doc.is_archived:
        logger.info(f"Deleting archived document {document_uuid}")
    else:
        logger.info(f"Deleting document {document_uuid} (not archived)")
    
    # Delete the physical file
    try:
        file_to_delete = get_file_storage_dir() / doc.file_path
        await asyncio.to_thread(file_to_delete.unlink, missing_ok=True)
        logger.info(f"Deleted document file: {file_to_delete}")
    except Exception as e:
        logger.warning(f"Could not delete file {doc.file_path}: {e}")
        # Continue with database deletion even if file deletion fails
    
    # Decrement tag usage counts BEFORE deleting document
    await tag_service.decrement_tags_on_delete(db, doc)

    # Remove from search index BEFORE deleting document
    await search_service.remove_item(db, document_uuid)
        
    await db.delete(doc)
    await db.commit()
    
    logger.info(f"Document {document_uuid} deleted successfully")