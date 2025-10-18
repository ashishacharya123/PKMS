"""
Unified Upload Schemas for PKMS

Base schemas that provide consistent validation and structure
across all upload modules while allowing module-specific extensions.

This eliminates schema duplication and provides a unified interface for upload requests.
"""

from pydantic import BaseModel, Field, validator
from pydantic.alias_generators import to_camel
from typing import List, Optional
from datetime import datetime

from app.utils.security import sanitize_tags


class CamelCaseModel(BaseModel):
    """Base model with camelCase conversion."""
    model_config = {
        "alias_generator": to_camel,
        "populate_by_name": True,
        "from_attributes": True
    }


class BaseCommitUploadRequest(CamelCaseModel):
    """Base schema for all upload commit requests."""
    file_id: str = Field(..., description="Upload ID from chunk manager")
    description: Optional[str] = Field(None, max_length=1000, description="File description")
    display_order: Optional[int] = Field(0, ge=0, description="Order of display (0 = first)")
    tags: Optional[List[str]] = Field(default_factory=list, max_items=20, description="Tags for the uploaded file")

    @validator('tags')
    def validate_tags(cls, v):
        return sanitize_tags(v or [])


class DocumentCommitUploadRequest(BaseCommitUploadRequest):
    """Extended schema for document uploads."""
    title: str = Field(..., min_length=1, max_length=255, description="Document title")
    project_ids: Optional[List[str]] = Field(default_factory=list, max_items=10, description="Project UUIDs to link this document to")
    is_exclusive_mode: Optional[bool] = Field(False, description="If True, document is exclusive to projects and deleted when any project is deleted")

    @validator('project_ids')
    def validate_project_ids(cls, v):
        if not v:
            return v
        import re
        uuid4 = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
        for pid in v:
            if not isinstance(pid, str) or not uuid4.match(pid):
                raise ValueError("project_ids must contain valid UUID4 strings")
        return v


class NoteCommitUploadRequest(BaseCommitUploadRequest):
    """Extended schema for note file uploads."""
    note_uuid: str = Field(..., description="UUID of the note to attach file to")


class ArchiveCommitUploadRequest(BaseCommitUploadRequest):
    """Extended schema for archive uploads."""
    name: Optional[str] = Field(None, max_length=255, description="Display name for the archive item")
    folder_uuid: Optional[str] = Field(None, description="UUID of parent folder")


class DiaryCommitUploadRequest(BaseCommitUploadRequest):
    """Extended schema for diary media uploads."""
    entry_id: str = Field(..., description="UUID of the diary entry")
    media_type: str = Field(..., description="Media type: photo, video, voice")

    @validator('media_type')
    def validate_media_type(cls, v):
        valid_types = ["photo", "video", "voice"]
        if v not in valid_types:
            raise ValueError(f"media_type must be one of: {valid_types}")
        return v


class UploadStatusResponse(CamelCaseModel):
    """Response schema for upload status checks."""
    upload_id: str
    status: str
    progress: Optional[float] = None
    chunks_total: Optional[int] = None
    chunks_completed: Optional[int] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    error: Optional[str] = None


class UnifiedCommitResponse(CamelCaseModel):
    """Unified response schema for all upload commits."""
    success: bool
    message: str
    upload_id: str
    file_uuid: str
    module: str

    # Module-specific fields
    document_uuid: Optional[str] = None
    note_file_uuid: Optional[str] = None
    archive_item_uuid: Optional[str] = None
    diary_media_uuid: Optional[str] = None