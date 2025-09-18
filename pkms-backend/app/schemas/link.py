from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Optional, List
from datetime import datetime

class CamelCaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

class LinkCreate(CamelCaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    url: str = Field(..., min_length=1, max_length=2000)
    description: Optional[str] = Field(None, max_length=1000)
    tags: Optional[List[str]] = Field(default=[], max_items=20)
    is_favorite: Optional[bool] = False
    is_archived: Optional[bool] = False

class LinkUpdate(CamelCaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    url: Optional[str] = Field(None, min_length=1, max_length=2000)
    description: Optional[str] = Field(None, max_length=1000)
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_favorite: Optional[bool] = None
    is_archived: Optional[bool] = None

class LinkResponse(CamelCaseModel):
    id: int
    uuid: str
    title: str
    url: str
    description: Optional[str]
    is_favorite: bool
    is_archived: bool
    created_at: datetime
    tags: List[str]
