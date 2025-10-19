"""
Todo Management Router for PKMS

Handles all todo-related endpoints including CRUD operations,
subtasks, and todo management.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, delete, func, case
from app.schemas.todo import TodoCreate, TodoUpdate, TodoResponse
from app.schemas.project import ProjectBadge
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from sqlalchemy.orm import selectinload
import logging

from app.config import NEPAL_TZ

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.todo import Todo
from app.models.tag import Tag
from app.models.user import User
from app.models.associations import todo_projects
from app.models.enums import ModuleType, TodoStatus, TaskPriority
from app.models.tag_associations import todo_tags
from app.auth.dependencies import get_current_user
from app.services.tag_service import tag_service
from app.services.project_service import project_service
from app.services.search_service import search_service
from app.routers.dashboard import invalidate_user_dashboard_cache

router = APIRouter()


# Helper Functions
def _convert_todo_to_response(todo: Todo, project_badges: Optional[List[ProjectBadge]] = None) -> TodoResponse:
    """Convert Todo model to TodoResponse with relational tags."""
    badges = project_badges or []
    return TodoResponse(
        uuid=todo.uuid,
        title=todo.title,
        description=todo.description,
        status=todo.status,
        priority=todo.priority,
        is_archived=todo.is_archived,
        is_favorite=todo.is_favorite,
        is_exclusive_mode=todo.is_exclusive_mode,
        start_date=todo.start_date,
        due_date=todo.due_date,
        created_at=todo.created_at,
        updated_at=todo.updated_at,
        completed_at=todo.completed_at,
        tags=[t.name for t in todo.tag_objs] if todo.tag_objs else [],
        projects=badges
    )


async def _get_project_counts(db: AsyncSession, project_uuid: str) -> tuple[int, int]:
    """Get todo count and completed count for a project using shared service."""
    from app.services.dashboard_stats_service import dashboard_stats_service
    return await dashboard_stats_service.get_project_todo_counts(db, project_uuid)


# Todo Endpoints
@router.post("/", response_model=TodoResponse)
async def create_todo(
    todo_data: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new todo."""
    try:
        payload = todo_data.model_dump()
        project_ids = payload.pop("project_ids", []) or []
        
        # Create todo
        todo = Todo(**payload, created_by=current_user.uuid)
        db.add(todo)
        await db.flush()  # Get UUID for associations
        
        # Handle project associations
        if project_ids:
            await project_service.handle_associations(db, todo, project_ids, current_user.uuid, todo_projects, "todo_uuid")
        
        # Handle tags
        tags = payload.get("tags", [])
        if tags:
            await tag_service.handle_tags(db, todo, tags, current_user.uuid, ModuleType.TODOS, todo_tags)
        
        # Index in search
        await search_service.index_item(db, todo, 'todo')
        await db.commit()
        
        # Build project badges
        project_badges = await project_service.build_badges(db, todo.uuid, todo.is_exclusive_mode, todo_projects, "todo_uuid")
        
        logger.info(f"Todo created: {todo.title}")
        return _convert_todo_to_response(todo, project_badges)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error creating todo")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create todo: {str(e)}"
        )


