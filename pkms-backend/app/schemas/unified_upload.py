"""
Unified Upload Schemas for PKMS

Base schemas that provide consistent validation and structure
across all upload modules while allowing module-specific extensions.

This eliminates schema duplication and provides a unified interface for upload requests.
"""

from pydantic import BaseModel, Field, field_validator
from pydantic.alias_generators import to_camel
from pydantic.types import UUID4
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
    file_id: UUID4 = Field(..., description="Upload ID from chunk manager")
    description: Optional[str] = Field(None, max_length=1000, description="File description")
    display_order: int = Field(0, ge=0, description="Order of display (0 = first)")
    tags: List[str] = Field(default_factory=list, description="Tags for the uploaded file")

    @field_validator('tags', mode='before')
    def validate_tags(cls, v):
        sanitized = sanitize_tags(v or [])
        # Enforce/truncate to 20 items
        return sanitized[:20] if len(sanitized) > 20 else sanitized


class DocumentCommitUploadRequest(BaseCommitUploadRequest):
    """Extended schema for document uploads."""
    title: str = Field(..., min_length=1, max_length=255, description="Document title")
    project_ids: List[UUID4] = Field(default_factory=list, description="Project UUIDs to link this document to")
    is_project_exclusive: Optional[bool] = Field(False, description="If True, document is exclusive to projects and deleted when any project is deleted")

    @field_validator('project_ids', mode='before')
    def validate_project_ids(cls, v):
        if not v:
            return []
        # Convert strings to UUID4 objects and validate
        validated_ids = []
        for pid in v:
            if isinstance(pid, str):
                try:
                    validated_ids.append(UUID4(pid))
                except ValueError:
                    raise ValueError(f"Invalid UUID4 format: {pid}")
            elif isinstance(pid, UUID4):
                validated_ids.append(pid)
            else:
                raise ValueError("project_ids must contain valid UUID4 strings")
        return validated_ids


class NoteCommitUploadRequest(BaseCommitUploadRequest):
    """Extended schema for note file uploads."""
    note_uuid: UUID4 = Field(..., description="UUID of the note to attach file to")


class ArchiveCommitUploadRequest(BaseCommitUploadRequest):
    """Extended schema for archive uploads."""
    name: Optional[str] = Field(None, max_length=255, description="Display name for the archive item")
    folder_uuid: Optional[UUID4] = Field(None, description="UUID of parent folder")


class DiaryCommitUploadRequest(BaseCommitUploadRequest):
    """Extended schema for diary file uploads."""
    entry_id: UUID4 = Field(..., description="UUID of the diary entry")
    file_type: str = Field(..., description="File type: photo, video, voice")

    @field_validator('file_type', mode='before')
    def validate_file_type(cls, v):
        valid_types = ["photo", "video", "voice"]
        if v not in valid_types:
            raise ValueError(f"file_type must be one of: {valid_types}")
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
    diary_file_uuid: Optional[str] = None