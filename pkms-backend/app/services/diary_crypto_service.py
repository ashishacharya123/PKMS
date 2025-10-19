'''
Diary Crypto Service

Dedicated service for handling diary file encryption and decryption.
Separates cryptographic concerns from file handling operations.
'''

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
from app.config import get_file_storage_dir

logger = logging.getLogger(__name__)


class DiaryCryptoService:
    """Service for handling diary file encryption and decryption operations."""

    def __init__(self, diary_sessions: Dict[str, Dict[str, Any]], sessions_lock: asyncio.Lock):
        self.diary_sessions = diary_sessions
        self.sessions_lock = sessions_lock

    async def encrypt_file(
        self,
        source_file_path: Path,
        entry_date,
        entry_uuid: str,
        file_uuid: str,
        user_uuid: str
    ) -> tuple[Path, str]:
        """
        Encrypt a file for diary storage.
        """
        try:
            encryption_key = await self._get_encryption_key(user_uuid)

            entry_date_str = entry_date.strftime("%Y-%m-%d")
            encrypted_filename = f"{entry_date_str}_{entry_uuid}_{file_uuid}.dat"

            files_dir = get_file_storage_dir() / "secure" / "entries" / "files"
            files_dir.mkdir(parents=True, exist_ok=True)

            temp_encrypted_path = files_dir / f"temp_{encrypted_filename}"

            with open(source_file_path, "rb") as f:
                file_content = f.read()

            iv = secrets.token_bytes(12)
            aesgcm = AESGCM(encryption_key)
            encrypted_content = aesgcm.encrypt(iv, file_content, None)

            file_extension = source_file_path.suffix.lstrip('.').lower() if source_file_path.suffix else ""

            write_encrypted_file(
                dest_path=temp_encrypted_path,
                iv_b64=base64.b64encode(iv).decode(),
                encrypted_blob_b64=base64.b64encode(encrypted_content).decode(),
                original_extension=file_extension
            )

            logger.info(f"Diary file encrypted successfully for user {user_uuid}")
            return temp_encrypted_path, encrypted_filename

        except Exception as e:
            logger.exception("Failed to encrypt diary file")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to encrypt file"
            ) from e

    async def decrypt_file(
        self,
        file_uuid: str,
        file_path: Path,
        user_uuid: str
    ) -> tuple[bytes, str]:
        """
        Decrypt a diary file for download.
        """
        try:
            encryption_key = await self._get_encryption_key(user_uuid)

            if not file_path.exists():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="File not found on disk"
                )

            from app.utils.diary_encryption import compute_sha256
            from app.config import settings

            try:
                await asyncio.to_thread(compute_sha256, file_path)
            except Exception as e:
                if not settings.force_decrypt_on_integrity_failure:
                    logger.error(f"DIARY FILE INTEGRITY FAILURE: File {file_uuid} blocked | Error: {str(e)}")
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=f"File integrity check failed: {str(e)}"
                    )
                else:
                    logger.warning(f"DIARY FILE INTEGRITY FAILURE: File {file_uuid} (FORCED DECRYPT) | Error: {str(e)}")

            extension, iv, tag, header_size = read_encrypted_header(file_path)

            def _read_after_header(p: Path, offset: int) -> bytes:
                with open(p, "rb") as f:
                    f.seek(offset)
                    return f.read()

            ciphertext = await asyncio.to_thread(_read_after_header, file_path, header_size)

            aesgcm = AESGCM(encryption_key)
            decrypted_content = aesgcm.decrypt(iv, ciphertext + tag, None)

            logger.info(f"Successfully decrypted file {file_uuid} for user {user_uuid}")
            return decrypted_content, extension

        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Failed to decrypt diary file {file_uuid}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to decrypt file. The file may be corrupted or the diary session may be invalid."
            ) from e

    async def _get_encryption_key(self, user_uuid: str) -> bytes:
        """Get encryption key from diary session with validation."""
        async with self.sessions_lock:
            diary_session = self.diary_sessions.get(user_uuid)
            if not diary_session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Diary is locked. Please unlock diary first."
                )

            if time.time() > diary_session["expires_at"]:
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
