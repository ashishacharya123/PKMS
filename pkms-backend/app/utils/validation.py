"""Validation utilities for Pydantic models"""

from typing import Optional


def validate_uuid_list(v: Optional[list[str]]) -> Optional[list[str]]:
    """
    Shared validator for UUID list fields.
    
    Validates that all items in the list are valid UUIDs (supports all versions including UUID7).
    The codebase uses UUID7 for primary keys, but this validator accepts any valid UUID format.
    Returns the list with all items converted to strings.
    
    Args:
        v: List of UUID strings to validate, or None
        
    Returns:
        List of validated UUID strings, or None if input is None/empty
        
    Raises:
        ValueError: If any item in the list is not a valid UUID
    """
    if not v:
        return v
    
    import uuid as _uuid
    out = []
    for s in v:
        try:
            _uuid.UUID(str(s))
            out.append(str(s))
        except ValueError:
            raise ValueError(f"Invalid UUID: {s}")
    return out

