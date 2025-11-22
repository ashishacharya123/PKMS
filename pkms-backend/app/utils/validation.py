"""Validation utilities for Pydantic models"""

from typing import Optional


def validate_uuid_list(v: Optional[list[str]]) -> Optional[list[str]]:
    """
    Shared validator for UUID list fields.

    Validates that all items in the list are in our custom UUID7 format only.
    The codebase uses custom UUID7 for all primary keys, with format YYYYMMDDHH-XXXXXXXX.
    Returns the list with all items as strings.

    Args:
        v: List of UUID strings to validate, or None

    Returns:
        List of validated UUID strings, or None if input is None/empty

    Raises:
        ValueError: If any item in the list is not in custom UUID7 format
    """
    if not v:
        return v

    import re
    out = []
    for s in v:
        s_str = str(s)

        # Check for custom UUID7 format: YYYYMMDDHH-XXXXXXXX (10 digits + dash + 8 hex chars)
        if re.match(r'^\d{10}-[a-f0-9]{8}$', s_str):
            out.append(s_str)
        else:
            raise ValueError(f"Invalid UUID: {s} (must be in custom UUID7 format YYYYMMDDHH-XXXXXXXX)")
    return out

