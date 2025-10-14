"""
Document Router with Core Upload Service Integration
"""

import os
import shutil
from pathlib import Path
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
from app.models.todo import Project
from app.models.tag_associations import document_tags
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.tag_associations import archive_tags
from app.models.associations import document_projects
from app.auth.dependencies import get_current_user
from app.utils.security import sanitize_text_input, sanitize_tags
from app.services.chunk_service import chunk_manager
from app.services.file_detection import FileTypeDetectionService
from app.services.fts_service_enhanced import enhanced_fts_service
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

# Helper Functions
async def _handle_document_tags(db: AsyncSession, doc: Document, tag_names: List[str], user_id: int):
    """Handle document tag associations and update usage counts."""
    from sqlalchemy import delete

    # Fetch existing associations
    existing_tag_rows = await db.execute(
        select(document_tags.c.tag_uuid).where(document_tags.c.document_uuid == doc.uuid)
    )
    existing_tag_uuids = {row[0] for row in existing_tag_rows.fetchall()}

    existing_tags = []
    if existing_tag_uuids:
        tag_rows = await db.execute(
            select(Tag).where(Tag.uuid.in_(existing_tag_uuids))
        )
        existing_tags = tag_rows.scalars().all()

    # Determine removed tags
    removed_tag_uuids = existing_tag_uuids.copy()

    # Clear associations
    await db.execute(
        delete(document_tags).where(document_tags.c.document_uuid == doc.uuid)
    )

    normalized_names = [t.strip() for t in (tag_names or []) if t and t.strip()]

    if not normalized_names:
        for tag in existing_tags:
            if tag.usage_count > 0:
                tag.usage_count -= 1
        return

    for tag_name in normalized_names:
        result = await db.execute(
            select(Tag).where(
                and_(
                    Tag.name == tag_name,
                    Tag.user_id == user_id,
                    Tag.module_type == "documents"
                )
            )
        )
        tag = result.scalar_one_or_none()

        if not tag:
            tag = Tag(
                name=tag_name,
                user_id=user_id,
                module_type="documents",
                usage_count=1,
                color="#f59e0b"
            )
            db.add(tag)
            await db.flush()
        else:
            if tag.uuid in removed_tag_uuids:
                removed_tag_uuids.remove(tag.uuid)
            tag.usage_count += 1

        await db.execute(
            document_tags.insert().values(
                document_uuid=doc.uuid,
                tag_uuid=tag.uuid
            )
        )

    for tag in existing_tags:
        if tag.uuid in removed_tag_uuids and tag.usage_count > 0:
            tag.usage_count -= 1

async def _handle_document_projects(db: AsyncSession, doc: Document, project_ids: List[int], user_id: int):
    """Link document to projects via junction table (with ownership verification)."""
    from sqlalchemy import delete, and_
    from app.models.todo import Project
    
    # First, clear existing project links
    await db.execute(
        delete(document_projects).where(document_projects.c.document_id == doc.id)
    )
    
    # Add new project links (only for projects owned by the user)
    if project_ids:
        # Verify ownership: only link projects that belong to this user
        result = await db.execute(
            select(Project.id).where(
                and_(
                    Project.id.in_(project_ids),
                    Project.user_id == user_id
                )
            )
        )
        allowed_project_ids = [row[0] for row in result.fetchall()]
        
        # Insert links only for allowed projects
        for project_id in allowed_project_ids:
            await db.execute(
                document_projects.insert().values(
                    document_id=doc.id,
                    project_id=project_id,
                    project_name_snapshot=None  # Will be set on project deletion
                )
            )
        
        # Optional: warn if any requested projects were not owned by user
        if len(allowed_project_ids) < len(project_ids):
            forbidden_ids = set(project_ids) - set(allowed_project_ids)
            logger.warning("User attempted to link to projects they don't own", user_id=user_id, forbidden_ids=list(forbidden_ids))

async def _build_document_project_badges(db: AsyncSession, doc_id: int) -> List[ProjectBadge]:
    """Build project badges from junction table (live projects and deleted snapshots)."""
    # Query junction table for this document
    result = await db.execute(
        select(
            document_projects.c.project_id,
            document_projects.c.project_name_snapshot,
            document_projects.c.is_exclusive
        ).where(document_projects.c.document_id == doc_id)
    )
    
    badges = []
    for row in result:
        project_id = row.project_id
        snapshot_name = row.project_name_snapshot
        is_exclusive = row.is_exclusive
        
        if project_id is not None:
            # Live project - fetch current details
            project_result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = project_result.scalar_one_or_none()
            if project:
                badges.append(ProjectBadge(
                    id=project.id,
                    name=project.name,
                    color=project.color,
                    is_exclusive=is_exclusive,
                    is_deleted=False
                ))
        else:
            # Deleted project - use snapshot
            if snapshot_name:
                badges.append(ProjectBadge(
                    id=None,
                    name=snapshot_name,
                    color="#6c757d",  # Gray for deleted projects
                    is_exclusive=is_exclusive,
                    is_deleted=True
                ))
    
    return badges

