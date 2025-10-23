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
from app.models.associations import document_projects
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
                    "is_project_exclusive": payload.is_project_exclusive,
                    "is_diary_exclusive": payload.is_diary_exclusive,
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
            project_badges = await self._batch_get_project_badges(
                db, [document_with_tags.uuid], document_projects, "document_uuid"
            )
            project_badges = project_badges.get(document_with_tags.uuid, [])

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
                        Document.created_by == user_uuid,
                        Document.is_archived == archived,
                        Document.is_deleted.is_(False),  # Exclude deleted items
                        Document.uuid.in_(doc_uuids),
                        Document.is_project_exclusive.is_(False),  # Only show linked (non-project-exclusive) items
                        Document.is_diary_exclusive.is_(False)  # Only show non-diary-exclusive items
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
                # Fallback to regular query with eager loading for tags
                logger.info(f"Using regular query for archived={archived}")
                query = select(Document).options(selectinload(Document.tag_objs)).where(
                    and_(
                        Document.created_by == user_uuid,
                        Document.is_archived == archived,
                        Document.is_deleted.is_(False),  # Exclude deleted items
                        Document.is_project_exclusive.is_(False),  # Only show linked (non-project-exclusive) items
                        Document.is_diary_exclusive.is_(False)  # Only show non-diary-exclusive items
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
                for document in ordered_docs:
                    doc_junctions = junctions_by_doc.get(document.uuid, [])
                    project_badges: List[ProjectBadge] = []
                    
                    for junction in doc_junctions:
                        pj = junction._mapping["project_uuid"]
                        if pj and pj in project_map:
                            # Live project
                            project = project_map[pj]
                            project_badges.append(ProjectBadge(
                                uuid=project.uuid,
                                name=project.name,
                                is_project_exclusive=junction._mapping["is_project_exclusive"],
                                is_deleted=False
                            ))
                        elif junction._mapping["project_name_snapshot"]:
                            # Deleted project (snapshot)
                            project_badges.append(ProjectBadge(
                                uuid=None,
                                name=junction._mapping["project_name_snapshot"],
                                is_project_exclusive=junction._mapping["is_project_exclusive"],
                                is_deleted=True
                            ))
                    
                    response.append(self._convert_doc_to_response(document, project_badges))
        
            logger.info(f"Returning {len(response)} documents in response")
            return response
        except Exception as e:
            logger.exception("Error listing documents")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list documents: {str(e)}"
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
        project_badges = await self._batch_get_project_badges(
            db, [doc.uuid], document_projects, "document_uuid"
        )
        project_badges = project_badges.get(doc.uuid, [])
        
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
            await project_service.handle_associations(
                db, doc, update_data.pop("project_uuids"), user_uuid, document_projects, "document_uuid"
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
        project_badges = await self._batch_get_project_badges(
            db, [doc.uuid], document_projects, "document_uuid"
        )
        project_badges = project_badges.get(doc.uuid, [])

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
            is_project_exclusive=doc.is_project_exclusive,
            is_diary_exclusive=doc.is_diary_exclusive,
            is_deleted=doc.is_deleted,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
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
