"""
Authentication Router
Handles user registration, login, logout, and password recovery
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Cookie, Query
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, and_
from app.schemas.auth import UserSetup, UserLogin, PasswordChange, RecoveryReset, RecoveryKeyResponse, TokenResponse, UserResponse, RefreshTokenRequest, UsernameBody, LoginPasswordHintUpdate
from typing import List, Optional
from datetime import datetime, timedelta
import json
import re
from slowapi import Limiter
from slowapi.util import get_remote_address
import logging

from app.database import get_db, init_db
from app.models.user import User, Session, RecoveryKey
from app.auth.security import (
    hash_password, verify_password, create_access_token, generate_session_token,
    hash_security_answers, verify_security_answers, validate_password_strength,
    generate_recovery_key, hash_recovery_key
)
from app.auth.dependencies import get_current_user
from app.config import settings, NEPAL_TZ

router = APIRouter()

def get_rate_limit_key(request: Request) -> str:
    """Enhanced rate limiting key that combines IP and user agent"""
    client_ip = get_remote_address(request)
    user_agent = request.headers.get("user-agent", "")
    # Create a more robust key that's harder to bypass
    return f"{client_ip}:{hash(user_agent) % 10000}"

limiter = Limiter(key_func=get_rate_limit_key)
logger = logging.getLogger(__name__)

# Input validation patterns
USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{3,50}$')
SAFE_STRING_PATTERN = re.compile(r'^[a-zA-Z0-9\s\-_.,!?\'\"()\[\]{}@#$%^&*+=|\\:;<>/~`]{1,500}$')



@router.post("/setup", response_model=TokenResponse)
@limiter.limit("3/minute")
async def setup_user(
    user_data: UserSetup,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Comprehensive user setup (creates user + recovery questions + diary password)
    Everything is set up in one go - no more first_login complexity!
    """
    # Check if any user already exists (use COUNT to avoid MultipleResultsFound)
    user_count = await db.scalar(select(func.count(User.uuid)))
    if user_count and user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User already exists. Use login endpoint instead."
        )
    
    # Validate password strength
    is_valid, error_message = validate_password_strength(user_data.password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message
        )
    
    # Diary password: allow any complexity (user preference). Only strip unsafe characters via Pydantic validator.
    # No additional strength validation enforced.
    
    # Check username availability
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Hash passwords
    password_hash = hash_password(user_data.password)
    diary_password_hash = hash_password(user_data.diary_password) if user_data.diary_password else None
    
    # Create user with all info
    user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=password_hash,
        diary_password_hash=diary_password_hash,
        diary_password_hint=user_data.diary_password_hint,
        login_password_hint=user_data.login_password_hint,
        is_first_login=False  # Everything is set up at once!
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Set up recovery questions
    answers_hash, salt = hash_security_answers(user_data.recovery_answers)
    recovery_key = generate_recovery_key()
    key_hash, key_salt = hash_recovery_key(recovery_key)
    
    recovery_record = RecoveryKey(
        user_uuid=user.uuid,
        key_hash=key_hash,
        questions_json=json.dumps(user_data.recovery_questions),
        answers_hash=answers_hash,
        salt=salt
    )
    db.add(recovery_record)
    
    # Create session for login
    session_token = generate_session_token()
    session = Session(
        session_token=session_token,
        user_uuid=user.uuid,
        expires_at=datetime.now(NEPAL_TZ) + timedelta(days=7),
        ip_address=None,
        user_agent="internal-setup"
    )
    db.add(session)
    await db.commit()

    # Create JWT access token
    access_token = create_access_token(data={"sub": str(user.uuid)})

    # Set access token in HttpOnly cookie (XSS protection)
    response.set_cookie(
        key="pkms_token",
        value=access_token,
        max_age=settings.access_token_expire_minutes * 60,  # 30 minutes
        httponly=True,
        secure=(settings.environment == "production"),
        samesite="strict"  # SECURITY: Strict SameSite for CSRF protection
    )

    # Set refresh token cookie
    response.set_cookie(
        key="pkms_refresh",
        value=session_token,
        httponly=True,
        samesite="strict",  # SECURITY: Strict SameSite for CSRF protection
        secure=settings.environment == "production",
        max_age=7*24*60*60
    )
    
    return TokenResponse(
        access_token=access_token,  # Still return in body for backward compatibility during transition
        expires_in=settings.access_token_expire_minutes * 60,
        user_uuid=user.uuid,
        username=user.username
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    user_data: UserLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """Authenticate user and return access token"""
    
    # Check if user exists
    result = await db.execute(
        select(User).where(User.username == user_data.username)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        # Check if system has ANY users for proper error message
        user_count = await db.scalar(select(func.count(User.uuid)))
        if user_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No user account exists. Please create an account first by clicking 'Create account'."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password. Please check your credentials and try again."
            )
    
    if not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password. Please check your credentials and try again."
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled"
        )
    
    # Create access token
    token_data = {"sub": str(user.uuid), "username": user.username}
    access_token = create_access_token(token_data)
    
    # Create or update session
    session_token = generate_session_token()
    expires_at = datetime.now(NEPAL_TZ) + timedelta(days=settings.refresh_token_lifetime_days)
    
    # Clean up old sessions for this user
    await db.execute(
        delete(Session).where(Session.user_uuid == user.uuid)
    )
    
    # Create new session
    session = Session(
        session_token=session_token,
        user_uuid=user.uuid,
        expires_at=expires_at,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500]
    )
    db.add(session)
    
    # Update last login time
    user.last_login = datetime.now(NEPAL_TZ)
    
    await db.commit()
    
    # Set access token in HttpOnly cookie (XSS protection)
    response.set_cookie(
        key="pkms_token",
        value=access_token,
        max_age=settings.access_token_expire_minutes * 60,  # 30 minutes
        httponly=True,
        secure=(settings.environment == "production"),
        samesite="strict"  # SECURITY: Consistent strict SameSite for CSRF protection
    )
    
    # Set refresh token cookie
    response.set_cookie(
        key="pkms_refresh",
        value=session_token,
        max_age=settings.refresh_token_lifetime_days * 24 * 60 * 60,
        httponly=True,
        secure=(settings.environment == "production"),
        samesite="strict"  # SECURITY: Consistent strict SameSite for CSRF protection
    )
    
    return TokenResponse(
        access_token=access_token,  # Still return in body for backward compatibility during transition
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user_uuid=user.uuid,
        username=user.username
    )


@router.post("/logout")
async def logout(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias="pkms_refresh")
):
    """
    User logout - Clear cookies and invalidate session
    """
    try:
        # Clear diary session (in-memory) on logout for safety
        from app.routers.diary import _clear_diary_session
        _clear_diary_session(current_user.uuid)
        
        # Delete session from database (only current user's session)
        if session_token:
            await db.execute(
                delete(Session).where(
                    and_(
                        Session.session_token == session_token,
                        Session.user_uuid == current_user.uuid
                    )
                )
            )
            await db.commit()
    except Exception as e:
        logger.warning(f"Logout cleanup failed for user {current_user.uuid}: {e}")
    
    # Clear cookies
    response.delete_cookie(key="pkms_token", samesite="strict")
    response.delete_cookie(key="pkms_refresh", samesite="strict")
    
    return {"message": "Successfully logged out"}


@router.get("/recovery/questions")
async def get_recovery_questions(
    username: Optional[str] = Query(None, min_length=3, max_length=50),
    db: AsyncSession = Depends(get_db)
):
    """
    Get recovery questions for a specific user.
    This now requires a username to support multi-user environments.
    """
    logger.info("Recovery questions requested" + (f" for username: {username}" if username else " without username (single-user fallback)"))

    if username:
        user_res = await db.execute(select(User).where(User.username == username))
        user = user_res.scalar_one_or_none()
    else:
        # Fallback: allow omission only when a single user exists
        users_res = await db.execute(select(User))
        users = users_res.scalars().all()
        if len(users) == 1:
            user = users[0]
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username must be provided when multiple users exist."
            )

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    recovery_key_res = await db.execute(
        select(RecoveryKey).where(RecoveryKey.user_uuid == user.uuid)
    )
    recovery_key = recovery_key_res.scalar_one_or_none()

    if not recovery_key or not recovery_key.questions_json:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recovery questions not set up for this user."
        )

    try:
        questions = json.loads(recovery_key.questions_json)
        return {"questions": questions}
    except json.JSONDecodeError:
        logger.error(f"Failed to parse recovery questions for user {user.uuid}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve recovery questions."
        )


