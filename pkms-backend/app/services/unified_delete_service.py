"""
Unified Delete Service

Atomic deletion helper: DB delete/commit first, then file unlink with separate error handling.
"""

from pathlib import Path
import logging
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError


logger = logging.getLogger(__name__)


class UnifiedDeleteService:
    async def delete_file_with_db(self, file_path: Path, db_object, db: AsyncSession):
        """Delete database record first, then file. DB failure = rollback, File failure = warning."""
        try:
            await db.delete(db_object)
            await db.commit()
        except SQLAlchemyError as e:
            await db.rollback()
            raise HTTPException(status_code=500, detail="Database operation failed") from e

        # File deletion with separate error handling
        try:
            if file_path.exists():
                file_path.unlink()
        except OSError as e:
            logger.warning("File cleanup failed after DB commit", exc_info=True)


unified_delete_service = UnifiedDeleteService()


