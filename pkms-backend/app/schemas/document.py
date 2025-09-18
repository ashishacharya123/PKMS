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
    project_id: Optional[int] = None
    archive_item_uuid: Optional[str] = None
    upload_status: str
    created_at: datetime
    updated_at: datetime
    tags: List[str]

class CommitDocumentUploadRequest(CamelCaseModel):
    file_id: str
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    tags: Optional[List[str]] = Field(default=[], max_items=20)
    project_id: Optional[int] = Field(None, description="Associate this document to a project")

    @validator('tags')
    def validate_tags(cls, v):
        from app.utils.security import sanitize_tags
        return sanitize_tags(v or [])

class ArchiveDocumentRequest(CamelCaseModel):
    folder_uuid: str = Field(..., description="UUID of the archive folder to store the document")
    copy_tags: bool = Field(True, description="Whether to copy document tags to the archive item")
