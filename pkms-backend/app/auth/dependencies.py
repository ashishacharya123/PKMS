"""
Authentication dependencies for FastAPI
"""

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models.user import User, Session
from app.auth.security import verify_token
from app.config import settings, NEPAL_TZ

# Security scheme
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Get the current authenticated user and extend session activity
    
    Args:
        credentials: HTTP Bearer token
        db: Database session
    
    Returns:
        Current user object
    
    Raises:
        HTTPException: If authentication fails
    """
    token = credentials.credentials
    
    # Verify JWT token
    payload = verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user from database
    result = await db.execute(select(User).where(User.id == user_id))
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
    
    # Update session activity and extend expiration
    try:
        from datetime import timedelta
        
        # Find active session for this user (get the most recent one)
        session_result = await db.execute(
            select(Session)
            .where(Session.user_id == user.id)
            .where(Session.expires_at > datetime.now(NEPAL_TZ))
            .order_by(Session.expires_at.desc())
            .limit(1)
        )
        session = session_result.scalar_one_or_none()
        
        if session:
            # Update last activity and extend session by 7 days from now
            session.last_activity = datetime.now(NEPAL_TZ)
            session.expires_at = datetime.now(NEPAL_TZ) + timedelta(days=7)
            
            # Commit the session update
            await db.commit()
    except Exception as e:
        # Don't fail authentication if session update fails, just log it
        # This ensures the API remains functional even if session extension fails
        print(f"Warning: Failed to update session activity: {e}")
    
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
        
        user_id = payload.get("sub")
        if user_id is None:
            return None
        
        # Get user from database
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        
        if user is None or not user.is_active:
            return None
        
        return user
        
    except Exception:
        return None


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