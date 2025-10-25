"""
Project Schemas for PKMS

Complete schemas for Project model including all fields and relationships.
Used across todos, notes, documents, and archive modules.
"""
from pydantic import Field, field_validator
from typing import Optional, List, Dict, Any, Annotated, Literal
from datetime import datetime, date
from .base import CamelCaseModel

from app.models.enums import ProjectStatus, TaskPriority

# Pydantic v2-compatible list constraints
Tags = Annotated[List[str], Field(max_length=20)]


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
    due_date: Optional[date] = None  # Professional project management feature
    tags: Optional[Tags] = Field(default_factory=list)

    @field_validator('due_date')
    def validate_due_date(cls, v, info):
        if v and 'start_date' in info.data and info.data['start_date']:
            if v < info.data['start_date']:
                raise ValueError('Due date must be after start date')
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
    due_date: Optional[date] = None  # Professional project management feature
    completion_date: Optional[datetime] = None  # When project was actually completed
    tags: Optional[Tags] = None

    @field_validator('completion_date')
    def validate_completion_date(cls, v, info):
        # If provided, completion_date cannot be before start_date
        if v and 'start_date' in info.data and info.data['start_date']:
            start = info.data['start_date']
            try:
                if v.date() < start:
                    raise ValueError('Completion date must be on/after start date')
            except Exception:
                # If v has no date() (unlikely), fall back to direct compare when types match
                if isinstance(v, datetime) and isinstance(start, datetime) and v < start:
                    raise ValueError('Completion date must be on/after start date')
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
    due_date: Optional[date]
    days_remaining: Optional[int]


class ProjectBadge(CamelCaseModel):
    """Project badge for displaying project associations on items"""
    uuid: Optional[str] = None  # None if project is deleted (snapshot)
    name: str
    # color removed - deemed unnecessary for professional project management
    # is_project_exclusive removed - exclusivity now handled via project_items association
    is_deleted: bool  # True if project was deleted (using snapshot name)


class ProjectDuplicateRequest(CamelCaseModel):
    """
    Advanced schema for project duplication with deep/shallow copy support.
    """
    # REQUIRED: User must provide the new project name (solves "prj_a_copy" issue)
    new_project_name: str = Field(..., min_length=1, max_length=255, description="Name for the duplicated project")
    
    # Optional: Description override
    description: Optional[str] = Field(None, description="Description for new project (defaults to original)")
    
    # Duplication mode (solves "shallow vs deep" issue)
    duplication_mode: Literal["shallow_link", "deep_copy"] = Field(
        default="deep_copy",
        description="shallow_link: reuse existing items, deep_copy: create new independent items"
    )
    
    # Item renaming map for deep copies (solves "what name to use" issue)
    item_renames: Dict[str, str] = Field(
        default_factory=dict,
        description="Map of old item UUID to new desired name (for deep copies only)"
    )
    
    # Selective copying options
    include_todos: bool = Field(default=True, description="Include todos in duplication")
    include_notes: bool = Field(default=True, description="Include notes in duplication")
    include_documents: bool = Field(default=True, description="Include documents in duplication")


class ProjectDuplicateResponse(CamelCaseModel):
    """Enhanced response for project duplication with error tracking"""
    original_uuid: str
    duplicate_uuid: str
    name: str
    duplication_mode: str
    items_copied: Dict[str, int] = Field(
        description="Count of items copied by type: {todos: 5, notes: 3, documents: 2}"
    )
    errors: List[str] = Field(
        default_factory=list,
        description="List of any errors encountered during duplication (e.g., 'Note uuid-123 failed to copy: Permission denied')"
    )


# Reorder & Link/Unlink DTOs
class ProjectDocumentsReorderRequest(CamelCaseModel):
    document_uuids: List[str]
    if_unmodified_since: Optional[datetime] = None


class ProjectDocumentsLinkRequest(CamelCaseModel):
    document_uuids: List[str]
    are_items_exclusive: bool = Field(False, description="Apply exclusive flag to these linked items")


class ProjectDocumentUnlinkRequest(CamelCaseModel):
    document_uuid: str


class DocumentDeletePreflightResponse(CamelCaseModel):
    """Response for document delete preflight check"""
    can_delete: bool = Field(..., description="Whether the document can be deleted")
    link_count: int = Field(..., description="Number of projects this document is linked to")
    linked_projects: List[str] = Field(..., description="List of project names this document is linked to")
    warning_message: Optional[str] = Field(None, description="Warning message if document is linked elsewhere")


class NoteDeletePreflightResponse(CamelCaseModel):
    """Response for note delete preflight check"""
    can_delete: bool = Field(..., description="Whether the note can be deleted")
    link_count: int = Field(..., description="Number of projects this note is linked to")
    linked_projects: List[str] = Field(..., description="List of project names this note is linked to")
    warning_message: Optional[str] = Field(None, description="Warning message if note is linked elsewhere")


class TodoDeletePreflightResponse(CamelCaseModel):
    """Response for todo delete preflight check"""
    can_delete: bool = Field(..., description="Whether the todo can be deleted")
    link_count: int = Field(..., description="Number of projects this todo is linked to")
    linked_projects: List[str] = Field(..., description="List of project names this todo is linked to")
    warning_message: Optional[str] = Field(None, description="Warning message if todo is linked elsewhere")


class UnifiedDeletePreflightResponse(CamelCaseModel):
    """Unified response for any item delete preflight check"""
    can_delete: bool = Field(..., description="Whether the item can be deleted")
    link_count: int = Field(..., description="Total number of links across all relationship types")
    linked_items: Dict[str, Dict[str, Any]] = Field(..., description="Detailed breakdown of linked items by type")
    warning_message: Optional[str] = Field(None, description="Human-readable warning message")


class ProjectSectionReorderRequest(CamelCaseModel):
    """Request for reordering sections within a project"""
    section_types: List[Literal["documents", "notes", "todos"]] = Field(..., description="Ordered list of section types")
    
    @field_validator('section_types')
    def validate_section_types(cls, v):
        # Check for duplicates since Literal doesn't prevent duplicates
        if len(v) != len(set(v)):
            raise ValueError("Section types must be unique")
        return v