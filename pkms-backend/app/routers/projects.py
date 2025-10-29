"""
Projects Router for PKMS

Thin router that delegates all business logic to ProjectCRUDService.
Handles only HTTP concerns: request/response mapping, authentication, error handling.

Refactored to follow "thin router, thick service" architecture pattern.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import logging

from app.database import get_db
from app.models.associations import project_items
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse, 
    ProjectDuplicateRequest, ProjectDuplicateResponse,
    ProjectDocumentsReorderRequest, ProjectDocumentsLinkRequest, ProjectDocumentUnlinkRequest,
    ProjectSectionReorderRequest
)
from app.services.project_service import project_service
from app.decorators.error_handler import handle_api_errors

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/reserve")
@handle_api_errors("reserve project")
async def reserve_project(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reserve a project UUID by creating a minimal placeholder project."""
    uuid = await project_service.reserve_project(db, current_user.uuid)
    return {"uuid": uuid}


@router.post("/", response_model=ProjectResponse)
@router.post("", response_model=ProjectResponse)
@handle_api_errors("create project")
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new project."""
    return await project_service.create_project(db, current_user.uuid, project_data)


@router.get("/", response_model=List[ProjectResponse])
@router.get("", response_model=List[ProjectResponse])
@handle_api_errors("list projects")
async def list_projects(
    archived: Optional[bool] = Query(None, description="Filter by archived status"),
    tag: Optional[str] = Query(None, description="Filter by tag name"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all projects for the current user."""
    return await project_service.list_projects(db, current_user.uuid, archived, tag)


@router.get("/deleted", response_model=List[ProjectResponse])
@handle_api_errors("list deleted projects")
async def list_deleted_projects(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all soft-deleted projects for the current user."""
    return await project_service.list_deleted_projects(db, current_user.uuid)


@router.get("/{project_uuid}", response_model=ProjectResponse)
@handle_api_errors("get project")
async def get_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific project by UUID."""
    return await project_service.get_project(db, current_user.uuid, project_uuid)


@router.put("/{project_uuid}", response_model=ProjectResponse)
@handle_api_errors("update project")
async def update_project(
    project_uuid: str,
    project_data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update project metadata and tags."""
    return await project_service.update_project(db, current_user.uuid, project_uuid, project_data)


@router.delete("/{project_uuid}", status_code=status.HTTP_204_NO_CONTENT)
@handle_api_errors("delete project")
async def delete_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Soft delete project (move to Recycle Bin)."""
    await project_service.soft_delete_project(db, current_user.uuid, project_uuid)


@router.post("/{project_uuid}/restore")
@handle_api_errors("restore project")
async def restore_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Restore a soft-deleted project from Recycle Bin."""
    await project_service.restore_project(db, current_user.uuid, project_uuid)
    return {"message": "Project restored successfully"}


@router.delete("/{project_uuid}/permanent")
@handle_api_errors("hard delete project")
async def permanent_delete_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete project (hard delete) - WARNING: Cannot be undone!"""
    await project_service.permanent_delete_project(db, current_user.uuid, project_uuid)
    return {"message": "Project permanently deleted"}


@router.post("/{project_uuid}/duplicate", response_model=ProjectDuplicateResponse)
@handle_api_errors("duplicate project")
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
    
    return await duplication_service.duplicate_project(
        db=db,
        user_uuid=current_user.uuid,
        original_project_uuid=project_uuid,
        request=request
    )


@router.get("/{project_uuid}/items-summary")
@handle_api_errors("get project items summary")
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
        raise e


@router.get("/{project_uuid}/items/{item_type}")
@handle_api_errors("get project items")
async def get_project_items(
    project_uuid: str,
    item_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all items (documents, notes, todos) associated with a project."""
    return await project_service.get_project_items(db, current_user.uuid, project_uuid, item_type)


@router.patch("/{project_uuid}/items/{item_type}/reorder", status_code=status.HTTP_204_NO_CONTENT)
@handle_api_errors("reorder project items")
async def reorder_project_items(
    project_uuid: str,
    item_type: str,
    reorder_data: ProjectDocumentsReorderRequest,  # Keep same schema for now
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reorder items within a project."""
    await project_service.reorder_project_items(db, current_user.uuid, project_uuid, item_type, reorder_data.document_uuids)


@router.post("/{project_uuid}/items/{item_type}/link", status_code=status.HTTP_204_NO_CONTENT)
@handle_api_errors("link items to project")
async def link_items_to_project(
    project_uuid: str,
    item_type: str,
    link_data: ProjectDocumentsLinkRequest,  # Keep same schema for now
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Link existing items to a project."""
    await project_service.link_items_to_project(
        db, current_user.uuid, project_uuid, item_type, link_data.document_uuids,
        is_exclusive=link_data.are_items_exclusive
    )


@router.post("/{project_uuid}/items/{item_type}/unlink", status_code=status.HTTP_204_NO_CONTENT)
@handle_api_errors("unlink item from project")
async def unlink_item_from_project(
    project_uuid: str,
    item_type: str,
    unlink_data: ProjectDocumentUnlinkRequest,  # Keep same schema for now
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Unlink an item from a project."""
    await project_service.unlink_item_from_project(db, current_user.uuid, project_uuid, item_type, unlink_data.document_uuid)


@router.patch("/{project_uuid}/sections/reorder", status_code=status.HTTP_204_NO_CONTENT)
@handle_api_errors("reorder project sections")
async def reorder_project_sections(
    project_uuid: str,
    reorder_data: ProjectSectionReorderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reorder sections within a project."""
    await project_service.reorder_sections(db, current_user.uuid, project_uuid, reorder_data)