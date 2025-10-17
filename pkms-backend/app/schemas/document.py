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

class DocumentCreate(CamelCaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    tags: Optional[List[str]] = Field(default_factory=list, max_items=20)
    
    @field_validator('tags')
    def validate_tags(cls, v):
        from app.utils.security import sanitize_tags
        return sanitize_tags(v or [])

class DocumentUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_favorite: Optional[bool] = None
    is_archived: Optional[bool] = None
    project_ids: Optional[List[str]] = Field(None, max_items=10, description="List of project UUIDs to link this document to")
    @field_validator('project_ids')
    @classmethod
    def _validate_project_ids(cls, v):
        if not v:
            return v
        import uuid as _uuid
        out = []
        for s in v:
            try:
                _uuid.UUID(str(s))
                out.append(str(s))
            except Exception:
                raise ValueError(f"Invalid UUID: {s}")
        return out
    is_exclusive_mode: Optional[bool] = Field(None, description="If True, document is exclusive to projects and deleted when any project is deleted")

class DocumentResponse(CamelCaseModel):
    uuid: str
    title: str
    original_name: str
    filename: str
    file_path: str
    file_size: int
    mime_type: str
    description: Optional[str]
    is_favorite: bool
    is_archived: bool
    is_exclusive_mode: bool
    
    upload_status: str
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this document belongs to")

class CommitDocumentUploadRequest(CamelCaseModel):
    file_id: str
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    tags: Optional[List[str]] = Field(default_factory=list, max_items=20)
    project_ids: List[str] = Field(default_factory=list, max_items=10, description="List of project UUIDs to link this document to")
    is_exclusive_mode: Optional[bool] = Field(default=False, description="If True, document is exclusive to projects and deleted when any project is deleted")

    @field_validator('tags')
    def validate_tags(cls, v):
        from app.utils.security import sanitize_tags
        return sanitize_tags(v or [])
    @field_validator('project_ids')
    @classmethod
    def _validate_project_ids(cls, v):
        if not v:
            return v
        import uuid as _uuid
        out = []
        for s in v:
            try:
                _uuid.UUID(str(s))
                out.append(str(s))
            except Exception:
                raise ValueError(f"Invalid UUID: {s}")
        return out

class ArchiveDocumentRequest(CamelCaseModel):
    """Deprecated: Cross-module archiving removed. Kept for backward compatibility of imports."""
    folder_uuid: str = Field(default="", description="Deprecated")
    copy_tags: bool = Field(default=False, description="Deprecated")
