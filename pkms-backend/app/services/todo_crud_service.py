"""
Todo CRUD Service

Handles all CRUD operations for todos including creation, reading, updating, deletion,
status management, priority handling, and project associations.
"""

import logging
import uuid as uuid_lib
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, delete, case
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.config import NEPAL_TZ
from app.models.todo import Todo
from app.models.tag import Tag
from app.models.associations import todo_projects
from app.models.enums import ModuleType, TodoStatus, TaskPriority
from app.models.tag_associations import todo_tags
from app.schemas.todo import TodoCreate, TodoUpdate, TodoResponse
from app.schemas.project import ProjectBadge
from app.services.tag_service import tag_service
from app.services.project_service import project_service
from app.services.search_service import search_service
from app.services.dashboard_service import dashboard_service
from app.services.shared_utilities_service import shared_utilities_service

logger = logging.getLogger(__name__)


class TodoCRUDService:
    """Service for todo CRUD operations and management"""
    
    def __init__(self):
        pass
    
    async def create_todo(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        todo_data: TodoCreate
    ) -> TodoResponse:
        """Create a new todo with project associations and tags"""
        try:
            payload = todo_data.model_dump()
            project_ids = payload.pop("project_ids", []) or []
            
            # Create todo
            todo = Todo(**payload, created_by=user_uuid)
            db.add(todo)
            await db.flush()  # Get UUID for associations
            
            # Handle project associations
            if project_ids:
                await project_service.handle_associations(
                    db, todo, project_ids, user_uuid, todo_projects, "todo_uuid"
                )
            
            # Handle tags
            tags = payload.get("tags", [])
            if tags:
                await tag_service.handle_tags(
                    db, todo, tags, user_uuid, ModuleType.TODOS, todo_tags
                )
            
            # Index in search
            await search_service.index_item(db, todo, 'todo')
            await db.commit()
            
            # OPTIMIZED: Use batch badge loading for single item to avoid N+1
            project_badges = await shared_utilities_service.batch_get_project_badges(
                db, [todo.uuid], todo_projects, "todo_uuid"
            )
            project_badges = project_badges.get(todo.uuid, [])
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "todo_created")
            
            logger.info(f"Todo created: {todo.title}")
            return self._convert_todo_to_response(todo, project_badges)
            
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error creating todo for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create todo: {str(e)}"
            )
    
    async def list_todos(
        self, 
        db: AsyncSession, 
        user_uuid: str,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        project_uuid: Optional[str] = None,
        is_favorite: Optional[bool] = None,
        is_archived: Optional[bool] = None,
        due_date_from: Optional[date] = None,
        due_date_to: Optional[date] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[TodoResponse]:
        """List todos with filters and pagination"""
        try:
            # Build query conditions
            cond = and_(Todo.created_by == user_uuid)
            
            if status:
                cond = and_(cond, Todo.status == status)
            
            if priority:
                cond = and_(cond, Todo.priority == priority)
            
            if is_favorite is not None:
                cond = and_(cond, Todo.is_favorite == is_favorite)
            
            if is_archived is not None:
                cond = and_(cond, Todo.is_archived == is_archived)
            
            if due_date_from:
                cond = and_(cond, Todo.due_date >= due_date_from)
            
            if due_date_to:
                cond = and_(cond, Todo.due_date <= due_date_to)
            
            if search:
                cond = and_(cond, or_(
                    Todo.title.ilike(f"%{search}%"),
                    Todo.description.ilike(f"%{search}%")
                ))
            
            if project_uuid:
                # Join with todo_projects to filter by project
                cond = and_(cond, Todo.uuid.in_(
                    select(todo_projects.c.todo_uuid).where(
                        todo_projects.c.project_uuid == project_uuid
                    )
                ))
            
            # Execute query with eager loading for tags
            result = await db.execute(
                select(Todo)
                .options(selectinload(Todo.tag_objs))  # Eager load tags to avoid N+1
                .where(cond)
                .order_by(Todo.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            todos = result.scalars().all()
            
            # BATCH LOAD: Get all project badges in a single query to avoid N+1
            todo_uuids = [todo.uuid for todo in todos]
            project_badges_map = await shared_utilities_service.batch_get_project_badges(db, todo_uuids, todo_projects, "todo_uuid")
            
            # Convert to response format with project badges
            todo_responses = []
            for todo in todos:
                project_badges = project_badges_map.get(todo.uuid, [])
                todo_responses.append(self._convert_todo_to_response(todo, project_badges))
            
            return todo_responses
            
        except Exception as e:
            logger.exception(f"Error listing todos for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list todos: {str(e)}"
            )
    
    async def get_todo(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        todo_uuid: str
    ) -> TodoResponse:
        """Get single todo with all related data"""
        try:
            result = await db.execute(
                select(Todo)
                .options(selectinload(Todo.tag_objs))
                .where(and_(Todo.uuid == todo_uuid, Todo.created_by == user_uuid))
            )
            todo = result.scalar_one_or_none()
            
            if not todo:
                raise HTTPException(status_code=404, detail="Todo not found")
            
            # OPTIMIZED: Use batch badge loading for single item to avoid N+1
            project_badges = await shared_utilities_service.batch_get_project_badges(
                db, [todo.uuid], todo_projects, "todo_uuid"
            )
            project_badges = project_badges.get(todo.uuid, [])
            
            return self._convert_todo_to_response(todo, project_badges)
            
        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Error getting todo {todo_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get todo: {str(e)}"
            )
    
    async def update_todo(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        todo_uuid: str, 
        update_data: TodoUpdate
    ) -> TodoResponse:
        """Update todo with validation and status management"""
        try:
            # Get existing todo
            result = await db.execute(
                select(Todo).where(
                    and_(Todo.uuid == todo_uuid, Todo.created_by == user_uuid)
                )
            )
            todo = result.scalar_one_or_none()
            
            if not todo:
                raise HTTPException(status_code=404, detail="Todo not found")
            
            # Update fields
            update_dict = update_data.model_dump(exclude_unset=True)
            
            # Handle project associations
            if "project_ids" in update_dict:
                project_ids = update_dict.pop("project_ids", []) or []
                
                # Remove existing associations
                await db.execute(
                    delete(todo_projects).where(todo_projects.c.todo_uuid == todo_uuid)
                )
                
                # Add new associations
                if project_ids:
                    await project_service.handle_associations(
                        db, todo, project_ids, user_uuid, todo_projects, "todo_uuid"
                    )
            
            # Handle tags
            if "tags" in update_dict:
                tags = update_dict.pop("tags", [])
                await tag_service.handle_tags(
                    db, todo, tags, user_uuid, ModuleType.TODOS, todo_tags
                )
            
            # Update other fields
            for field, value in update_dict.items():
                if hasattr(todo, field):
                    setattr(todo, field, value)
            
            # Handle status change logic
            if "status" in update_dict:
                await self._handle_status_change(todo, update_dict["status"])
            
            # Update search index
            await search_service.index_item(db, todo, 'todo')
            
            await db.commit()
            await db.refresh(todo)
            
            # OPTIMIZED: Use batch badge loading for single item to avoid N+1
            project_badges = await shared_utilities_service.batch_get_project_badges(
                db, [todo.uuid], todo_projects, "todo_uuid"
            )
            project_badges = project_badges.get(todo.uuid, [])
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "todo_updated")
            
            return self._convert_todo_to_response(todo, project_badges)
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error updating todo {todo_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update todo: {str(e)}"
            )
    
    async def delete_todo(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        todo_uuid: str
    ) -> None:
        """Delete todo and all associated data"""
        try:
            # Get todo to verify ownership
            result = await db.execute(
                select(Todo).where(
                    and_(Todo.uuid == todo_uuid, Todo.created_by == user_uuid)
                )
            )
            todo = result.scalar_one_or_none()
            
            if not todo:
                raise HTTPException(status_code=404, detail="Todo not found")
            
            # Remove from search index
            await search_service.remove_item(db, todo_uuid, 'todo')
            
            # Delete todo (cascade will handle associations)
            await db.execute(delete(Todo).where(Todo.uuid == todo_uuid))
            
            await db.commit()
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "todo_deleted")
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error deleting todo {todo_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete todo: {str(e)}"
            )
    
    async def update_todo_status(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        todo_uuid: str, 
        status_value: str
    ) -> TodoResponse:
        """Update todo status with proper validation"""
        try:
            # Validate status
            if status_value not in [status.value for status in TodoStatus]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status: {status_value}"
                )
            
            # Get todo
            result = await db.execute(
                select(Todo).where(
                    and_(Todo.uuid == todo_uuid, Todo.created_by == user_uuid)
                )
            )
            todo = result.scalar_one_or_none()
            
            if not todo:
                raise HTTPException(status_code=404, detail="Todo not found")
            
            # Update status
            old_status = todo.status
            todo.status = status_value
            
            # Handle status change logic
            await self._handle_status_change(todo, status_value)
            
            # Update search index
            await search_service.index_item(db, todo, 'todo')
            
            await db.commit()
            await db.refresh(todo)
            
            # OPTIMIZED: Use batch badge loading for single item to avoid N+1
            project_badges = await shared_utilities_service.batch_get_project_badges(
                db, [todo.uuid], todo_projects, "todo_uuid"
            )
            project_badges = project_badges.get(todo.uuid, [])
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "todo_status_updated")
            
            logger.info(f"Todo status updated: {todo.title} ({old_status} -> {status_value})")
            return self._convert_todo_to_response(todo, project_badges)
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error updating todo status {todo_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update todo status: {str(e)}"
            )
    
    async def complete_todo(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        todo_uuid: str
    ) -> TodoResponse:
        """Mark todo as completed"""
        return await self.update_todo_status(db, user_uuid, todo_uuid, TodoStatus.DONE.value)
    
    async def get_todo_stats(
        self, 
        db: AsyncSession, 
        user_uuid: str
    ) -> Dict[str, Any]:
        """Get todo statistics for user"""
        try:
            # Get counts by status
            status_counts = await db.execute(
                select(
                    Todo.status,
                    func.count(Todo.uuid).label('count')
                )
                .where(Todo.created_by == user_uuid)
                .group_by(Todo.status)
            )
            
            stats = {
                'total': 0,
                'pending': 0,
                'in_progress': 0,
                'completed': 0,
                'cancelled': 0,
                'overdue': 0
            }
            
            for status, count in status_counts:
                stats[status] = count
                stats['total'] += count
            
            # Count overdue todos
            today = datetime.now(NEPAL_TZ).date()
            overdue_count = await db.scalar(
                select(func.count(Todo.uuid))
                .where(
                    and_(
                        Todo.created_by == user_uuid,
                        Todo.due_date < today,
                        Todo.status.in_([TodoStatus.PENDING.value, TodoStatus.IN_PROGRESS.value])
                    )
                )
            )
            stats['overdue'] = overdue_count or 0
            
            return stats
            
        except Exception as e:
            logger.exception(f"Error getting todo stats for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get todo stats: {str(e)}"
            )
    
    async def _handle_status_change(self, todo: Todo, new_status: str) -> None:
        """Handle status change logic (completion dates, etc.)"""
        if new_status == TodoStatus.DONE.value:
            if not todo.completed_at:
                todo.completed_at = datetime.now(NEPAL_TZ)
        elif todo.completed_at and new_status != TodoStatus.DONE.value:
            # If changing from completed to another status, clear completion date
            todo.completed_at = None
    
    def _convert_todo_to_response(
        self, 
        todo: Todo, 
        project_badges: Optional[List[ProjectBadge]] = None
    ) -> TodoResponse:
        """Convert Todo model to TodoResponse"""
        badges = project_badges or []
        return TodoResponse(
            uuid=todo.uuid,
            title=todo.title,
            description=todo.description,
            status=todo.status,
            priority=todo.priority,
            is_archived=todo.is_archived,
            is_favorite=todo.is_favorite,
            is_project_exclusive=todo.is_project_exclusive,
            is_todo_exclusive=todo.is_todo_exclusive,
            start_date=todo.start_date,
            due_date=todo.due_date,
            created_at=todo.created_at,
            updated_at=todo.updated_at,
            completed_at=todo.completed_at,
            tags=[t.name for t in todo.tag_objs] if todo.tag_objs else [],
            projects=badges
        )




# Global instance
todo_crud_service = TodoCRUDService()
