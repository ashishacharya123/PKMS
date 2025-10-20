from pydantic import BaseModel, Field, ConfigDict, field_validator
from pydantic.alias_generators import to_camel
from typing import Optional, List
from datetime import datetime, date

from app.models.enums import TodoStatus, TaskPriority
from app.schemas.project import ProjectBadge


class CamelCaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )


class TodoCreate(CamelCaseModel):
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    project_ids: Optional[List[str]] = Field(default_factory=list, max_items=10, description="List of project UUIDs to link this todo to")
    is_project_exclusive: Optional[bool] = Field(default=False, description="If True, todo is exclusive to projects and deleted when any project is deleted")
    is_todo_exclusive: Optional[bool] = Field(default=False, description="If True, todo is exclusive to parent todo (subtask-only)")
    
    @field_validator('project_ids')
    def validate_project_ids_are_uuid4(cls, v: Optional[List[str]]):
        if not v:
            return v
        import re
        uuid4 = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        for pid in v:
            if not isinstance(pid, str) or not uuid4.match(pid):
                raise ValueError("project_ids must contain valid UUID4 strings")
        return v
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    priority: TaskPriority = TaskPriority.MEDIUM

class TodoBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: TodoStatus = TodoStatus.PENDING
    order_index: int = 0
    priority: TaskPriority = TaskPriority.MEDIUM
    tags: Optional[List[str]] = Field(default_factory=list, max_items=20)
    is_archived: Optional[bool] = False

    @field_validator('priority')
    def validate_priority(cls, v):
        if isinstance(v, str):
            return TaskPriority(v)
        elif isinstance(v, TaskPriority):
            return v
        else:
            raise ValueError('Priority must be a TaskPriority enum or string (low, medium, high, urgent)')

class TodoUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    status: Optional[TodoStatus] = None
    order_index: Optional[int] = None
    project_ids: Optional[List[str]] = Field(None, max_items=10, description="List of project UUIDs to link this todo to")
    is_project_exclusive: Optional[bool] = Field(None, description="If True, todo is exclusive to projects and deleted when any project is deleted")
    is_todo_exclusive: Optional[bool] = Field(None, description="If True, todo is exclusive to parent todo (subtask-only)")
    
    @field_validator('project_ids')
    def validate_project_ids_are_uuid4_update(cls, v: Optional[List[str]]):
        if v is None:
            return v
        import re
        uuid4 = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        for pid in v:
            if not isinstance(pid, str) or not uuid4.match(pid):
                raise ValueError("project_ids must contain valid UUID4 strings")
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
    is_project_exclusive: bool
    is_todo_exclusive: bool
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
    
    # Time tracking calculated in frontend:
    # estimate_days = (due_date - start_date).days if both exist
    # actual_days = (completion_date - start_date).days if both exist
    
    @property
    def is_completed(self) -> bool:
        """Computed property: todo is completed if status is 'done'"""
        return self.status == TodoStatus.DONE

