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
    uuid: Optional[str] = None  # None if project is deleted (snapshot)
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

    @field_validator('project_ids')
    def validate_project_ids_are_uuid4(cls, v: Optional[List[str]]):
        if not v:
            return v
        import re
        uuid4_regex = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        for pid in v:
            if not isinstance(pid, str) or not uuid4_regex.match(pid):
                raise ValueError("project_ids must contain valid UUID4 strings")
        return v

class NoteUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, min_length=0, max_length=50000)
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None
    project_ids: Optional[List[str]] = Field(None, max_items=10, description="List of project UUIDs to link this note to")
    is_exclusive_mode: Optional[bool] = Field(None, description="If True, note is exclusive to projects and deleted when any project is deleted")

    @field_validator('title')
    def validate_safe_text(cls, v: Optional[str]):
        from app.utils.security import sanitize_text_input
        return sanitize_text_input(v, max_length=200) if v else v

    @field_validator('project_ids')
    def validate_project_ids_are_uuid4_update(cls, v: Optional[List[str]]):
        if v is None:
            return v
        import re
        uuid4_regex = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        for pid in v:
            if not isinstance(pid, str) or not uuid4_regex.match(pid):
                raise ValueError("project_ids must contain valid UUID4 strings")
        return v

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
