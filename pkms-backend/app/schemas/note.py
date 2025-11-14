from pydantic import Field, field_validator
from typing import Optional, List
from datetime import datetime
from .base import CamelCaseModel
from app.schemas.project import ProjectBadge
from app.utils.validation import validate_uuid_list


class NoteCreate(CamelCaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)  # Brief description for FTS5 search
    content: str = Field(..., min_length=0, max_length=50000)  # Character limit - actual 2KB byte limit enforced in service
    tags: Optional[list[str]] = Field(default_factory=list, max_items=20)
    project_uuids: Optional[list[str]] = Field(default_factory=list, max_items=10, description="List of project UUIDs to link this note to")
    are_projects_exclusive: Optional[bool] = Field(False, description="Apply exclusive flag to all project associations")
    force_file_storage: Optional[bool] = Field(False, description="Force content to be saved as file even if small")
    is_template: Optional[bool] = Field(False, description="Mark this note as a template")
    from_template_id: Optional[str] = Field(None, description="UUID of the template this note was created from")

    @field_validator('title', mode='before')
    def validate_safe_text(cls, v: str):
        from app.utils.security import sanitize_text_input
        return sanitize_text_input(v, max_length=200)

    @field_validator('content', mode='after')
    def validate_content_size(cls, v: str):
        """Validate content doesn't exceed 2KB when UTF-8 encoded (larger content stored as file)"""
        MAX_DB_CONTENT_SIZE = 2048  # 2KB threshold
        content_size_bytes = len(v.encode('utf-8'))
        if content_size_bytes > MAX_DB_CONTENT_SIZE * 10:  # Allow up to 20KB for file storage
            raise ValueError(f"Content too large: {content_size_bytes} bytes (max 20KB)")
        return v

    @field_validator('project_uuids')
    def validate_project_uuids(cls, v: Optional[List[str]]):
        return validate_uuid_list(v)

class NoteUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=500)  # Brief description for FTS5 search
    content: Optional[str] = Field(None, min_length=0, max_length=50000)  # Character limit - actual 2KB byte limit enforced in service
    tags: Optional[list[str]] = Field(None, max_items=20)
    force_file_storage: Optional[bool] = Field(None, description="Force content to be saved as file even if small")
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None
    is_template: Optional[bool] = None
    from_template_id: Optional[str] = None
    project_uuids: Optional[list[str]] = Field(None, max_items=10, description="List of project UUIDs to link this note to")
    are_projects_exclusive: Optional[bool] = Field(None, description="Apply exclusive flag to all project associations")

    @field_validator('title', mode='before')
    def validate_safe_text(cls, v: Optional[str]):
        from app.utils.security import sanitize_text_input
        return sanitize_text_input(v, max_length=200) if v else v

    @field_validator('content', mode='after')
    def validate_content_size(cls, v: Optional[str]):
        """Validate content doesn't exceed 20KB when UTF-8 encoded (will be stored as file if > 2KB)"""
        if v is None:
            return v
        MAX_CONTENT_SIZE = 2048 * 10  # 20KB max (2KB for DB, rest goes to file)
        content_size_bytes = len(v.encode('utf-8'))
        if content_size_bytes > MAX_CONTENT_SIZE:
            raise ValueError(f"Content too large: {content_size_bytes} bytes (max 20KB)")
        return v

    @field_validator('project_uuids')
    def validate_project_uuids_update(cls, v: Optional[list[str]]):
        return validate_uuid_list(v)

class NoteResponse(CamelCaseModel):
    uuid: str
    title: str
    content: Optional[str]  # ✅ Allow null for file-backed notes
    contentFilePath: Optional[str] = Field(alias="content_file_path")  # ✅ Expose file path
    fileCount: int = Field(alias="file_count")
    thumbnailPath: Optional[str] = Field(alias="thumbnail_path")  # ✅ ADDED - now exists in Note model
    isFavorite: bool = Field(alias="is_favorite")
    isArchived: bool = Field(alias="is_archived")
    isTemplate: bool = Field(alias="is_template")
    fromTemplateId: Optional[str] = Field(alias="from_template_id")
    createdAt: datetime = Field(alias="created_at")
    updatedAt: datetime = Field(alias="updated_at")
    tags: list[str]
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this note belongs to")
    createdBy: str = Field(alias="created_by")  # ✅ ADDED - User who created the note

class NoteSummary(CamelCaseModel):
    uuid: str
    title: str
    fileCount: int = Field(alias="file_count")
    isFavorite: bool = Field(alias="is_favorite")
    isArchived: bool = Field(alias="is_archived")
    isTemplate: bool = Field(alias="is_template")
    fromTemplateId: Optional[str] = Field(alias="from_template_id")
    createdAt: datetime = Field(alias="created_at")
    updatedAt: datetime = Field(alias="updated_at")
    tags: list[str]
    preview: str
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this note belongs to")
    createdBy: str = Field(alias="created_by")