@router.get("/", response_model=List[TodoResponse])
async def list_todos(
    status: Optional[str] = None,
    is_archived: Optional[bool] = None,
    is_favorite: Optional[bool] = None,
    priority: Optional[str] = None,
    due_date: Optional[date] = None,
    tag: Optional[str] = None,
    include_subtasks: Optional[bool] = True,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all todos for the current user."""
    try:
        # Build base query
        query = select(Todo).where(
            and_(
                Todo.created_by == current_user.uuid,
                Todo.is_deleted.is_(False)
            )
        )
        
        # Apply filters
        if status:
            try:
                status_enum = TodoStatus(status)
                query = query.where(Todo.status == status_enum)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        
        if is_archived is not None:
            query = query.where(Todo.is_archived.is_(is_archived))
        
        if is_favorite is not None:
            query = query.where(Todo.is_favorite.is_(is_favorite))
        
        if priority:
            try:
                priority_enum = TaskPriority(priority)
                query = query.where(Todo.priority == priority_enum)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid priority: {priority}")
        
        if due_date:
            query = query.where(Todo.due_date == due_date)
        
        if tag:
            query = query.join(todo_tags).join(Tag).where(Tag.name == tag)
        
        # Filter out subtasks if not requested
        if not include_subtasks:
            query = query.where(Todo.parent_uuid.is_(None))
        
        # Execute query
        result = await db.execute(query.order_by(Todo.order_index, Todo.created_at.desc()))
        todos = result.scalars().all()
        
        # Build responses with project badges
        responses = []
        for todo in todos:
            project_badges = await project_service.build_badges(db, todo.uuid, todo.is_exclusive_mode, todo_projects, "todo_uuid")
            responses.append(_convert_todo_to_response(todo, project_badges))
        
        return responses
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error listing todos")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list todos: {str(e)}"
        )


@router.get("/{todo_uuid}", response_model=TodoResponse)
async def get_todo(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single todo by UUID."""
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.projects)
        ).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
    )
    todo = result.scalar_one_or_none()
    
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    # Build project badges
    project_badges = await project_service.build_badges(db, todo.uuid, todo.is_exclusive_mode, todo_projects, "todo_uuid")
    
    return _convert_todo_to_response(todo, project_badges)


@router.put("/{todo_uuid}", response_model=TodoResponse)
async def update_todo(
    todo_uuid: str,
    todo_data: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing todo."""
    try:
        result = await db.execute(
            select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
        )
        todo = result.scalar_one_or_none()
        
        if not todo:
            raise HTTPException(status_code=404, detail="Todo not found")
        
        update_data = todo_data.model_dump(exclude_unset=True)
        
        # Handle projects if provided
        if "project_ids" in update_data:
            await project_service.handle_associations(db, todo, update_data.pop("project_ids"), current_user.uuid, todo_projects, "todo_uuid")
        
        # Handle tags if provided
        if "tags" in update_data:
            await tag_service.handle_tags(db, todo, update_data["tags"], current_user.uuid, ModuleType.TODOS, todo_tags)
        
        # Update todo fields
        for key, value in update_data.items():
            if key not in ["project_ids", "tags"]:  # Skip already handled fields
                setattr(todo, key, value)
        
        # Index in search
        await search_service.index_item(db, todo, 'todo')
        await db.commit()
        
        # Build project badges
        project_badges = await project_service.build_badges(db, todo.uuid, todo.is_exclusive_mode, todo_projects, "todo_uuid")
        
        logger.info(f"Todo updated: {todo.title}")
        return _convert_todo_to_response(todo, project_badges)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error updating todo")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update todo: {str(e)}"
        )


@router.delete("/{todo_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a todo (soft delete)."""
    try:
        result = await db.execute(
            select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
        )
        todo = result.scalar_one_or_none()
        
        if not todo:
            raise HTTPException(status_code=404, detail="Todo not found")
        
        # Soft delete
        todo.is_deleted = True
        await db.commit()
        
        logger.info(f"Todo deleted: {todo.title}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error deleting todo")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete todo: {str(e)}"
        )


