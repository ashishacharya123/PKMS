from pydantic import Field, field_validator
from typing import Optional, List
from datetime import datetime
import re
from .base import CamelCaseModel

# UUID4 regex pattern - hoisted to module scope for performance
UUID4_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")

from app.schemas.project import ProjectBadge


class NoteCreate(CamelCaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)  # Brief description for FTS5 search
    content: str = Field(..., min_length=0, max_length=50000)
    tags: Optional[list[str]] = Field(default_factory=list, max_items=20)
    project_uuids: Optional[list[str]] = Field(default_factory=list, max_items=10, description="List of project UUIDs to link this note to")
    are_projects_exclusive: Optional[bool] = Field(False, description="Apply exclusive flag to all project associations")
    force_file_storage: Optional[bool] = Field(False, description="Force content to be saved as file even if small")

    @field_validator('title', mode='before')
    def validate_safe_text(cls, v: str):
        from app.utils.security import sanitize_text_input
        return sanitize_text_input(v, max_length=200)

    @field_validator('project_uuids')
    def validate_project_uuids_are_uuid4(cls, v: Optional[List[str]]):
        if not v:
            return v
        for pid in v:
            if not isinstance(pid, str) or not UUID4_RE.match(pid):
                raise ValueError("project_uuids must contain valid UUID4 strings")
        return v

class NoteUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)  # Brief description for FTS5 search
    content: Optional[str] = Field(None, min_length=0, max_length=50000)
    tags: Optional[list[str]] = Field(None, max_items=20)
    force_file_storage: Optional[bool] = Field(None, description="Force content to be saved as file even if small")
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None
    project_uuids: Optional[list[str]] = Field(None, max_items=10, description="List of project UUIDs to link this note to")
    are_projects_exclusive: Optional[bool] = Field(None, description="Apply exclusive flag to all project associations")

    @field_validator('title', mode='before')
    def validate_safe_text(cls, v: Optional[str]):
        from app.utils.security import sanitize_text_input
        return sanitize_text_input(v, max_length=200) if v else v

    @field_validator('project_uuids')
    def validate_project_uuids_are_uuid4_update(cls, v: Optional[list[str]]):
        if v is None:
            return v
        for pid in v:
            if not isinstance(pid, str) or not UUID4_RE.match(pid):
                raise ValueError("project_uuids must contain valid UUID4 strings")
        return v

class NoteResponse(CamelCaseModel):
    uuid: str
    title: str
    content: str
    fileCount: int = Field(alias="file_count")
    thumbnailPath: Optional[str] = Field(alias="thumbnail_path")  # ✅ ADDED - now exists in Note model
    isFavorite: bool = Field(alias="is_favorite")
    isArchived: bool = Field(alias="is_archived")
    # REMOVED: is_project_exclusive - exclusivity now handled in project_items association
    createdAt: datetime = Field(alias="created_at")
    updatedAt: datetime = Field(alias="updated_at")
    tags: list[str]
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this note belongs to")

class NoteSummary(CamelCaseModel):
    uuid: str
    title: str
    fileCount: int = Field(alias="file_count")
    isFavorite: bool = Field(alias="is_favorite")
    isArchived: bool = Field(alias="is_archived")
    # REMOVED: is_project_exclusive - exclusivity now handled in project_items association
    createdAt: datetime = Field(alias="created_at")
    updatedAt: datetime = Field(alias="updated_at")
    tags: list[str]
    preview: str
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this note belongs to")

# NoteFile schemas removed - notes now use Document + note_documents association
# Use Document schemas instead for file operations
