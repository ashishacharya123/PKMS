"""
Authentication Router
Handles user registration, login, logout, and password recovery
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Cookie, Query
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from pydantic import BaseModel, EmailStr, Field, validator
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

limiter = Limiter(key_func=get_remote_address)
logger = logging.getLogger(__name__)

# Input validation patterns
USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{3,50}$')
SAFE_STRING_PATTERN = re.compile(r'^[a-zA-Z0-9\s\-_.,!?\'\"()\[\]{}@#$%^&*+=|\\:;<>/~`]{1,500}$')

# Pydantic models for request/response with enhanced validation
class UserSetup(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=128)
    email: Optional[EmailStr] = None
    login_password_hint: Optional[str] = Field(None, max_length=255)
    
    # Recovery questions (mandatory)
    recovery_questions: List[str] = Field(..., min_items=2, max_items=5)
    recovery_answers: List[str] = Field(..., min_items=2, max_items=5)
    
    # Diary password (now mandatory)
    diary_password: str = Field(..., min_length=8, max_length=128)
    diary_password_hint: Optional[str] = Field(None, max_length=255)
    
    @validator('username')
    def validate_username(cls, v):
        if not USERNAME_PATTERN.match(v):
            raise ValueError('Username can only contain letters, numbers, hyphens, and underscores')
        if v.lower() in ['admin', 'root', 'administrator', 'user', 'test', 'demo']:
            raise ValueError('This username is not allowed')
        return v  # Remove .lower() - keep original case
    
    @validator('password')
    def validate_password_security(cls, v):
        # Additional password validation beyond basic strength
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Password contains unsafe characters')
        return v
    
    @validator('recovery_questions')
    def validate_questions(cls, v):
        for question in v:
            if not SAFE_STRING_PATTERN.match(question):
                raise ValueError('Security questions contain invalid characters')
            if len(question.strip()) < 10:
                raise ValueError('Security questions must be at least 10 characters long')
        return [q.strip() for q in v]
    
    @validator('recovery_answers')
    def validate_answers(cls, v):
        for answer in v:
            if not SAFE_STRING_PATTERN.match(answer):
                raise ValueError('Security answers contain invalid characters')
            if len(answer.strip()) < 2:
                raise ValueError('Security answers must be at least 2 characters long')
        return [a.strip() for a in v]
    
    @validator('diary_password')
    def validate_diary_password(cls, v):
        if v and any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Diary password contains unsafe characters')
        return v
    
    @validator('recovery_answers', 'recovery_questions')
    def validate_matching_count(cls, v, values):
        if 'recovery_questions' in values and len(v) != len(values['recovery_questions']):
            raise ValueError('Number of questions and answers must match')
        return v

class UserLogin(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)
    
    @validator('username')
    def validate_username(cls, v):
        if not USERNAME_PATTERN.match(v):
            raise ValueError('Invalid username format')
        return v  # Remove .lower() - keep original case

class PasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)
    
    @validator('new_password')
    def validate_new_password(cls, v):
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Password contains unsafe characters')
        return v

class RecoveryReset(BaseModel):
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    answers: List[str] = Field(..., min_items=2, max_items=5)
    new_password: str = Field(..., min_length=8, max_length=128)
    
    @validator('answers')
    def validate_answers(cls, v):
        for answer in v:
            if not SAFE_STRING_PATTERN.match(answer):
                raise ValueError('Security answers contain invalid characters')
        return [a.strip() for a in v]
    
    @validator('new_password')
    def validate_new_password(cls, v):
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Password contains unsafe characters')
        return v

class RecoveryKeyResponse(BaseModel):
    recovery_key: str
    message: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: int
    username: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class RefreshTokenRequest(BaseModel):
    """Empty body – refresh is cookie-based but keeps model for future extensibility"""
    pass

class UsernameBody(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)

    @validator('username')
    def validate_username(cls, v):
        if not USERNAME_PATTERN.match(v):
            raise ValueError('Invalid username format')
        return v  # Remove .lower() - keep original case

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
    # Check if any user already exists
    result = await db.execute(select(User))
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
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
        user_id=user.id,
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
        user_id=user.id,
        expires_at=datetime.now(NEPAL_TZ) + timedelta(days=7),
        ip_address=None,
        user_agent="internal-setup"
    )
    db.add(session)
    await db.commit()

    # Create JWT access token
    access_token = create_access_token(data={"sub": str(user.id)})

    # Set secure cookie
    response.set_cookie(
        key="pkms_refresh",
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",
        max_age=7*24*60*60
    )
    
    return TokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user_id=user.id,
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
    
    # First check if any users exist in the system
    user_count = await db.scalar(select(func.count(User.id)))
    
    if user_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user account exists. Please create an account first by clicking 'Create account'."
        )
    
    # Check if user exists
    result = await db.execute(
        select(User).where(User.username == user_data.username)
    )
    user = result.scalar_one_or_none()
    
    if not user:
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
    token_data = {"sub": str(user.id), "username": user.username}
    access_token = create_access_token(token_data)
    
    # Create or update session
    session_token = generate_session_token()
    expires_at = datetime.now(NEPAL_TZ) + timedelta(days=settings.refresh_token_lifetime_days)
    
    # Clean up old sessions for this user
    await db.execute(
        delete(Session).where(Session.user_id == user.id)
    )
    
    # Create new session
    session = Session(
        session_token=session_token,
        user_id=user.id,
        expires_at=expires_at,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", "")[:500]
    )
    db.add(session)
    
    # Update last login time
    user.last_login = datetime.now(NEPAL_TZ)
    
    await db.commit()
    
    # Set refresh token cookie
    response.set_cookie(
        key="pkms_refresh",
        value=session_token,
        max_age=settings.refresh_token_lifetime_days * 24 * 60 * 60,
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
        samesite="lax"
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.access_token_expire_minutes * 60,
        user_id=user.id,
        username=user.username
    )


@router.post("/logout")
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    User logout
    Note: With JWT tokens, logout is handled client-side by removing the token.
    This endpoint is provided for completeness and future session management.
    """
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
        select(RecoveryKey).where(RecoveryKey.user_id == user.id)
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
        logger.error(f"Failed to parse recovery questions for user {user.id}")
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

    # Get recovery key for this user
    result = await db.execute(select(RecoveryKey).where(RecoveryKey.user_id == user.id))
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
        result = await db.execute(select(User).where(User.id == session.user_id))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account disabled")

        # Issue new access token
        access_token = create_access_token(data={"sub": str(user.id)})

        # Slide session expiry by another 7 days
        session.expires_at = now + timedelta(days=7)
        await db.commit()

        # refresh cookie max-age
        response.set_cookie(
            key="pkms_refresh",
            value=session_token,
            httponly=True,
            samesite="lax",
            secure=settings.environment == "production",
            max_age=7*24*60*60
        )

        return TokenResponse(
            access_token=access_token,
            expires_in=settings.access_token_expire_minutes * 60,
            user_id=user.id,
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
class LoginPasswordHintUpdate(BaseModel):
    hint: str = Field(..., max_length=255)
    
    @validator('hint')
    def validate_hint(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('Hint cannot be empty')
        if len(v) < 2:
            raise ValueError('Hint must be at least 2 characters long')
        return v


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
    """
    result = await db.execute(select(User).limit(1))
    user = result.scalar_one_or_none()

    hint = ""
    if user and user.login_password_hint:
        hint = user.login_password_hint
    
    return {"hint": hint, "username": user.username if user else ""} 