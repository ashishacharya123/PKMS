"""
Todo Management Router for PKMS

Thin router that delegates all business logic to TodoCRUDService and TodoWorkflowService.
Handles only HTTP concerns: request/response mapping, authentication, error handling.

Refactored to follow "thin router, thick service" architecture pattern.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from typing import List, Optional
from datetime import date
import logging

from app.database import get_db
from app.models.user import User
from app.models.todo import Todo
from app.auth.dependencies import get_current_user
from app.schemas.todo import TodoCreate, TodoUpdate, TodoResponse
from app.services.todo_crud_service import todo_crud_service
from app.services.todo_workflow_service import todo_workflow_service
from app.services.todo_dependency_service import todo_dependency_service

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
        logger.exception("Error creating todo for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create todo"
        ) from e


@router.get("/", response_model=List[TodoResponse])
async def list_todos(
    todo_status: Optional[str] = Query(None, description="Filter by status"),
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
            db, current_user.uuid, todo_status, priority, project_uuid,
            is_favorite, is_archived, due_date_from, due_date_to,
            search, limit, offset
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error listing todos for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list todos"
        )


@router.get("/deleted", response_model=List[TodoResponse])
async def list_deleted_todos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List deleted todos for Recycle Bin."""
    try:
        return await todo_crud_service.list_deleted_todos(db, current_user.uuid)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error listing deleted todos")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list deleted todos"
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
    except Exception:
        logger.exception("Error getting todo %s", todo_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get todo"
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
    except Exception:
        logger.exception("Error updating todo %s", todo_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update todo"
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
    except Exception:
        logger.exception("Error deleting todo %s", todo_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete todo"
        )

@router.post("/{todo_uuid}/restore")
async def restore_todo(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Restore a soft-deleted todo from Recycle Bin."""
    try:
        await todo_crud_service.restore_todo(db, current_user.uuid, todo_uuid)
        return {"message": "Todo restored successfully"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error restoring todo %s", todo_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to restore todo"
        )

@router.delete("/{todo_uuid}/permanent")
async def hard_delete_todo(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete todo (hard delete) - WARNING: Cannot be undone!"""
    try:
        await todo_crud_service.hard_delete_todo(db, current_user.uuid, todo_uuid)
        return {"message": "Todo permanently deleted"}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error permanently deleting todo %s", todo_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to permanently delete todo"
        )


@router.patch("/{todo_uuid}/status", response_model=TodoResponse)
async def update_todo_status(
    todo_uuid: str,
    status_value: str = Body(..., embed=True, description="New status value"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update todo status with proper validation"""
    try:
        return await todo_crud_service.update_todo_status(db, current_user.uuid, todo_uuid, status_value)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error updating todo status %s", todo_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update todo status"
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
    except Exception:
        logger.exception("Error completing todo %s", todo_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete todo"
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
    except Exception:
        logger.exception("Error getting overdue todos for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get overdue todos"
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
    except Exception:
        logger.exception("Error getting upcoming todos for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get upcoming todos"
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
    except Exception:
        logger.exception("Error getting high priority todos for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get high priority todos"
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
    except Exception:
        logger.exception("Error getting completion analytics for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get completion analytics"
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
    except Exception:
        logger.exception("Error getting productivity insights for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get productivity insights"
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
    except Exception:
        logger.exception("Error auto-updating overdue todos for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to auto-update overdue todos"
        )


@router.post("/{todo_uuid}/duplicate", response_model=TodoResponse)
async def duplicate_todo(
    todo_uuid: str,
    new_title: Optional[str] = Query(None, description="Optional new title for the duplicated todo"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Duplicate a single todo.
    
    - Creates a new, independent todo
    - Status reset to PENDING (fresh start)
    - NO dependencies (clean placeholder)
    - Original description, priority, tags copied
    - Can optionally provide a new title
    """
    from app.services.duplication_service import duplication_service
    
    try:
        # Use the same _deep_copy_todo helper from duplication_service
        renames = {todo_uuid: new_title} if new_title else {}
        new_todo_uuid = await duplication_service._deep_copy_todo(
            db=db,
            user_uuid=current_user.uuid,
            old_todo_uuid=todo_uuid,
            renames=renames
        )
        
        # Return the new todo
        return await todo_crud_service.get_todo(db, current_user.uuid, new_todo_uuid)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error duplicating todo {todo_uuid} for user {current_user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to duplicate todo: {str(e)}"
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
    except Exception:
        logger.exception("Error getting todo stats for user %s", current_user.uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get todo stats"
        )


# Dependency Management Endpoints

@router.post("/{todo_uuid}/dependencies/{blocker_uuid}")
async def add_dependency(
    todo_uuid: str,
    blocker_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Add a dependency: blocker_uuid must complete before todo_uuid can proceed"""
    try:
        await todo_dependency_service.add_dependency(
            db, todo_uuid, blocker_uuid, current_user.uuid
        )
        return {"message": "Dependency added successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        logger.exception("Error adding dependency")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add dependency"
        )


@router.delete("/{todo_uuid}/dependencies/{blocker_uuid}")
async def remove_dependency(
    todo_uuid: str,
    blocker_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove a dependency between todos"""
    try:
        await todo_dependency_service.remove_dependency(
            db, todo_uuid, blocker_uuid
        )
        return {"message": "Dependency removed successfully"}
    except Exception:
        logger.exception("Error removing dependency")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to remove dependency"
        )


@router.get("/{todo_uuid}/blocking")
async def get_blocking_todos(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get todos that this todo is blocking (others waiting on this one)"""
    try:
        blocking_todos = await todo_dependency_service.get_blocking_todos(
            db, todo_uuid
        )
        return {"blocking_todos": blocking_todos}
    except Exception:
        logger.exception("Error getting blocking todos")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get blocking todos"
        )


@router.get("/{todo_uuid}/blocked-by")
async def get_blocked_by_todos(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get todos that are blocking this one (this todo is waiting on these)"""
    try:
        blocked_todos = await todo_dependency_service.get_blocked_todos(
            db, todo_uuid
        )
        return {"blocked_by_todos": blocked_todos}
    except Exception:
        logger.exception("Error getting blocked todos")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get blocked todos"
        )


@router.patch("/{parent_uuid}/subtasks/reorder")
async def reorder_subtasks(
    parent_uuid: str,
    subtask_uuids: List[str] = Body(..., description="List of subtask UUIDs in new order"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reorder subtasks for a parent todo"""
    try:
        # Verify parent todo exists and user owns it
        parent_result = await db.execute(
            select(Todo).where(
                and_(Todo.uuid == parent_uuid, Todo.created_by == current_user.uuid)
            )
        )
        parent_todo = parent_result.scalar_one_or_none()
        
        if not parent_todo:
            raise HTTPException(status_code=404, detail="Parent todo not found")
        
        # Verify all subtasks exist and belong to the parent
        subtask_result = await db.execute(
            select(Todo).where(
                and_(
                    Todo.uuid.in_(subtask_uuids),
                    Todo.parent_uuid == parent_uuid,
                    Todo.created_by == current_user.uuid
                )
            )
        )
        existing_subtasks = {todo.uuid: todo for todo in subtask_result.scalars().all()}
        
        if len(existing_subtasks) != len(subtask_uuids):
            missing_uuids = set(subtask_uuids) - set(existing_subtasks.keys())
            raise HTTPException(
                status_code=400, 
                detail=f"Some subtasks not found or don't belong to parent: {missing_uuids}"
            )
        
        # Update sort_order for each subtask
        for index, subtask_uuid in enumerate(subtask_uuids):
            await db.execute(
                update(Todo)
                .where(Todo.uuid == subtask_uuid)
                .values(order_index=index)
            )
        
        await db.commit()
        
        return {"message": "Subtasks reordered successfully"}
        
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.exception("Error reordering subtasks for parent %s", parent_uuid)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reorder subtasks"
        )