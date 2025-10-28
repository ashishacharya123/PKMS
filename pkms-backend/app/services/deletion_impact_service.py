"""
Deletion Impact Service

Analyzes the impact of deleting items across the system.
Provides detailed warnings, blockers, and impact analysis for safe deletion decisions.
"""

import logging
from typing import Dict, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from fastapi import HTTPException, status

from app.models.project import Project
from app.models.note import Note
from app.models.todo import Todo
from app.models.document import Document
from app.models.associations import project_items, note_documents

logger = logging.getLogger(__name__)


class DeletionImpactService:
    """Analyzes deletion impact and provides safety recommendations"""
    
    async def analyze_deletion_impact(
        self,
        db: AsyncSession,
        item_type: str,
        item_uuid: str,
        user_uuid: str,
        mode: str = "soft"  # NEW: "soft" or "hard"
    ) -> Dict[str, Any]:
        """
        Comprehensive analysis of what will happen if this item is deleted.
        
        Returns:
            {
                "can_delete": bool,
                "unlink_only_allowed": bool,  # true if project can be unlinked without deleting
                "warnings": List[str],
                "blockers": List[str],
                "impact_summary": str,
                "orphan_items": List[Dict],  # Items that WILL be deleted (count=0 after unlink)
                "preserved_items": List[Dict]  # Items that will survive (count>0 after unlink)
            }
        """
        try:
            # Handle mode-specific logic
            if mode == "soft":
                # Soft delete is always safe (reversible)
                return {
                    "can_delete": True,
                    "warnings": [f"This will move the {item_type} to the Recycle Bin. It can be restored later."],
                    "blockers": [],
                    "impact_summary": "Soft delete - fully reversible",
                    "orphan_items": [],
                    "preserved_items": []
                }
            elif mode != "hard":
                raise HTTPException(status_code=400, detail="Mode must be 'soft' or 'hard'")
            
            # Run the real analysis for hard delete mode
            # Verify item exists and user owns it
            item = await self._verify_item_ownership(db, item_type, item_uuid, user_uuid)
            if not item:
                raise HTTPException(status_code=404, detail=f"{item_type.title()} not found")
            
            warnings = []
            blockers = []
            exclusive_items = []
            shared_items = []
            
            if item_type == "project":
                result = await self._analyze_project_deletion(db, item_uuid, user_uuid)
                warnings.extend(result["warnings"])
                blockers.extend(result["blockers"])
                exclusive_items.extend(result["exclusive_items"])
                shared_items.extend(result["shared_items"])
                
            elif item_type == "todo":
                result = await self._analyze_todo_deletion(db, item_uuid, user_uuid)
                warnings.extend(result["warnings"])
                blockers.extend(result["blockers"])
                
            elif item_type == "note":
                result = await self._analyze_note_deletion(db, item_uuid, user_uuid)
                warnings.extend(result["warnings"])
                blockers.extend(result["blockers"])
                exclusive_items.extend(result["exclusive_items"])
                shared_items.extend(result["shared_items"])
                
            elif item_type == "document":
                result = await self._analyze_document_deletion(db, item_uuid, user_uuid)
                warnings.extend(result["warnings"])
                blockers.extend(result["blockers"])
                
            # Determine if deletion is safe
            can_delete = len(blockers) == 0
            
            # Build impact summary
            impact_parts = []
            if exclusive_items:
                impact_parts.append(f"Will delete {len(exclusive_items)} exclusive items")
            if shared_items:
                impact_parts.append(f"Will preserve {len(shared_items)} shared items")
            if warnings:
                impact_parts.append(f"{len(warnings)} warnings")
                
            impact_summary = "; ".join(impact_parts) if impact_parts else "No impact"
            
            return {
                "can_delete": can_delete,
                "unlink_only_allowed": item_type == "project",  # Only projects support unlink-only mode
                "warnings": warnings,
                "blockers": blockers,
                "impact_summary": impact_summary,
                "orphan_items": exclusive_items,  # Rename for consistency
                "preserved_items": shared_items   # Rename for consistency
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Error analyzing deletion impact for {item_type} {item_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to analyze deletion impact: {str(e)}"
            )
    
    async def _analyze_project_deletion(
        self, 
        db: AsyncSession, 
        project_uuid: str, 
        user_uuid: str
    ) -> Dict[str, Any]:
        """Analyze what happens when deleting a project"""
        from app.services.association_counter_service import association_counter_service
        
        # Get all children
        children_result = await db.execute(
            select(project_items.c.item_type, project_items.c.item_uuid)
            .where(project_items.c.project_uuid == project_uuid)
        )
        children = children_result.all()
        
        orphan_items = []
        preserved_items = []
        
        for item_type, item_uuid in children:
            # Simulate: what if we remove this link?
            current_count = await association_counter_service.get_item_link_count(db, item_type, item_uuid)
            count_after_unlink = current_count - 1
            
            if count_after_unlink == 0:
                orphan_items.append({"type": item_type, "uuid": item_uuid})
            else:
                preserved_items.append({"type": item_type, "uuid": item_uuid})
        
        # Project deletion is ALWAYS allowed (unlink-only mode available)
        warnings = []
        if orphan_items:
            warnings.append(f"Will delete {len(orphan_items)} orphaned items")
        if preserved_items:
            warnings.append(f"Will preserve {len(preserved_items)} shared items")
        
        return {
            "unlink_only_allowed": True,
            "orphan_items": orphan_items,
            "preserved_items": preserved_items,
            "warnings": warnings,
            "blockers": []
        }
    
    async def _analyze_todo_deletion(
        self, 
        db: AsyncSession, 
        todo_uuid: str, 
        user_uuid: str
    ) -> Dict[str, Any]:
        """Analyze what happens when deleting a todo"""
        warnings = []
        blockers = []
        
        # Check if todo has subtasks
        subtasks_result = await db.execute(
            select(func.count()).where(
                and_(
                    Todo.parent_uuid == todo_uuid,
                    Todo.is_deleted.is_(False)
                )
            )
        )
        subtask_count = subtasks_result.scalar() or 0
        
        if subtask_count > 0:
            warnings.append(f"Will delete {subtask_count} subtasks")
        
        # Check project associations
        project_count_result = await db.execute(
            select(func.count()).select_from(project_items).where(
                and_(
                    project_items.c.item_uuid == todo_uuid,
                    project_items.c.item_type == 'Todo'
                )
            )
        )
        project_count = project_count_result.scalar() or 0
        
        if project_count > 0:
            warnings.append(f"Todo is linked to {project_count} project(s)")
            
        return {
            "warnings": warnings,
            "blockers": blockers,
            "exclusive_items": [],
            "shared_items": []
        }
    
    async def _analyze_note_deletion(
        self, 
        db: AsyncSession, 
        note_uuid: str, 
        user_uuid: str
    ) -> Dict[str, Any]:
        """Analyze what happens when deleting a note"""
        warnings = []
        blockers = []
        exclusive_items = []
        shared_items = []
        
        # Check associated documents
        docs_result = await db.execute(
            select(
                note_documents.c.document_uuid,
                note_documents.c.is_exclusive
            ).where(note_documents.c.note_uuid == note_uuid)
        )
        docs = docs_result.all()
        
        for doc_uuid, is_exclusive in docs:
            if is_exclusive:
                # Check if document is exclusive to other notes too
                other_notes_result = await db.execute(
                    select(func.count()).select_from(note_documents).where(
                        and_(
                            note_documents.c.document_uuid == doc_uuid,
                            note_documents.c.note_uuid != note_uuid,
                            note_documents.c.is_exclusive.is_(True)
                        )
                    )
                )
                other_exclusive_count = other_notes_result.scalar() or 0
                
                if other_exclusive_count > 0:
                    blockers.append(
                        f"Document {doc_uuid} is exclusive to {other_exclusive_count + 1} notes. "
                        f"Deleting this note would break other notes."
                    )
                else:
                    exclusive_items.append({
                        "type": "document",
                        "uuid": doc_uuid,
                        "reason": "exclusive_to_this_note"
                    })
            else:
                shared_items.append({
                    "type": "document", 
                    "uuid": doc_uuid,
                    "reason": "shared_with_other_notes"
                })
        
        if exclusive_items:
            warnings.append(f"Will delete {len(exclusive_items)} exclusive documents")
        if shared_items:
            warnings.append(f"Will preserve {len(shared_items)} shared documents")
            
        return {
            "warnings": warnings,
            "blockers": blockers,
            "exclusive_items": exclusive_items,
            "shared_items": shared_items
        }
    
    async def _analyze_document_deletion(
        self, 
        db: AsyncSession, 
        document_uuid: str, 
        user_uuid: str
    ) -> Dict[str, Any]:
        """Analyze what happens when deleting a document"""
        warnings = []
        blockers = []
        
        # Check if document is EXCLUSIVE to any item
        from app.services.document_exclusivity_service import document_exclusivity_service
        is_exclusive = await document_exclusivity_service.has_exclusive_associations(db, document_uuid)
        
        if is_exclusive:
            # BLOCKER - cannot delete exclusive documents directly
            blockers.append("Document is exclusively owned. Delete the parent item instead.")
            return {"blockers": blockers, "warnings": []}
        
        # Not exclusive - just count associations for warnings
        from app.services.association_counter_service import association_counter_service
        link_count = await association_counter_service.get_document_link_count(db, document_uuid)
        if link_count > 0:
            warnings.append(f"Document linked to {link_count} items")
        
        return {"blockers": [], "warnings": warnings}
    
    async def _verify_item_ownership(
        self,
        db: AsyncSession,
        item_type: str,
        item_uuid: str,
        user_uuid: str
    ) -> Optional[Any]:
        """Verify item exists and user owns it"""
        
        if item_type == "project":
            item = await db.get(Project, item_uuid)
            return item if item and item.created_by == user_uuid else None
            
        elif item_type == "todo":
            item = await db.get(Todo, item_uuid)
            return item if item and item.created_by == user_uuid else None
            
        elif item_type == "note":
            item = await db.get(Note, item_uuid)
            return item if item and item.created_by == user_uuid else None
            
        elif item_type == "document":
            item = await db.get(Document, item_uuid)
            return item if item and item.created_by == user_uuid else None
            
        else:
            raise HTTPException(status_code=400, detail=f"Unknown item type: {item_type}")


# Global instance
deletion_impact_service = DeletionImpactService()
