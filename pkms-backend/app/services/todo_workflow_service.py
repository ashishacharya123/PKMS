"""
Todo Workflow Service

Handles advanced todo workflow features including task dependencies,
workflow automation, due date management, and completion tracking.
"""

import logging
from typing import List, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.config import NEPAL_TZ
from app.models.todo import Todo
from app.models.enums import TodoStatus, TaskPriority
from app.schemas.todo import TodoResponse
from app.services.shared_utilities_service import shared_utilities_service

logger = logging.getLogger(__name__)


class TodoWorkflowService:
    """Service for advanced todo workflow and automation features"""
    
    def __init__(self):
        pass
    
    async def get_overdue_todos(
        self, 
        db: AsyncSession, 
        user_uuid: str,
        days_overdue: int = 0
    ) -> List[TodoResponse]:
        """
        Get todos that are overdue.
        
        Args:
            db: Database session
            user_uuid: User UUID
            days_overdue: Number of days overdue (0 = all overdue)
            
        Returns:
            List of overdue todos
        """
        try:
            today = datetime.now(NEPAL_TZ).date()
            cutoff_date = today - timedelta(days=days_overdue) if days_overdue > 0 else today
            
            result = await db.execute(
                select(Todo)
                .options(selectinload(Todo.tag_objs))  # Eager load tags to avoid N+1
                .where(
                    and_(
                        Todo.created_by == user_uuid,
                        Todo.due_date < cutoff_date,
                        Todo.status.in_([TodoStatus.PENDING, TodoStatus.IN_PROGRESS, TodoStatus.BLOCKED]),  # Include blocked todos - they can be overdue too!
                        Todo.is_archived.is_(False)
                    )
                )
                .order_by(Todo.due_date.asc())
            )
            todos = result.scalars().all()
            
            if not todos:
                return []
            
            # Batch load project badges to avoid N+1 queries
            todo_uuids = [todo.uuid for todo in todos]
            project_badges_map = await shared_utilities_service.batch_get_project_badges_polymorphic(
                db, todo_uuids, 'Todo'
            )
            
            # Convert to response format
            todo_responses = []
            for todo in todos:
                # Calculate days overdue
                days_overdue_count = (today - todo.due_date).days
                
                # Get tags and project badges
                tags = [tag.name for tag in todo.tag_objs] if todo.tag_objs else []
                project_badges = project_badges_map.get(todo.uuid, [])
                
                todo_response = TodoResponse(
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
                    tags=tags,
                    projects=project_badges
                )
                
                # Add metadata
                todo_response.days_overdue = days_overdue_count
                todo_responses.append(todo_response)
            
            return todo_responses
            
        except Exception as e:
            logger.exception(f"Error getting overdue todos for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get overdue todos: {str(e)}"
            )
    
    async def get_upcoming_todos(
        self, 
        db: AsyncSession, 
        user_uuid: str,
        days_ahead: int = 7
    ) -> List[TodoResponse]:
        """
        Get todos that are due in the next N days.
        
        Args:
            db: Database session
            user_uuid: User UUID
            days_ahead: Number of days to look ahead
            
        Returns:
            List of upcoming todos
        """
        try:
            today = datetime.now(NEPAL_TZ).date()
            future_date = today + timedelta(days=days_ahead)
            
            result = await db.execute(
                select(Todo)
                .options(selectinload(Todo.tag_objs))  # Eager load tags to avoid N+1
                .where(
                    and_(
                        Todo.created_by == user_uuid,
                        Todo.due_date >= today,
                        Todo.due_date <= future_date,
                        Todo.status.in_([TodoStatus.PENDING, TodoStatus.IN_PROGRESS, TodoStatus.BLOCKED]),  # Include blocked todos - they can be overdue too!
                        Todo.is_archived.is_(False)
                    )
                )
                .order_by(Todo.due_date.asc())
            )
            todos = result.scalars().all()
            
            if not todos:
                return []
            
            # Batch load project badges to avoid N+1 queries
            todo_uuids = [todo.uuid for todo in todos]
            project_badges_map = await shared_utilities_service.batch_get_project_badges_polymorphic(
                db, todo_uuids, 'Todo'
            )
            
            # Convert to response format
            todo_responses = []
            for todo in todos:
                # Calculate days until due
                days_until_due = (todo.due_date - today).days
                
                # Get tags and project badges
                tags = [tag.name for tag in todo.tag_objs] if todo.tag_objs else []
                project_badges = project_badges_map.get(todo.uuid, [])
                
                todo_response = TodoResponse(
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
                    tags=tags,
                    projects=project_badges
                )
                
                # Add metadata
                todo_response.days_until_due = days_until_due
                todo_responses.append(todo_response)
            
            return todo_responses
            
        except Exception as e:
            logger.exception(f"Error getting upcoming todos for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get upcoming todos: {str(e)}"
            )
    
    async def get_high_priority_todos(
        self, 
        db: AsyncSession, 
        user_uuid: str
    ) -> List[TodoResponse]:
        """Get high priority todos that are not completed"""
        try:
            result = await db.execute(
                select(Todo)
                .options(selectinload(Todo.tag_objs))  # Eager load tags to avoid N+1
                .where(
                    and_(
                        Todo.created_by == user_uuid,
                        Todo.priority == TaskPriority.HIGH.value,
                        Todo.status != TodoStatus.DONE,
                        # Include blocked todos - they can be high priority too!
                        Todo.is_archived == False
                    )
                )
                .order_by(Todo.due_date.asc().nullslast())
            )
            todos = result.scalars().all()
            
            if not todos:
                return []
            
            # Batch load project badges to avoid N+1 queries
            todo_uuids = [todo.uuid for todo in todos]
            project_badges_map = await shared_utilities_service.batch_get_project_badges_polymorphic(
                db, todo_uuids, 'Todo'
            )
            
            # Convert to response format
            todo_responses = []
            for todo in todos:
                # Get tags and project badges
                tags = [tag.name for tag in todo.tag_objs] if todo.tag_objs else []
                project_badges = project_badges_map.get(todo.uuid, [])
                
                todo_response = TodoResponse(
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
                    tags=tags,
                    projects=project_badges
                )
                todo_responses.append(todo_response)
            
            return todo_responses
            
        except Exception as e:
            logger.exception(f"Error getting high priority todos for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get high priority todos: {str(e)}"
            )
    
    async def get_completion_analytics(
        self, 
        db: AsyncSession, 
        user_uuid: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get completion analytics for the user.
        
        Args:
            db: Database session
            user_uuid: User UUID
            days: Number of days to analyze
            
        Returns:
            Dictionary with completion analytics
        """
        try:
            end_date = datetime.now(NEPAL_TZ).date()
            start_date = end_date - timedelta(days=days)
            
            # Get completion counts by day
            completion_counts = await db.execute(
                select(
                    func.date(Todo.completed_at).label('completion_date'),
                    func.count(Todo.uuid).label('count')
                )
                .where(
                    and_(
                        Todo.created_by == user_uuid,
                        Todo.completed_at >= start_date,
                        Todo.completed_at <= end_date
                    )
                )
                .group_by(func.date(Todo.completed_at))
                .order_by(func.date(Todo.completed_at))
            )
            
            # Get total todos created in period
            total_created = await db.scalar(
                select(func.count(Todo.uuid))
                .where(
                    and_(
                        Todo.created_by == user_uuid,
                        Todo.created_at >= start_date,
                        Todo.created_at <= end_date
                    )
                )
            )
            
            # Get total completed in period
            total_completed = await db.scalar(
                select(func.count(Todo.uuid))
                .where(
                    and_(
                        Todo.created_by == user_uuid,
                        Todo.completed_at >= start_date,
                        Todo.completed_at <= end_date
                    )
                )
            )
            
            # Calculate completion rate
            completion_rate = (total_completed / total_created * 100) if total_created > 0 else 0
            
            # Build daily completion data
            daily_completions = {}
            for completion_date, count in completion_counts:
                daily_completions[completion_date.isoformat()] = count
            
            return {
                'period_days': days,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'total_created': total_created or 0,
                'total_completed': total_completed or 0,
                'completion_rate': round(completion_rate, 2),
                'daily_completions': daily_completions,
                'average_daily_completions': round((total_completed or 0) / days, 2)
            }
            
        except Exception as e:
            logger.exception(f"Error getting completion analytics for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get completion analytics: {str(e)}"
            )
    
    async def get_productivity_insights(
        self, 
        db: AsyncSession, 
        user_uuid: str
    ) -> Dict[str, Any]:
        """
        Get productivity insights and recommendations.
        
        Returns:
            Dictionary with productivity insights
        """
        try:
            # Get current stats
            total_todos = await db.scalar(
                select(func.count(Todo.uuid))
                .where(Todo.created_by == user_uuid)
            )
            
            completed_todos = await db.scalar(
                select(func.count(Todo.uuid))
                .where(
                    and_(
                        Todo.created_by == user_uuid,
                        Todo.status == TodoStatus.DONE
                    )
                )
            )
            
            overdue_todos = await db.scalar(
                select(func.count(Todo.uuid))
                .where(
                    and_(
                        Todo.created_by == user_uuid,
                        Todo.due_date < datetime.now(NEPAL_TZ).date(),
                        Todo.status.in_([TodoStatus.PENDING, TodoStatus.IN_PROGRESS])
                    )
                )
            )
            
            high_priority_todos = await db.scalar(
                select(func.count(Todo.uuid))
                .where(
                    and_(
                        Todo.created_by == user_uuid,
                        Todo.priority == TaskPriority.HIGH.value,
                        Todo.status != TodoStatus.DONE
                    )
                )
            )
            
            # Calculate insights
            completion_rate = (completed_todos / total_todos * 100) if total_todos > 0 else 0
            overdue_rate = (overdue_todos / total_todos * 100) if total_todos > 0 else 0
            
            insights = {
                'total_todos': total_todos or 0,
                'completed_todos': completed_todos or 0,
                'overdue_todos': overdue_todos or 0,
                'high_priority_todos': high_priority_todos or 0,
                'completion_rate': round(completion_rate, 2),
                'overdue_rate': round(overdue_rate, 2),
                'recommendations': []
            }
            
            # Generate recommendations
            if overdue_rate > 20:
                insights['recommendations'].append(
                    f"You have {overdue_todos} overdue todos ({overdue_rate:.1f}%). Consider reviewing and updating due dates."
                )
            
            if high_priority_todos > 5:
                insights['recommendations'].append(
                    f"You have {high_priority_todos} high priority todos. Focus on completing these first."
                )
            
            if completion_rate < 50:
                insights['recommendations'].append(
                    f"Your completion rate is {completion_rate:.1f}%. Consider breaking down large tasks into smaller ones."
                )
            
            if completion_rate > 80:
                insights['recommendations'].append(
                    f"Great job! Your completion rate is {completion_rate:.1f}%. Keep up the excellent work!"
                )
            
            return insights
            
        except Exception as e:
            logger.exception(f"Error getting productivity insights for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get productivity insights: {str(e)}"
            )
    
    async def auto_update_overdue_todos(
        self, 
        db: AsyncSession, 
        user_uuid: str
    ) -> Dict[str, Any]:
        """
        Automatically update overdue todos (e.g., change priority, add notifications).
        
        Returns:
            Dictionary with update results
        """
        try:
            today = datetime.now(NEPAL_TZ).date()
            
            # Get overdue todos
            overdue_todos = await db.execute(
                select(Todo)
                .where(
                    and_(
                        Todo.created_by == user_uuid,
                        Todo.due_date < today,
                        Todo.status.in_([TodoStatus.PENDING, TodoStatus.IN_PROGRESS, TodoStatus.BLOCKED]),  # Include blocked todos - they can be overdue too!
                        Todo.is_archived.is_(False)
                    )
                )
            )
            todos = overdue_todos.scalars().all()
            
            updated_count = 0
            for todo in todos:
                # Auto-update logic (example: increase priority for very overdue todos)
                days_overdue = (today - todo.due_date).days
                
                if days_overdue > 7 and todo.priority != TaskPriority.HIGH.value:
                    todo.priority = TaskPriority.HIGH.value
                    updated_count += 1
                    logger.info(f"Auto-updated priority for overdue todo: {todo.title}")
            
            if updated_count > 0:
                await db.commit()
            
            return {
                'overdue_todos_found': len(todos),
                'auto_updated_count': updated_count,
                'message': f"Auto-updated {updated_count} overdue todos"
            }
            
        except Exception as e:
            await db.rollback()
            logger.exception(f"Error auto-updating overdue todos for user {user_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to auto-update overdue todos: {str(e)}"
            )


# Global instance
todo_workflow_service = TodoWorkflowService()
