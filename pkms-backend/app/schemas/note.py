from pydantic import BaseModel, Field, ConfigDict, field_validator
from pydantic.alias_generators import to_camel
from typing import List, Optional
from datetime import datetime
import re

# UUID4 regex pattern - hoisted to module scope for performance
UUID4_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")

from app.schemas.project import ProjectBadge

class CamelCaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )


class NoteCreate(CamelCaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)  # Brief description for FTS5 search
    content: str = Field(..., min_length=0, max_length=50000)
    tags: Optional[List[str]] = Field(default_factory=list, max_items=20)
    project_ids: Optional[List[str]] = Field(default_factory=list, max_items=10, description="List of project UUIDs to link this note to")
    # is_project_exclusive removed - exclusivity now handled via project_items association

    @field_validator('title')
    def validate_safe_text(cls, v: str):
        from app.utils.security import sanitize_text_input
        return sanitize_text_input(v, max_length=200)

    @field_validator('project_ids')
    def validate_project_ids_are_uuid4(cls, v: Optional[List[str]]):
        if not v:
            return v
        from app.schemas.note import UUID4_RE as uuid4_regex
        for pid in v:
            if not isinstance(pid, str) or not uuid4_regex.match(pid):
                raise ValueError("project_ids must contain valid UUID4 strings")
        return v

class NoteUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)  # Brief description for FTS5 search
    content: Optional[str] = Field(None, min_length=0, max_length=50000)
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None
    project_ids: Optional[List[str]] = Field(None, max_items=10, description="List of project UUIDs to link this note to")
    is_project_exclusive: Optional[bool] = Field(None, description="If True, note is exclusive to projects and deleted when any project is deleted")

    @field_validator('title')
    def validate_safe_text(cls, v: Optional[str]):
        from app.utils.security import sanitize_text_input
        return sanitize_text_input(v, max_length=200) if v else v

    @field_validator('project_ids')
    def validate_project_ids_are_uuid4_update(cls, v: Optional[List[str]]):
        if v is None:
            return v
        from app.schemas.note import UUID4_RE as uuid4_regex
        for pid in v:
            if not isinstance(pid, str) or not uuid4_regex.match(pid):
                raise ValueError("project_ids must contain valid UUID4 strings")
        return v

class NoteResponse(CamelCaseModel):
    uuid: str
    title: str
    content: str
    file_count: int
    thumbnail_path: Optional[str]  # ✅ ADDED - now exists in Note model
    is_favorite: bool
    is_archived: bool
    is_project_exclusive: bool
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this note belongs to")

class NoteSummary(CamelCaseModel):
    uuid: str
    title: str
    file_count: int
    is_favorite: bool
    is_archived: bool
    is_project_exclusive: bool
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    preview: str
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this note belongs to")

# NoteFile schemas removed - notes now use Document + note_documents association
# Use Document schemas instead for file operations
