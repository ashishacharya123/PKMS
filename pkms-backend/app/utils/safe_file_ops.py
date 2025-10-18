"""
Safe file operations with atomic deletion and backup/restore patterns
"""

import shutil
import time
import logging
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any

logger = logging.getLogger(__name__)


async def safe_delete_with_db(file_path: Path, db_record: Any, db: AsyncSession):
    """Delete file and database record atomically with backup/restore"""
    # First backup the file
    backup_path = file_path.with_suffix(f'.backup_{int(time.time())}')
    if file_path.exists():
        shutil.copy2(file_path, backup_path)
        logger.info(f"Created backup: {backup_path}")

    try:
        # Delete from database first
        await db.delete(db_record)
        await db.commit()
        logger.info(f"Deleted database record")

        # Only delete file after successful DB delete
        if file_path.exists():
            file_path.unlink()
            logger.info(f"Deleted file: {file_path}")

        # Clean up backup
        if backup_path.exists():
            backup_path.unlink()
            logger.info(f"Cleaned up backup: {backup_path}")

    except Exception as e:
        logger.error(f"ERROR: Error during atomic deletion: {e}")
        
        # Restore from backup if DB operation failed
        if backup_path.exists() and not file_path.exists():
            shutil.copy2(backup_path, file_path)
            logger.info(f"Restored file from backup: {file_path}")

        # Clean up backup
        if backup_path.exists():
            backup_path.unlink()
            logger.info(f"Cleaned up backup after error: {backup_path}")
        
        raise e


async def safe_move_with_backup(source_path: Path, dest_path: Path):
    """Move file with backup and rollback capability"""
    backup_path = dest_path.with_suffix(f'.backup_{int(time.time())}')
    
    try:
        # Create backup of destination if it exists
        if dest_path.exists():
            shutil.copy2(dest_path, backup_path)
            logger.info(f"Created destination backup: {backup_path}")
        
        # Move the file
        shutil.move(str(source_path), str(dest_path))
        logger.info(f"Moved file: {source_path} -> {dest_path}")
        
        # Clean up backup
        if backup_path.exists():
            backup_path.unlink()
            logger.info(f"Cleaned up backup: {backup_path}")
            
    except Exception as e:
        logger.error(f"ERROR: Error during file move: {e}")
        
        # Restore destination from backup if move failed
        if backup_path.exists() and not dest_path.exists():
            shutil.copy2(backup_path, dest_path)
            logger.info(f"Restored destination from backup: {dest_path}")
        
        # Clean up backup
        if backup_path.exists():
            backup_path.unlink()
            logger.info(f"Cleaned up backup after error: {backup_path}")
        
        raise e


async def safe_copy_with_verification(source_path: Path, dest_path: Path):
    """Copy file with verification and cleanup on failure"""
    try:
        # Copy the file
        shutil.copy2(source_path, dest_path)
        
        # Verify the copy
        if not dest_path.exists():
            raise Exception("Copy verification failed - destination file not found")
        
        if source_path.stat().st_size != dest_path.stat().st_size:
            raise Exception("Copy verification failed - file size mismatch")
        
        logger.info(f"Copied and verified file: {source_path} -> {dest_path}")
        
    except Exception as e:
        logger.error(f"ERROR: Error during file copy: {e}")
        
        # Clean up failed copy
        if dest_path.exists():
            dest_path.unlink()
            logger.info(f"Cleaned up failed copy: {dest_path}")
        
        raise e
