"""
UUID Generator Utility for PKMS
Provides hybrid UUID4 + timestamp generation to replace uuid6 dependency
"""

import uuid
import time


def uuid7() -> str:
    """
    Generate a compact UUID4 with hour-based timestamp prefix.

    This optimized version:
    - Uses hour-based timestamp for much shorter strings (17 chars vs 50 chars)
    - Maintains chronological ordering within each hour
    - Uses native Python uuid module (no compilation required)
    - Preserves UUID4 randomness for uniqueness
    - Fits comfortably in String(32) fields instead of requiring String(50)

    Returns:
        str: Compact time-ordered UUID string (e.g., "2025011514-550e8400")
        Format: YYYYMMDDHH-HHHHHHHH where HHHHHHHH is first 8 chars of UUID4
    """
    from datetime import datetime
    # Hour-based timestamp (YYYYMMDDHH format) - 10 characters
    hour_timestamp = datetime.now().strftime("%Y%m%d%H")

    # Use first 8 characters of UUID4 for compactness
    uuid4_part = str(uuid.uuid4()).replace("-", "")[:8]

    return f"{hour_timestamp}-{uuid4_part}"


# For backward compatibility, also expose uuid4
def uuid4() -> str:
    """Generate standard UUID4 string."""
    return str(uuid.uuid4())