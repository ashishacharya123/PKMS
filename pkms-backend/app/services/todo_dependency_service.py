"""
Todo Dependency Service
Manages blocking relationships and auto-updates BLOCKED status
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_, insert, func
from typing import List, Dict, Set
from app.models.todo import Todo
from app.models.associations import todo_dependencies
from app.models.enums import TodoStatus
import logging

logger = logging.getLogger(__name__)

class TodoDependencyService:
    """Service for managing todo dependencies and auto-updating blocked status"""
    
    async def add_dependency(
        self,
        db: AsyncSession,
        blocked_todo_uuid: str,
        blocking_todo_uuid: str,
        user_uuid: str
    ) -> None:
        """
        Add a dependency: blocking_todo must complete before blocked_todo can proceed.
        Auto-sets blocked_todo.status to BLOCKED if blocking_todo is incomplete.
        
        Args:
            blocked_todo_uuid: Todo that is blocked (waiting)
            blocking_todo_uuid: Todo that is blocking (must complete first)
            user_uuid: Owner (for verification)
        
        Raises:
            ValueError: If todos don't exist, user doesn't own them, self-dependency, or circular dependency
        """
        # Verify both todos exist and belong to user
        result = await db.execute(
            select(Todo.uuid)
            .where(
                and_(
                    Todo.uuid.in_([blocked_todo_uuid, blocking_todo_uuid]),
                    Todo.created_by == user_uuid,
                    Todo.is_deleted.is_(False)
                )
            )
        )
        found_uuids = {row[0] for row in result.fetchall()}
        if len(found_uuids) != 2:
            raise ValueError("Both todos must exist and belong to user")
        
        # Prevent self-dependency
        if blocked_todo_uuid == blocking_todo_uuid:
            raise ValueError("Todo cannot depend on itself")
        
        # Check for circular dependencies
        if await self._would_create_cycle(db, blocked_todo_uuid, blocking_todo_uuid):
            raise ValueError("Would create circular dependency")
        
        # Check if dependency already exists
        existing = await db.execute(
            select(todo_dependencies.c.blocked_todo_uuid)
            .where(
                and_(
                    todo_dependencies.c.blocked_todo_uuid == blocked_todo_uuid,
                    todo_dependencies.c.blocking_todo_uuid == blocking_todo_uuid
                )
            )
        )
        if existing.scalar_one_or_none():
            return  # Already exists, idempotent
        
        # Add dependency
        await db.execute(
            insert(todo_dependencies).values(
                blocked_todo_uuid=blocked_todo_uuid,
                blocking_todo_uuid=blocking_todo_uuid,
                dependency_type='blocks'
            )
        )
        
        # Auto-update blocked status
        await self._update_blocked_status(db, blocked_todo_uuid)
        
        await db.commit()
    
    async def remove_dependency(
        self,
        db: AsyncSession,
        blocked_todo_uuid: str,
        blocking_todo_uuid: str
    ) -> None:
        """Remove a dependency and potentially unblock the todo"""
        await db.execute(
            delete(todo_dependencies).where(
                and_(
                    todo_dependencies.c.blocked_todo_uuid == blocked_todo_uuid,
                    todo_dependencies.c.blocking_todo_uuid == blocking_todo_uuid
                )
            )
        )
        
        # Auto-update blocked status (might unblock)
        await self._update_blocked_status(db, blocked_todo_uuid)
        
        await db.commit()
    
    async def get_blocking_todos(
        self,
        db: AsyncSession,
        todo_uuid: str
    ) -> List[Dict]:
        """Get all todos blocking this one (I'm waiting on these)"""
        result = await db.execute(
            select(
                Todo.uuid,
                Todo.title,
                Todo.status,
                Todo.priority
            )
            .join(
                todo_dependencies,
                Todo.uuid == todo_dependencies.c.blocking_todo_uuid
            )
            .where(
                and_(
                    todo_dependencies.c.blocked_todo_uuid == todo_uuid,
                    Todo.is_deleted.is_(False)
                )
            )
        )
        
        blocking_todos = []
        for row in result.fetchall():
            blocking_todos.append({
                "uuid": row[0],
                "title": row[1],
                "status": row[2],
                "priority": row[3],
                "is_completed": row[2] == TodoStatus.DONE
            })
        
        return blocking_todos
    
    async def get_blocked_todos(
        self,
        db: AsyncSession,
        todo_uuid: str
    ) -> List[Dict]:
        """Get all todos this one is blocking (others waiting on me)"""
        result = await db.execute(
            select(
                Todo.uuid,
                Todo.title,
                Todo.status,
                Todo.priority
            )
            .join(
                todo_dependencies,
                Todo.uuid == todo_dependencies.c.blocked_todo_uuid
            )
            .where(
                and_(
                    todo_dependencies.c.blocking_todo_uuid == todo_uuid,
                    Todo.is_deleted.is_(False)
                )
            )
        )
        
        blocked_todos = []
        for row in result.fetchall():
            blocked_todos.append({
                "uuid": row[0],
                "title": row[1],
                "status": row[2],
                "priority": row[3],
                "is_completed": row[2] == TodoStatus.DONE
            })
        
        return blocked_todos
    
    async def _update_blocked_status(
        self,
        db: AsyncSession,
        todo_uuid: str
    ) -> None:
        """
        Auto-update todo status:
        - Set to BLOCKED if has incomplete blocking todos
        - Set to PENDING if was BLOCKED but no incomplete blockers remain
        """
        # Count incomplete blocking todos
        result = await db.execute(
            select(func.count(Todo.uuid))
            .join(
                todo_dependencies,
                Todo.uuid == todo_dependencies.c.blocking_todo_uuid
            )
            .where(
                and_(
                    todo_dependencies.c.blocked_todo_uuid == todo_uuid,
                    Todo.status.not_in([TodoStatus.DONE, TodoStatus.CANCELLED]),
                    Todo.is_deleted.is_(False)
                )
            )
        )
        
        incomplete_count = result.scalar() or 0
        
        # Get current todo
        todo_result = await db.execute(
            select(Todo).where(Todo.uuid == todo_uuid)
        )
        todo = todo_result.scalar_one_or_none()
        
        if not todo:
            return
        
        # Auto-update status based on blocker count
        if incomplete_count > 0:
            # Has incomplete blockers → set to BLOCKED (unless already DONE/CANCELLED)
            if todo.status not in [TodoStatus.DONE, TodoStatus.CANCELLED]:
                todo.status = TodoStatus.BLOCKED
                logger.info(f"Todo {todo_uuid} auto-blocked ({incomplete_count} blockers)")
        else:
            # No incomplete blockers → unblock if currently BLOCKED
            if todo.status == TodoStatus.BLOCKED:
                todo.status = TodoStatus.PENDING
                logger.info(f"Todo {todo_uuid} auto-unblocked (no blockers)")
    
    async def _would_create_cycle(
        self,
        db: AsyncSession,
        blocked_todo_uuid: str,
        blocking_todo_uuid: str
    ) -> bool:
        """
        Check if adding this dependency would create a cycle using DFS.
        
        Example cycle:
        A blocks B, B blocks C, C blocks A (cycle!)
        """
        # Build adjacency list of all dependencies
        result = await db.execute(
            select(
                todo_dependencies.c.blocked_todo_uuid,
                todo_dependencies.c.blocking_todo_uuid
            )
        )
        
        graph: Dict[str, Set[str]] = {}
        for row in result.fetchall():
            blocked, blocking = row
            if blocked not in graph:
                graph[blocked] = set()
            graph[blocked].add(blocking)
        
        # Add proposed edge temporarily
        if blocked_todo_uuid not in graph:
            graph[blocked_todo_uuid] = set()
        graph[blocked_todo_uuid].add(blocking_todo_uuid)
        
        # DFS to detect cycle
        visited = set()
        rec_stack = set()
        
        def has_cycle(node: str) -> bool:
            visited.add(node)
            rec_stack.add(node)
            
            if node in graph:
                for neighbor in graph[node]:
                    if neighbor not in visited:
                        if has_cycle(neighbor):
                            return True
                    elif neighbor in rec_stack:
                        return True  # Back edge = cycle!
            
            rec_stack.remove(node)
            return False
        
        return has_cycle(blocked_todo_uuid)

# Global instance
todo_dependency_service = TodoDependencyService()
