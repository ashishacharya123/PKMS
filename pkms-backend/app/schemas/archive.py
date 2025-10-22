from pydantic import BaseModel, Field, validator, ConfigDict
from pydantic.alias_generators import to_camel
from typing import List, Optional, Dict, Any
from datetime import datetime

class CamelCaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

class FolderCreate(CamelCaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    parent_uuid: Optional[str] = None

    @validator('name')
    def validate_name(cls, v):
        from app.utils.security import sanitize_folder_name
        return sanitize_folder_name(v)

    @validator('description')
    def validate_description(cls, v):
        if v is None:
            return v
        from app.utils.security import sanitize_description
        return sanitize_description(v)

    @validator('parent_uuid')
    def validate_parent_uuid(cls, v):
        if v is None:
            return v
        from app.utils.security import validate_uuid_format
        return validate_uuid_format(v)

class FolderUpdate(CamelCaseModel):
    # Optional updates - only include fields you want to change
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_favorite: Optional[bool] = None
    parent_uuid: Optional[str] = None

    @validator('name')
    def validate_name(cls, v):
        if v is not None:
            from app.utils.security import sanitize_folder_name
            return sanitize_folder_name(v)
        return v

    @validator('description')
    def validate_description(cls, v):
        if v is not None:
            from app.utils.security import sanitize_description
            return sanitize_description(v)
        return v

    @validator('parent_uuid')
    def validate_parent_uuid(cls, v):
        if v is not None:
            from app.utils.security import validate_uuid_format
            return validate_uuid_format(v)
        return v

class ItemUpdate(CamelCaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    folder_uuid: Optional[str] = None
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_favorite: Optional[bool] = None

    @validator('name')
    def validate_name(cls, v):
        if v is None:
            return v
        from app.utils.security import sanitize_filename
        return sanitize_filename(v)

    @validator('description')
    def validate_description(cls, v):
        if v is None:
            return v
        from app.utils.security import sanitize_description
        return sanitize_description(v)

    @validator('folder_uuid')
    def validate_folder_uuid(cls, v):
        if v is None:
            return v
        from app.utils.security import validate_uuid_format
        return validate_uuid_format(v)

    @validator('tags')
    def validate_tags(cls, v):
        if v is None:
            return v
        from app.utils.security import sanitize_tags
        return sanitize_tags(v)

class FolderResponse(CamelCaseModel):
    uuid: str
    name: str
    description: Optional[str]
    parent_uuid: Optional[str]
    path: str  # Display path
    display_path: Optional[str] = None  # Human-readable path
    filesystem_path: Optional[str] = None  # UUID-based path for debugging
    depth: int  # Folder depth in hierarchy
    created_at: datetime
    updated_at: datetime
    item_count: int
    subfolder_count: int
    total_size: int

class ItemResponse(CamelCaseModel):
    uuid: str
    name: str
    description: Optional[str]
    folder_uuid: str
    original_filename: str
    stored_filename: str
    file_path: str
    mime_type: str
    file_size: int
    metadata: Dict[str, Any]
    thumbnail_path: Optional[str]  # ✅ ADDED - now exists in ArchiveItem model
    is_favorite: bool
    # version field removed - doesn't exist in ArchiveItem model
    created_at: datetime
    updated_at: datetime
    tags: List[str]

class ItemSummary(CamelCaseModel):
    uuid: str
    name: str
    folder_uuid: str
    original_filename: str
    mime_type: str
    file_size: int
    is_favorite: bool
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    preview: str

class FolderTree(CamelCaseModel):
    folder: FolderResponse
    children: List['FolderTree']
    items: List[ItemSummary]

class BulkMoveRequest(CamelCaseModel):
    destination_folder_uuid: str = Field(..., description="Destination folder UUID")
    folder_uuids: List[str] = Field(default_factory=list, description="List of folder UUIDs to move")
    item_uuids: List[str] = Field(default_factory=list, description="List of item UUIDs to move")

class CommitUploadRequest(CamelCaseModel):
    file_id: str
    folder_uuid: str
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = []
