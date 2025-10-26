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
from sqlalchemy import select, and_, or_, func, delete, case, update
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.config import NEPAL_TZ
from app.models.todo import Todo
from app.models.tag import Tag
from app.models.associations import project_items
from app.models.project import Project
from sqlalchemy import insert, delete
from app.models.enums import ModuleType, TodoStatus, TaskPriority
from app.models.tag_associations import todo_tags
from app.schemas.todo import TodoCreate, TodoUpdate, TodoResponse
from app.schemas.project import ProjectBadge
from app.services.tag_service import tag_service
from app.services.project_service import project_service
from app.services.search_service import search_service
from app.services.dashboard_service import dashboard_service
from app.services.shared_utilities_service import shared_utilities_service
from app.services.todo_dependency_service import todo_dependency_service

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
            project_uuids = payload.pop("project_uuids", []) or []
            are_projects_exclusive = payload.pop("are_projects_exclusive", False)
            
            # Create todo
            todo = Todo(**payload, created_by=user_uuid)
            db.add(todo)
            await db.flush()  # Get UUID for associations
            
            # Handle project associations using polymorphic project_items
            if project_uuids:
                # Verify user owns all projects
                projects_result = await db.execute(
                    select(Project).where(
                        and_(
                            Project.active_only(),  # Auto-excludes soft-deleted
                            Project.uuid.in_(project_uuids),
                            Project.created_by == user_uuid
                        )
                    )
                )
                owned_projects = projects_result.scalars().all()
                owned_project_uuids = {p.uuid for p in owned_projects}
                
                invalid_uuids = set(project_uuids) - owned_project_uuids
                if invalid_uuids:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid or inaccessible project UUIDs: {list(invalid_uuids)}"
                    )
                
                # Insert into polymorphic project_items table
                for idx, project_uuid in enumerate(project_uuids):
                    await db.execute(
                        insert(project_items).values(
                            project_uuid=project_uuid,
                            item_type='Todo',  # Polymorphic discriminator
                            item_uuid=todo.uuid,
                            is_exclusive=are_projects_exclusive,
                            sort_order=idx
                        )
                    )
            
            # Handle tags
            tags = payload.get("tags", [])
            if tags:
                await tag_service.handle_tags(
                    db, todo, tags, user_uuid, ModuleType.TODOS, todo_tags
                )
            
            # Handle dependencies if provided
            blocked_by_uuids = payload.get("blocked_by_uuids", [])
            if blocked_by_uuids:
                for blocker_uuid in blocked_by_uuids:
                    try:
                        await todo_dependency_service.add_dependency(
                            db,
                            blocked_todo_uuid=todo.uuid,
                            blocking_todo_uuid=blocker_uuid,
                            user_uuid=user_uuid
                        )
                    except ValueError as e:
                        logger.warning(f"Failed to add dependency: {e}")
            
            # Index in search
            await search_service.index_item(db, todo, 'todo')
            await db.commit()
            
            # OPTIMIZED: Use batch badge loading for single item to avoid N+1
            project_badges = await shared_utilities_service.batch_get_project_badges_polymorphic(
                db, [todo.uuid], 'Todo'
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
                # Join with project_items to filter by project
                cond = and_(cond, Todo.uuid.in_(
                    select(project_items.c.item_uuid).where(
                        and_(
                            project_items.c.project_uuid == project_uuid,
                            project_items.c.item_type == 'Todo'
                        )
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
            project_badges_map = await shared_utilities_service.batch_get_project_badges_polymorphic(db, todo_uuids, 'Todo')
            
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
    
    async def list_deleted_todos(
        self, 
        db: AsyncSession, 
        user_uuid: str
    ) -> List[TodoResponse]:
        """List soft-deleted todos for Recycle Bin."""
        try:
            query = select(Todo).where(
                and_(
                    Todo.deleted_only(),
                    Todo.created_by == user_uuid
                )
            )
            query = query.options(selectinload(Todo.tag_objs))
            result = await db.execute(query.order_by(Todo.updated_at.desc()))
            todos = result.scalars().all()
            
            responses = []
            for todo in todos:
                responses.append(self._convert_todo_to_response(todo, [], None, None))
            
            return responses
            
        except Exception as e:
            logger.exception(f"Error listing deleted todos for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to list deleted todos: {str(e)}"
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
            project_badges = await shared_utilities_service.batch_get_project_badges_polymorphic(
                db, [todo.uuid], 'Todo'
            )
            project_badges = project_badges.get(todo.uuid, [])
            
            # Load dependency info
            blocking_todos = await todo_dependency_service.get_blocking_todos(db, todo.uuid)
            blocked_todos = await todo_dependency_service.get_blocked_todos(db, todo.uuid)
            
            return self._convert_todo_to_response(todo, project_badges, blocking_todos, blocked_todos)
            
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
            if "project_uuids" in update_dict:
                project_uuids = update_dict.pop("project_uuids", []) or []
                are_projects_exclusive = update_dict.pop("are_projects_exclusive", False)

                # Handle project associations using polymorphic project_items
                if project_uuids is not None:  # Allow clearing with empty list
                    # Delete existing associations for this todo
                    await db.execute(
                        delete(project_items).where(
                            and_(
                                project_items.c.item_type == 'Todo',
                                project_items.c.item_uuid == todo.uuid
                            )
                        )
                    )
                    
                    if project_uuids:  # If not empty, add new associations
                        # Verify ownership
                        projects_result = await db.execute(
                            select(Project).where(
                                and_(
                                    Project.uuid.in_(project_uuids),
                                    Project.created_by == user_uuid,
                                    Project.is_deleted.is_(False)
                                )
                            )
                        )
                        owned_projects = projects_result.scalars().all()
                        owned_project_uuids = {p.uuid for p in owned_projects}
                        
                        invalid_uuids = set(project_uuids) - owned_project_uuids
                        if invalid_uuids:
                            raise HTTPException(
                                status_code=400,
                                detail=f"Invalid or inaccessible project UUIDs"
                            )
                        
                        # Insert new associations
                        for idx, project_uuid in enumerate(project_uuids):
                            await db.execute(
                                insert(project_items).values(
                                    project_uuid=project_uuid,
                                    item_type='Todo',
                                    item_uuid=todo.uuid,
                                    is_exclusive=are_projects_exclusive,
                                    sort_order=idx
                                )
                            )
            
            # Handle tags
            if "tags" in update_dict:
                tags = update_dict.pop("tags", [])
                await tag_service.handle_tags(
                    db, todo, tags, user_uuid, ModuleType.TODOS, todo_tags
                )
            
            # Handle dependency modifications
            if "add_blocker_uuids" in update_dict:
                add_blocker_uuids = update_dict.pop("add_blocker_uuids", [])
                if add_blocker_uuids:
                    for blocker_uuid in add_blocker_uuids:
                        try:
                            await todo_dependency_service.add_dependency(
                                db, todo.uuid, blocker_uuid, user_uuid
                            )
                        except ValueError as e:
                            logger.warning(f"Failed to add blocker: {e}")
            
            if "remove_blocker_uuids" in update_dict:
                remove_blocker_uuids = update_dict.pop("remove_blocker_uuids", [])
                if remove_blocker_uuids:
                    for blocker_uuid in remove_blocker_uuids:
                        await todo_dependency_service.remove_dependency(
                            db, todo.uuid, blocker_uuid
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
            project_badges = await shared_utilities_service.batch_get_project_badges_polymorphic(
                db, [todo.uuid], 'Todo'
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
        """Delete todo and all associated data (soft delete with cascading to subtasks)"""
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
            
            # Preflight check: Determine if todo is main todo or subtask
            is_subtask = todo.parent_uuid is not None
            
            if is_subtask:
                # For subtasks: Check if parent todo exists and warn about impact
                parent_result = await db.execute(
                    select(Todo).where(Todo.uuid == todo.parent_uuid)
                )
                parent_todo = parent_result.scalar_one_or_none()
                if parent_todo:
                    logger.info(f"Deleting subtask '{todo.title}' from parent '{parent_todo.title}'")
            else:
                # For main todos: Check if it has subtasks
                subtask_count_result = await db.execute(
                    select(func.count(Todo.uuid)).where(
                        and_(
                            Todo.active_only(),  # Auto-excludes soft-deleted
                            Todo.parent_uuid == todo_uuid
                        )
                    )
                )
                subtask_count = subtask_count_result.scalar() or 0
                
                if subtask_count > 0:
                    logger.warning("Deleting main todo '%s' with %d subtasks - cascading delete to children", todo.title, subtask_count)
                    # Soft delete all subtasks as well (cascading delete)
                    await db.execute(
                        update(Todo)
                        .where(and_(Todo.parent_uuid == todo_uuid, Todo.is_deleted.is_(False)))
                        .values(is_deleted=True, updated_at=datetime.now(NEPAL_TZ))
                    )
                
                # Check project associations
                # project_items.c.item_uuid means: access the 'item_uuid' column of the project_items table
                # The '.c' is SQLAlchemy's column accessor for Table objects (c = columns)
                # Note: We count by item_uuid instead of id due to actual database schema (model vs db mismatch)
                project_count_result = await db.execute(
                    select(func.count(project_items.c.item_uuid)).where(
                        and_(
                            project_items.c.item_type == 'Todo',      # c.item_type = item_type column
                            project_items.c.item_uuid == todo_uuid    # c.item_uuid = item_uuid column
                        )
                    )
                )
                project_count = project_count_result.scalar() or 0
                
                if project_count > 0:
                    logger.info(f"Todo '{todo.title}' is linked to {project_count} project(s)")
                    # Project associations will be automatically removed by cascade
            
            # TODO: Add file cleanup for associated documents
            # Check if todo has associated documents and clean up files
            
            # Remove from search index
            search_service.remove_item(db, todo_uuid)
            
            # Soft delete todo (consistent with other services)
            todo.is_deleted = True
            db.add(todo)
            
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

    async def restore_todo(self, db: AsyncSession, user_uuid: str, todo_uuid: str):
        """
        Restores a soft-deleted todo. SIMPLE operation.
        All associations are still intact, just flip the flag.
        """
        # 1. Get soft-deleted todo
        result = await db.execute(
            select(Todo).where(
                and_(
                    Todo.deleted_only(),  # Only soft-deleted
                    Todo.uuid == todo_uuid,
                    Todo.created_by == user_uuid
                )
            )
        )
        todo = result.scalar_one_or_none()
        if not todo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deleted todo not found")
        
        # 2. Flip flag
        todo.is_deleted = False
        todo.updated_at = datetime.now(NEPAL_TZ)
        await db.add(todo)
        
        # 3. Commit
        await db.commit()
        
        # 4. Re-index in search
        await search_service.index_item(db, todo, 'todo')
        dashboard_service.invalidate_user_cache(user_uuid, "todo_restored")
        logger.info(f"Todo restored: {todo.title}")

    async def hard_delete_todo(
        self, 
        db: AsyncSession, 
        user_uuid: str, 
        todo_uuid: str
    ) -> None:
        """Permanently delete todo (hard delete) - WARNING: Cannot be undone!"""
        try:
            # Check link count
            from app.services.association_counter_service import association_counter_service
            link_count = await association_counter_service.get_todo_link_count(db, todo_uuid)
            if link_count > 0:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN, 
                    detail=f"Todo still linked to {link_count} projects"
                )
            
            result = await db.execute(
                select(Todo).where(
                    and_(Todo.uuid == todo_uuid, Todo.created_by == user_uuid, Todo.is_deleted.is_(True))
                )
            )
            todo = result.scalar_one_or_none()
            
            if not todo:
                raise HTTPException(status_code=404, detail="Deleted todo not found")
            
            # Delete all subtasks first (cascade delete)
            subtasks_result = await db.execute(
                select(Todo).where(
                    and_(
                        Todo.parent_uuid == todo_uuid,
                        Todo.created_by == user_uuid
                    )
                )
            )
            subtasks = subtasks_result.scalars().all()
            
            for subtask in subtasks:
                # Remove subtask from search index
                await search_service.remove_item(db, subtask.uuid, 'todo')
                # Delete subtask record
                await db.delete(subtask)
                logger.info(f"Deleted subtask '{subtask.title}' (parent: {todo.title})")
            
            # Remove from search index
            await search_service.remove_item(db, todo_uuid, 'todo')
            
            # Hard delete main todo record
            await db.delete(todo)
            
            await db.commit()
            
            # Invalidate dashboard cache
            dashboard_service.invalidate_user_cache(user_uuid, "todo_hard_deleted")
            
        except HTTPException:
            raise
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error hard deleting todo {todo_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to hard delete todo: {str(e)}"
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
            project_badges = await shared_utilities_service.batch_get_project_badges_polymorphic(
                db, [todo.uuid], 'Todo'
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
        project_badges: Optional[List[ProjectBadge]] = None,
        blocking_todos: Optional[List[Dict]] = None,
        blocked_todos: Optional[List[Dict]] = None
    ) -> TodoResponse:
        """Convert Todo model to TodoResponse"""
        badges = project_badges or []
        blocking_list = blocking_todos or []
        blocked_list = blocked_todos or []
        
        return TodoResponse(
            uuid=todo.uuid,
            title=todo.title,
            description=todo.description,
            status=todo.status,
            priority=todo.priority,
            is_archived=todo.is_archived,
            is_favorite=todo.is_favorite,
            # REMOVED: is_project_exclusive and is_todo_exclusive - now handled via project_items
            start_date=todo.start_date,
            due_date=todo.due_date,
            created_at=todo.created_at,
            updated_at=todo.updated_at,
            completed_at=todo.completed_at,
            tags=[t.name for t in todo.tag_objs] if todo.tag_objs else [],
            projects=badges,
            # NEW: Dependency info
            blocking_todos=blocking_list if blocking_list else None,
            blocked_by_todos=blocked_list if blocked_list else None,
            blocker_count=len([b for b in blocked_list if not b.get('is_completed', False)])
        )




# Global instance
todo_crud_service = TodoCRUDService()
