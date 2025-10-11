"""
Security utilities for authentication and encryption
"""

import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional, Tuple
from passlib.context import CryptContext
from jose import JWTError, jwt
import hashlib
import hmac

from app.config import settings, NEPAL_TZ

logger = logging.getLogger(__name__)

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt (includes built-in salt)
    
    Args:
        password: Plain text password
    
    Returns:
        Bcrypt hashed password
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against its bcrypt hash
    
    Args:
        plain_password: Plain text password to verify
        hashed_password: Stored bcrypt hash
    
    Returns:
        True if password matches, False otherwise
    """
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token
    
    Args:
        data: Data to encode in the token
        expires_delta: Optional expiration time
    
    Returns:
        JWT token string
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(NEPAL_TZ) + expires_delta
    else:
        expire = datetime.now(NEPAL_TZ) + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    
    return encoded_jwt


def verify_token(token: str) -> Optional[dict]:
    """
    Verify and decode a JWT token
    
    Args:
        token: JWT token string
    
    Returns:
        Decoded token data or None if invalid
    """
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        return payload
    except JWTError:
        logger.exception("JWT verification failed")
        return None


def generate_session_token() -> str:
    """
    Generate a secure session token
    
    Returns:
        Secure random token string
    """
    return secrets.token_urlsafe(32)


def hash_security_answers(answers: list[str], salt: Optional[str] = None) -> Tuple[str, str]:
    """
    Hash security question answers
    
    Args:
        answers: List of answer strings
        salt: Optional salt
    
    Returns:
        Tuple of (hashed_answers, salt)
    """
    if salt is None:
        salt = secrets.token_hex(32)
    
    # Combine all answers
    combined = "|".join(answers).lower().strip()
    salted = combined + salt
    
    # Hash using SHA-256
    hashed = hashlib.sha256(salted.encode()).hexdigest()
    
    return hashed, salt


def verify_security_answers(answers: list[str], hashed_answers: str, salt: str) -> bool:
    """
    Verify security question answers
    
    Args:
        answers: List of answer strings to verify
        hashed_answers: Stored hash
        salt: Stored salt
    
    Returns:
        True if answers match, False otherwise
    """
    combined = "|".join(answers).lower().strip()
    salted = combined + salt
    hashed = hashlib.sha256(salted.encode()).hexdigest()
    
    return hmac.compare_digest(hashed, hashed_answers)


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """
    Validate password strength
    
    Args:
        password: Password to validate
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if len(password) < settings.password_min_length:
        return False, f"Password must be at least {settings.password_min_length} characters long"
    
    if not any(c.isupper() for c in password):
        return False, "Password must contain at least one uppercase letter"
    
    if not any(c.islower() for c in password):
        return False, "Password must contain at least one lowercase letter"
    
    if not any(c.isdigit() for c in password):
        return False, "Password must contain at least one number"
    
    if not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
        return False, "Password must contain at least one special character"
    
    return True, "Password is strong"


def generate_recovery_key() -> str:
    """
    Generate a secure recovery key
    
    Returns:
        Secure random recovery key
    """
    return secrets.token_urlsafe(64)


def hash_recovery_key(key: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """
    Hash a recovery key
    
    Args:
        key: Recovery key to hash
        salt: Optional salt
    
    Returns:
        Tuple of (hashed_key, salt)
    """
    if salt is None:
        salt = secrets.token_hex(32)
    
    salted_key = key + salt
    hashed = hashlib.sha256(salted_key.encode()).hexdigest()
    
    return hashed, salt 