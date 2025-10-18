"""
Authentication dependencies for FastAPI
"""

from fastapi import Depends, HTTPException, status, Request, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models.user import User, Session
from app.auth.security import verify_token
from app.config import settings, NEPAL_TZ
import logging

logger = logging.getLogger(__name__)

# Security scheme (kept for backward compatibility)
security = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    token_cookie: str | None = Cookie(default=None, alias="pkms_token"),
    credentials: HTTPAuthorizationCredentials | None = Depends(security)
) -> User:
    """
    Get the current authenticated user from HttpOnly cookie (preferred) or Authorization header (fallback)
    
    Args:
        request: FastAPI request
        db: Database session
        token_cookie: JWT token from HttpOnly cookie (primary method)
        credentials: HTTP Bearer token (fallback for backward compatibility)
    
    Returns:
        Current user object
    
    Raises:
        HTTPException: If authentication fails
    """
    # Try cookie first (preferred, XSS-safe)
    token = token_cookie
    
    # Fallback to Authorization header for backward compatibility
    if not token and credentials:
        token = credentials.credentials
    
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify JWT token
    payload = verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    created_by = payload.get("sub")
    if not created_by:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from database by UUID
    result = await db.execute(select(User).where(User.uuid == created_by))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Note: Session activity tracking removed to prevent database commit issues
    # Session expiry is extended via the /auth/refresh endpoint instead
    
    return user


async def get_optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    """
    Get the current user if authenticated, None otherwise
    
    Args:
        request: FastAPI request object
        db: Database session
    
    Returns:
        Current user object or None
    """
    try:
        # Try to get authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None
        
        token = auth_header.split(" ")[1]
        
        # Verify JWT token
        payload = verify_token(token)
        if not payload:
            return None
        
        created_by = payload.get("sub")
        if created_by is None:
            return None
        
        # Get user from database
        result = await db.execute(select(User).where(User.uuid == created_by))
        user = result.scalar_one_or_none()
        
        if user is None or not user.is_active:
            return None
        
        return user
        
    except HTTPException:
        # Re-raise HTTP exceptions (authentication failures)
        raise
    except (ValueError, TypeError) as e:
        # Handle specific token parsing errors
        logger.warning(f"Invalid token format in get_current_user_optional: {str(e)}")
        return None
    except Exception as e:
        # SECURITY: Optional auth should NEVER crash the request
        logger.error(f"Unexpected error in get_current_user_optional: {type(e).__name__}")
        return None  # ALWAYS return None for optional auth


def require_first_login(user: User = Depends(get_current_user)) -> User:
    """
    Require that this is the user's first login
    
    Args:
        user: Current user
    
    Returns:
        User object
    
    Raises:
        HTTPException: If not first login
    """
    if not user.is_first_login:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This endpoint is only available for first-time setup"
        )
    
    return user


def require_not_first_login(user: User = Depends(get_current_user)) -> User:
    """
    Require that this is not the user's first login
    
    Args:
        user: Current user
    
    Returns:
        User object
    
    Raises:
        HTTPException: If first login
    """
    if user.is_first_login:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please complete first-time setup first"
        )
    
    return user 