"""
Diary Crypto Service

Dedicated service for handling diary media encryption and decryption.
Separates cryptographic concerns from file handling operations.
"""

import base64
import secrets
import time
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException, status
import logging

from app.utils.diary_encryption import write_encrypted_file, read_encrypted_header
from app.config import get_file_storage_dir, get_data_dir

logger = logging.getLogger(__name__)


class DiaryCryptoService:
    """Service for handling diary media encryption and decryption operations."""

    def __init__(self, diary_sessions: Dict[str, Dict[str, Any]], sessions_lock: asyncio.Lock):
        self.diary_sessions = diary_sessions
        self.sessions_lock = sessions_lock

    async def encrypt_media_file(
        self,
        source_file_path: Path,
        entry_date,
        entry_uuid: str,
        media_uuid: str,
        user_uuid: str
    ) -> tuple[Path, str]:
        """
        Encrypt a media file for diary storage.

        Args:
            source_file_path: Path to the source file to encrypt
            entry_date: Date of the diary entry
            entry_uuid: UUID of the diary entry
            media_uuid: UUID of the media item
            user_uuid: User UUID for session validation

        Returns:
            Tuple of (encrypted_file_path, encrypted_filename)
        """
        try:
            # Get encryption key from diary session
            encryption_key = await self._get_encryption_key(user_uuid)

            # Generate encrypted filename
            entry_date_str = entry_date.strftime("%Y-%m-%d")
            encrypted_filename = f"{entry_date_str}_{entry_uuid}_{media_uuid}.dat"

            # Prepare destination directory
            media_dir = get_file_storage_dir() / "secure" / "entries" / "media"
            media_dir.mkdir(parents=True, exist_ok=True)

            # Prepare paths
            temp_encrypted_path = media_dir / f"temp_{encrypted_filename}"
            final_encrypted_path = media_dir / encrypted_filename

            # Read and encrypt file
            with open(source_file_path, "rb") as f:
                file_content = f.read()

            # Generate secure IV
            iv = secrets.token_bytes(12)  # 96-bit IV for AES-GCM

            # Encrypt content
            aesgcm = AESGCM(encryption_key)
            encrypted_content = aesgcm.encrypt(iv, file_content, None)

            # Extract file extension
            file_extension = source_file_path.suffix.lstrip('.').lower() if source_file_path.suffix else ""

            # Write encrypted file to temporary location
            write_encrypted_file(
                dest_path=temp_encrypted_path,
                iv_b64=base64.b64encode(iv).decode(),
                encrypted_blob_b64=base64.b64encode(encrypted_content).decode(),
                original_extension=file_extension
            )

            logger.info(f"Media encrypted successfully for user {user_uuid}")
            return temp_encrypted_path, encrypted_filename

        except Exception as e:
            logger.error(f"Failed to encrypt diary media: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to encrypt media file: {str(e)}"
            )

    async def decrypt_media_file(
        self,
        media_uuid: str,
        file_path: Path,
        user_uuid: str
    ) -> tuple[bytes, str]:
        """
        Decrypt a diary media file for download.

        Args:
            media_uuid: UUID of the media item
            file_path: Path to the encrypted file
            user_uuid: User UUID for session validation

        Returns:
            Tuple of (decrypted_content, original_extension)
        """
        try:
            # Get encryption key from diary session
            encryption_key = await self._get_encryption_key(user_uuid)

            # Validate file exists
            if not file_path.exists():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Media file not found on disk"
                )

            # Read encrypted file header
            extension, iv, tag, header_size = read_encrypted_header(file_path)

            # Read ciphertext after header
            def _read_after_header(p: Path, offset: int) -> bytes:
                with open(p, "rb") as f:
                    f.seek(offset)
                    return f.read()

            ciphertext = await asyncio.to_thread(_read_after_header, file_path, header_size)

            # Decrypt content
            aesgcm = AESGCM(encryption_key)
            decrypted_content = aesgcm.decrypt(iv, ciphertext + tag, None)

            logger.info(f"Successfully decrypted media {media_uuid} for user {user_uuid}")
            return decrypted_content, extension

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Failed to decrypt diary media {media_uuid}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to decrypt media file. The file may be corrupted or the diary session may be invalid."
            )

    async def _get_encryption_key(self, user_uuid: str) -> bytes:
        """
        Get encryption key from diary session with validation.

        Args:
            user_uuid: User UUID to get session for

        Returns:
            Encryption key bytes
        """
        async with self.sessions_lock:
            diary_session = self.diary_sessions.get(user_uuid)
            if not diary_session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Diary is locked. Please unlock diary first."
                )

            # Check session expiry
            if time.time() > diary_session["expires_at"]:
                # Clean up expired session
                del self.diary_sessions[user_uuid]
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Diary session expired. Please unlock diary again."
                )

            return diary_session["key"]

    @staticmethod
    def cleanup_temp_file(temp_path: Path) -> None:
        """Clean up temporary encrypted file after successful database commit."""
        try:
            if temp_path.exists():
                temp_path.unlink()
        except Exception as e:
            logger.warning(f"Failed to cleanup temporary file {temp_path}: {e}")