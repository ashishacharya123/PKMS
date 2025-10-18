"""
Project Schemas for PKMS

Complete schemas for Project model including all fields and relationships.
Used across todos, notes, documents, and archive modules.
"""
from pydantic import BaseModel, Field, ConfigDict, field_validator
from pydantic.alias_generators import to_camel
from typing import Optional, List
from datetime import datetime, date

from app.models.enums import ProjectStatus, TaskPriority


class CamelCaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )


class ProjectCreate(CamelCaseModel):
    """Schema for creating a new project"""
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    # color and icon removed - deemed unnecessary for professional project management
    sort_order: Optional[int] = Field(default=0)
    status: Optional[ProjectStatus] = Field(default=ProjectStatus.IS_RUNNING)
    priority: TaskPriority = Field(default=TaskPriority.MEDIUM)
    is_archived: Optional[bool] = Field(default=False)
    is_favorite: Optional[bool] = Field(default=False)
    progress_percentage: Optional[int] = Field(default=0, ge=0, le=100)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    due_date: Optional[date] = None  # Professional project management feature
    tags: Optional[List[str]] = Field(default_factory=list, max_items=20)

    @field_validator('end_date')
    def validate_end_date(cls, v, info):
        if v and 'start_date' in info.data and info.data['start_date']:
            if v < info.data['start_date']:
                raise ValueError('End date must be after start date')
        return v

    @field_validator('due_date')
    def validate_due_date(cls, v, info):
        if v and 'start_date' in info.data and info.data['start_date']:
            if v < info.data['start_date']:
                raise ValueError('Due date must be after start date')
        if v and 'end_date' in info.data and info.data['end_date']:
            if v > info.data['end_date']:
                raise ValueError('Due date must be before end date')
        return v


class ProjectUpdate(CamelCaseModel):
    """Schema for updating an existing project"""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    # color and icon removed - deemed unnecessary for professional project management
    sort_order: Optional[int] = None
    status: Optional[ProjectStatus] = None
    priority: Optional[TaskPriority] = None
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None
    progress_percentage: Optional[int] = Field(None, ge=0, le=100)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    due_date: Optional[date] = None  # Professional project management feature
    completion_date: Optional[datetime] = None  # When project was actually completed
    tags: Optional[List[str]] = Field(None, max_items=20)

    @field_validator('end_date')
    def validate_end_date(cls, v, info):
        if v and 'start_date' in info.data and info.data['start_date']:
            if v < info.data['start_date']:
                raise ValueError('End date must be after start date')
        return v


class ProjectResponse(CamelCaseModel):
    """Schema for project API responses"""
    uuid: str
    name: str
    description: Optional[str]
    # color and icon removed - deemed unnecessary for professional project management
    sort_order: int
    status: ProjectStatus
    priority: TaskPriority
    is_archived: bool
    is_favorite: bool
    is_deleted: bool
    progress_percentage: int
    start_date: Optional[date]
    end_date: Optional[date]
    due_date: Optional[date]  # Professional project management feature
    completion_date: Optional[datetime]  # When project was actually completed
    created_by: str
    created_at: datetime
    updated_at: datetime
    
    # Computed fields
    todo_count: int = Field(default=0)
    completed_count: int = Field(default=0)
    document_count: int = Field(default=0)
    note_count: int = Field(default=0)
    tag_count: int = Field(default=0)
    actual_progress: int = Field(default=0)  # Calculated from todos
    days_remaining: Optional[int] = None  # Days until end_date
    
    # Relationships
    tags: List[str] = Field(default_factory=list)


class ProjectSummary(CamelCaseModel):
    """Schema for project summary/statistics"""
    uuid: str
    name: str
    status: ProjectStatus
    progress_percentage: int
    actual_progress: int
    todo_count: int
    completed_todos: int
    document_count: int
    note_count: int
    tag_count: int
    start_date: Optional[date]
    end_date: Optional[date]
    days_remaining: Optional[int]


class ProjectBadge(CamelCaseModel):
    """Project badge for displaying project associations on items"""
    uuid: Optional[str] = None  # None if project is deleted (snapshot)
    name: str
    # color removed - deemed unnecessary for professional project management
    is_exclusive: bool
    is_deleted: bool  # True if project was deleted (using snapshot name)


class ProjectDuplicateRequest(CamelCaseModel):
    """Schema for project duplication requests"""
    name_suffix: str = Field(default="Copy", max_length=50)
    include_associated_items: bool = Field(default=False, description="Whether to copy associated todos, documents, notes")


class ProjectDuplicateResponse(CamelCaseModel):
    """Schema for project duplication responses"""
    original_uuid: str
    new_uuid: str
    name: str
    items_copied: int = 0
    message: str