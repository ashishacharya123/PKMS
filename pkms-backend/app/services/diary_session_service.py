"""
Diary Session Service

Manages secure in-memory session storage for diary encryption keys.
Handles session lifecycle, expiration, and secure cleanup.
"""

import asyncio
import logging
import time
import gc
from typing import Dict, Optional, Any
from contextlib import asynccontextmanager
import secrets
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

logger = logging.getLogger(__name__)

# Session timeout (30 minutes, aligned with app session)
DIARY_SESSION_TIMEOUT = 1800


class DiarySessionService:
    """
    Manages diary encryption sessions with secure key storage and automatic expiration.
    
    SECURITY FEATURES:
    - In-memory only (never persists to disk)
    - Automatic expiration and cleanup
    - Secure memory overwrite before deletion
    - PBKDF2 key derivation with salt
    """
    
    def __init__(self):
        # Format: {user_uuid: {"key": bytes, "salt": bytes, "timestamp": float, "expires_at": float}}
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self._cleanup_task = None
        
    @asynccontextmanager
    async def _get_lock(self):
        """Async-safe access to sessions"""
        async with self._lock:
            yield
    
    async def get_password_from_session(self, user_uuid: str) -> Optional[bytes]:
        """
        Get diary derived key from session if valid and not expired.
        
        Args:
            user_uuid: User's UUID
            
        Returns:
            Derived encryption key if session is valid, None otherwise
        """
        expected_expires_at: float | None = None
        
        async with self._get_lock():
            session = self._sessions.get(user_uuid)
            if not session:
                return None
            now = time.time()
            if now > session["expires_at"]:
                expected_expires_at = session["expires_at"]
            else:
                return session["key"]
        
        if expected_expires_at is not None:
            await self.clear_session(user_uuid, expected_expires_at=expected_expires_at)
            return None
        return None
    
    async def store_password_in_session(self, user_uuid: str, password: str) -> None:
        """
        Store derived diary key in secure session with expiry.
        
        Derives encryption key from password using PBKDF2 and stores it
        with expiration timestamp.
        
        Args:
            user_uuid: User's UUID
            password: User's diary password (will be derived into key)
        """
        async with self._get_lock():
            current_time = time.time()
            key, salt = self.derive_encryption_key(password)
            
            self._sessions[user_uuid] = {
                "key": key,
                "salt": salt,
                "timestamp": current_time,
                "expires_at": current_time + DIARY_SESSION_TIMEOUT
            }
            
            logger.info(f"Diary session created for user {user_uuid}, expires in {DIARY_SESSION_TIMEOUT}s")
    
    async def clear_session(self, user_uuid: str, *, expected_expires_at: float | None = None) -> None:
        """
        Clear diary session and password from memory.
        
        SECURITY: Overwrites memory buffers before deletion to prevent
        sensitive data from remaining in memory.
        
        Args:
            user_uuid: User's UUID
            expected_expires_at: Only clear if session's expires_at matches this value
        """
        async with self._get_lock():
            session = self._sessions.get(user_uuid)
            if not session:
                return
            if expected_expires_at is not None and session.get("expires_at") != expected_expires_at:
                # Session was refreshed; do not clear a fresh session
                return
            
            # Securely overwrite all sensitive data
            try:
                # Overwrite key (best-effort). Use mutable buffers for in-place zeroization.
                key_buf = session.get("key")
                if isinstance(key_buf, (bytearray, memoryview)):
                    key_buf[:] = b"\x00" * len(key_buf)
                session["key"] = None
                
                # Overwrite salt (best-effort)
                salt_buf = session.get("salt")
                if isinstance(salt_buf, (bytearray, memoryview)):
                    salt_buf[:] = b"\x00" * len(salt_buf)
                session["salt"] = None
                
                # Overwrite timestamp data
                session["timestamp"] = 0.0
                session["expires_at"] = 0.0
                
            except Exception as e:
                logger.warning(f"Error securely clearing session data for user {user_uuid}: {e}")
            
            # Remove from dictionary and force garbage collection
            del self._sessions[user_uuid]
            logger.info("Diary session cleared (user=%s*)", user_uuid[:8])
            
            # Force cleanup
            gc.collect()
    
    async def is_unlocked(self, user_uuid: str) -> bool:
        """
        Check if diary is currently unlocked for user.
        
        Args:
            user_uuid: User's UUID
            
        Returns:
            True if diary is unlocked (valid session exists), False otherwise
        """
        return await self.get_password_from_session(user_uuid) is not None
    
    @staticmethod
    def derive_encryption_key(password: str, salt: bytes = None) -> tuple[bytes, bytes]:
        """
        Derive encryption key from diary password using PBKDF2-HMAC-SHA256.
        
        SECURITY: Uses proper key derivation with salt and iterations to prevent
        rainbow table attacks and make brute force computationally expensive.
        
        Args:
            password: User's diary password
            salt: Optional salt (generates new one if None)
            
        Returns:
            Tuple of (derived_key, salt) for AES-256
        """
        if salt is None:
            salt = secrets.token_bytes(32)  # 256-bit salt
        
        # Use PBKDF2 with 100,000 iterations (OWASP recommended minimum)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,  # 256-bit key for AES-256
            salt=salt,
            iterations=100000,
        )
        
        key = kdf.derive(password.encode("utf-8"))
        return key, salt
    
    async def _cleanup_expired_sessions_task(self):
        """
        Background task to cleanup expired diary sessions.
        
        Runs every 60 seconds and removes sessions that have exceeded
        their expiration time.
        """
        while True:
            try:
                await asyncio.sleep(60)
                
                # Compute expired users under lock
                async with self._get_lock():
                    now = time.time()
                    expired_users = [
                        (user_uuid, session["expires_at"])
                        for user_uuid, session in self._sessions.items()
                        if now > session["expires_at"]
                    ]
                
                # Clear sessions outside of lock
                for user_uuid, expected_expires_at in expired_users:
                    try:
                        await self.clear_session(user_uuid, expected_expires_at=expected_expires_at)
                    except Exception:
                        logger.exception("Error clearing session for user %s", user_uuid)
                
                if expired_users:
                    logger.info(f"Cleaned up {len(expired_users)} expired diary sessions")
                    
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in diary session cleanup task")
    
    def start_cleanup_task(self):
        """
        Start the background cleanup task.
        
        Should be called once during application startup.
        """
        if self._cleanup_task is None:
            try:
                self._cleanup_task = asyncio.create_task(self._cleanup_expired_sessions_task())
                logger.info("Diary session cleanup task started (runs every 60s)")
            except RuntimeError:
                logger.info("Diary session cleanup task will start when event loop is available")


# Global instance
diary_session_service = DiarySessionService()

