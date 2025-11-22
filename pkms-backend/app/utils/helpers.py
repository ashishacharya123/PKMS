"""
Helper utility functions for PKMS
Provides common utility functions used across the application.
"""

from fastapi import Request


def is_preview_request(request: Request) -> bool:
    """
    Check if the request is a preview request based on query parameters.

    This function provides a centralized way to detect preview requests
    that works regardless of the specific URL path or route structure.
    It replaces brittle path-based detection with parameter-based detection.

    Args:
        request: FastAPI request object

    Returns:
        bool: True if this is a preview request, False otherwise

    Example:
        # URLs that will be detected as preview requests:
        # /documents/123/download?preview=true
        # /archive/items/456/download?preview=True
        # /folders/789/download?preview=true
    """
    return request.query_params.get("preview", "").lower() == "true"