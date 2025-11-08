"""
API Error Handler Decorator

Standardized error handling for all API endpoints with automatic logging
and consistent error responses.
"""

import asyncio
import logging
import os
from functools import wraps
from typing import Callable, Any
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)


def is_development_mode() -> bool:
    """Check if application is running in development mode."""
    return os.getenv("DEBUG", "false").lower() == "true" or os.getenv("ENVIRONMENT") == "development"


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
      except asyncio.CancelledError:
        # Critical: Always propagate cancellation immediately
        raise
      except Exception as e:
        # Extract user information for logging
        user_uuid = 'unknown'
        if 'current_user' in kwargs:
          try:
            user_uuid = getattr(kwargs['current_user'], 'uuid', 'unknown')
          except Exception:
            user_uuid = 'unknown'
        elif args and hasattr(args[0], '__class__') and args[0].__class__.__name__ == 'User':
          # FastAPI typically injects User as first arg in path operations
          # Note: Uses class name matching to avoid import dependency
          # Trade-off: Less robust than isinstance() but avoids circular imports
          user_uuid = getattr(args[0], 'uuid', 'unknown')

        # Use consistent dev mode checking
        detail_msg = f"Failed to {operation_name}"
        if is_development_mode():
          detail_msg += f": {str(e)}"

        logger.exception("Error %s for user %s", operation_name, user_uuid)
        raise HTTPException(
          status_code=status_code,
          detail=detail_msg
        ) from e

    return wrapper
  return decorator


def handle_api_errors_sync(operation_name: str, status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR):
  """
  Synchronous counterpart of error handler decorator.
  
  Args:
      operation_name: Human-readable operation description (e.g., "creating note")
      status_code: HTTP status code to return on error (default: 500)
  """
  def decorator(func: Callable) -> Callable:
    @wraps(func)
    def wrapper(*args, **kwargs) -> Any:
      try:
        return func(*args, **kwargs)
      except HTTPException:
        raise
      # Note: No CancelledError for sync functions
      except Exception as e:
        user_uuid = 'unknown'
        if 'current_user' in kwargs:
          try:
            user_uuid = getattr(kwargs['current_user'], 'uuid', 'unknown')
          except Exception:
            user_uuid = 'unknown'
        elif args and hasattr(args[0], '__class__') and args[0].__class__.__name__ == 'User':
          # FastAPI typically injects User as first arg in path operations
          # Note: Uses class name matching to avoid import dependency
          # Trade-off: Less robust than isinstance() but avoids circular imports
          user_uuid = getattr(args[0], 'uuid', 'unknown')

        # Use consistent dev mode checking
        detail_msg = f"Failed to {operation_name}"
        if is_development_mode():
          detail_msg += f": {str(e)}"

        logger.exception("Error %s for user %s", operation_name, user_uuid)
        raise HTTPException(
          status_code=status_code,
          detail=detail_msg
        ) from e
    return wrapper
  return decorator


