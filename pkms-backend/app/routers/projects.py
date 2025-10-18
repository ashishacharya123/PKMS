"""
Projects Router for PKMS

Handles all project-related endpoints including CRUD operations,
duplication, and comprehensive project views.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, delete, func, case
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from sqlalchemy.orm import selectinload
import logging

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.project import Project
from app.models.document import Document
from app.models.note import Note
from app.models.todo import Todo
from app.models.tag import Tag
from app.models.user import User
from app.models.associations import todo_projects, document_projects, note_projects
# ModuleType import removed - tags are now universal across all modules
from app.models.enums import TodoStatus, TaskPriority
from app.models.tag_associations import project_tags
from app.auth.dependencies import get_current_user
from app.services.tag_service import tag_service
from app.services.project_service import project_service
from app.services.search_service import search_service

from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse, ProjectBadge, 
    ProjectDuplicateRequest, ProjectDuplicateResponse
)

router = APIRouter()


# Helper Functions
def _convert_project_to_response(project: Project, todo_count: int = 0, completed_count: int = 0) -> ProjectResponse:
    """Convert Project model to ProjectResponse with todo counts."""
    return ProjectResponse(
        uuid=project.uuid,
        name=project.name,
        description=project.description,
        # color removed - deemed unnecessary for professional project management
        sort_order=project.sort_order,
        status=project.status,
        priority=project.priority,
        is_archived=project.is_archived,
        is_favorite=project.is_favorite,
        is_deleted=project.is_deleted,
        progress_percentage=project.progress_percentage,
        start_date=project.start_date,
        end_date=project.end_date,
        due_date=project.due_date,  # Professional project management feature
        completion_date=project.completion_date,  # When project was actually completed
        created_by=project.created_by,
        created_at=project.created_at,
        updated_at=project.updated_at,
        todo_count=todo_count,
        completed_count=completed_count,
        document_count=len(project.documents_multi) if project.documents_multi else 0,
        note_count=len(project.notes) if project.notes else 0,
        tag_count=len(project.tag_objs) if project.tag_objs else 0,
        actual_progress=0,  # Will be calculated
        days_remaining=None,  # Will be calculated
        tags=[t.name for t in project.tag_objs] if project.tag_objs else []
    )


async def _get_project_counts(db: AsyncSession, project_uuid: str) -> tuple[int, int]:
    """Get todo count and completed count for a project using shared service."""
    from app.services.dashboard_stats_service import dashboard_stats_service
    return await dashboard_stats_service.get_project_todo_counts(db, project_uuid)


def _convert_doc_to_response(doc: Document, project_badges: Optional[List[ProjectBadge]] = None) -> Dict[str, Any]:
    """Convert Document model to response format."""
    return {
        "uuid": doc.uuid,
        "title": doc.title,
        "description": doc.description,
        "filename": doc.filename,
        "mime_type": doc.mime_type,
        "file_size": doc.file_size,
        "upload_status": doc.upload_status,
        "is_archived": doc.is_archived,
        "is_favorite": doc.is_favorite,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
        "projects": project_badges or []
    }


def _convert_note_to_response(note: Note, project_badges: Optional[List[ProjectBadge]] = None) -> Dict[str, Any]:
    """Convert Note model to response format."""
    return {
        "uuid": note.uuid,
        "title": note.title,
        "content": note.content,
        "is_archived": note.is_archived,
        "is_favorite": note.is_favorite,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        "projects": project_badges or []
    }


def _convert_todo_to_response(todo: Todo, project_badges: Optional[List[ProjectBadge]] = None) -> Dict[str, Any]:
    """Convert Todo model to response format."""
    return {
        "uuid": todo.uuid,
        "title": todo.title,
        "description": todo.description,
        "status": todo.status,
        "priority": todo.priority,
        "is_archived": todo.is_archived,
        "is_favorite": todo.is_favorite,
        "created_at": todo.created_at,
        "updated_at": todo.updated_at,
        "projects": project_badges or []
    }


# Project Endpoints
@router.post("/", response_model=ProjectResponse)
@router.post("", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new project."""
    try:
        payload = project_data.model_dump()
        tags = payload.pop("tags", []) or []

        # color validation removed - color field deleted from projects

        project = Project(**payload, created_by=current_user.uuid)
        db.add(project)
        await db.commit()
        await db.refresh(project)
        
        if tags:
            await tag_service.handle_tags(db, project, tags, current_user.uuid, None, project_tags)  # ModuleType removed - tags are universal
        
        # Index in search and persist
        await search_service.index_item(db, project, 'project')
        await db.commit()
        
        logger.info(f"Project created: {project.name}")
        return _convert_project_to_response(project, 0, 0)  # New project has 0 todos
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error creating project")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create project: {str(e)}"
        )


