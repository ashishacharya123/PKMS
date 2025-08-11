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
from pydantic import BaseModel, Field, validator
from datetime import datetime
import json
import logging
import uuid as uuid_lib

from app.database import get_db
from app.config import NEPAL_TZ, get_data_dir, get_file_storage_dir
from app.models.document import Document
from app.models.tag import Tag
from app.models.user import User
from app.models.tag_associations import document_tags
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.tag_associations import archive_tags
from app.auth.dependencies import get_current_user
from app.utils.security import sanitize_text_input, sanitize_tags
from app.services.chunk_service import chunk_manager
from app.services.file_detection import FileTypeDetectionService
from app.services.fts_service import fts_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["documents"])

# Initialize file type detection service
file_detector = FileTypeDetectionService()

# Pydantic Models
class DocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    tags: Optional[List[str]] = Field(default=[], max_items=20)
    
    @validator('tags')
    def validate_tags(cls, v):
        return sanitize_tags(v or [])

class DocumentUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_favorite: Optional[bool] = None
    is_archived: Optional[bool] = None

class DocumentResponse(BaseModel):
    id: int
    uuid: str
    title: str
    original_name: str
    filename: str
    file_path: str
    file_size: int
    mime_type: str
    description: Optional[str]
    is_favorite: bool
    is_archived: bool
    archive_item_uuid: Optional[str] = None  # Reference to ArchiveItem if archived
    upload_status: str
    created_at: datetime
    updated_at: datetime
    tags: List[str]

    class Config:
        from_attributes = True

class CommitDocumentUploadRequest(BaseModel):
    """Request model for committing chunked document upload"""
    file_id: str
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    tags: Optional[List[str]] = Field(default=[], max_items=20)

    @validator('tags')
    def validate_tags(cls, v):
        return sanitize_tags(v or [])

class ArchiveDocumentRequest(BaseModel):
    """Request model for archiving a document to the archive module"""
    folder_uuid: str = Field(..., description="UUID of the archive folder to store the document")
    copy_tags: bool = Field(True, description="Whether to copy document tags to the archive item")

# Helper Functions
async def _handle_document_tags(db: AsyncSession, doc: Document, tag_names: List[str], user_id: int):
    """Handle document tag associations and update usage counts."""
    from sqlalchemy import delete
    
    # Clear existing tag associations
    await db.execute(
        delete(document_tags).where(document_tags.c.document_uuid == doc.uuid)
    )
    
    if not tag_names:
        return

    for tag_name in tag_names:
        # Get or create tag with proper module_type
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
            # Create new tag with documents module_type
            tag = Tag(
                name=tag_name,
                user_id=user_id,
                module_type="documents",
                usage_count=1,
                color="#f59e0b"  # Amber color for document tags
            )
            db.add(tag)
            await db.flush()
        else:
            # Increment usage count
            tag.usage_count += 1
        
        # Create association
        await db.execute(
            document_tags.insert().values(
                document_uuid=doc.uuid,
                tag_uuid=tag.uuid
            )
        )

