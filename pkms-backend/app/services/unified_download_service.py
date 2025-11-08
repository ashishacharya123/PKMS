'''
Unified Download Service for PKMS

This service provides consistent download functionality across all modules
while supporting module-specific requirements like file path resolution.
'''

from pathlib import Path
from typing import Optional, Union, Type
import logging
import hashlib

from fastapi import HTTPException, status, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.base import Base
from app.models.document import Document
# NoteFile model removed - notes now use Document + note_documents association
from app.models.archive import ArchiveItem
from app.config import get_data_dir

logger = logging.getLogger(__name__)


class DownloadConfig:
    """Configuration class for module-specific download behavior."""

    def __init__(
        self,
        module: str,
        model_class: Type[Base],
        file_path_field: str = "file_path",
        original_name_field: str = "original_name",
        mime_type_field: str = "mime_type",
        file_size_field: str = "file_size",
        requires_decryption: bool = False
    ):
        self.module = module
        self.model_class = model_class
        self.file_path_field = file_path_field
        self.original_name_field = original_name_field
        self.mime_type_field = mime_type_field
        self.file_size_field = file_size_field
        self.requires_decryption = requires_decryption


class UnifiedDownloadService:
    """Unified service for handling file downloads across all modules."""

    def _generate_etag(self, file_path: Path, record, config) -> str:
        """Generate ETag based on file metadata (size + modification time + database record)"""
        try:
            stat = file_path.stat()
            file_size = stat.st_size
            mod_time = stat.st_mtime
            updated_at = getattr(record, 'updated_at', None)
            db_timestamp = updated_at.timestamp() if updated_at else 0
            etag_data = f"{file_size}-{mod_time}-{db_timestamp}-{config.module}"
            return hashlib.md5(etag_data.encode()).hexdigest()
        except Exception as e:
            logger.warning(f"Failed to generate ETag for {file_path}: {e}")
            return hashlib.md5(str(file_path).encode()).hexdigest()

    CONFIGS = {
        "documents": DownloadConfig(
            module="documents",
            model_class=Document,
            requires_decryption=False
        ),
        "notes": DownloadConfig(
            module="notes",
            model_class=Document,  # Notes now use Document + note_documents association
            requires_decryption=False
        ),
        "archive": DownloadConfig(
            module="archive",
            model_class=ArchiveItem,
            file_path_field="file_path",
            original_name_field="original_filename",
            requires_decryption=False
        ),
      }

    def __init__(self):
        pass

    async def download_file(
        self,
        db: AsyncSession,
        file_uuid: str,
        module: str,
        user_uuid: str,
        additional_conditions: Optional[list] = None,
        request: Optional[Request] = None
    ) -> Union[FileResponse, Response]:
        """Unified download method for all modules."""
        if module not in self.CONFIGS:
            raise ValueError(f"Unsupported module: {module}")

        config = self.CONFIGS[module]

        try:
            record = await self._get_file_record(
                db, config, file_uuid, user_uuid, additional_conditions
            )

            file_path = self._resolve_file_path(record, config)
            if not file_path.exists():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="File not found on disk"
                )

            original_name = getattr(record, config.original_name_field)
            mime_type = getattr(record, config.mime_type_field)
            file_size = getattr(record, config.file_size_field)

            etag = self._generate_etag(file_path, record, config)

            if request:
                if_none_match = request.headers.get("if-none-match")
                if if_none_match and if_none_match == etag:
                    return Response(
                        status_code=304,
                        headers={
                            "ETag": etag,
                            "Cache-Control": "private, max-age=3600",
                        }
                    )

            response = FileResponse(
                path=str(file_path),
                filename=original_name,
                media_type=mime_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{original_name}"',
                    "X-File-Size": str(file_size),
                    "X-Module": config.module,
                    "X-File-UUID": file_uuid,
                    "ETag": etag,
                    "Cache-Control": "private, max-age=3600",
                }
            )

            logger.info(f"File downloaded successfully: {original_name} from {config.module}")
            return response

        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Error downloading file from {module}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to download file: {str(e)}"
            )

    async def _get_file_record(
        self,
        db: AsyncSession,
        config: DownloadConfig,
        file_uuid: str,
        user_uuid: str,
        additional_conditions: Optional[list] = None
    ) -> Base:
        """Get file record with ownership verification."""
        query = select(config.model_class).where(
            config.model_class.uuid == file_uuid
        )

        if hasattr(config.model_class, 'created_by'):
            query = query.where(config.model_class.created_by == user_uuid)
        elif hasattr(config.model_class, 'note_uuid'):
            from app.models.note import Note
            query = query.join(Note).where(Note.created_by == user_uuid)
        
        if additional_conditions:
            for condition in additional_conditions:
                query = query.where(condition)

        result = await db.execute(query)
        record = result.scalar_one_or_none()

        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File not found in {config.module}"
            )

        return record

    def _resolve_file_path(self, record: Base, config: DownloadConfig) -> Path:
        """Resolve database file path to absolute filesystem path."""
        file_path_str = getattr(record, config.file_path_field)

        file_path = Path(file_path_str)
        if file_path.is_absolute():
            return file_path

        return (get_data_dir() / file_path_str.lstrip("/")).resolve()

    async def get_file_info(
        self,
        db: AsyncSession,
        file_uuid: str,
        module: str,
        user_uuid: str
    ) -> dict:
        """Get file metadata without downloading the actual file."""
        if module not in self.CONFIGS:
            raise ValueError(f"Unsupported module: {module}")

        config = self.CONFIGS[module]

        if config.requires_decryption:
            raise ValueError(f"Module {module} requires decryption - use dedicated service")

        try:
            record = await self._get_file_record(db, config, file_uuid, user_uuid)

            file_path = self._resolve_file_path(record, config)
            file_exists = file_path.exists()

            return {
                "uuid": file_uuid,
                "module": module,
                "original_name": getattr(record, config.original_name_field),
                "file_size": getattr(record, config.file_size_field),
                "mime_type": getattr(record, config.mime_type_field),
                "file_exists": file_exists,
                "file_path": str(file_path)
            }

        except HTTPException:
            raise
        except Exception as e:
            logger.exception(f"Error getting file info from {module}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get file info: {str(e)}"
            )


unified_download_service = UnifiedDownloadService()
