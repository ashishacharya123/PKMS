from pydantic import BaseModel, Field, ConfigDict, field_validator
from pydantic.alias_generators import to_camel
from typing import List, Optional
from datetime import datetime

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

class NoteCreate(CamelCaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=0, max_length=50000)
    tags: Optional[List[str]] = Field(default_factory=list, max_items=20)
    project_ids: Optional[List[str]] = Field(default_factory=list, max_items=10, description="List of project UUIDs to link this note to")
    is_exclusive_mode: Optional[bool] = Field(default=False, description="If True, note is exclusive to projects and deleted when any project is deleted")

    @field_validator('title')
    def validate_safe_text(cls, v: str):
        from app.utils.security import sanitize_text_input
        return sanitize_text_input(v, max_length=200)

class NoteUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, min_length=0, max_length=50000)
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None
    project_ids: Optional[List[int]] = Field(None, max_items=10, description="List of project IDs to link this note to")
    is_exclusive_mode: Optional[bool] = Field(None, description="If True, note is exclusive to projects and deleted when any project is deleted")

    @field_validator('title')
    def validate_safe_text(cls, v: Optional[str]):
        from app.utils.security import sanitize_text_input
        return sanitize_text_input(v, max_length=200) if v else v

class NoteResponse(CamelCaseModel):
    id: int
    uuid: str
    title: str
    content: str
    file_count: int
    is_favorite: bool
    is_archived: bool
    is_exclusive_mode: bool
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this note belongs to")

class NoteSummary(CamelCaseModel):
    id: int
    uuid: str
    title: str
    file_count: int
    is_favorite: bool
    is_archived: bool
    is_exclusive_mode: bool
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    preview: str
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this note belongs to")

class NoteFileResponse(CamelCaseModel):
    uuid: str
    note_uuid: str
    filename: str
    original_name: str
    file_size: int
    mime_type: str
    description: Optional[str]
    created_at: datetime

class CommitNoteFileRequest(CamelCaseModel):
    file_id: str
    note_uuid: str
    description: Optional[str] = Field(None, max_length=500)