@router.post("/recovery/reset")
async def reset_password(
    recovery_data: RecoveryReset,
    db: AsyncSession = Depends(get_db)
):
    """
    Reset password using security questions
    """
    # Validate new password
    is_valid, error_message = validate_password_strength(recovery_data.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message
        )
    
    # Get user according to provided (or inferred) username
    if recovery_data.username:
        user_res = await db.execute(select(User).where(User.username == recovery_data.username))
        user = user_res.scalar_one_or_none()
    else:
        # Count users instead of loading all
        user_count = await db.scalar(select(func.count(User.uuid)))
        if user_count == 1:
            # Get the single user
            user_res = await db.execute(select(User).limit(1))
            user = user_res.scalar_one_or_none()
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username must be provided when multiple users exist."
            )

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Get recovery key for this user
    result = await db.execute(select(RecoveryKey).where(RecoveryKey.user_uuid == user.uuid))
    recovery_record = result.scalar_one_or_none()

    if not recovery_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No recovery setup found"
        )

    # Verify answers
    if not verify_security_answers(recovery_data.answers, recovery_record.answers_hash, recovery_record.salt):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect security answers"
        )
    
    # Hash new password using bcrypt
    password_hash = hash_password(recovery_data.new_password)
    
    # Update user password
    user.password_hash = password_hash
    user.is_first_login = False
    
    # Update recovery key last used
    recovery_record.last_used = datetime.now(NEPAL_TZ)
    
    await db.commit()
    
    return {"message": "Password successfully reset"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """
    Get current user information
    """
    return current_user


@router.put("/password")
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Change user password
    """
    # Verify current password
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    is_valid, error_message = validate_password_strength(password_data.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message
        )
    
    # Hash new password using bcrypt
    password_hash = hash_password(password_data.new_password)
    
    # Update user
    current_user.password_hash = password_hash
    current_user.is_first_login = False
    
    await db.commit()
    
    return {"message": "Password successfully changed"}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    response: Response,
    db: AsyncSession = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias="pkms_refresh")
):
    """Silent token renewal using refresh cookie"""
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")

    try:
        # Lookup session
        result = await db.execute(select(Session).where(Session.session_token == session_token))
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        # Handle potential naive datetimes from legacy records
        now = datetime.now(NEPAL_TZ)
        expires_at = session.expires_at
        if expires_at is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session state")
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=NEPAL_TZ)

        if expires_at < now:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

        # Get user
        result = await db.execute(select(User).where(User.uuid == session.user_uuid))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account disabled")

        # Issue new access token
        access_token = create_access_token(data={"sub": str(user.uuid)})

        # SECURITY: Invalidate the used refresh token to prevent replay attacks
        # Generate new session token to prevent session fixation
        new_session_token = generate_session_token()
        
        # Update session with new token (this invalidates the old one)
        session.session_token = new_session_token
        session.last_activity = now
        
        # SIMPLE LOGIC: Extend by configured days from NOW
        new_expiry = now + timedelta(days=settings.refresh_token_lifetime_days)

        # But don't extend beyond 1 day total from session creation (security limit)
        created_at = session.created_at.replace(tzinfo=NEPAL_TZ) if session.created_at.tzinfo is None else session.created_at
        max_expiry = created_at + timedelta(days=1)

        # Use the earlier of the two dates
        session.expires_at = min(new_expiry, max_expiry)
        
        await db.commit()

        # Set access token in HttpOnly cookie (XSS protection)
        response.set_cookie(
            key="pkms_token",
            value=access_token,
            max_age=settings.access_token_expire_minutes * 60,  # 30 minutes
            httponly=True,
            secure=(settings.environment == "production"),
            samesite="strict"  # SECURITY: Strict SameSite for CSRF protection
        )

        # Set new refresh cookie with new token
        # Use the updated session.expires_at
        remaining = int((session.expires_at - now).total_seconds()) if session.expires_at else settings.refresh_token_lifetime_days * 24 * 60 * 60
        response.set_cookie(
            key="pkms_refresh",
            value=new_session_token,
            httponly=True,
            samesite="strict",  # SECURITY: Strict SameSite for CSRF protection
            secure=settings.environment == "production",
            max_age=max(0, remaining)
        )

        return TokenResponse(
            access_token=access_token,
            expires_in=settings.access_token_expire_minutes * 60,
            user_uuid=user.uuid,
            username=user.username
        )
    except HTTPException:
        # Pass through expected auth errors
        raise
    except Exception as e:
        logger.exception("/auth/refresh unexpected failure")
        # Return 401 to allow client to handle gracefully rather than surfacing as network error
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh failed")

# Master recovery system removed - using security questions only


# Login Password Hint Endpoints
@router.put("/login-password-hint")
async def set_login_password_hint(
    hint_data: LoginPasswordHintUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Set or update the login password hint for the current user
    """
    current_user.login_password_hint = hint_data.hint.strip()
    await db.commit()
    
    return {"message": "Login password hint updated successfully"}


@router.post("/login-password-hint")
async def get_login_password_hint(
    data: UsernameBody,
    db: AsyncSession = Depends(get_db)
):
    """
    Get the login password hint for a given username.
    This is intentionally not authenticated to be used on the login page.
    """
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()

    hint = ""
    if user and user.login_password_hint:
        hint = user.login_password_hint
    
    return {"hint": hint}

@router.get("/login-password-hint")
async def get_any_login_password_hint(db: AsyncSession = Depends(get_db)):
    """
    Get any login password hint from the system (for single user systems).
    This is intentionally not authenticated to be used on the login page.
    SECURITY: Returns generic response to prevent user enumeration.
    """
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()

    # SECURITY: Always return the same structure to prevent user enumeration
    if user and user.login_password_hint:
        return {"hint": user.login_password_hint, "username": ""}  # Don't leak username
    else:
        # Return generic response even if no user exists
        return {"hint": "", "username": ""} 