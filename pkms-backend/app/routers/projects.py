"""
Projects Router for PKMS

Thin router that delegates all business logic to ProjectCRUDService.
Handles only HTTP concerns: request/response mapping, authentication, error handling.

Refactored to follow "thin router, thick service" architecture pattern.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
import logging

from app.database import get_db
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse, 
    ProjectDuplicateRequest, ProjectDuplicateResponse,
    ProjectDocumentsReorderRequest, ProjectDocumentsLinkRequest, ProjectDocumentUnlinkRequest,
    ProjectSectionReorderRequest
)
from app.services.project_service import project_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", response_model=ProjectResponse)
@router.post("", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new project."""
    try:
        return await project_service.create_project(db, current_user.uuid, project_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error creating project for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create project: {str(e)}"
        )


@router.get("/", response_model=List[ProjectResponse])
@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    archived: Optional[bool] = Query(None, description="Filter by archived status"),
    tag: Optional[str] = Query(None, description="Filter by tag name"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all projects for the current user."""
    try:
        return await project_service.list_projects(db, current_user.uuid, archived, tag)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing projects for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list projects: {str(e)}"
        )


@router.get("/deleted", response_model=List[ProjectResponse])
async def list_deleted_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all soft-deleted projects for the current user."""
    try:
        return await project_service.list_deleted_projects(db, current_user.uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing deleted projects for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list deleted projects: {str(e)}"
        )


@router.get("/{project_uuid}", response_model=ProjectResponse)
async def get_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific project by UUID."""
    try:
        return await project_service.get_project(db, current_user.uuid, project_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve project: {str(e)}"
        )


@router.put("/{project_uuid}", response_model=ProjectResponse)
async def update_project(
    project_uuid: str,
    project_data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update project metadata and tags."""
    try:
        return await project_service.update_project(db, current_user.uuid, project_uuid, project_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update project: {str(e)}"
        )


@router.delete("/{project_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Soft delete project (move to Recycle Bin)."""
    try:
        await project_service.soft_delete_project(db, current_user.uuid, project_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete project: {str(e)}"
        )


@router.post("/{project_uuid}/restore")
async def restore_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Restore a soft-deleted project from Recycle Bin."""
    try:
        await project_service.restore_project(db, current_user.uuid, project_uuid)
        return {"message": "Project restored successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error restoring project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to restore project: {str(e)}"
        )


@router.delete("/{project_uuid}/permanent")
async def permanent_delete_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete project (hard delete) - WARNING: Cannot be undone!"""
    try:
        await project_service.permanent_delete_project(db, current_user.uuid, project_uuid)
        return {"message": "Project permanently deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error permanently deleting project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to permanently delete project"
        )


@router.post("/{project_uuid}/duplicate", response_model=ProjectDuplicateResponse)
async def duplicate_project(
    project_uuid: str,
    request: ProjectDuplicateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Duplicate a project with advanced options:
    
    - **Shallow Copy**: Links existing items to new project (fast, shared items)
    - **Deep Copy**: Creates new, independent copies of items (slower, isolated items)
    - **Item Renaming**: Optionally provide new names for deep-copied items
    - **Selective**: Choose which item types to include
    
    Note: Documents are always shallow-linked due to hash-based deduplication.
    """
    from app.services.duplication_service import duplication_service
    
    try:
        return await duplication_service.duplicate_project(
            db=db,
            user_uuid=current_user.uuid,
            original_project_uuid=project_uuid,
            request=request
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error duplicating project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to duplicate project: {str(e)}"
        )


@router.get("/{project_uuid}/items-summary")
async def get_project_items_summary(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get a summary of all items in a project (for duplication UI).
    
    Returns:
    {
        "todos": [{"uuid": "...", "title": "Task 1"}, ...],
        "notes": [{"uuid": "...", "title": "Note 1"}, ...],
        "documents": [{"uuid": "...", "title": "Doc 1"}, ...]
    }
    """
    try:
        # Get all items from project via project_items
        result = await db.execute(
            select(
                project_items.c.item_type,
                project_items.c.item_uuid
            ).where(project_items.c.project_uuid == project_uuid)
        )
        items = result.all()
        
        summary = {"todos": [], "notes": [], "documents": []}
        
        for item_type, item_uuid in items:
            try:
                if item_type == "Todo":
                    from app.models.todo import Todo
                    todo_result = await db.execute(
                        select(Todo.title).where(Todo.uuid == item_uuid)
                    )
                    title = todo_result.scalar_one_or_none()
                    if title:
                        summary["todos"].append({"uuid": item_uuid, "title": title})
                        
                elif item_type == "Note":
                    from app.models.note import Note
                    note_result = await db.execute(
                        select(Note.title).where(Note.uuid == item_uuid)
                    )
                    title = note_result.scalar_one_or_none()
                    if title:
                        summary["notes"].append({"uuid": item_uuid, "title": title})
                        
                elif item_type == "Document":
                    from app.models.document import Document
                    doc_result = await db.execute(
                        select(Document.filename).where(Document.uuid == item_uuid)
                    )
                    title = doc_result.scalar_one_or_none()
                    if title:
                        summary["documents"].append({"uuid": item_uuid, "title": title})
                        
            except Exception as e:
                logger.warning(f"Failed to get title for {item_type} {item_uuid}: {e}")
                continue
        
        return summary
        
    except Exception as e:
        logger.exception(f"Error getting project items summary for {project_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get project items summary: {str(e)}"
        )


@router.get("/{project_uuid}/items/{item_type}")
async def get_project_items(
    project_uuid: str,
    item_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all items (documents, notes, todos) associated with a project."""
    try:
        return await project_service.get_project_items(db, current_user.uuid, project_uuid, item_type)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting project items for project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve project items: {str(e)}"
        )


@router.patch("/{project_uuid}/items/{item_type}/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_project_items(
    project_uuid: str,
    item_type: str,
    reorder_data: ProjectDocumentsReorderRequest,  # Keep same schema for now
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reorder items within a project."""
    try:
        await project_service.reorder_project_items(db, current_user.uuid, project_uuid, item_type, reorder_data.document_uuids)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error reordering {item_type} for project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reorder {item_type}: {str(e)}"
        )


@router.post("/{project_uuid}/items/{item_type}/link", status_code=status.HTTP_204_NO_CONTENT)
async def link_items_to_project(
    project_uuid: str,
    item_type: str,
    link_data: ProjectDocumentsLinkRequest,  # Keep same schema for now
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Link existing items to a project."""
    try:
        await project_service.link_items_to_project(
            db, current_user.uuid, project_uuid, item_type, link_data.document_uuids,
            is_exclusive=link_data.are_items_exclusive
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error linking {item_type} to project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to link {item_type}: {str(e)}"
        )


@router.post("/{project_uuid}/items/{item_type}/unlink", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_item_from_project(
    project_uuid: str,
    item_type: str,
    unlink_data: ProjectDocumentUnlinkRequest,  # Keep same schema for now
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Unlink an item from a project."""
    try:
        await project_service.unlink_item_from_project(db, current_user.uuid, project_uuid, item_type, unlink_data.document_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error unlinking {item_type} from project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unlink {item_type}: {str(e)}"
        )


@router.patch("/{project_uuid}/sections/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_project_sections(
    project_uuid: str,
    reorder_data: ProjectSectionReorderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reorder sections within a project."""
    try:
        await project_service.reorder_sections(db, current_user.uuid, project_uuid, reorder_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error reordering sections for project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reorder sections: {str(e)}"
        )