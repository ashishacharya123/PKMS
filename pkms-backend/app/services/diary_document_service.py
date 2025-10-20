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
from app.services.dashboard_service import dashboard_service

logger = logging.getLogger(__name__)


class DiaryDocumentService:
    """
    Service for managing document associations with diary entries.
    Reuses the same patterns as ProjectService for consistency.
    """

    async def link_documents_to_diary_entry(
        self, db: AsyncSession, user_uuid: str, diary_entry_uuid: str, document_uuids: List[str]
    ):
        """
        Link existing documents to a diary entry.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            diary_entry_uuid: Diary entry UUID
            document_uuids: List of document UUIDs to link
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

        # Get current max sort_order for this diary entry
        max_order_result = await db.execute(
            select(func.max(document_diary.c.sort_order))
            .where(document_diary.c.diary_entry_uuid == diary_entry_uuid)
        )
        max_order = max_order_result.scalar() or -1

        # Link each document
        for index, document_uuid in enumerate(document_uuids):
            # Verify document exists and belongs to user
            doc_result = await db.execute(
                select(Document).where(
                    and_(
                        Document.uuid == document_uuid,
                        Document.created_by == user_uuid,
                        Document.is_deleted.is_(False)
                    )
                )
            )
            if not doc_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, 
                    detail=f"Document {document_uuid} not found"
                )
            
            # Check if already linked
            existing_result = await db.execute(
                select(document_diary.c.id)
                .where(
                    and_(
                        document_diary.c.diary_entry_uuid == diary_entry_uuid,
                        document_diary.c.document_uuid == document_uuid
                    )
                )
            )
            if existing_result.scalar_one_or_none():
                continue  # Skip already linked
            
            # Insert association
            await db.execute(
                document_diary.insert().values(
                    document_uuid=document_uuid,
                    diary_entry_uuid=diary_entry_uuid,
                    sort_order=max_order + index + 1,
                    created_at=datetime.now(NEPAL_TZ),
                    updated_at=datetime.now(NEPAL_TZ)
                )
            )
        
        await db.commit()
        
        # Update diary entry file count
        await self._update_diary_entry_file_count(db, diary_entry_uuid)
        
        # Invalidate dashboard cache
        dashboard_service.invalidate_user_cache(user_uuid, "diary_documents_linked")

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
        
        await db.commit()
        
        # Update diary entry file count
        await self._update_diary_entry_file_count(db, diary_entry_uuid)
        
        # Invalidate dashboard cache
        dashboard_service.invalidate_user_cache(user_uuid, "diary_document_unlinked")

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

        # Verify all documents exist and are linked to this diary entry
        for document_uuid in document_uuids:
            link_result = await db.execute(
                select(document_diary.c.id)
                .where(
                    and_(
                        document_diary.c.diary_entry_uuid == diary_entry_uuid,
                        document_diary.c.document_uuid == document_uuid
                    )
                )
            )
            if not link_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Document {document_uuid} not linked to diary entry {diary_entry_uuid}"
                )

        # Update sort_order for each document
        for index, document_uuid in enumerate(document_uuids):
            await db.execute(
                document_diary.update()
                .where(
                    and_(
                        document_diary.c.diary_entry_uuid == diary_entry_uuid,
                        document_diary.c.document_uuid == document_uuid
                    )
                )
                .values(
                    sort_order=index,
                    updated_at=datetime.now(NEPAL_TZ)
                )
            )
        
        await db.commit()
        
        # Invalidate dashboard cache
        dashboard_service.invalidate_user_cache(user_uuid, "diary_documents_reordered")

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

        # Get documents linked to this diary entry
        result = await db.execute(
            select(Document)
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
        
        return result.scalars().all()

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
