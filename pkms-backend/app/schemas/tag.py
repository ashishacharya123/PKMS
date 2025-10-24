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
    uuid: str  # ADD
    name: str
    usage_count: int  # ADD (renamed from usageCount for backend consistency)
    # color removed - not needed
    # module_type removed - deleted from model

# TagAutocompleteResponse DELETED - not needed (endpoint returns List[TagResponse] directly)
