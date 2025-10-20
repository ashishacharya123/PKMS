"""
Todo Management Router for PKMS

Thin router that delegates all business logic to TodoCRUDService and TodoWorkflowService.
Handles only HTTP concerns: request/response mapping, authentication, error handling.

Refactored to follow "thin router, thick service" architecture pattern.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import date
import logging

from app.database import get_db
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.schemas.todo import TodoCreate, TodoUpdate, TodoResponse
from app.services.todo_crud_service import todo_crud_service
from app.services.todo_workflow_service import todo_workflow_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", response_model=TodoResponse)
async def create_todo(
    todo_data: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new todo"""
    try:
        return await todo_crud_service.create_todo(db, current_user.uuid, todo_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error creating todo for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create todo: {str(e)}"
        )


@router.get("/", response_model=List[TodoResponse])
async def list_todos(
    status: Optional[str] = Query(None, description="Filter by status"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    project_uuid: Optional[str] = Query(None, description="Filter by project UUID"),
    is_favorite: Optional[bool] = Query(None, description="Filter by favorite status"),
    is_archived: Optional[bool] = Query(None, description="Filter by archived status"),
    due_date_from: Optional[date] = Query(None, description="Filter by due date from"),
    due_date_to: Optional[date] = Query(None, description="Filter by due date to"),
    search: Optional[str] = Query(None, description="Search in title and description"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of todos to return"),
    offset: int = Query(0, ge=0, description="Number of todos to skip"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List todos with filters and pagination"""
    try:
        return await todo_crud_service.list_todos(
            db, current_user.uuid, status, priority, project_uuid, 
            is_favorite, is_archived, due_date_from, due_date_to, 
            search, limit, offset
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error listing todos for user {current_user.uuid}")
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
    """Get single todo with all related data"""
    try:
        return await todo_crud_service.get_todo(db, current_user.uuid, todo_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting todo {todo_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get todo: {str(e)}"
        )


@router.put("/{todo_uuid}", response_model=TodoResponse)
async def update_todo(
    todo_uuid: str,
    update_data: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update todo with validation and status management"""
    try:
        return await todo_crud_service.update_todo(db, current_user.uuid, todo_uuid, update_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating todo {todo_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update todo: {str(e)}"
        )


@router.delete("/{todo_uuid}")
async def delete_todo(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete todo and all associated data"""
    try:
        await todo_crud_service.delete_todo(db, current_user.uuid, todo_uuid)
        return {"message": "Todo deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error deleting todo {todo_uuid}")
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
    """Update todo status with proper validation"""
    try:
        return await todo_crud_service.update_todo_status(db, current_user.uuid, todo_uuid, status_value)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error updating todo status {todo_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update todo status: {str(e)}"
        )


@router.post("/{todo_uuid}/complete", response_model=TodoResponse)
async def complete_todo(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark todo as completed"""
    try:
        return await todo_crud_service.complete_todo(db, current_user.uuid, todo_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error completing todo {todo_uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to complete todo: {str(e)}"
        )


# Workflow endpoints
@router.get("/workflow/overdue", response_model=List[TodoResponse])
async def get_overdue_todos(
    days_overdue: int = Query(0, ge=0, description="Number of days overdue (0 = all overdue)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get todos that are overdue"""
    try:
        return await todo_workflow_service.get_overdue_todos(db, current_user.uuid, days_overdue)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting overdue todos for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get overdue todos: {str(e)}"
        )


@router.get("/workflow/upcoming", response_model=List[TodoResponse])
async def get_upcoming_todos(
    days_ahead: int = Query(7, ge=1, le=30, description="Number of days to look ahead"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get todos that are due in the next N days"""
    try:
        return await todo_workflow_service.get_upcoming_todos(db, current_user.uuid, days_ahead)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting upcoming todos for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get upcoming todos: {str(e)}"
        )


@router.get("/workflow/high-priority", response_model=List[TodoResponse])
async def get_high_priority_todos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get high priority todos that are not completed"""
    try:
        return await todo_workflow_service.get_high_priority_todos(db, current_user.uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting high priority todos for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get high priority todos: {str(e)}"
        )


@router.get("/workflow/analytics/completion")
async def get_completion_analytics(
    days: int = Query(30, ge=7, le=365, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get completion analytics for the user"""
    try:
        return await todo_workflow_service.get_completion_analytics(db, current_user.uuid, days)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting completion analytics for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get completion analytics: {str(e)}"
        )


@router.get("/workflow/insights")
async def get_productivity_insights(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get productivity insights and recommendations"""
    try:
        return await todo_workflow_service.get_productivity_insights(db, current_user.uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting productivity insights for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get productivity insights: {str(e)}"
        )


@router.post("/workflow/auto-update")
async def auto_update_overdue_todos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Automatically update overdue todos (e.g., change priority)"""
    try:
        return await todo_workflow_service.auto_update_overdue_todos(db, current_user.uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error auto-updating overdue todos for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to auto-update overdue todos: {str(e)}"
        )


@router.get("/stats")
async def get_todo_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get todo statistics for user"""
    try:
        return await todo_crud_service.get_todo_stats(db, current_user.uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting todo stats for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get todo stats: {str(e)}"
        )