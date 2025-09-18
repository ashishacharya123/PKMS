from pydantic import BaseModel, Field, validator, ConfigDict
from pydantic.alias_generators import to_camel
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import json

class CamelCaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

class EncryptionSetupRequest(CamelCaseModel):
    password: str
    hint: Optional[str] = None

class EncryptionUnlockRequest(CamelCaseModel):
    password: str

class DiaryEntryCreate(CamelCaseModel):
    date: date
    nepali_date: Optional[str] = None
    title: Optional[str] = Field(None, max_length=255)
    encrypted_blob: str
    encryption_iv: str
    encryption_tag: str
    mood: Optional[int] = Field(None, ge=1, le=5)
    metadata: Optional[Dict[str, Any]] = {}
    is_template: Optional[bool] = False
    tags: Optional[List[str]] = []

class DiaryEntryResponse(CamelCaseModel):
    uuid: str
    id: int
    date: date
    nepali_date: Optional[str]
    title: Optional[str]
    encrypted_blob: str
    encryption_iv: str
    encryption_tag: str
    mood: Optional[int]
    metadata: Dict[str, Any]
    is_template: bool
    created_at: datetime
    updated_at: datetime
    media_count: int
    tags: List[str] = []

    @validator('metadata', pre=True)
    def parse_metadata_json(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

class DiaryEntrySummary(CamelCaseModel):
    uuid: str
    id: int
    date: date
    nepali_date: Optional[str]
    title: Optional[str]
    mood: Optional[int]
    is_template: bool
    created_at: datetime
    media_count: int
    encrypted_blob: str
    encryption_iv: str
    encryption_tag: str
    metadata: Dict[str, Any]
    tags: List[str] = []
    
    @validator('metadata', pre=True)
    def parse_metadata_json(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v
        
class DiaryCalendarData(CamelCaseModel):
    date: str
    mood: Optional[int]
    has_entry: bool
    media_count: int

class MoodStats(CamelCaseModel):
    average_mood: Optional[float]
    mood_distribution: Dict[int, int]
    total_entries: int

class DiaryMediaResponse(CamelCaseModel):
    uuid: str
    entry_id: int
    filename_encrypted: str
    mime_type: str
    size_bytes: int
    media_type: str
    duration_seconds: Optional[int]
    created_at: datetime

class DiaryMediaUpload(CamelCaseModel):
    caption: Optional[str] = Field(None, max_length=500)
    media_type: str = Field(..., description="Type: photo, video, voice")
    
    @validator('media_type')
    def validate_media_type(cls, v):
        allowed_types = ['photo', 'video', 'voice']
        if v not in allowed_types:
            raise ValueError(f"Media type must be one of: {', '.join(allowed_types)}")
        return v

class CommitDiaryMediaRequest(CamelCaseModel):
    file_id: str
    entry_id: int
    caption: Optional[str] = None
    media_type: str = Field(..., description="Type: photo, video, voice")
    
    @validator('media_type')
    def validate_media_type(cls, v):
        allowed_types = ['photo', 'video', 'voice']
        if v not in allowed_types:
            raise ValueError(f"Media type must be one of: {', '.join(allowed_types)}")
        return v
