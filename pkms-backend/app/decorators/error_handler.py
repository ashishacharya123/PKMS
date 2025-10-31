"""
API Error Handler Decorator

Standardized error handling for all API endpoints with automatic logging
and consistent error responses.
"""

import logging
from functools import wraps
from typing import Callable, Any
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


def handle_api_errors(operation_name: str, status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR):
  """
  Decorator for consistent API error handling.

  Args:
      operation_name: Human-readable operation description (e.g., "creating note")
      status_code: HTTP status code to return on error (default: 500)
  """
  def decorator(func: Callable) -> Callable:
    @wraps(func)
    async def wrapper(*args, **kwargs) -> Any:
      try:
        return await func(*args, **kwargs)
      except HTTPException:
        # Re-raise HTTP exceptions as-is (already properly formatted)
        raise
      except Exception as e:
        # Extract user information for logging
        user_uuid = 'unknown'
        if 'current_user' in kwargs:
          try:
            user_uuid = getattr(kwargs['current_user'], 'uuid', 'unknown')
          except Exception:
            user_uuid = 'unknown'
        else:
          for arg in args:
            # Heuristic: FastAPI dependency-injected User objects often have uuid/username
            if hasattr(arg, 'uuid') and hasattr(arg, 'username'):
              user_uuid = getattr(arg, 'uuid', 'unknown')
              break

        logger.exception("Error %s for user %s", operation_name, user_uuid)
        raise HTTPException(
          status_code=status_code,
          detail=f"Failed to {operation_name}"
        ) from e

    return wrapper
  return decorator


def handle_api_errors_sync(operation_name: str, status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR):
  """
  Synchronous counterpart of error handler decorator.
  """
  def decorator(func: Callable) -> Callable:
    @wraps(func)
    def wrapper(*args, **kwargs) -> Any:
      try:
        return func(*args, **kwargs)
      except HTTPException:
        raise
      except Exception as e:
        user_uuid = 'unknown'
        if 'current_user' in kwargs:
          try:
            user_uuid = getattr(kwargs['current_user'], 'uuid', 'unknown')
          except Exception:
            user_uuid = 'unknown'
        logger.exception("Error %s for user %s", operation_name, user_uuid)
        raise HTTPException(
          status_code=status_code,
          detail=f"Failed to {operation_name}"
        ) from e
    return wrapper
  return decorator