def _convert_doc_to_response(doc: Document) -> DocumentResponse:
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
        archive_item_uuid=doc.archive_item_uuid,
        upload_status=doc.upload_status,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        tags=[t.name for t in doc.tag_objs] if doc.tag_objs else []
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
        logger.info(f"📄 Committing document upload: {payload.title}")
        
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
        # Sanitize filename for filesystem safety
        safe_original = "".join(c for c in original_name if c.isalnum() or c in (' ', '-', '_', '.')).rstrip()
        # Limit filename length to prevent filesystem issues
        if len(safe_original) > 100:
            safe_original = safe_original[:100]
        
        stored_filename = f"{safe_original}_{file_uuid}{file_extension}"
        dest_path = docs_dir / stored_filename

        # Move assembled file to final location; handle cross-device moves (EXDEV)
        try:
            assembled.rename(dest_path)
        except OSError as move_err:
            import errno as _errno
            if getattr(move_err, 'errno', None) == _errno.EXDEV:
                # Fallback to shutil.move which copies across devices, then unlinks
                shutil.move(str(assembled), str(dest_path))
            else:
                raise

        # Get file size before database operations
        file_size = dest_path.stat().st_size
        file_path_relative = str(dest_path.relative_to(get_file_storage_dir()))
        
        # Detect file type and extract metadata
        detection_result = await file_detector.detect_file_type(
            file_path=dest_path,
            file_content=None  # File is already on disk
        )

        # Create Document record
        document = Document(
            uuid=file_uuid,
            title=payload.title,
            original_name=original_name + file_extension,  # Use the cleaned original name
            filename=stored_filename,
            file_path=file_path_relative,
            file_size=file_size,
            mime_type=detection_result["mime_type"],
            description=payload.description,
            upload_status="completed",
            user_id=current_user.id
        )
        
        db.add(document)
        await db.flush()  # Get the ID for tag associations

        # Handle tags
        if payload.tags:
            await _handle_document_tags(db, document, payload.tags, current_user.id)

        await db.commit()
        
        # Reload document with tags to avoid lazy loading issues in response conversion
        result = await db.execute(
            select(Document).options(selectinload(Document.tag_objs)).where(
                Document.id == document.id
            )
        )
        document_with_tags = result.scalar_one()

        # Clean up temporary file tracking
        if payload.file_id in chunk_manager.uploads:
            del chunk_manager.uploads[payload.file_id]

        logger.info(f"✅ Document committed successfully: {stored_filename}")
        
        return _convert_doc_to_response(document_with_tags)
        
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Error committing document upload: {str(e)}")
        logger.error(f"❌ Full exception details: {type(e).__name__}: {e}")
        import traceback
        logger.error(f"❌ Traceback: {traceback.format_exc()}")
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
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List documents with filtering and pagination. Uses FTS5 for text search."""
    logger.info(f"📄 Listing documents for user {current_user.id} - archived: {archived}, search: {search}, tag: {tag}")
    
    if search:
        # Use FTS5 for full-text search
        fts_results = await fts_service.search_all(db, search, current_user.id, content_types=["documents"], limit=limit, offset=offset)
        doc_uuids = [r["id"] for r in fts_results if r["type"] == "document"]
        logger.info(f"🔍 FTS5 search returned {len(doc_uuids)} document UUIDs")
        
        if not doc_uuids:
            return []
        # Fetch documents by UUIDs, preserving FTS5 order
        query = select(Document).options(selectinload(Document.tag_objs)).where(
            and_(
                Document.user_id == current_user.id,
                Document.is_archived == archived,
                Document.uuid.in_(doc_uuids)
            )
        )
        if tag:
            query = query.join(Document.tag_objs).where(Tag.name == tag)
        if mime_type:
            query = query.where(Document.mime_type.like(f"{mime_type}%"))
        if is_favorite is not None:
            query = query.where(Document.is_favorite == is_favorite)
        result = await db.execute(query)
        documents = result.scalars().unique().all()
        logger.info(f"📚 FTS5 query returned {len(documents)} documents")
        
        # Order documents by FTS5 relevance
        docs_by_uuid = {d.uuid: d for d in documents}
        ordered_docs = [docs_by_uuid[uuid] for uuid in doc_uuids if uuid in docs_by_uuid]
        logger.info(f"📊 Final ordered result: {len(ordered_docs)} documents")
    else:
        # Fallback to regular query
        logger.info(f"📂 Using regular query for archived={archived}")
        query = select(Document).options(selectinload(Document.tag_objs)).where(
            and_(
                Document.user_id == current_user.id,
                Document.is_archived == archived
            )
        )
        if tag:
            query = query.join(Document.tag_objs).where(Tag.name == tag)
        if mime_type:
            query = query.where(Document.mime_type.like(f"{mime_type}%"))
        if is_favorite is not None:
            query = query.where(Document.is_favorite == is_favorite)
        query = query.order_by(Document.created_at.desc()).offset(offset).limit(limit)
        result = await db.execute(query)
        ordered_docs = result.scalars().unique().all()
        logger.info(f"📚 Regular query returned {len(ordered_docs)} documents")
        
    response = [_convert_doc_to_response(d) for d in ordered_docs]
    logger.info(f"✅ Returning {len(response)} documents in response")
    return response

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific document by ID."""
    result = await db.execute(
        select(Document).options(selectinload(Document.tag_objs)).where(
            and_(Document.id == document_id, Document.user_id == current_user.id)
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return _convert_doc_to_response(doc)

@router.get("/{document_id}/download")
async def download_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download a document file."""
    result = await db.execute(
        select(Document).where(
            and_(Document.id == document_id, Document.user_id == current_user.id)
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

@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    document_data: DocumentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update document metadata and tags."""
    result = await db.execute(
        select(Document).options(selectinload(Document.tag_objs)).where(
            and_(Document.id == document_id, Document.user_id == current_user.id)
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    update_data = document_data.model_dump(exclude_unset=True)
    
    if "tags" in update_data:
        await _handle_document_tags(db, doc, update_data.pop("tags"), current_user.id)

    for key, value in update_data.items():
        setattr(doc, key, value)
        
    await db.commit()
    await db.refresh(doc)
    return _convert_doc_to_response(doc)

@router.post("/{document_id}/archive")
async def archive_document(
    document_id: int,
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
        logger.info(f"📦 Archiving document {document_id} to folder {archive_request.folder_uuid} for user {current_user.id}")
        
        # Get document
        doc_result = await db.execute(
            select(Document)
            .options(selectinload(Document.tag_objs))
            .where(and_(Document.id == document_id, Document.user_id == current_user.id))
        )
        document = doc_result.scalar_one_or_none()
        if not document:
            logger.warning(f"❌ Document {document_id} not found for user {current_user.id}")
            raise HTTPException(status_code=404, detail="Document not found")
        
        logger.info(f"📄 Found document: {document.title} (is_archived: {document.is_archived})")
        
        if document.is_archived:
            logger.warning(f"⚠️ Document {document_id} is already archived")
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
            logger.warning(f"❌ Archive folder {archive_request.folder_uuid} not found for user {current_user.id}")
            raise HTTPException(status_code=404, detail="Archive folder not found")
        
        # Check if document file exists
        original_file_path = get_file_storage_dir() / document.file_path
        if not original_file_path.exists():
            logger.error(f"❌ Document file not found on disk: {original_file_path}")
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
            logger.info(f"📋 Copied file to archive: {archive_file_path}")
        except Exception as e:
            logger.error(f"❌ Failed to copy file to archive: {e}")
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
            extracted_text=document.extracted_text,
            user_id=current_user.id,
            is_archived=False,  # In archive module, items start as not archived
            is_favorite=document.is_favorite,
            metadata_json=json.dumps({
                "source": "documents",
                "original_document_id": document.id,
                "archived_at": datetime.now().isoformat()
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
                        tag_id=archive_tag.id
                    )
                )
        
        # Update document to mark as archived
        logger.info(f"✏️ Updating document {document_id} to archived status")
        document.is_archived = True
        document.archive_item_uuid = archive_item.uuid
        
        await db.commit()
        await db.refresh(document)
        
        logger.info(f"✅ Document {document_id} archived successfully - is_archived: {document.is_archived}, archive_item_uuid: {document.archive_item_uuid}")
        
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
    except Exception as e:
        await db.rollback()
        logger.error(f"❌ Error archiving document {document_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to archive document"
        )

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a document and its associated file.
    
    Note: If the document was archived, this only deletes the original document.
    The archived copy in the Archive module remains intact and accessible.
    """
    result = await db.execute(
        select(Document).where(
            and_(Document.id == document_id, Document.user_id == current_user.id)
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    
    # Log archive status for clarity
    if doc.is_archived:
        logger.info(f"🗑️ Deleting archived document {document_id} (archive copy preserved: {doc.archive_item_uuid})")
    else:
        logger.info(f"🗑️ Deleting document {document_id} (not archived)")
    
    # Delete the physical file
    try:
        file_to_delete = get_file_storage_dir() / doc.file_path
        if file_to_delete.exists():
            file_to_delete.unlink()
            logger.info(f"🗑️ Deleted document file: {file_to_delete}")
    except Exception as e:
        logger.warning(f"⚠️ Could not delete file {doc.file_path}: {e}")
        # Continue with database deletion even if file deletion fails
        
    await db.delete(doc)
    await db.commit()
    
    logger.info(f"✅ Document {document_id} deleted successfully")