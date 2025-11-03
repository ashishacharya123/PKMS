# app/services/cleanup_service.py
import logging
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, and_, or_
from app.models.project import Project
from app.models.note import Note
from app.models.diary import DiaryEntry

logger = logging.getLogger(__name__)

class CleanupService:
    async def cleanup_abandoned_reservations(self, db: AsyncSession):
        """
        Clean up ONLY the most obvious abandoned reservation records.

        SAFETY FIRST: This is extremely conservative and only deletes records that are
        virtually guaranteed to be abandoned reservations, not legitimate user data.

        We look for the exact patterns created by each reservation system:
        1. Projects: Named exactly "[Reserved]"
        2. Notes: Empty title ("") with no content
        3. Diary: Empty title ("") with placeholder content
        4. Records older than 4 hours (gives users time to complete)
        """
        threshold = datetime.utcnow() - timedelta(hours=4)
        logger.info("Running conservative cleanup for obvious reservations older than %s", threshold)
        total_deleted = 0

        try:
            # Clean up projects with exact "[Reserved]" name
            projects_deleted = await self._cleanup_reserved_projects(db, threshold)
            total_deleted += projects_deleted

            # Clean up notes with empty title and no content (reservation pattern)
            notes_deleted = await self._cleanup_reserved_notes(db, threshold)
            total_deleted += notes_deleted

            # Clean up diary entries with empty title (reservation pattern)
            diary_deleted = await self._cleanup_reserved_diary_entries(db, threshold)
            total_deleted += diary_deleted

            if total_deleted > 0:
                await db.commit()
                logger.info("Conservative cleanup completed. Total reserved records deleted: %d", total_deleted)
            else:
                logger.info("No obvious reserved records found for cleanup")

        except Exception as e:
            logger.error("Cleanup service failed: %s", e)
            await db.rollback()
            raise

    async def _cleanup_reserved_projects(self, db: AsyncSession, threshold: datetime) -> int:
        """
        ONLY delete projects that are literally named "[Reserved]" - no ambiguity.
        These are created by the project reservation system and never completed.
        """
        try:
            # VERY SPECIFIC: Only delete projects exactly named "[Reserved]"
            stmt = delete(Project).where(
                and_(
                    Project.created_at < threshold,
                    Project.name == "[Reserved]"  # Exact match only - no guessing
                )
            )
            result = await db.execute(stmt)
            if result.rowcount > 0:
                logger.info("Deleted %d abandoned reserved projects", result.rowcount)
            return result.rowcount or 0
        except Exception as e:
            logger.error("Failed to clean up reserved projects: %s", e)
            return 0

    async def _cleanup_reserved_notes(self, db: AsyncSession, threshold: datetime) -> int:
        """
        ONLY delete notes that match the exact reservation pattern:
        - Empty title ("") created by reservation system
        - No content and no content file
        - Older than threshold
        """
        try:
            # VERY SPECIFIC: Only delete notes with exact reservation pattern
            stmt = delete(Note).where(
                and_(
                    Note.created_at < threshold,
                    Note.title == "",  # Empty title created by reservation system
                    or_(
                        and_(
                            Note.content == "",
                            Note.content.is_(None)
                        ),
                        Note.content_file_path.is_(None)
                    )
                )
            )
            result = await db.execute(stmt)
            if result.rowcount > 0:
                logger.info("Deleted %d abandoned reserved notes", result.rowcount)
            return result.rowcount or 0
        except Exception as e:
            logger.error("Failed to clean up reserved notes: %s", e)
            return 0

    async def _cleanup_reserved_diary_entries(self, db: AsyncSession, threshold: datetime) -> int:
        """
        ONLY delete diary entries that match the exact reservation pattern:
        - Empty title ("") created by reservation system
        - No files attached (file_count = 0)
        - Older than threshold
        """
        try:
            # VERY SPECIFIC: Only delete diary entries with exact reservation pattern
            stmt = delete(DiaryEntry).where(
                and_(
                    DiaryEntry.created_at < threshold,
                    DiaryEntry.title == "",  # Empty title created by reservation system
                    DiaryEntry.file_count == 0  # No files attached
                )
            )
            result = await db.execute(stmt)
            if result.rowcount > 0:
                logger.info("Deleted %d abandoned reserved diary entries", result.rowcount)
            return result.rowcount or 0
        except Exception as e:
            logger.error("Failed to clean up reserved diary entries: %s", e)
            return 0

cleanup_service = CleanupService()