def _convert_doc_to_response(doc: Document, project_badges: Optional[List[ProjectBadge]] = None) -> DocumentResponse:
    """Convert Document model to DocumentResponse with relational tags."""
    return DocumentResponse(
        id=doc.id,
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
        project_id=doc.project_id,  # Legacy
        archive_item_uuid=doc.archive_item_uuid,
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
    
    Uses the core chunk upload service for efficient uploading, then creates
    the document record with proper file organization.
    """
    try:
        logger.info(f"Committing document upload: {payload.title}")
        
        # Check assembled file status
        status_obj = await chunk_manager.get_upload_status(payload.file_id)
        logger.info(f"File status: {status_obj}")
        if not status_obj or status_obj.get("status") != "completed":
            logger.warning(f"File not ready - status: {status_obj.get('status') if status_obj else 'None'}")
            raise HTTPException(status_code=400, detail=f"File not yet assembled - status: {status_obj.get('status') if status_obj else 'None'}")

        # Locate assembled file path
        temp_dir = Path(get_data_dir()) / "temp_uploads"
        logger.info(f"Looking for assembled file in: {temp_dir}")
        assembled = next(temp_dir.glob(f"complete_{payload.file_id}_*"), None)
        if not assembled:
            # List what files are actually in temp_dir for debugging
            available_files = list(temp_dir.glob("*"))
            logger.error(f"Assembled file not found. Available files: {available_files}")
            raise HTTPException(status_code=404, detail=f"Assembled file not found in {temp_dir}")

        # Prepare destination directory on Windows bind mount for accessibility
        docs_dir = get_file_storage_dir() / "assets" / "documents"
        docs_dir.mkdir(parents=True, exist_ok=True)

        # Generate human-readable filename: originalname_UUID.ext
        file_uuid = str(uuid_lib.uuid4())
        file_extension = assembled.suffix
        
        # Extract original filename from assembled filename (remove chunk prefixes)
        original_name = assembled.name.replace(f"complete_{payload.file_id}_", "")
        # Remove file extension from original name if present
        if original_name.endswith(file_extension):
            original_name = original_name[:-len(file_extension)]
        # SECURITY: Proper filename sanitization to prevent path traversal
        from app.utils.security import sanitize_filename
        safe_original = sanitize_filename(original_name)
        # Limit filename length to prevent filesystem issues
        if len(safe_original) > 100:
            safe_original = safe_original[:100]
        
        stored_filename = f"{safe_original}_{file_uuid}{file_extension}"
        temp_dest_path = docs_dir / f"temp_{stored_filename}"  # Temporary location
        final_dest_path = docs_dir / stored_filename  # Final location

        # Move assembled file to TEMPORARY location first; handle cross-device moves (EXDEV)
        try:
            assembled.rename(temp_dest_path)
        except OSError as move_err:
            import errno as _errno
            if getattr(move_err, 'errno', None) == _errno.EXDEV:
                # Fallback to shutil.move which copies across devices, then unlinks
                shutil.move(str(assembled), str(temp_dest_path))
            else:
                raise

        # Get file size before database operations
        file_size = temp_dest_path.stat().st_size
        
        # SECURITY: Validate file size to prevent DoS attacks
        from app.utils.security import validate_file_size
        from app.config import settings
        validate_file_size(file_size, settings.max_file_size)
        
        file_path_relative = str(final_dest_path.relative_to(get_file_storage_dir()))
        
        # Detect file type and extract metadata
        detection_result = await file_detector.detect_file_type(
            file_path=temp_dest_path,
            file_content=None  # File is already on disk
        )

        # SECURITY: Validate and sanitize input fields
        if not payload.title or len(payload.title.strip()) == 0:
            raise HTTPException(status_code=400, detail="Title is required")
        sanitized_title = sanitize_text_input(payload.title, 200)
        sanitized_description = sanitize_text_input(payload.description or "", 1000)
        
        # Create Document record
        document = Document(
            uuid=file_uuid,
            title=sanitized_title,
            original_name=original_name + file_extension,  # Use the cleaned original name
            filename=stored_filename,
            file_path=file_path_relative,
            file_size=file_size,
            mime_type=detection_result["mime_type"],
            description=sanitized_description,
            upload_status="completed",
            is_exclusive_mode=payload.is_exclusive_mode or False,
            user_id=current_user.id,
            project_id=payload.project_id  # Legacy support
        )
        
        db.add(document)
        await db.flush()  # Get the ID for tag associations

        # Handle tags
        if payload.tags:
            # SECURITY: Sanitize tags to prevent XSS injection
            sanitized_tags = sanitize_tags(payload.tags)
            await _handle_document_tags(db, document, sanitized_tags, current_user.id)

        # Handle projects (with ownership verification)
        if payload.project_ids:
            await _handle_document_projects(db, document, payload.project_ids, current_user.id)

        await db.commit()
        
        # SECURITY: Move file to final location ONLY after successful DB commit
        try:
            temp_dest_path.rename(final_dest_path)
            logger.info(f"✅ File moved to final location: {final_dest_path}")
        except Exception as move_error:
            logger.error(f"❌ Failed to move file to final location: {move_error}")
            # Clean up temp file
            try:
                if temp_dest_path.exists():
                    temp_dest_path.unlink()
            except Exception:
                pass
            raise HTTPException(status_code=500, detail="Failed to finalize file storage")
        
        # Reload document with tags to avoid lazy loading issues in response conversion
        result = await db.execute(
            select(Document).options(selectinload(Document.tag_objs)).where(
                Document.id == document.id
            )
        )
        document_with_tags = result.scalar_one()

        # Build project badges
        project_badges = await _build_document_project_badges(db, document_with_tags.id)

        # Clean up temporary file tracking
        if payload.file_id in chunk_manager.uploads:
            del chunk_manager.uploads[payload.file_id]

        logger.info(f"Document committed successfully: {stored_filename}")
        
        return _convert_doc_to_response(document_with_tags, project_badges)
        
    except HTTPException:
        await db.rollback()
        # Clean up temp file on DB rollback
        try:
            if 'temp_dest_path' in locals() and temp_dest_path.exists():
                temp_dest_path.unlink()
        except Exception:
            pass
        raise
    except Exception as e:
        await db.rollback()
        # Clean up temp file on DB rollback
        try:
            if 'temp_dest_path' in locals() and temp_dest_path.exists():
                temp_dest_path.unlink()
        except Exception:
            pass
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
    project_id: Optional[int] = Query(None, description="Filter documents by project_id"),
    project_only: Optional[bool] = Query(False, description="Only documents attached to a project"),
    unassigned_only: Optional[bool] = Query(False, description="Only documents without a project_id"),
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
        logger.info(f"Listing documents for user {current_user.id} - archived: {archived}, search: {search}, tag: {tag}")
        
        if search:
            # Use FTS5 for full-text search
            fts_results = await enhanced_fts_service.search_all(db, search, current_user.id, content_types=["documents"], limit=limit, offset=offset)
            
            # Create mapping of document UUID to FTS score for proper ordering
            fts_scores = {}
            doc_uuids = []
            for r in fts_results:
                if r["type"] == "document":
                    doc_uuids.append(r["id"])
                    # Use 0.1 as default (lowest relevance) instead of 0.0 to maintain 0.0-1.0 range
                    fts_scores[r["id"]] = r.get("normalized_score", 0.1)
            
            logger.info(f"FTS5 search returned {len(doc_uuids)} document UUIDs with scores")
            
            if not doc_uuids:
                return []
            
            # Fetch documents by UUIDs
            query = select(Document).options(selectinload(Document.tag_objs)).where(
                and_(
                    Document.user_id == current_user.id,
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
            if project_id is not None:
                query = query.where(Document.project_id == project_id)
            elif project_only:
                query = query.where(Document.project_id.is_not(None))
            elif unassigned_only:
                query = query.where(Document.project_id.is_(None))
            result = await db.execute(query)
            documents = result.scalars().unique().all()
            logger.info(f"FTS5 query returned {len(documents)} documents")
            
            # PROPER FIX: Order documents by FTS5 relevance score
            # Create a list of (document, score) tuples, handling missing scores gracefully
            doc_score_pairs = []
            for doc in documents:
                score = fts_scores.get(doc.uuid, 0.1)  # Default to 0.1 (lowest relevance) if no FTS score
                doc_score_pairs.append((doc, score))
            
            # Sort by score (descending) to get most relevant first
            doc_score_pairs.sort(key=lambda x: x[1], reverse=True)
            ordered_docs = [doc for doc, score in doc_score_pairs]
            
            logger.info(f"Final ordered result: {len(ordered_docs)} documents (ordered by FTS relevance)")
        else:
            # Fallback to regular query
            logger.info(f"Using regular query for archived={archived}")
            query = select(Document).options(selectinload(Document.tag_objs)).where(
                and_(
                    Document.user_id == current_user.id,
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
            if project_id is not None:
                query = query.where(Document.project_id == project_id)
            elif project_only:
                query = query.where(Document.project_id.is_not(None))
            elif unassigned_only:
                query = query.where(Document.project_id.is_(None))
            query = query.order_by(Document.created_at.desc()).offset(offset).limit(limit)
            result = await db.execute(query)
            ordered_docs = result.scalars().unique().all()
            logger.info(f"Regular query returned {len(ordered_docs)} documents")
        
        # Build responses with project badges - batch load to avoid N+1 queries
        response = []
        if ordered_docs:
            # Collect all document IDs
            doc_ids = [d.id for d in ordered_docs]
        
            # Single query to fetch all document-project junctions
            junction_result = await db.execute(
                select(document_projects)
                .where(document_projects.c.document_id.in_(doc_ids))
            )
            junctions = junction_result.fetchall()
        
            # Collect all project IDs (both live and deleted)
            project_ids = set()
            for junction in junctions:
                if junction.project_id:
                    project_ids.add(junction.project_id)

            # Single query to fetch all live projects
            projects = []
            if project_ids:
                project_result = await db.execute(
                    select(Project)
                    .where(Project.id.in_(project_ids))
                )
                projects = project_result.scalars().all()

            # Create project lookup map
            project_map = {p.id: p for p in projects}

            # Group junctions by document_id
            junctions_by_doc = {}
            for junction in junctions:
                if junction.document_id not in junctions_by_doc:
                    junctions_by_doc[junction.document_id] = []
                junctions_by_doc[junction.document_id].append(junction)
        
            # Build project badges for each document
            for d in ordered_docs:
                doc_junctions = junctions_by_doc.get(d.id, [])
                project_badges = []
                
                for junction in doc_junctions:
                    if junction.project_id and junction.project_id in project_map:
                        # Live project
                        project = project_map[junction.project_id]
                        project_badges.append(ProjectBadge(
                            id=project.id,
                            name=project.name,
                            color=project.color,
                            is_exclusive=junction.is_exclusive,
                            is_deleted=False
                        ))
                    elif junction.project_name_snapshot:
                        # Deleted project (snapshot)
                        project_badges.append(ProjectBadge(
                            id=None,
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
            and_(Document.uuid == document_uuid, Document.user_id == current_user.id)
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    # Build project badges
    project_badges = await _build_document_project_badges(db, doc.id)
    
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
            and_(Document.uuid == document_uuid, Document.user_id == current_user.id)
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
            and_(Document.uuid == document_uuid, Document.user_id == current_user.id)
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
        await _handle_document_tags(db, doc, sanitized_tags, current_user.id)

    # Handle projects if provided (with ownership verification)
    if "project_ids" in update_data:
        await _handle_document_projects(db, doc, update_data.pop("project_ids"), current_user.id)

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
    
    # Build project badges
    project_badges = await _build_document_project_badges(db, doc.id)
    
    return _convert_doc_to_response(doc, project_badges)

@router.post("/{document_uuid}/archive")
async def archive_document(
    document_uuid: str,
    archive_request: ArchiveDocumentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Archive a document by copying it to the archive module.
    
    This copies the document file to the archive storage and creates an ArchiveItem
    while preserving the original document. The document is marked as archived.
    User can safely delete the original document later if desired.
    """
    try:
        logger.info(f"Archiving document {document_uuid} to folder {archive_request.folder_uuid} for user {current_user.id}")
        
        # Get document
        doc_result = await db.execute(
            select(Document)
            .options(selectinload(Document.tag_objs))
            .where(and_(Document.uuid == document_uuid, Document.user_id == current_user.id))
        )
        document = doc_result.scalar_one_or_none()
        if not document:
            logger.warning(f"Document {document_uuid} not found for user {current_user.id}")
            raise HTTPException(status_code=404, detail="Document not found")
        
        logger.info(f"Found document: {document.title} (is_archived: {document.is_archived})")
        
        if document.is_archived:
            logger.warning(f"Document {document_uuid} is already archived")
            raise HTTPException(status_code=400, detail="Document is already archived")
        
        # Verify archive folder exists and belongs to user
        folder_result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.uuid == archive_request.folder_uuid,
                    ArchiveFolder.user_id == current_user.id
                )
            )
        )
        archive_folder = folder_result.scalar_one_or_none()
        if not archive_folder:
            logger.warning(f"Archive folder {archive_request.folder_uuid} not found for user {current_user.id}")
            raise HTTPException(status_code=404, detail="Archive folder not found")
        
        # Check if document file exists
        original_file_path = get_file_storage_dir() / document.file_path
        if not original_file_path.exists():
            logger.error(f"Document file not found on disk: {original_file_path}")
            raise HTTPException(status_code=404, detail="Document file not found on disk")
        
        # Prepare archive storage location
        archive_dir = get_file_storage_dir() / "archive" / archive_request.folder_uuid
        archive_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename for archive
        archive_filename = f"{uuid_lib.uuid4()}{original_file_path.suffix}"
        archive_file_path = archive_dir / archive_filename
        
        # Copy file to archive location
        try:
            shutil.copy2(original_file_path, archive_file_path)
            logger.info(f"Copied file to archive: {archive_file_path}")
        except Exception:
            logger.exception("Failed to copy file to archive")
            raise HTTPException(status_code=500, detail="Failed to copy file to archive")
        
        # Create ArchiveItem record
        archive_item = ArchiveItem(
            name=document.title,
            description=document.description or f"Archived from Documents: {document.title}",
            folder_uuid=archive_request.folder_uuid,
            original_filename=document.original_name,
            stored_filename=archive_filename,
            file_path=str(archive_file_path.relative_to(get_file_storage_dir())),
            file_size=document.file_size,
            mime_type=document.mime_type,
            extracted_text=getattr(document, "extracted_text", None),
            user_id=current_user.id,
            is_archived=False,  # In archive module, items start as not archived
            is_favorite=document.is_favorite,
            metadata_json=json.dumps({
                "source": "documents",
                "original_document_id": document.id,
                "archived_at": datetime.now(NEPAL_TZ).isoformat()
            })
        )
        
        db.add(archive_item)
        await db.flush()  # Get the UUID
        
        # Copy tags if requested
        if archive_request.copy_tags and document.tag_objs:
            for doc_tag in document.tag_objs:
                # Create or find equivalent tag for archive module
                archive_tag_result = await db.execute(
                    select(Tag).where(
                        and_(
                            Tag.name == doc_tag.name,
                            Tag.user_id == current_user.id,
                            Tag.module_type.in_(["archive", "general"])
                        )
                    )
                )
                archive_tag = archive_tag_result.scalar_one_or_none()
                
                if not archive_tag:
                    # Create new tag for archive
                    archive_tag = Tag(
                        name=doc_tag.name,
                        user_id=current_user.id,
                        module_type="archive",
                        color=doc_tag.color,
                        usage_count=1
                    )
                    db.add(archive_tag)
                    await db.flush()
                else:
                    archive_tag.usage_count += 1
                
                # Create tag association
                await db.execute(
                    archive_tags.insert().values(
                        item_uuid=archive_item.uuid,
                        tag_uuid=archive_tag.uuid
                    )
                )
        
        # Update document to mark as archived
        logger.info(f"Updating document {document_uuid} to archived status")
        document.is_archived = True
        document.archive_item_uuid = archive_item.uuid
        
        await db.commit()
        await db.refresh(document)
        
        logger.info(f"Document {document_uuid} archived successfully - is_archived: {document.is_archived}, archive_item_uuid: {document.archive_item_uuid}")
        
        return {
            "success": True,
            "message": "Document archived successfully",
            "archive_item_uuid": archive_item.uuid,
            "archive_folder": archive_folder.name,
            "archive_path": archive_folder.path,
            "tags_copied": len(document.tag_objs) if archive_request.copy_tags else 0
        }
        
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        logger.exception(f"Error archiving document {document_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to archive document"
        )

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
        select(Document).where(
            and_(Document.uuid == document_uuid, Document.user_id == current_user.id)
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    # Log archive status for clarity
    if doc.is_archived:
        logger.info(f"Deleting archived document {document_uuid} (archive copy preserved: {doc.archive_item_uuid})")
    else:
        logger.info(f"Deleting document {document_uuid} (not archived)")
    
    # Delete the physical file
    try:
        file_to_delete = get_file_storage_dir() / doc.file_path
        if file_to_delete.exists():
            file_to_delete.unlink()
            logger.info(f"Deleted document file: {file_to_delete}")
    except Exception as e:
        logger.warning(f"Could not delete file {doc.file_path}: {e}")
        # Continue with database deletion even if file deletion fails
        
    await db.delete(doc)
    await db.commit()
    
    logger.info(f"Document {document_uuid} deleted successfully")