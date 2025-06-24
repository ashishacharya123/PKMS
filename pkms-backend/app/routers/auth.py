"""
Authentication Router
Handles user registration, login, logout, and password recovery
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime, timedelta
import json

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

# Pydantic models for request/response
class UserSetup(BaseModel):
    username: str
    password: str
    email: Optional[EmailStr] = None

class UserLogin(BaseModel):
    username: str
    password: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class RecoverySetup(BaseModel):
    questions: List[str]
    answers: List[str]

class RecoveryReset(BaseModel):
    answers: List[str]
    new_password: str

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


@router.post("/setup", response_model=TokenResponse)
async def setup_user(
    user_data: UserSetup,
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
    
    # Hash password
    password_hash, salt = hash_password(user_data.password)
    
    # Create user
    user = User(
        username=user_data.username,
        email=user_data.email,
        password_hash=password_hash,
        salt=salt,
        is_first_login=True
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Create session
    session_token = generate_session_token()
    session = Session(
        id=session_token,
        user_id=user.id,
        session_token=session_token,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    )
    
    db.add(session)
    await db.commit()
    
    # Create access token
    access_token = create_access_token(data={"sub": str(user.id)})
    
    return TokenResponse(
        access_token=access_token,
        expires_in=settings.access_token_expire_minutes * 60,
        user_id=user.id,
        username=user.username,
        is_first_login=user.is_first_login
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    user_data: UserLogin,
    request: Request,
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
    
    # Verify password
    if not verify_password(user_data.password, user.password_hash, user.salt):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()
    
    # Create session
    session_token = generate_session_token()
    session = Session(
        id=session_token,
        user_id=user.id,
        session_token=session_token,
        expires_at=datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    
    db.add(session)
    await db.commit()
    
    # Create access token
    access_token = create_access_token(data={"sub": str(user.id)})
    
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
    User logout (invalidate session)
    """
    # Get current session and delete it
    result = await db.execute(
        select(Session).where(Session.user_id == current_user.id)
    )
    sessions = result.scalars().all()
    
    for session in sessions:
        await db.delete(session)
    
    await db.commit()
    
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
        answers_hash=answers_hash
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
    
    # Hash new password
    password_hash, salt = hash_password(recovery_data.new_password)
    
    # Update user password
    user.password_hash = password_hash
    user.salt = salt
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
    if not verify_password(password_data.current_password, current_user.password_hash, current_user.salt):
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
    
    # Hash new password
    password_hash, salt = hash_password(password_data.new_password)
    
    # Update user
    current_user.password_hash = password_hash
    current_user.salt = salt
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