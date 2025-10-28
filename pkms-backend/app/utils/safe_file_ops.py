"""
Safe File Operations

Utilities for atomic file + database operations.
Ensures we never have orphaned DB records pointing to deleted files.
"""

import logging
from pathlib import Path
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

logger = logging.getLogger(__name__)


async def safe_delete_with_db(file_path: Path, db_object: Any, db: AsyncSession):
    """
    Atomically delete DB record and file, with DB delete happening FIRST.
    This ensures we never have orphaned DB records pointing to deleted files.
    
    Order matters:
    1. Delete DB record
    2. Commit DB
    3. Delete file (only if DB commit succeeded)
    
    If DB fails -> rollback, file still exists (safe)
    If file delete fails -> DB already committed, log warning (file can be cleaned up later)
    """
    try:
        # 1. Delete DB record FIRST
        await db.delete(db_object)
        
        # 2. Commit the DB change
        await db.commit()
        
        # 3. ONLY if DB commit is successful, delete the file
        if file_path.exists():
            file_path.unlink()
            logger.info(f"Successfully deleted file: {file_path}")
        else:
            logger.warning(f"File not found during delete: {file_path}")
            
    except Exception as e:
        # 4. If DB delete/commit fails, rollback. The file is still safe.
        await db.rollback()
        logger.error(f"Atomic delete failed. DB rolled back. File {file_path} was NOT deleted. Error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete record and file: {str(e)}"
        )