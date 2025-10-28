from .base import CamelCaseModel

class TagResponse(CamelCaseModel):
    uuid: str  # ADD
    name: str
    usage_count: int  # ADD (renamed from usageCount for backend consistency)
    # color removed - not needed
    # module_type removed - deleted from model

# TagAutocompleteResponse DELETED - not needed (endpoint returns List[TagResponse] directly)
