from pydantic import BaseModel, Field, ConfigDict, field_validator
from pydantic.alias_generators import to_camel
from typing import Optional, List
from datetime import datetime, date

VALID_PRIORITIES = [1, 2, 3, 4]  # 1=low, 2=medium, 3=high, 4=urgent

class CamelCaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

class ProjectBadge(CamelCaseModel):
    """Project badge for displaying project associations on items"""
    id: Optional[int]  # None if project is deleted
    name: str
    color: str
    is_exclusive: bool
    is_deleted: bool  # True if project was deleted (using snapshot name)

class TodoCreate(CamelCaseModel):
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    project_ids: Optional[List[str]] = Field(default_factory=list, max_items=10, description="List of project UUIDs to link this todo to")
    is_exclusive_mode: Optional[bool] = Field(default=False, description="If True, todo is exclusive to projects and deleted when any project is deleted")
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    priority: int = 2
    status: str = "pending"
    order_index: int = 0
    tags: Optional[List[str]] = Field(default_factory=list, max_items=20)
    is_archived: Optional[bool] = False

    @field_validator('priority')
    def validate_priority(cls, v: int):
        if v not in VALID_PRIORITIES:
            raise ValueError('Priority must be 1 (low), 2 (medium), 3 (high), or 4 (urgent)')
        return v

class TodoUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    status: Optional[str] = None
    order_index: Optional[int] = None
    project_ids: Optional[List[str]] = Field(None, max_items=10, description="List of project UUIDs to link this todo to")
    is_exclusive_mode: Optional[bool] = Field(None, description="If True, todo is exclusive to projects and deleted when any project is deleted")
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    priority: Optional[int] = None
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None

    @field_validator('priority')
    def validate_priority(cls, v: Optional[int]):
        if v is not None and v not in VALID_PRIORITIES:
            raise ValueError('Priority must be 1 (low), 2 (medium), 3 (high), or 4 (urgent)')
        return v

class TodoResponse(CamelCaseModel):
    id: int
    uuid: Optional[str] = None
    title: str
    description: Optional[str]
    status: str
    is_archived: bool
    is_favorite: bool
    is_exclusive_mode: bool
    priority: int
    project_uuid: Optional[str]  # Legacy single project
    project_name: Optional[str]  # Legacy single project name
    order_index: int = 0
    parent_id: Optional[int] = None
    subtasks: List['TodoResponse'] = Field(default_factory=list)
    start_date: Optional[date]
    due_date: Optional[date]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this todo belongs to")
    
    @property
    def is_completed(self) -> bool:
        """Computed property: todo is completed if status is 'done'"""
        return self.status == 'done'

class ProjectCreate(CamelCaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    tags: Optional[List[str]] = Field(default=[], max_items=20)

class ProjectResponse(CamelCaseModel):
    id: int
    uuid: Optional[str] = None
    name: str
    description: Optional[str]
    color: Optional[str]
    is_archived: bool
    todo_count: int = 0
    completed_count: int = 0
    tags: List[str] = []
