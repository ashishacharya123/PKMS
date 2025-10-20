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
from app.services.project_crud_service import project_crud_service

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
        return await project_crud_service.create_project(db, current_user.uuid, project_data)
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
        return await project_crud_service.list_projects(db, current_user.uuid, archived, tag)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing projects for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list projects: {str(e)}"
        )


@router.get("/{project_uuid}", response_model=ProjectResponse)
async def get_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific project by UUID."""
    try:
        return await project_crud_service.get_project(db, current_user.uuid, project_uuid)
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
        return await project_crud_service.update_project(db, current_user.uuid, project_uuid, project_data)
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
    """Delete a project (soft delete)."""
    try:
        await project_crud_service.delete_project(db, current_user.uuid, project_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete project: {str(e)}"
        )


@router.post("/{project_uuid}/duplicate", response_model=ProjectDuplicateResponse)
async def duplicate_project(
    project_uuid: str,
    duplicate_data: ProjectDuplicateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Duplicate a project with all its associations."""
    try:
        return await project_crud_service.duplicate_project(db, current_user.uuid, project_uuid, duplicate_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error duplicating project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to duplicate project: {str(e)}"
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
        return await project_crud_service.get_project_items(db, current_user.uuid, project_uuid, item_type)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting project items for project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve project items: {str(e)}"
        )


@router.patch("/{project_uuid}/documents/reorder", status_code=status.HTTP_204_NO_CONTENT)
async def reorder_project_documents(
    project_uuid: str,
    reorder_data: ProjectDocumentsReorderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reorder documents within a project."""
    try:
        await project_crud_service.reorder_documents(db, current_user.uuid, project_uuid, reorder_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error reordering documents for project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reorder documents: {str(e)}"
        )


@router.post("/{project_uuid}/documents:link", status_code=status.HTTP_204_NO_CONTENT)
async def link_documents_to_project(
    project_uuid: str,
    link_data: ProjectDocumentsLinkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Link existing documents to a project."""
    try:
        await project_crud_service.link_documents_to_project(db, current_user.uuid, project_uuid, link_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error linking documents to project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to link documents: {str(e)}"
        )


@router.post("/{project_uuid}/documents:unlink", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_document_from_project(
    project_uuid: str,
    unlink_data: ProjectDocumentUnlinkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Unlink a document from a project."""
    try:
        await project_crud_service.unlink_document_from_project(db, current_user.uuid, project_uuid, unlink_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error unlinking document from project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unlink document: {str(e)}"
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
        await project_crud_service.reorder_sections(db, current_user.uuid, project_uuid, reorder_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error reordering sections for project {project_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reorder sections: {str(e)}"
        )