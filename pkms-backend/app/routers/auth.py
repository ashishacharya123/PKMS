"""
Authentication Router
Handles user registration, login, logout, and password recovery
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Cookie
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr, Field, validator
from typing import List, Optional
from datetime import datetime, timedelta
import json
import re
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.database import get_db
from app.models.user import User, Session, RecoveryKey
from app.auth.security import (
    hash_password, verify_password, create_access_token, generate_session_token,
    hash_security_answers, verify_security_answers, validate_password_strength,
    generate_recovery_key, hash_recovery_key
)
from app.auth.dependencies import get_current_user, require_first_login, require_not_first_login
from app.config import settings

router = APIRouter()

limiter = Limiter(key_func=get_remote_address)

# Input validation patterns
USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9_-]{3,50}$')
SAFE_STRING_PATTERN = re.compile(r'^[a-zA-Z0-9\s\-_.,!?\'\"()\[\]{}@#$%^&*+=|\\:;<>/~`]{1,500}$')

# Pydantic models for request/response with enhanced validation
class UserSetup(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=128)
    email: Optional[EmailStr] = None
    
    @validator('username')
    def validate_username(cls, v):
        if not USERNAME_PATTERN.match(v):
            raise ValueError('Username can only contain letters, numbers, hyphens, and underscores')
        if v.lower() in ['admin', 'root', 'administrator', 'user', 'test', 'demo']:
            raise ValueError('This username is not allowed')
        return v.lower()
    
    @validator('password')
    def validate_password_security(cls, v):
        # Additional password validation beyond basic strength
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Password contains unsafe characters')
        return v

class UserLogin(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=1, max_length=128)
    
    @validator('username')
    def validate_username(cls, v):
        if not USERNAME_PATTERN.match(v):
            raise ValueError('Invalid username format')
        return v.lower()

class PasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)
    
    @validator('new_password')
    def validate_new_password(cls, v):
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Password contains unsafe characters')
        return v

class RecoverySetup(BaseModel):
    questions: List[str] = Field(..., min_items=2, max_items=5)
    answers: List[str] = Field(..., min_items=2, max_items=5)
    
    @validator('questions')
    def validate_questions(cls, v):
        for question in v:
            if not SAFE_STRING_PATTERN.match(question):
                raise ValueError('Security questions contain invalid characters')
            if len(question.strip()) < 10:
                raise ValueError('Security questions must be at least 10 characters long')
        return [q.strip() for q in v]
    
    @validator('answers')
    def validate_answers(cls, v):
        for answer in v:
            if not SAFE_STRING_PATTERN.match(answer):
                raise ValueError('Security answers contain invalid characters')
            if len(answer.strip()) < 2:
                raise ValueError('Security answers must be at least 2 characters long')
        return [a.strip() for a in v]

class RecoveryReset(BaseModel):
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
    is_first_login: bool

class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str]
    is_first_login: bool
    created_at: datetime

    class Config:
        from_attributes = True

class RefreshTokenRequest(BaseModel):
    """Empty body – refresh is cookie-based but keeps model for future extensibility"""
    pass

class MasterRecoverySetup(BaseModel):
    master_recovery_password: str = Field(..., min_length=8, max_length=128)
    
    @validator('master_recovery_password')
    def validate_master_password(cls, v):
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Master recovery password contains unsafe characters')
        return v

class MasterRecoveryReset(BaseModel):
    master_recovery_password: str = Field(..., min_length=8, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)
    
    @validator('master_recovery_password')
    def validate_master_password(cls, v):
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Master recovery password contains unsafe characters')
        return v
    
    @validator('new_password')
    def validate_new_password(cls, v):
        if any(char in v for char in ['<', '>', '&', '"', "'"]):
            raise ValueError('Password contains unsafe characters')
        return v

@router.post("/setup", response_model=TokenResponse)
@limiter.limit("3/minute")
async def setup_user(
    user_data: UserSetup,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    First-time user setup (creates master password)
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
    
    # Check username availability
    result = await db.execute(select(User).where(User.username == user_data.username))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Hash password using bcrypt
    password_hash = hash_password(user_data.password)
    
    # Create user
    user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=password_hash,
        is_first_login=True
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Create JWT access token
    access_token = create_access_token(data={"sub": str(user.id)})
    
    # --- NEW: Create refresh session & cookie ---
    session_token = generate_session_token()
    session = Session(
        session_token=session_token,
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(days=7),  # 7-day sliding window
        ip_address=None,
        user_agent="internal-setup"
    )
    db.add(session)
    await db.commit()

    # Secure cookie (HttpOnly, SameSite=Lax)
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
        username=user.username,
        is_first_login=user.is_first_login
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    user_data: UserLogin,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    User login
    """
    # Get user by username
    result = await db.execute(select(User).where(User.username == user_data.username))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled"
        )
    
    # Verify password using bcrypt
    if not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()
    
    # Create JWT access token
    access_token = create_access_token(data={"sub": str(user.id)})
    
    # --- NEW: Create refresh session & cookie ---
    session_token = generate_session_token()
    session = Session(
        session_token=session_token,
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(days=7),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    db.add(session)
    await db.commit()

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
        username=user.username,
        is_first_login=user.is_first_login
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


@router.post("/recovery/setup", response_model=RecoveryKeyResponse)
async def setup_recovery(
    recovery_data: RecoverySetup,
    current_user: User = Depends(require_first_login),
    db: AsyncSession = Depends(get_db)
):
    """
    Setup password recovery with security questions
    """
    if len(recovery_data.questions) != len(recovery_data.answers):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Number of questions and answers must match"
        )
    
    if len(recovery_data.questions) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 2 security questions are required"
        )
    
    # Hash answers
    answers_hash, salt = hash_security_answers(recovery_data.answers)
    
    # Generate recovery key
    recovery_key = generate_recovery_key()
    key_hash, key_salt = hash_recovery_key(recovery_key)
    
    # Create recovery key record
    recovery_record = RecoveryKey(
        user_id=current_user.id,
        key_hash=key_hash,
        questions_json=json.dumps(recovery_data.questions),
        answers_hash=answers_hash,
        salt=salt
    )
    
    db.add(recovery_record)
    await db.commit()
    
    return RecoveryKeyResponse(
        recovery_key=recovery_key,
        message="Recovery key generated. Store it securely - you'll need it to reset your password."
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
    
    # Get recovery key record
    result = await db.execute(select(RecoveryKey))
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
    
    # Get user
    result = await db.execute(select(User).where(User.id == recovery_record.user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Hash new password using bcrypt
    password_hash = hash_password(recovery_data.new_password)
    
    # Update user password
    user.password_hash = password_hash
    user.is_first_login = False
    
    # Update recovery key last used
    recovery_record.last_used = datetime.utcnow()
    
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
    current_user: User = Depends(require_not_first_login),
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


@router.post("/complete-setup")
async def complete_setup(
    current_user: User = Depends(require_first_login),
    db: AsyncSession = Depends(get_db)
):
    """
    Mark first-time setup as complete
    """
    current_user.is_first_login = False
    await db.commit()
    
    return {"message": "Setup completed successfully"}

@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    response: Response,
    db: AsyncSession = Depends(get_db),
    session_token: str | None = Cookie(default=None, alias="pkms_refresh")
):
    """Silent token renewal using refresh cookie"""
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")

    # Lookup session
    result = await db.execute(select(Session).where(Session.session_token == session_token))
    session = result.scalar_one_or_none()
    if not session or session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    # Get user
    result = await db.execute(select(User).where(User.id == session.user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account disabled")

    # Issue new access token
    access_token = create_access_token(data={"sub": str(user.id)})

    # Slide session expiry by another 7 days
    session.expires_at = datetime.utcnow() + timedelta(days=7)
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
        username=user.username,
        is_first_login=user.is_first_login
    ) 

@router.post("/recovery/setup-master", response_model=dict)
async def setup_master_recovery(
    recovery_data: MasterRecoverySetup,
    current_user: User = Depends(require_first_login),
    db: AsyncSession = Depends(get_db)
):
    """
    Setup master recovery password (simplified for single user)
    """
    # Validate master recovery password strength
    is_valid, error_message = validate_password_strength(recovery_data.master_recovery_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Master recovery password is too weak: {error_message}"
        )
    
    # Hash the master recovery password
    master_password_hash = hash_password(recovery_data.master_recovery_password)
    
    # Check if recovery record exists and update or create
    result = await db.execute(select(RecoveryKey))
    recovery_record = result.scalar_one_or_none()
    
    if recovery_record:
        # Update existing record with master password
        recovery_record.master_password_hash = master_password_hash
        recovery_record.last_used = None  # Reset usage
    else:
        # Create new recovery record with master password only
        recovery_record = RecoveryKey(
            user_id=current_user.id,
            key_hash="",  # Empty for master password method
            questions_json="[]",  # Empty for master password method
            answers_hash="",  # Empty for master password method
            salt="",  # Empty for master password method
            master_password_hash=master_password_hash
        )
        db.add(recovery_record)
    
    await db.commit()
    
    return {
        "message": "Master recovery password set successfully. This password can be used to recover your account and unlock your diary.",
        "method": "master_password"
    }

@router.post("/recovery/reset-master")
async def reset_password_with_master(
    recovery_data: MasterRecoveryReset,
    db: AsyncSession = Depends(get_db)
):
    """
    Reset password using master recovery password (simplified for single user)
    """
    # Validate new password
    is_valid, error_message = validate_password_strength(recovery_data.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_message
        )
    
    # Get recovery key record (simplified for single user)
    result = await db.execute(select(RecoveryKey))
    recovery_record = result.scalar_one_or_none()
    
    if not recovery_record or not hasattr(recovery_record, 'master_password_hash') or not recovery_record.master_password_hash:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No master recovery password found. Please use security questions instead."
        )
    
    # Verify master recovery password
    if not verify_password(recovery_data.master_recovery_password, recovery_record.master_password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect master recovery password"
        )
    
    # Get user (simplified for single user)
    result = await db.execute(select(User))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Hash new password using bcrypt
    password_hash = hash_password(recovery_data.new_password)
    
    # Update user password
    user.password_hash = password_hash
    user.is_first_login = False
    
    # Update recovery key last used
    recovery_record.last_used = datetime.utcnow()
    
    await db.commit()
    
    return {"message": "Password successfully reset using master recovery password"}

@router.post("/recovery/check-master")
async def check_master_recovery_available(db: AsyncSession = Depends(get_db)):
    """
    Check if master recovery password is available (simplified for single user)
    """
    result = await db.execute(select(RecoveryKey))
    recovery_record = result.scalar_one_or_none()
    
    has_master = (recovery_record and 
                  hasattr(recovery_record, 'master_password_hash') and 
                  recovery_record.master_password_hash)
    has_questions = (recovery_record and recovery_record.questions_json and 
                    recovery_record.questions_json != "[]")
    
    return {
        "has_master_recovery": has_master,
        "has_security_questions": has_questions,
        "recommended_method": "master_password" if has_master else "security_questions"
    } 