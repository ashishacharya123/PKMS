"""
Diary Document Service

Handles linking/unlinking/reordering documents to diary entries.
Reuses the same patterns as ProjectService for document associations.
"""

import logging
from datetime import datetime
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, update
from fastapi import HTTPException, status

from app.config import NEPAL_TZ
from app.models.document import Document
from app.models.diary import DiaryEntry
from app.models.associations import document_diary

logger = logging.getLogger(__name__)


class DiaryDocumentService:
    """
    Service for managing document associations with diary entries.
    Reuses the same patterns as ProjectService for consistency.
    """

    async def link_documents_to_diary_entry(
        self, db: AsyncSession, user_uuid: str, diary_entry_uuid: str, document_uuids: List[str], is_encrypted: bool = False
    ):
        """
        Link existing documents to a diary entry.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            diary_entry_uuid: Diary entry UUID
            document_uuids: List of document UUIDs to link
            is_encrypted: Whether the linked documents are encrypted
        """
        try:
            # Verify diary entry exists and belongs to user
            entry_result = await db.execute(
                select(DiaryEntry).where(
                    and_(
                        DiaryEntry.uuid == diary_entry_uuid,
                        DiaryEntry.created_by == user_uuid,
                        DiaryEntry.is_deleted.is_(False)
                    )
                )
            )
            if not entry_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Diary entry {diary_entry_uuid} not found"
                )

            # Get current max sort_order for this diary entry
            max_order_result = await db.execute(
                select(func.max(document_diary.c.sort_order))
                .where(document_diary.c.diary_entry_uuid == diary_entry_uuid)
            )
            max_order = max_order_result.scalar() or -1

            # Batch-load and validate all documents in a single query
            if not document_uuids:
                return
            
            # Remove duplicates while preserving order
            unique_document_uuids = list(dict.fromkeys(document_uuids))
            if len(unique_document_uuids) != len(document_uuids):
                logger.warning(f"Duplicate document UUIDs detected and removed: {len(document_uuids) - len(unique_document_uuids)} duplicates")
            
            # Batch verify all documents exist and belong to user
            docs_result = await db.execute(
                select(Document.uuid).where(
                    and_(
                        Document.uuid.in_(unique_document_uuids),
                        Document.created_by == user_uuid,
                        Document.is_deleted.is_(False)
                    )
                )
            )
            existing_doc_uuids = {row[0] for row in docs_result.fetchall()}
            
            # Check for missing documents
            missing_uuids = set(unique_document_uuids) - existing_doc_uuids
            if missing_uuids:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Documents not found: {', '.join(missing_uuids)}"
                )
            
            # Batch check existing associations
            existing_assocs_result = await db.execute(
                select(document_diary.c.document_uuid)
                .where(
                    and_(
                        document_diary.c.diary_entry_uuid == diary_entry_uuid,
                        document_diary.c.document_uuid.in_(unique_document_uuids)
                    )
                )
            )
            already_linked_uuids = {row[0] for row in existing_assocs_result.fetchall()}
            
            # Filter out already linked documents
            new_document_uuids = [uuid for uuid in unique_document_uuids if uuid not in already_linked_uuids]
            
            # Link each new document
            for index, document_uuid in enumerate(new_document_uuids):
                # Insert association
                await db.execute(
                    document_diary.insert().values(
                        document_uuid=document_uuid,
                        diary_entry_uuid=diary_entry_uuid,
                        sort_order=max_order + index + 1,
                        is_exclusive=True,  # Diary files always exclusive
                        is_encrypted=is_encrypted,  # Track encryption status
                        created_at=datetime.now(NEPAL_TZ),
                        updated_at=datetime.now(NEPAL_TZ)
                    )
                )
            
            # Update diary entry file count
            await self._update_diary_entry_file_count(db, diary_entry_uuid)
            
            # Commit first, then invalidate cache
            await db.commit()
        
        except HTTPException:
            # Re-raise HTTP exceptions without rollback (they're expected)
            raise
        except Exception as e:
            # Rollback on unexpected errors to leave session clean
            await db.rollback()
            logger.exception(f"Unexpected error linking documents to diary entry {diary_entry_uuid}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to link documents to diary entry"
            ) from e

    async def unlink_document_from_diary_entry(
        self, db: AsyncSession, user_uuid: str, diary_entry_uuid: str, document_uuid: str
    ):
        """
        Unlink a document from a diary entry.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            diary_entry_uuid: Diary entry UUID
            document_uuid: Document UUID to unlink
        """
        # Verify diary entry exists and belongs to user
        entry_result = await db.execute(
            select(DiaryEntry).where(
                and_(
                    DiaryEntry.uuid == diary_entry_uuid,
                    DiaryEntry.created_by == user_uuid,
                    DiaryEntry.is_deleted.is_(False)
                )
            )
        )
        if not entry_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Diary entry {diary_entry_uuid} not found"
            )

        # Remove association
        result = await db.execute(
            document_diary.delete().where(
                and_(
                    document_diary.c.diary_entry_uuid == diary_entry_uuid,
                    document_diary.c.document_uuid == document_uuid
                )
            )
        )
        
        if result.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document {document_uuid} not linked to diary entry {diary_entry_uuid}"
            )
        
        # Update diary entry file count
        await self._update_diary_entry_file_count(db, diary_entry_uuid)
        
        # Commit first, then invalidate cache
        await db.commit()

    async def reorder_diary_documents(
        self, db: AsyncSession, user_uuid: str, diary_entry_uuid: str, document_uuids: List[str]
    ):
        """
        Reorder documents within a diary entry.

        Args:
            db: Database session
            user_uuid: User's UUID
            diary_entry_uuid: Diary entry UUID
            document_uuids: List of document UUIDs in desired order
        """
        try:
            # Verify diary entry exists and belongs to user
            entry_result = await db.execute(
                select(DiaryEntry).where(
                    and_(
                        DiaryEntry.uuid == diary_entry_uuid,
                        DiaryEntry.created_by == user_uuid,
                        DiaryEntry.is_deleted.is_(False)
                    )
                )
            )
            if not entry_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Diary entry {diary_entry_uuid} not found"
                )

        # ✅ Creative Solution 1: Batch verify all documents in ONE query (eliminate N+1 verification)
            existing_links_query = (
                select(document_diary.c.document_uuid)
                .where(
                    and_(
                        document_diary.c.diary_entry_uuid == diary_entry_uuid,
                        document_diary.c.document_uuid.in_(document_uuids)
                    )
                )
            )
            existing_links_result = await db.execute(existing_links_query)
            existing_document_uuids = {row[0] for row in existing_links_result}

            # Find missing documents using set difference (O(1) lookup)
            missing_document_uuids = set(document_uuids) - existing_document_uuids
            if missing_document_uuids:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Documents not linked to diary entry {diary_entry_uuid}: {list(missing_document_uuids)}"
                )

            # ✅ Creative Solution 2: Bulk UPDATE with VALUES clause (eliminate N+1 updates)
            if document_uuids:
                from sqlalchemy import case

                # Build CASE WHEN statement for bulk update - ONE query for ALL documents!
                when_clauses = []
                for index, document_uuid in enumerate(document_uuids):
                    when_clauses.append(case(
                    (document_diary.c.document_uuid == document_uuid, index),
                    else_=document_diary.c.sort_order
                ))

                # Single bulk UPDATE statement - creative solution!
                await db.execute(
                    document_diary.update()
                    .where(
                        and_(
                            document_diary.c.diary_entry_uuid == diary_entry_uuid,
                            document_diary.c.document_uuid.in_(document_uuids)
                        )
                    )
                    .values(
                        sort_order=case(*when_clauses),
                        updated_at=datetime.now(NEPAL_TZ)
                    )
                )

        # Only invalidate cache after successful commit
            await db.commit()

        except Exception as e:
            # Rollback on any error and re-raise
            await db.rollback()
            logger.error(f"Failed to reorder diary documents for entry {diary_entry_uuid}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to reorder diary documents"
            ) from e

    async def get_diary_entry_documents(
        self, db: AsyncSession, user_uuid: str, diary_entry_uuid: str
    ) -> List[Document]:
        """
        Get all documents linked to a diary entry, ordered by sort_order.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            diary_entry_uuid: Diary entry UUID
            
        Returns:
            List of Document objects ordered by sort_order
        """
        # Verify diary entry exists and belongs to user
        entry_result = await db.execute(
            select(DiaryEntry).where(
                and_(
                    DiaryEntry.uuid == diary_entry_uuid,
                    DiaryEntry.created_by == user_uuid,
                    DiaryEntry.is_deleted.is_(False)
                )
            )
        )
        if not entry_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Diary entry {diary_entry_uuid} not found"
            )

        # Get documents linked to this diary entry with encryption status
        result = await db.execute(
            select(Document, document_diary.c.is_encrypted, document_diary.c.sort_order)
            .join(document_diary, Document.uuid == document_diary.c.document_uuid)
            .where(
                and_(
                    document_diary.c.diary_entry_uuid == diary_entry_uuid,
                    Document.created_by == user_uuid,
                    Document.is_deleted.is_(False)
                )
            )
            .order_by(document_diary.c.sort_order)
        )
        
        # Return documents with encryption status attached
        documents_with_encryption = []
        for row in result:
            doc = row[0]
            doc.is_encrypted = row[1]  # Attach encryption status to document
            documents_with_encryption.append(doc)
        
        return documents_with_encryption

    async def _update_diary_entry_file_count(self, db: AsyncSession, diary_entry_uuid: str) -> None:
        """Update file count for a diary entry"""
        # Count documents linked to this diary entry
        count_result = await db.execute(
            select(func.count(document_diary.c.document_uuid))
            .where(document_diary.c.diary_entry_uuid == diary_entry_uuid)
        )
        file_count = count_result.scalar() or 0
        
        # Update diary entry
        await db.execute(
            update(DiaryEntry)
            .where(DiaryEntry.uuid == diary_entry_uuid)
            .values(file_count=file_count)
        )


# Global instance
diary_document_service = DiaryDocumentService()
