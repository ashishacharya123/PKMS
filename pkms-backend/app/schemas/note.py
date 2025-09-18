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

class NoteCreate(CamelCaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=0, max_length=50000)
    tags: Optional[List[str]] = Field(default=[], max_items=20)

    @validator('title')
    def validate_safe_text(cls, v):
        from app.utils.security import sanitize_text_input
        return sanitize_text_input(v, max_length=200)

class NoteUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, min_length=0, max_length=50000)
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None

    @validator('title')
    def validate_safe_text(cls, v):
        from app.utils.security import sanitize_text_input
        return sanitize_text_input(v, max_length=200) if v else v

class NoteResponse(CamelCaseModel):
    id: int
    uuid: str
    title: str
    content: str
    file_count: int
    is_favorite: bool
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    tags: List[str]

class NoteSummary(CamelCaseModel):
    id: int
    uuid: str
    title: str
    file_count: int
    is_favorite: bool
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    preview: str

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
