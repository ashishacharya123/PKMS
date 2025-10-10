from pydantic import BaseModel, Field, validator, ConfigDict
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

class DocumentCreate(CamelCaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    tags: Optional[List[str]] = Field(default=[], max_items=20)
    
    @validator('tags')
    def validate_tags(cls, v):
        from app.utils.security import sanitize_tags
        return sanitize_tags(v or [])

class DocumentUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_favorite: Optional[bool] = None
    is_archived: Optional[bool] = None
    project_ids: Optional[List[int]] = Field(None, max_items=10, description="List of project IDs to link this document to")
    is_exclusive_mode: Optional[bool] = Field(None, description="If True, document is exclusive to projects and deleted when any project is deleted")

class DocumentResponse(CamelCaseModel):
    id: int
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
    project_id: Optional[int] = None  # Legacy single project
    archive_item_uuid: Optional[str] = None
    upload_status: str
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    projects: List[ProjectBadge] = Field(default=[], description="Projects this document belongs to")

class CommitDocumentUploadRequest(CamelCaseModel):
    file_id: str
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    tags: Optional[List[str]] = Field(default=[], max_items=20)
    project_id: Optional[int] = Field(None, description="Legacy: Associate this document to a single project")
    project_ids: Optional[List[int]] = Field(default=[], max_items=10, description="List of project IDs to link this document to")
    is_exclusive_mode: Optional[bool] = Field(default=False, description="If True, document is exclusive to projects and deleted when any project is deleted")

    @validator('tags')
    def validate_tags(cls, v):
        from app.utils.security import sanitize_tags
        return sanitize_tags(v or [])

class ArchiveDocumentRequest(CamelCaseModel):
    folder_uuid: str = Field(..., description="UUID of the archive folder to store the document")
    copy_tags: bool = Field(True, description="Whether to copy document tags to the archive item")
