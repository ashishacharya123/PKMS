"""
Document CRUD Service

Handles all CRUD operations for documents including creation, reading, updating, deletion,
file management, project associations, and search indexing.
"""

import logging
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, delete
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
from fastapi.responses import FileResponse

from app.config import NEPAL_TZ, get_file_storage_dir
from app.models.document import Document
from app.models.project import Project
from app.models.associations import project_items
from app.models.enums import ModuleType
from app.schemas.document import (
    DocumentResponse,
    CommitDocumentUploadRequest,
    DocumentUpdate,
    ProjectBadge,
)
from app.utils.security import sanitize_text_input, sanitize_tags
from app.services.tag_service import tag_service
from app.services.project_service import project_service
from app.services.unified_upload_service import unified_upload_service
from app.services.search_service import search_service
from app.services.dashboard_service import dashboard_service

logger = logging.getLogger(__name__)


class DocumentCRUDService:
    """
    Service for handling CRUD operations for documents, including file management,
    tagging, project associations, and search indexing.
    """

    async def commit_document_upload(
        self, db: AsyncSession, user_uuid: str, payload: CommitDocumentUploadRequest
    ) -> DocumentResponse:
        """Finalize a previously chunk-uploaded document file and create DB record."""
        try:
            logger.info(f"Committing document upload: {payload.title}")

            # Commit upload through unified upload service
            document = await unified_upload_service.commit_upload(
                db=db,
                upload_id=payload.file_id,
                module="documents",
                created_by=user_uuid,
                metadata={
                    "title": payload.title,
                    "description": payload.description,
                    "tags": payload.tags,
                    "project_uuids": payload.project_uuids,
                    "are_projects_exclusive": payload.are_projects_exclusive,
                    # REMOVED: is_diary_exclusive - diary association handled via diary_entry_uuid
                }
            )

            # Load document with tags for response
            result = await db.execute(
                select(Document).options(selectinload(Document.tag_objs)).where(
                    Document.uuid == document.uuid
                )
            )
            document_with_tags = result.scalar_one()

            # Index in search (DB already committed by service)
            await search_service.index_item(db, document_with_tags, 'document')
            await db.commit()

            # OPTIMIZED: Use batch badge loading for single item to avoid N+1
            from app.services.shared_utilities_service import shared_utilities_service
            project_badges_map = await shared_utilities_service.batch_get_project_badges_polymorphic(
                db, [document_with_tags.uuid], 'Document'
            )
            project_badges = project_badges_map.get(document_with_tags.uuid, [])

            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "document_uploaded")

            logger.info(f"Document committed successfully: {document_with_tags.filename}")
            return self._convert_doc_to_response(document_with_tags, project_badges)

        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Error committing document upload")
            try:
                await db.rollback()
            except Exception:
                logger.debug("Rollback after commit_document_upload failure failed")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to commit document upload: {str(e)}"
            )

    async def list_documents(
        self,
        db: AsyncSession,
        user_uuid: str,
        search: Optional[str] = None,
        tag: Optional[str] = None,
        mime_type: Optional[str] = None,
        archived: Optional[bool] = False,
        is_favorite: Optional[bool] = None,
        project_only: Optional[bool] = False,
        unassigned_only: Optional[bool] = False,
        limit: int = 50,
        offset: int = 0,
    ) -> List[DocumentResponse]:
        """
        List documents with filtering and pagination. Uses FTS5 for text search.
        
        Exclusive mode filtering:
        - Items with is_project_exclusive=True are HIDDEN from main list (only in project dashboards)
        - Items with is_diary_exclusive=True are HIDDEN from main list (only in diary entries)
        - Items with both flags=False are ALWAYS shown (linked mode)
        """
        # Validate bounds to match router constraints (1-100)
        limit = min(max(limit, 1), 100)
        offset = max(offset, 0)
        
        try:
            logger.info(f"Listing documents for user {user_uuid} - archived: {archived}, search: {search}, tag: {tag}")
            
            if search:
                # Use unified FTS5 search with native offset
                from app.utils.security import sanitize_search_query
                q = sanitize_search_query(search)
                fts_results = await search_service.search(
                    db, user_uuid, q, item_types=["document"], limit=limit, offset=offset
                )

                # Collect document UUIDs in FTS order (bm25 ASC = better first)
                doc_uuids: List[str] = []
                for result in fts_results:
                    if result["type"] == "document":
                        doc_uuids.append(result["uuid"])

                logger.info(f"FTS5 search returned {len(doc_uuids)} document UUIDs with scores")
                
                if not doc_uuids:
                    return []
                
                # Fetch documents by UUIDs with eager loading for tags
                query = select(Document).options(selectinload(Document.tag_objs)).where(
                    and_(
                        Document.active_only(),  # Auto-excludes soft-deleted
                        Document.created_by == user_uuid,
                        Document.is_archived == archived,
                        Document.uuid.in_(doc_uuids),
                        # REMOVED: is_project_exclusive and is_diary_exclusive - exclusivity now handled in association tables
                    )
                )
                # Apply filters
                if tag:
                    from app.models.tag import Tag
                    query = query.join(Document.tag_objs).where(Tag.name == tag)
                if mime_type:
                    query = query.where(Document.mime_type.like(f"{mime_type}%"))
                if is_favorite is not None:
                    query = query.where(Document.is_favorite == is_favorite)
                if project_only:
                    # Filter documents that have project associations
                    query = query.join(project_items, Document.uuid == project_items.c.item_uuid).where(
                        project_items.c.item_type == 'Document'
                    )
                elif unassigned_only:
                    # Filter documents that have NO project associations
                    query = query.outerjoin(project_items, and_(
                        Document.uuid == project_items.c.item_uuid,
                        project_items.c.item_type == 'Document'
                    ))
                    query = query.where(project_items.c.item_uuid.is_(None))
                result = await db.execute(query.order_by(Document.is_favorite.desc(), Document.created_at.desc()))
                documents = result.scalars().unique().all()
                logger.info(f"FTS5 query returned {len(documents)} documents")
                
                # Preserve FTS order as returned by search_service
                docs_by_uuid = {d.uuid: d for d in documents}
                ordered_docs = [docs_by_uuid[u] for u in doc_uuids if u in docs_by_uuid]
                
                logger.info(f"Final ordered result: {len(ordered_docs)} documents (ordered by FTS relevance)")
            else:
                # Fallback to regular query with eager loading for tags
                logger.info(f"Using regular query for archived={archived}")
                query = select(Document).options(selectinload(Document.tag_objs)).where(
                    and_(
                        Document.active_only(),  # Auto-excludes soft-deleted
                        Document.created_by == user_uuid,
                        Document.is_archived == archived
                        # REMOVED: is_project_exclusive and is_diary_exclusive - exclusivity now handled in association tables
                    )
                )
                # Apply filters
                if tag:
                    from app.models.tag import Tag
                    query = query.join(Document.tag_objs).where(Tag.name == tag)
                if mime_type:
                    query = query.where(Document.mime_type.like(f"{mime_type}%"))
                if is_favorite is not None:
                    query = query.where(Document.is_favorite == is_favorite)
                if project_only:
                    # Filter documents that have project associations
                    query = query.join(project_items, Document.uuid == project_items.c.item_uuid).where(
                        project_items.c.item_type == 'Document'
                    )
                elif unassigned_only:
                    # Filter documents that have NO project associations
                    query = query.outerjoin(project_items, and_(
                        Document.uuid == project_items.c.item_uuid,
                        project_items.c.item_type == 'Document'
                    ))
                    query = query.where(project_items.c.item_uuid.is_(None))
                query = query.order_by(Document.is_favorite.desc(), Document.created_at.desc()).offset(offset).limit(limit)
                result = await db.execute(query)
                ordered_docs = result.scalars().unique().all()
                logger.info(f"Regular query returned {len(ordered_docs)} documents")
            
            # Build responses with project badges - batch load to avoid N+1 queries
            response: List[DocumentResponse] = []
            if ordered_docs:
                # Collect all document UUIDs
                doc_uuids2 = [d.uuid for d in ordered_docs]
                
                # Use shared_utilities_service for polymorphic badge loading
                from app.services.shared_utilities_service import shared_utilities_service
                project_badges_map = await shared_utilities_service.batch_get_project_badges_polymorphic(
                    db, doc_uuids2, 'Document'
                )
                
                # Build response with badges
                for document in ordered_docs:
                    project_badges = project_badges_map.get(document.uuid, [])
                    response.append(self._convert_doc_to_response(document, project_badges))
        
            logger.info(f"Returning {len(response)} documents in response")
            return response
        except Exception as e:
            logger.exception("Error listing documents")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list documents: {str(e)}"
            )

    async def list_deleted_documents(
        self,
        db: AsyncSession,
        user_uuid: str,
    ) -> List[DocumentResponse]:
        """List soft-deleted documents for Recycle Bin."""
        try:
            query = select(Document).where(
                and_(
                    Document.deleted_only(),
                    Document.created_by == user_uuid
                )
            )
            query = query.options(selectinload(Document.tag_objs))
            result = await db.execute(query.order_by(Document.updated_at.desc()))
            documents = result.scalars().all()
            
            responses = []
            for doc in documents:
                responses.append(self._convert_doc_to_response(doc, []))
            
            return responses
            
        except Exception as e:
            logger.exception(f"Error listing deleted documents for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list deleted documents: {str(e)}"
            )

    async def get_document(
        self, db: AsyncSession, user_uuid: str, document_uuid: str
    ) -> DocumentResponse:
        """Get a specific document by UUID."""
        result = await db.execute(
            select(Document).options(selectinload(Document.tag_objs)).where(
                and_(Document.uuid == document_uuid, Document.created_by == user_uuid)
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        
        # OPTIMIZED: Use batch badge loading for single item to avoid N+1
        from app.services.shared_utilities_service import shared_utilities_service
        project_badges_map = await shared_utilities_service.batch_get_project_badges_polymorphic(
            db, [doc.uuid], 'Document'
        )
        project_badges = project_badges_map.get(doc.uuid, [])
        
        return self._convert_doc_to_response(doc, project_badges)

    async def update_document(
        self, db: AsyncSession, user_uuid: str, document_uuid: str, document_data: DocumentUpdate
    ) -> DocumentResponse:
        """Update document metadata and tags."""
        result = await db.execute(
            select(Document).options(selectinload(Document.tag_objs)).where(
                and_(Document.uuid == document_uuid, Document.created_by == user_uuid)
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
            from app.models.tag_associations import document_tags
            await tag_service.handle_tags(db, doc, sanitized_tags, user_uuid, ModuleType.DOCUMENTS, document_tags)

        # Handle projects if provided (with ownership verification)
        if "project_uuids" in update_data:
            project_uuids = update_data.pop("project_uuids")
            are_projects_exclusive = update_data.pop("are_projects_exclusive", False)
            await project_service.handle_polymorphic_associations(
                db=db,
                item=doc,
                project_uuids=project_uuids,
                created_by=user_uuid,
                association_table=project_items,
                item_type='Document',
                is_exclusive=are_projects_exclusive
            )

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
        
        # OPTIMIZED: Use batch badge loading for single item to avoid N+1
        from app.services.shared_utilities_service import shared_utilities_service
        project_badges_map = await shared_utilities_service.batch_get_project_badges_polymorphic(
            db, [doc.uuid], 'Document'
        )
        project_badges = project_badges_map.get(doc.uuid, [])

        # Invalidate dashboard cache
        dashboard_service.invalidate_user_cache(user_uuid, "document_updated")
        
        return self._convert_doc_to_response(doc, project_badges)

    async def delete_document(self, db: AsyncSession, user_uuid: str, document_uuid: str):
        """Delete a document and its associated file.
        
        Note: If the document was archived, this only deletes the original document.
        The archived copy in the Archive module remains intact and accessible.
        """
        result = await db.execute(
            select(Document).options(selectinload(Document.tag_objs)).where(
                and_(Document.uuid == document_uuid, Document.created_by == user_uuid)
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        
        # PRE-CHECK: Use exclusivity service
        from app.services.document_exclusivity_service import document_exclusivity_service
        if await document_exclusivity_service.has_exclusive_associations(db, document_uuid):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Cannot delete. Document is exclusively owned by project/note."
            )
        
        # Log archive status for clarity
        if doc.is_archived:
            logger.info(f"Soft-deleting archived document {document_uuid}")
        else:
            logger.info(f"Soft-deleting document {document_uuid} (not archived)")
        
        # Decrement tag usage counts BEFORE soft deleting document
        await tag_service.decrement_tags_on_delete(db, doc)

        # Remove from search index BEFORE soft deleting document
        await search_service.remove_item(db, document_uuid)
        
        # Soft delete: set is_deleted flag instead of hard delete
        doc.is_deleted = True
        await db.add(doc)
        await db.commit()

        # Invalidate dashboard cache
        dashboard_service.invalidate_user_cache(user_uuid, "document_deleted")

        logger.info(f"Document {document_uuid} soft-deleted successfully")

    async def restore_document(self, db: AsyncSession, user_uuid: str, document_uuid: str):
        """
        Restores a soft-deleted document. SIMPLE operation.
        All associations are still intact, just flip the flag.
        """
        # 1. Get soft-deleted document
        result = await db.execute(
            select(Document).options(selectinload(Document.tag_objs)).where(
                and_(
                    Document.deleted_only(),  # Only soft-deleted
                    Document.uuid == document_uuid,
                    Document.created_by == user_uuid
                )
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deleted document not found")
        
        # 2. Flip flag
        doc.is_deleted = False
        doc.updated_at = datetime.now(NEPAL_TZ)
        await db.add(doc)
        
        # 3. Commit
        await db.commit()
        
        # 4. Re-index in search
        await search_service.index_item(db, doc, 'document')
        dashboard_service.invalidate_user_cache(user_uuid, "document_restored")
        logger.info(f"Document restored: {doc.title}")

    async def permanent_delete_document(self, db: AsyncSession, user_uuid: str, document_uuid: str):
        """Permanently delete document and its file from disk."""
        from app.services.association_counter_service import association_counter_service
        from app.utils.safe_file_ops import safe_delete_with_db
        
        # Get document
        result = await db.execute(
            select(Document).options(selectinload(Document.tag_objs)).where(
                and_(Document.uuid == document_uuid, Document.created_by == user_uuid)
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
        
        # PRE-CHECK 1: Exclusivity
        from app.services.document_exclusivity_service import document_exclusivity_service
        if await document_exclusivity_service.has_exclusive_associations(db, document_uuid):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="Still exclusively owned. Remove associations first."
            )
        
        # PRE-CHECK 2: Association count
        link_count = await association_counter_service.get_document_link_count(db, document_uuid)
        if link_count > 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail=f"Still linked to {link_count} items. Remove associations first."
            )
        
        # All checks passed - purge
        file_path = get_file_storage_dir() / doc.file_path
        
        # Clean up tags/search if not already soft-deleted
        if not doc.is_deleted:
            await tag_service.decrement_tags_on_delete(db, doc)
            await search_service.remove_item(db, document_uuid)
        
        # Clean up junction tables (should be 0, but final cleanup)
        await db.execute(delete(project_items).where(project_items.c.item_uuid == document_uuid))
        await db.execute(delete(note_documents).where(note_documents.c.document_uuid == document_uuid))
        await db.execute(delete(document_diary).where(document_diary.c.document_uuid == document_uuid))
        
        # Atomic file + DB delete (DB first, then file)
        await safe_delete_with_db(file_path, doc, db)
        
        dashboard_service.invalidate_user_cache(user_uuid, "document_purged")

    async def download_document(
        self, db: AsyncSession, user_uuid: str, document_uuid: str
    ) -> FileResponse:
        """Download a document file."""
        result = await db.execute(
            select(Document).where(
                and_(Document.uuid == document_uuid, Document.created_by == user_uuid)
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

        file_path = get_file_storage_dir() / doc.file_path
        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Document file not found on disk"
            )

        return FileResponse(
            path=str(file_path),
            filename=doc.original_name or doc.filename,
            media_type=doc.mime_type
        )

    def _convert_doc_to_response(
        self, doc: Document, project_badges: Optional[List[ProjectBadge]] = None
    ) -> DocumentResponse:
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
            # REMOVED: is_project_exclusive and is_diary_exclusive - exclusivity now handled in association tables
            is_deleted=doc.is_deleted,
            created_at=doc.created_at,
            updated_at=doc.updated_at
            tags=[t.name for t in doc.tag_objs] if doc.tag_objs else [],
            projects=project_badges or []
        )

    # Helper: batch-load project badges for items to avoid N+1
    async def _batch_get_project_badges(
        self,
        db: AsyncSession,
        item_uuids: List[str],
        association_table,
        item_uuid_field: str,
    ) -> Dict[str, List[ProjectBadge]]:
        if not item_uuids:
            return {}
        # Fetch all junctions for these items
        junction_result = await db.execute(
            select(association_table).where(getattr(association_table.c, item_uuid_field).in_(item_uuids))
        )
        junctions = junction_result.fetchall()
        # Collect live project UUIDs
        project_uuids = {j._mapping["project_uuid"] for j in junctions if j._mapping["project_uuid"]}
        projects = []
        if project_uuids:
            proj_result = await db.execute(select(Project).where(Project.uuid.in_(project_uuids)))
            projects = proj_result.scalars().all()
        project_map = {p.uuid: p for p in projects}
        # Group by item and build badges
        out: Dict[str, List[ProjectBadge]] = {u: [] for u in item_uuids}
        for j in junctions:
            doc_uuid = j._mapping[item_uuid_field]
            pj = j._mapping["project_uuid"]
            if pj and pj in project_map:
                p = project_map[pj]
                out[doc_uuid].append(
                    ProjectBadge(uuid=p.uuid, name=p.name, is_project_exclusive=j._mapping["is_project_exclusive"], is_deleted=False)
                )
            elif j._mapping.get("project_name_snapshot"):
                out[doc_uuid].append(
                    ProjectBadge(uuid=None, name=j._mapping["project_name_snapshot"], is_project_exclusive=j._mapping["is_project_exclusive"], is_deleted=True)
                )
        return out


# Global instance
document_crud_service = DocumentCRUDService()
