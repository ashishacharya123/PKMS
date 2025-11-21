"""
UUID Generator Utility for PKMS
Provides hybrid UUID4 + timestamp generation to replace uuid6 dependency
"""

import uuid
import time


def uuid7() -> str:
    """
    Generate a UUID4 with timestamp prefix.

    This replaces uuid6.uuid7() with a lightweight alternative that:
    - Uses native Python uuid module (no compilation required)
    - Adds timestamp prefix for chronological ordering
    - Maintains string format compatibility with existing API
    - Preserves UUID4 randomness for uniqueness

    Returns:
        str: Time-ordered UUID string (e.g., "1700591234567-550e8400-e29b-41d4-a716-446655440000")
    """
    timestamp = int(time.time() * 1000)  # milliseconds precision
    uuid4_part = str(uuid.uuid4())
    return f"{timestamp}-{uuid4_part}"


# For backward compatibility, also expose uuid4
def uuid4() -> str:
    """Generate standard UUID4 string."""
    return str(uuid.uuid4())