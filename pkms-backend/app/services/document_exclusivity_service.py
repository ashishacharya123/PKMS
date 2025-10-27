"""
Document Exclusivity Service

This service handles exclusivity logic for document associations.
It provides CTE queries to check for exclusivity conflicts and determine
if documents can be safely deleted or modified.
"""

from typing import List, Dict, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.models.document import Document
import logging

logger = logging.getLogger(__name__)


class DocumentExclusivityService:
    """Service for managing document exclusivity and conflict detection"""
    
    @staticmethod
    async def has_exclusive_associations(
        db: AsyncSession, 
        document_uuid: str
    ) -> bool:
        logger.info(f"[EXCLUSIVITY CHECK] Service: Running has_exclusive_associations for doc {document_uuid}.")
        """
        Fast validator query to check if document has any exclusive associations.
        Uses simple SELECT 1 ... LIMIT 1 for performance.
        
        Args:
            db: Database session
            document_uuid: UUID of document to check
            
        Returns:
            True if document has exclusive associations, False otherwise
        """
        try:
            # Fast validator query - stops at first match
            query = text("""
                SELECT 1 FROM note_documents 
                WHERE document_uuid = :document_uuid AND is_exclusive = 1
                LIMIT 1
                
                UNION ALL
                
                SELECT 1 FROM document_diary 
                WHERE document_uuid = :document_uuid AND is_exclusive = 1
                LIMIT 1
                
                UNION ALL
                
                -- REMOVED: document_projects - replaced with project_items
                
                UNION ALL
                
                SELECT 1 FROM project_items 
                WHERE item_uuid = :document_uuid AND item_type = 'Document' AND is_exclusive = 1
                LIMIT 1
            """)
            
            result = await db.execute(query, {"document_uuid": document_uuid})
            return result.fetchone() is not None
            
        except Exception as e:
            logger.error(f"Error checking exclusive associations for document {document_uuid}: {str(e)}")
            raise
    
    @staticmethod
    async def get_exclusivity_conflict_report(
        db: AsyncSession, 
        document_uuid: str
    ) -> List[Dict[str, str]]:
        logger.info(f"[EXCLUSIVITY CHECK] Service: Running get_exclusivity_conflict_report for doc {document_uuid}.")
        # --- END LOGGING ---
        """
        Get detailed conflict report for user-friendly error messages.
        Uses complex GROUP_CONCAT query for comprehensive reporting.
        
        Args:
            db: Database session
            document_uuid: UUID of document to check
            
        Returns:
            List of conflict descriptions
        """
        try:
            # Complex conflict report query for user-friendly messages
            query = text("""
                WITH exclusivity_conflicts AS (
                    SELECT 
                        'Note' as association_type,
                        n.title as item_name,
                        n.uuid as item_uuid,
                        nd.is_exclusive
                    FROM note_documents nd
                    JOIN notes n ON nd.note_uuid = n.uuid
                    WHERE nd.document_uuid = :document_uuid AND nd.is_exclusive = 1
                    
                    UNION ALL
                    
                    SELECT 
                        'Diary' as association_type,
                        DATE(di.entry_date) as item_name,
                        di.uuid as item_uuid,
                        dd.is_exclusive
                    FROM document_diary dd
                    JOIN diary_entries di ON dd.diary_entry_uuid = di.uuid
                    WHERE dd.document_uuid = :document_uuid AND dd.is_exclusive = 1
                    
                    UNION ALL
                    
                    -- REMOVED: document_projects - replaced with project_items
                    
                    UNION ALL
                    
                    SELECT 
                        'ProjectItem' as association_type,
                        p.name as item_name,
                        p.uuid as item_uuid,
                        pi.is_exclusive
                    FROM project_items pi
                    JOIN projects p ON pi.project_uuid = p.uuid
                    WHERE pi.item_uuid = :document_uuid AND pi.item_type = 'Document' AND pi.is_exclusive = 1
                )
                SELECT 
                    association_type,
                    item_name,
                    item_uuid,
                    is_exclusive
                FROM exclusivity_conflicts
                ORDER BY association_type, item_name
            """)
            
            result = await db.execute(query, {"document_uuid": document_uuid})
            conflicts = []
            
            for row in result:
                conflicts.append({
                    "type": row.association_type,
                    "name": row.item_name,
                    "uuid": row.item_uuid,
                    "is_exclusive": bool(row.is_exclusive)
                })
            
            return conflicts
            
        except Exception as e:
            logger.error(f"Error getting exclusivity conflict report for document {document_uuid}: {str(e)}")
            raise
    
    @staticmethod
    async def can_delete_document(
        db: AsyncSession, 
        document_uuid: str
    ) -> Tuple[bool, List[str]]:
        """
        Check if a document can be safely deleted.
        
        Args:
            db: Database session
            document_uuid: UUID of document to check
            
        Returns:
            Tuple of (can_delete, conflict_descriptions)
        """
        try:
            # Use fast validator query
            has_exclusive = await DocumentExclusivityService.has_exclusive_associations(
                db, document_uuid
            )
            
            if not has_exclusive:
                return True, []
            
            # Get detailed conflict report for user-friendly error
            conflicts = await DocumentExclusivityService.get_exclusivity_conflict_report(
                db, document_uuid
            )
            
            conflict_descriptions = [
                f"{conflict['type']}: {conflict['name']}" 
                for conflict in conflicts 
                if conflict['is_exclusive']
            ]
            
            return False, conflict_descriptions
            
        except Exception as e:
            logger.error(f"Error checking if document {document_uuid} can be deleted: {str(e)}")
            raise
    
    @staticmethod
    async def get_document_associations(
        db: AsyncSession, 
        document_uuid: str
    ) -> Dict[str, List[Dict]]:
        """
        Get all associations for a document with exclusivity information.
        
        Args:
            db: Database session
            document_uuid: UUID of document to check
            
        Returns:
            Dictionary with association types as keys and lists of associations as values
        """
        try:
            associations = {
                "notes": [],
                "diary_entries": [],
                "projects": [],
                "project_items": []
            }
            
            # Get note associations
            note_query = text("""
                SELECT 
                    n.uuid, n.title, nd.is_exclusive, nd.sort_order
                FROM note_documents nd
                JOIN notes n ON nd.note_uuid = n.uuid
                WHERE nd.document_uuid = :document_uuid
                ORDER BY nd.sort_order
            """)
            
            note_result = await db.execute(note_query, {"document_uuid": document_uuid})
            for row in note_result:
                associations["notes"].append({
                    "uuid": row.uuid,
                    "title": row.title,
                    "is_exclusive": bool(row.is_exclusive),
                    "sort_order": row.sort_order
                })
            
            # Get diary associations
            diary_query = text("""
                SELECT 
                    di.uuid, di.title, dd.is_exclusive, dd.sort_order
                FROM document_diary dd
                JOIN diary_entries di ON dd.diary_entry_uuid = di.uuid
                WHERE dd.document_uuid = :document_uuid
                ORDER BY dd.sort_order
            """)
            
            diary_result = await db.execute(diary_query, {"document_uuid": document_uuid})
            for row in diary_result:
                associations["diary_entries"].append({
                    "uuid": row.uuid,
                    "title": row.title,
                    "is_exclusive": bool(row.is_exclusive),
                    "sort_order": row.sort_order
                })
            
            # Get project associations via Project_Items
            project_query = text("""
                SELECT 
                    p.uuid, p.name, pi.is_exclusive, pi.sort_order
                FROM project_items pi
                JOIN projects p ON pi.project_uuid = p.uuid
                WHERE pi.item_uuid = :document_uuid AND pi.item_type = 'Document'
                ORDER BY pi.sort_order
            """)
            
            project_result = await db.execute(project_query, {"document_uuid": document_uuid})
            for row in project_result:
                associations["projects"].append({
                    "uuid": row.uuid,
                    "name": row.name,
                    "is_exclusive": bool(row.is_exclusive),
                    "sort_order": row.sort_order
                })
            
            # Get polymorphic project items
            project_items_query = text("""
                SELECT 
                    pi.item_type, pi.item_uuid, pi.is_exclusive, pi.sort_order,
                    CASE 
                        WHEN pi.item_type = 'Note' THEN n.title
                        WHEN pi.item_type = 'Document' THEN d.title
                        WHEN pi.item_type = 'Todo' THEN t.task
                    END as item_name
                FROM project_items pi
                LEFT JOIN notes n ON pi.item_type = 'Note' AND pi.item_uuid = n.uuid
                LEFT JOIN documents d ON pi.item_type = 'Document' AND pi.item_uuid = d.uuid
                LEFT JOIN todos t ON pi.item_type = 'Todo' AND pi.item_uuid = t.uuid
                WHERE pi.item_type = 'Document' AND pi.item_uuid = :document_uuid
                ORDER BY pi.sort_order
            """)
            
            project_items_result = await db.execute(project_items_query, {"document_uuid": document_uuid})
            for row in project_items_result:
                associations["project_items"].append({
                    "item_type": row.item_type,
                    "item_uuid": row.item_uuid,
                    "item_name": row.item_name,
                    "is_exclusive": bool(row.is_exclusive),
                    "sort_order": row.sort_order
                })
            
            return associations
            
        except Exception as e:
            logger.error(f"Error getting document associations for {document_uuid}: {str(e)}")
            raise
    
    @staticmethod
    async def get_orphan_documents(db: AsyncSession) -> List[Document]:
        """
        Find documents with no associations (orphans).
        
        Args:
            db: Database session
            
        Returns:
            List of orphan documents
        """
        try:
            query = text("""
                SELECT d.* FROM documents d
                LEFT JOIN note_documents nd ON d.uuid = nd.document_uuid
                LEFT JOIN document_diary dd ON d.uuid = dd.document_uuid
                LEFT JOIN project_items pi ON d.uuid = pi.item_uuid AND pi.item_type = 'Document'
                WHERE nd.document_uuid IS NULL 
                  AND dd.document_uuid IS NULL 
                  AND pi.item_uuid IS NULL
                ORDER BY d.created_at DESC
            """)
            
            result = await db.execute(query)
            return [Document(**row._asdict()) for row in result]
            
        except Exception as e:
            logger.error(f"Error getting orphan documents: {str(e)}")
            raise
    
    @staticmethod
    async def check_and_delete_if_exclusive_orphan(
        db: AsyncSession, 
        document_uuid: str
    ) -> bool:
        logger.info(f"[EXCLUSIVITY CHECK] Service: Running check_and_delete_if_exclusive_orphan for doc {document_uuid}.")
        """
        CRITICAL: Check if document is an orphan and delete if so.
        
        This method is called after deleting a parent (note, project, etc.).
        It checks if the document now has zero associations.
        If so, it deletes the document to prevent "lost files."
        
        Args:
            db: Database session
            document_uuid: UUID of document to check
            
        Returns:
            True if document was deleted, False if it still has associations
        """
        try:
            # Step 1: Check if the document has ANY links left
            has_any_links = await DocumentExclusivityService.has_any_associations(
                db, document_uuid
            )
            
            if has_any_links:
                # It's still linked to something else. Do not delete.
                return False
            
            # Step 2: It has no links. It is an orphan. Delete it.
            # (No need to check for "exclusivity" - it has no links to check)
            try:
                from app.models.document import Document
                document = await db.get(Document, document_uuid)
                
                if document:
                    # Here you would also add the logic to delete
                    # the physical file from the file system.
                    # e.g., file_system_service.delete(document.file_path)
                    
                    await db.delete(document)
                    await db.commit()
                    logger.info(f"Deleted orphan document {document_uuid}")
                    return True
                else:
                    # Document was already deleted, which is fine.
                    return False
                    
            except Exception as e:
                logger.error(f"Error deleting orphan document {document_uuid}: {str(e)}")
                raise
            
            return False
            
        except Exception as e:
            logger.error(f"Error checking and deleting exclusive orphan {document_uuid}: {str(e)}")
            raise
    
    @staticmethod
    async def has_any_associations(
        db: AsyncSession, 
        document_uuid: str
    ) -> bool:
        """
        Check if document has any associations (exclusive or non-exclusive).
        
        Args:
            db: Database session
            document_uuid: UUID of document to check
            
        Returns:
            True if document has any associations, False otherwise
        """
        try:
            query = text("""
                SELECT 1 FROM note_documents 
                WHERE document_uuid = :document_uuid
                LIMIT 1
                
                UNION ALL
                
                SELECT 1 FROM document_diary 
                WHERE document_uuid = :document_uuid
                LIMIT 1
                
                UNION ALL
                
                -- REMOVED: document_projects - replaced with project_items
                
                UNION ALL
                
                SELECT 1 FROM project_items 
                WHERE item_uuid = :document_uuid AND item_type = 'Document'
                LIMIT 1
            """)
            
            result = await db.execute(query, {"document_uuid": document_uuid})
            return result.fetchone() is not None
            
        except Exception as e:
            logger.error(f"Error checking associations for document {document_uuid}: {str(e)}")
            raise
    
    @staticmethod
    async def cleanup_orphan_documents(
        db: AsyncSession, 
        dry_run: bool = True
    ) -> Dict[str, int]:
        """
        Clean up orphan documents (documents with no associations).
        ONLY deletes non-exclusive orphans to prevent "lost files."
        
        Args:
            db: Database session
            dry_run: If True, only count orphans without deleting
            
        Returns:
            Dictionary with cleanup statistics
        """
        try:
            orphans = await DocumentExclusivityService.get_orphan_documents(db)
            
            if dry_run:
                return {
                    "orphans_found": len(orphans),
                    "orphans_deleted": 0,
                    "dry_run": True
                }
            
            # Delete orphan documents (they have no associations by definition)
            deleted_count = 0
            for orphan in orphans:
                try:
                    # Orphans have no associations by definition, so we can safely delete them
                    await db.delete(orphan)
                    deleted_count += 1
                except Exception as e:
                    logger.error(f"Error deleting orphan document {orphan.uuid}: {str(e)}")
            
            await db.commit()
            
            return {
                "orphans_found": len(orphans),
                "orphans_deleted": deleted_count,
                "dry_run": False
            }
            
        except Exception as e:
            logger.error(f"Error cleaning up orphan documents: {str(e)}")
            raise


# Create singleton instance
document_exclusivity_service = DocumentExclusivityService()
