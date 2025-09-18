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

class TagResponse(CamelCaseModel):
    name: str
    color: Optional[str]
    module_type: Optional[str]

class TagAutocompleteResponse(CamelCaseModel):
    tags: List[TagResponse]
