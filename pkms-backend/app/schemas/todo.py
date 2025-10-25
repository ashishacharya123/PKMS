from pydantic import Field, field_validator
from typing import Optional, List
from datetime import datetime, date
from .base import CamelCaseModel

from app.models.enums import TodoStatus, TaskPriority
from app.schemas.project import ProjectBadge


class BlockingTodoSummary(CamelCaseModel):
    """Summary of a todo that's blocking or blocked by this one"""
    uuid: str
    title: str
    status: TodoStatus
    priority: TaskPriority
    is_completed: bool




class TodoCreate(CamelCaseModel):
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    project_uuids: Optional[List[str]] = Field(default_factory=list, max_items=10, description="List of project UUIDs to link this todo to")
    are_projects_exclusive: Optional[bool] = Field(False, description="Apply exclusive flag to all project associations")
    # REMOVED: is_project_exclusive and is_todo_exclusive - exclusivity now handled via project_items association table
    
    # NEW: Set dependencies on creation
    blocked_by_uuids: Optional[List[str]] = Field(
        default_factory=list,
        description="UUIDs of todos that must complete before this one"
    )
    
    @field_validator('project_uuids')
    def validate_project_uuids_are_uuid4(cls, v: Optional[List[str]]):
        if not v:
            return v
        import re
        uuid4 = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        for pid in v:
            if not isinstance(pid, str) or not uuid4.match(pid):
                raise ValueError("project_uuids must contain valid UUID4 strings")
        return v
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    priority: TaskPriority = TaskPriority.MEDIUM


class TodoUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    status: Optional[TodoStatus] = None
    order_index: Optional[int] = None
    project_uuids: Optional[List[str]] = Field(None, max_items=10, description="List of project UUIDs to link this todo to")
    are_projects_exclusive: Optional[bool] = Field(None, description="Apply exclusive flag to all project associations")
    # REMOVED: is_project_exclusive and is_todo_exclusive - exclusivity now handled via project_items association table
    
    # NEW: Modify dependencies
    add_blocker_uuids: Optional[List[str]] = Field(
        None,
        description="UUIDs of todos to add as blockers"
    )
    remove_blocker_uuids: Optional[List[str]] = Field(
        None,
        description="UUIDs of blocking todos to remove"
    )
    
    @field_validator('project_uuids')
    def validate_project_uuids_are_uuid4_update(cls, v: Optional[List[str]]):
        if v is None:
            return v
        import re
        uuid4 = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        for pid in v:
            if not isinstance(pid, str) or not uuid4.match(pid):
                raise ValueError("project_uuids must contain valid UUID4 strings")
        return v
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    priority: Optional[TaskPriority] = None
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None

    @field_validator('priority')
    def validate_priority(cls, v):
        if v is None:
            return v
        if isinstance(v, str):
            return TaskPriority(v)
        elif isinstance(v, TaskPriority):
            return v
        else:
            raise ValueError('Priority must be a TaskPriority enum or string (low, medium, high, urgent)')

class TodoResponse(CamelCaseModel):
    uuid: str
    title: str
    description: Optional[str]
    status: TodoStatus
    is_archived: bool
    is_favorite: bool
    # REMOVED: is_project_exclusive and is_todo_exclusive - exclusivity now handled via project_items association table
    priority: TaskPriority
    project_uuid: Optional[str]  # Single project reference
    project_name: Optional[str]  # Single project name
    order_index: int = 0
    parent_uuid: Optional[str] = None
    subtasks: List['TodoResponse'] = Field(default_factory=list)
    start_date: Optional[date]
    due_date: Optional[date]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this todo belongs to")
    
    # NEW: Dependency info (populated on request)
    blocking_todos: Optional[List[BlockingTodoSummary]] = Field(
        default=None,
        description="Todos I'm blocking (others waiting on me)"
    )
    blocked_by_todos: Optional[List[BlockingTodoSummary]] = Field(
        default=None,
        description="Todos blocking me (I'm waiting on these)"
    )
    blocker_count: int = Field(
        default=0,
        description="Number of incomplete todos blocking this one"
    )
    
    # Time tracking calculated in frontend:
    # estimate_days = (due_date - start_date).days if both exist
    # actual_days = (completion_date - start_date).days if both exist
    
    @property
    def is_completed(self) -> bool:
        """Computed property: todo is completed if status is 'done'"""
        return self.status == TodoStatus.DONE

