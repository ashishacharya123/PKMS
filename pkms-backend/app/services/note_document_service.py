"""
Note Document Service

Handles associations between notes and documents using the note_documents junction table.
Provides CRUD operations for note-file relationships with exclusivity support.
"""

import logging
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert, delete, update, and_, func
from fastapi import HTTPException, status

from app.models.note import Note
from app.models.document import Document
from app.models.associations import note_documents
from app.schemas.document import DocumentResponse

logger = logging.getLogger(__name__)


class NoteDocumentService:
    """Service for managing note-document associations with exclusivity support."""
    
    async def link_document_to_note(
        self,
        db: AsyncSession,
        note_uuid: str,
        document_uuid: str,
        user_uuid: str,
        is_exclusive: bool = False,
        sort_order: int = 0
    ) -> Dict[str, Any]:
        """
        Link a document to a note with exclusivity support.
        
        Args:
            db: Database session
            note_uuid: UUID of the note
            document_uuid: UUID of the document
            user_uuid: User UUID for ownership verification
            is_exclusive: Whether the association is exclusive
            sort_order: Display order for the document
            
        Returns:
            Dictionary with association details
        """
        try:
            # Verify note ownership
            note_result = await db.execute(
                select(Note).where(
                    and_(Note.uuid == note_uuid, Note.created_by == user_uuid)
                )
            )
            note = note_result.scalar_one_or_none()
            if not note:
                raise HTTPException(
                    status_code=404, 
                    detail="Note not found or access denied"
                )
            
            # Verify document ownership
            doc_result = await db.execute(
                select(Document).where(
                    and_(Document.uuid == document_uuid, Document.created_by == user_uuid)
                )
            )
            document = doc_result.scalar_one_or_none()
            if not document:
                raise HTTPException(
                    status_code=404, 
                    detail="Document not found or access denied"
                )
            
            # Check if association already exists
            existing_result = await db.execute(
                select(note_documents.c.id).where(
                    and_(
                        note_documents.c.note_uuid == note_uuid,
                        note_documents.c.document_uuid == document_uuid
                    )
                )
            )
            if existing_result.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="Document is already linked to this note"
                )
            
            # Create the association
            await db.execute(
                insert(note_documents).values(
                    note_uuid=note_uuid,
                    document_uuid=document_uuid,
                    sort_order=sort_order,
                    is_exclusive=is_exclusive
                )
            )
            
            # Update note file count
            await self._update_note_file_count(db, note_uuid)
            
            await db.commit()
            
            logger.info(f"Linked document {document_uuid} to note {note_uuid} (exclusive: {is_exclusive})")
            
            return {
                "note_uuid": note_uuid,
                "document_uuid": document_uuid,
                "is_exclusive": is_exclusive,
                "sort_order": sort_order
            }
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"Error linking document to note: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to link document to note: {str(e)}"
            )
    
    async def unlink_document_from_note(
        self,
        db: AsyncSession,
        note_uuid: str,
        document_uuid: str,
        user_uuid: str
    ) -> bool:
        """
        Unlink a document from a note.
        
        Args:
            db: Database session
            note_uuid: UUID of the note
            document_uuid: UUID of the document
            user_uuid: User UUID for ownership verification
            
        Returns:
            True if unlinked successfully
        """
        try:
            # Verify note ownership
            note_result = await db.execute(
                select(Note).where(
                    and_(Note.uuid == note_uuid, Note.created_by == user_uuid)
                )
            )
            note = note_result.scalar_one_or_none()
            if not note:
                raise HTTPException(
                    status_code=404, 
                    detail="Note not found or access denied"
                )
            
            # Remove the association
            result = await db.execute(
                delete(note_documents).where(
                    and_(
                        note_documents.c.note_uuid == note_uuid,
                        note_documents.c.document_uuid == document_uuid
                    )
                )
            )
            
            if result.rowcount == 0:
                raise HTTPException(
                    status_code=404,
                    detail="Document is not linked to this note"
                )
            
            # Update note file count
            await self._update_note_file_count(db, note_uuid)
            
            await db.commit()
            
            logger.info(f"Unlinked document {document_uuid} from note {note_uuid}")
            return True
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"Error unlinking document from note: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to unlink document from note: {str(e)}"
            )
    
    async def get_note_documents(
        self,
        db: AsyncSession,
        note_uuid: str,
        user_uuid: str,
        include_exclusive: bool = True
    ) -> List[DocumentResponse]:
        """
        Get all documents linked to a note.
        
        Args:
            db: Database session
            note_uuid: UUID of the note
            user_uuid: User UUID for ownership verification
            include_exclusive: Whether to include exclusive documents
            
        Returns:
            List of document responses
        """
        try:
            # Verify note ownership
            note_result = await db.execute(
                select(Note).where(
                    and_(Note.uuid == note_uuid, Note.created_by == user_uuid)
                )
            )
            note = note_result.scalar_one_or_none()
            if not note:
                raise HTTPException(
                    status_code=404, 
                    detail="Note not found or access denied"
                )
            
            # Build query
            query = (
                select(Document, note_documents.c.is_exclusive, note_documents.c.sort_order)
                .join(note_documents, Document.uuid == note_documents.c.document_uuid)
                .where(note_documents.c.note_uuid == note_uuid)
            )
            
            if not include_exclusive:
                query = query.where(note_documents.c.is_exclusive.is_(False))
            
            query = query.order_by(note_documents.c.sort_order, Document.created_at.desc())
            
            result = await db.execute(query)
            documents = result.fetchall()
            
            return [
                {
                    "document": DocumentResponse(
                        uuid=doc.uuid,
                        title=doc.title,
                        filename=doc.filename,
                        original_name=doc.original_name,
                        file_path=doc.file_path,
                        file_size=doc.file_size,
                        mime_type=doc.mime_type,
                        is_favorite=doc.is_favorite,
                        is_archived=doc.is_archived,
                        is_deleted=doc.is_deleted,
                        created_at=doc.created_at,
                        updated_at=doc.updated_at,
                        tags=[],  # TODO: Add tag loading if needed
                        projects=[],  # TODO: Add project loading if needed
                    ),
                    "is_exclusive": is_exclusive,  # Link metadata
                    "sort_order": sort_order,  # Link metadata
                }
                for doc, is_exclusive, sort_order in documents
            ]
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error getting note documents: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to get note documents: {str(e)}"
            )
    
    async def update_document_order(
        self,
        db: AsyncSession,
        note_uuid: str,
        document_orders: List[Dict[str, Any]],
        user_uuid: str
    ) -> bool:
        """
        Update the sort order of documents in a note.
        
        Args:
            db: Database session
            note_uuid: UUID of the note
            document_orders: List of {document_uuid, sort_order} dictionaries
            user_uuid: User UUID for ownership verification
            
        Returns:
            True if updated successfully
        """
        try:
            # Verify note ownership
            note_result = await db.execute(
                select(Note).where(
                    and_(Note.uuid == note_uuid, Note.created_by == user_uuid)
                )
            )
            note = note_result.scalar_one_or_none()
            if not note:
                raise HTTPException(
                    status_code=404, 
                    detail="Note not found or access denied"
                )
            
            # Update sort orders
            for doc_order in document_orders:
                await db.execute(
                    update(note_documents)
                    .where(
                        and_(
                            note_documents.c.note_uuid == note_uuid,
                            note_documents.c.document_uuid == doc_order["document_uuid"]
                        )
                    )
                    .values(sort_order=doc_order["sort_order"])
                )
            
            await db.commit()
            
            logger.info(f"Updated document order for note {note_uuid}")
            return True
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"Error updating document order: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to update document order: {str(e)}"
            )
    
    async def _update_note_file_count(self, db: AsyncSession, note_uuid: str) -> None:
        """Update the file count for a note."""
        try:
            count_result = await db.execute(
                select(func.count(note_documents.c.id))
                .where(note_documents.c.note_uuid == note_uuid)
            )
            file_count = count_result.scalar() or 0
            
            await db.execute(
                update(Note)
                .where(Note.uuid == note_uuid)
                .values(file_count=file_count)
            )
            
        except Exception as e:
            logger.error(f"Error updating note file count: {str(e)}")
            # Don't raise here, it's not critical


# Global instance
note_document_service = NoteDocumentService()