@router.patch("/{todo_uuid}/status", response_model=TodoResponse)
async def update_todo_status(
    todo_uuid: str,
    status_value: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update todo status."""
    try:
        # Validate status
        valid_statuses = [status.value for status in TodoStatus]
        if status_value not in valid_statuses:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid status. Valid values: {', '.join(valid_statuses)}"
            )
        
        result = await db.execute(
            select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
        )
        todo = result.scalar_one_or_none()
        
        if not todo:
            raise HTTPException(status_code=404, detail="Todo not found")
        
        # Convert string to enum
        todo_status = TodoStatus(status_value)
        
        # Update status
        todo.status = todo_status
        
        # Handle completed_at timestamp
        if todo_status == TodoStatus.DONE:
            todo.completed_at = datetime.now(NEPAL_TZ)
        else:
            todo.completed_at = None
        
        # Index in search
        await search_service.index_item(db, todo, 'todo')
        await db.commit()
        
        # Build project badges
        project_badges = await project_service.build_badges(db, todo.uuid, todo.is_exclusive_mode, todo_projects, "todo_uuid")
        
        logger.info(f"Todo status updated: {todo.title} -> {todo_status}")
        return _convert_todo_to_response(todo, project_badges)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error updating todo status")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update todo status: {str(e)}"
        )


@router.patch("/{todo_uuid}/complete", response_model=TodoResponse)
async def complete_todo(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark todo as completed by setting status to 'done'."""
    return await update_todo_status(todo_uuid, TodoStatus.DONE.value, current_user, db)


@router.get("/{todo_uuid}/subtasks", response_model=List[TodoResponse])
async def get_subtasks(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all subtasks for a todo."""
    try:
        # Verify parent todo exists and belongs to user
        parent_result = await db.execute(
            select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
        )
        parent_todo = parent_result.scalar_one_or_none()
        
        if not parent_todo:
            raise HTTPException(status_code=404, detail="Parent todo not found")
        
        # Get subtasks
        result = await db.execute(
            select(Todo).where(
                and_(
                    Todo.parent_uuid == todo_uuid,
                    Todo.created_by == current_user.uuid,
                    Todo.is_deleted.is_(False)
                )
            ).order_by(Todo.order_index, Todo.created_at)
        )
        subtasks = result.scalars().all()
        
        # Build responses with project badges
        responses = []
        for subtask in subtasks:
            project_badges = await project_service.build_badges(db, subtask.uuid, subtask.is_exclusive_mode, todo_projects, "todo_uuid")
            responses.append(_convert_todo_to_response(subtask, project_badges))
        
        return responses
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error getting subtasks")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get subtasks: {str(e)}"
        )


@router.post("/{todo_uuid}/subtasks", response_model=TodoResponse)
async def create_subtask(
    todo_uuid: str,
    subtask_data: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a subtask for a todo."""
    try:
        # Verify parent todo exists and belongs to user
        parent_result = await db.execute(
            select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
        )
        parent_todo = parent_result.scalar_one_or_none()
        
        if not parent_todo:
            raise HTTPException(status_code=404, detail="Parent todo not found")
        
        # Create subtask
        payload = subtask_data.model_dump()
        payload["parent_uuid"] = todo_uuid
        payload["todo_type"] = "subtask"
        
        subtask = Todo(**payload, created_by=current_user.uuid)
        db.add(subtask)
        await db.flush()  # Get UUID for associations
        
        # Handle project associations (inherit from parent)
        if parent_todo.projects:
            project_ids = [p.uuid for p in parent_todo.projects]
            await project_service.handle_associations(db, subtask, project_ids, current_user.uuid, todo_projects, "todo_uuid")
        
        # Handle tags
        tags = payload.get("tags", [])
        if tags:
            await tag_service.handle_tags(db, subtask, tags, current_user.uuid, ModuleType.TODOS, todo_tags)
        
        # Index in search
        await search_service.index_item(db, subtask, 'todo')
        await db.commit()
        
        # Build project badges
        project_badges = await project_service.build_badges(db, subtask.uuid, subtask.is_exclusive_mode, todo_projects, "todo_uuid")
        
        logger.info(f"Subtask created: {subtask.title} for {parent_todo.title}")
        return _convert_todo_to_response(subtask, project_badges)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error creating subtask")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create subtask: {str(e)}"
        )


# Stats Endpoints
@router.get("/stats/summary")
async def get_todo_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get todo statistics summary using shared dashboard stats service."""
    try:
        from app.services.dashboard_stats_service import dashboard_stats_service
        
        # Use shared service to avoid duplication
        stats = await dashboard_stats_service.get_todo_stats(db, current_user.uuid)
        
        # Calculate completion rate
        total = stats.get("total", 0)
        completed = stats.get("done", 0)
        completion_rate = (completed / total * 100) if total > 0 else 0
        
        return {
            "total": total,
            "completed": completed,
            "pending": stats.get("pending", 0),
            "in_progress": stats.get("in_progress", 0),
            "blocked": stats.get("blocked", 0),
            "overdue": stats.get("overdue", 0),
            "due_today": stats.get("due_today", 0),
            "completed_today": stats.get("completed_today", 0),
            "within_time": stats.get("within_time", 0),
            "completion_rate": completion_rate
        }
        
    except Exception as e:
        logger.exception("Error getting todo stats")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get todo stats: {str(e)}"
        )