@router.get("/", response_model=List[ProjectResponse])
@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    archived: Optional[bool] = None,
    tag: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all projects for the current user."""
    try:
        # Build base query
        query = select(Project).where(
            and_(
                Project.created_by == current_user.uuid,
                Project.is_deleted.is_(False)
            )
        )
        
        # Apply filters
        if archived is not None:
            query = query.where(Project.is_archived.is_(archived))
        
        if tag:
            query = query.join(project_tags).join(Tag).where(Tag.name == tag)
        
        # Execute query
        result = await db.execute(query.order_by(Project.sort_order, Project.created_at.desc()))
        projects = result.scalars().all()
        
        # Get counts for each project
        projects_with_counts = []
        for project in projects:
            total, completed = await _get_project_counts(db, project.uuid)
            projects_with_counts.append(_convert_project_to_response(project, total, completed))
        
        return projects_with_counts
        
    except Exception as e:
        logger.exception("Error listing projects")
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
    """Get a single project by UUID."""
    result = await db.execute(
        select(Project).where(and_(Project.uuid == project_uuid, Project.created_by == current_user.uuid))
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    todo_count, completed_count = await _get_project_counts(db, project.uuid)
    return _convert_project_to_response(project, todo_count, completed_count)


@router.put("/{project_uuid}", response_model=ProjectResponse)
async def update_project(
    project_uuid: str,
    project_data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing project."""
    try:
        result = await db.execute(
            select(Project).where(and_(Project.uuid == project_uuid, Project.created_by == current_user.uuid))
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        update_payload = project_data.model_dump(exclude_unset=True)
        tags = update_payload.pop("tags", None)

        # color validation removed - color field deleted from projects

        # Update project fields
        for key, value in update_payload.items():
            setattr(project, key, value)
        
        # Handle tags if provided
        if tags is not None:
            await tag_service.handle_tags(db, project, tags, current_user.uuid, None, project_tags)  # ModuleType removed - tags are universal
        
        # Index in search and persist
        await search_service.index_item(db, project, 'project')
        await db.commit()
        
        todo_count, completed_count = await _get_project_counts(db, project.uuid)
        return _convert_project_to_response(project, todo_count, completed_count)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error updating project")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update project: {str(e)}"
        )


@router.post("/{project_uuid}/duplicate", response_model=ProjectResponse)
async def duplicate_project(
    project_uuid: str,
    duplicate_data: ProjectDuplicateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Duplicate an existing project with optional associated items."""
    try:
        # Get the original project
        result = await db.execute(
            select(Project).where(and_(Project.uuid == project_uuid, Project.created_by == current_user.uuid))
        )
        original_project = result.scalar_one_or_none()
        
        if not original_project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Use the model's duplicate method
        new_project = original_project.duplicate(
            session=db,
            name_suffix=duplicate_data.name_suffix,
            include_associated_items=duplicate_data.include_associated_items
        )
        
        # Handle tags if they exist
        if original_project.tag_objs:
            await tag_service.handle_tags(db, new_project, [tag.name for tag in original_project.tag_objs], current_user.uuid, None, project_tags)  # ModuleType removed - tags are universal
        
        # Index in search
        await search_service.index_item(db, new_project, 'project')
        await db.commit()
        
        # Get counts for response
        todo_count, completed_count = await _get_project_counts(db, new_project.uuid)
        
        logger.info(f"Project duplicated: {original_project.name} -> {new_project.name}")
        return _convert_project_to_response(new_project, todo_count, completed_count)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error duplicating project")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to duplicate project: {str(e)}"
        )


@router.get("/{project_uuid}/view", response_model=Dict[str, Any])
async def get_project_view(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive project view for left panel - includes all associated items."""
    try:
        # Get the project
        result = await db.execute(
            select(Project).where(and_(Project.uuid == project_uuid, Project.created_by == current_user.uuid))
        )
        project = result.scalar_one_or_none()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get project counts
        todo_count, completed_count = await _get_project_counts(db, project.uuid)
        
        # Get associated todos
        todos_result = await db.execute(
            select(Todo).where(
                and_(
                    Todo.created_by == current_user.uuid,
                    Todo.is_deleted.is_(False),
                    Todo.is_archived.is_(False)
                )
            ).join(todo_projects).where(todo_projects.c.project_uuid == project_uuid)
        )
        todos = todos_result.scalars().all()
        
        # Get associated documents
        documents_result = await db.execute(
            select(Document).where(
                and_(
                    Document.created_by == current_user.uuid,
                    Document.is_deleted.is_(False),
                    Document.is_archived.is_(False)
                )
            ).join(document_projects).where(document_projects.c.project_uuid == project_uuid)
        )
        documents = documents_result.scalars().all()
        
        # Get associated notes
        notes_result = await db.execute(
            select(Note).where(
                and_(
                    Note.created_by == current_user.uuid,
                    Note.is_deleted.is_(False),
                    Note.is_archived.is_(False)
                )
            ).join(note_projects).where(note_projects.c.project_uuid == project_uuid)
        )
        notes = notes_result.scalars().all()
        
        # Build project badges for todos
        todo_badges = await project_service.build_badges(db, project.uuid, False, todo_projects, "todo_uuid")
        
        # Convert to response format
        project_response = _convert_project_to_response(project, todo_count, completed_count)
        
        return {
            "project": project_response,
            "todos": [_convert_todo_to_response(todo, todo_badges) for todo in todos],
            "documents": [_convert_doc_to_response(doc, []) for doc in documents],  # TODO: Add document badges
            "notes": [_convert_note_to_response(note, []) for note in notes],  # TODO: Add note badges
            "summary": {
                "total_items": len(todos) + len(documents) + len(notes),
                "completed_items": completed_count,
                "completion_rate": (completed_count / todo_count * 100) if todo_count > 0 else 0,
                "last_updated": project.updated_at
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error getting project view")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get project view: {str(e)}"
        )


@router.delete("/{project_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a project with multi-project support:
    - Snapshots project name in junction tables for linked items (preserved as 'deleted_ProjectName')
    - Hard deletes exclusive items (items with is_exclusive_mode=True)
    - Removes project (SET NULL in junction tables preserves linked items)
    """
    try:
        await project_service.delete_project(db, project_uuid, current_user.uuid)
        logger.info(f"Project deleted: {project_uuid}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error deleting project")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete project: {str(e)}"
        )
