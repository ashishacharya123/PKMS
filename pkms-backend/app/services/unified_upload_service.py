"""
UnifiedUploadService - Ensures atomic file operations and database consistency

Handles:
- Atomic file upload commits (prevents orphaned files)
- Database consistency (prevents orphaned DB records)
- File integrity verification
- Cross-platform file operations
- Document, note, diary, and archive file uploads
"""

import asyncio
import shutil
import hashlib
import uuid as uuid_lib
import errno
from pathlib import Path
from typing import Optional, Dict, Any, Type, Callable
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
import logging

from app.services.chunk_service import chunk_manager, ChunkUploadStatus
from app.services.file_detection import FileTypeDetectionService
from app.config import get_data_dir, get_file_storage_dir
from app.utils.security import sanitize_filename, validate_file_size
from app.config import settings
from sqlalchemy import select, and_
from app.models.note import NoteFile
from app.models.enums import UploadStatus
from app.models.enums import ModuleType

logger = logging.getLogger(__name__)
file_detector = FileTypeDetectionService()


class UnifiedUploadService:
    """Ensures atomic file operations and database consistency across all modules"""

    async def commit_upload(
        self,
        db: AsyncSession,
        upload_id: str,
        module: str,  # "documents", "notes", "archive", "diary"
        created_by: str,
        metadata: Dict[str, Any],
        pre_commit_callback: Optional[Callable] = None  # For diary encryption
    ) -> Any:
        """
        Generic upload commit with two-phase commit pattern.
        Prevents orphaned files by committing DB before moving file to final location.
        
        Args:
            db: Database session
            upload_id: Upload ID from chunk manager
            module: Module name ("documents", "notes", "archive", "diary")
            created_by: User UUID
            metadata: Module-specific data
            pre_commit_callback: Optional callback for pre-processing (e.g., encryption)
            
        Returns:
            Created database record
        """
        temp_path = None
        assembled_path = None
        
        try:
            # Step 1: Validate and locate assembled file
            assembled_path = await self._locate_assembled_file(upload_id, created_by)
            
            # Step 2: Apply pre-commit callback (e.g., diary encryption)
            if pre_commit_callback:
                assembled_path = await pre_commit_callback(assembled_path)
            
            # Step 3: Generate paths based on module
            final_path, temp_path = self._generate_paths(module, assembled_path, metadata)
            
            # Step 4: Move to TEMP location first
            await self._move_to_temp(assembled_path, temp_path)
            
            # Step 5: Create DB record (module-specific)
            record = await self._create_record(db, module, temp_path, final_path, metadata, created_by)
            
            # Step 6: Handle associations (tags, projects)
            await self._handle_associations(db, module, record, metadata, created_by)
            
            # Step 7: COMMIT DATABASE (critical point)
            await db.commit()
            
            # Step 8: Move temp → final ONLY after successful DB commit
            await self._finalize_file(temp_path, final_path, record, db)
            
            # Step 9: Cleanup
            await chunk_manager.cleanup_upload(upload_id)
            
            return record
            
        except Exception as e:
            await self._cleanup_on_error(db, temp_path, assembled_path)
            raise

    async def _locate_assembled_file(self, upload_id: str, created_by: str) -> Path:
        """Locate and validate assembled file from chunk manager."""
        # Check upload status
        status_obj = await chunk_manager.get_upload_status(upload_id)
        if not status_obj:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        # Enforce ownership
        if status_obj.get("created_by") != created_by:
            raise HTTPException(status_code=403, detail="Access denied: upload does not belong to you")
        
        if status_obj.get("status") != ChunkUploadStatus.COMPLETED:
            raise HTTPException(status_code=400, detail="File not yet assembled")
        
        # Locate assembled file path
        temp_dir = Path(get_data_dir()) / "temp_uploads"
        assembled = await asyncio.to_thread(lambda: next(temp_dir.glob(f"complete_{upload_id}_*"), None))
        
        if not assembled:
            available_files = await asyncio.to_thread(lambda: list(temp_dir.glob("*")))
            logger.error(f"Assembled file not found. Available files: {available_files}")
            raise HTTPException(status_code=404, detail=f"Assembled file not found in {temp_dir}")
        
        return assembled

    def _generate_paths(self, module: str, assembled: Path, metadata: Dict[str, Any]) -> tuple[Path, Path]:
        """Generate final and temp paths based on module."""
        data_dir = get_data_dir()
        file_uuid = str(uuid_lib.uuid4())
        extension = assembled.suffix
        
        if module == "documents":
            # Generate human-readable filename: originalname_UUID.ext
            original_name = assembled.name.replace(f"complete_{metadata.get('upload_id', '')}_", "")
            if original_name.endswith(extension):
                original_name = original_name[:-len(extension)]
            
            safe_original = sanitize_filename(original_name)
            if len(safe_original) > 100:
                safe_original = safe_original[:100]
            
            stored_filename = f"{safe_original}_{file_uuid}{extension}"
            docs_dir = get_file_storage_dir() / "assets" / "documents"
            final_path = docs_dir / stored_filename
            temp_path = docs_dir / f"temp_{stored_filename}"
            
        elif module == "notes":
            filename = f"{file_uuid}{extension}"
            notes_dir = get_file_storage_dir() / "assets" / "notes" / "files"
            final_path = notes_dir / filename
            temp_path = notes_dir / f"temp_{filename}"
            
        elif module == "archive":
            filename = f"{file_uuid}{extension}"
            folder_uuid = metadata.get("folder_uuid")
            if folder_uuid:
                # Get folder path from database
                folder_path = self._get_filesystem_path(folder_uuid, None, None)
                archive_dir = get_file_storage_dir() / "assets" / "archive" / folder_path
            else:
                archive_dir = get_file_storage_dir() / "assets" / "archive"
            final_path = archive_dir / filename
            temp_path = archive_dir / f"temp_{filename}"
            
        elif module == "diary":
            filename = f"{file_uuid}{extension}"
            media_dir = get_file_storage_dir() / "secure" / "entries" / "media"
            final_path = media_dir / filename
            temp_path = media_dir / f"temp_{filename}"
            
        else:
            raise ValueError(f"Unsupported module: {module}")
        
        return final_path, temp_path

    async def _move_to_temp(self, src: Path, temp_dest: Path) -> None:
        """Move assembled file to temporary location."""
        temp_dest.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            await asyncio.to_thread(src.rename, temp_dest)
        except OSError as e:
            if e.errno == errno.EXDEV:  # Cross-device link
                await asyncio.to_thread(shutil.move, str(src), str(temp_dest))
            else:
                raise

    async def _create_record(self, db: AsyncSession, module: str, temp_path: Path, final_path: Path, metadata: Dict[str, Any], user: str) -> Any:
        """Create DB record based on module."""
        file_stat = await asyncio.to_thread(temp_path.stat)
        file_uuid = str(uuid_lib.uuid4())
        
        if module == "documents":
            from app.models.document import Document
            
            # Detect file type
            detection_result = await file_detector.detect_file_type(
                file_path=temp_path,
                file_content=None
            )
            
            record = Document(
                uuid=file_uuid,
                title=metadata.get("title", ""),
                original_name=metadata.get("original_name", final_path.name),
                filename=final_path.name,
                file_path=str(final_path.relative_to(get_file_storage_dir())),
                file_size=file_stat.st_size,
                mime_type=detection_result["mime_type"],
                description=metadata.get("description"),
                is_exclusive_mode=metadata.get("is_exclusive_mode", False),
                created_by=user
            )
            
        elif module == "notes":
            from app.models.note import NoteFile
            
            record = NoteFile(
                uuid=file_uuid,
                note_uuid=metadata.get("note_uuid"),
                filename=final_path.name,
                original_name=metadata.get("original_name", final_path.name),
                file_path=str(final_path.relative_to(get_file_storage_dir())),
                file_size=file_stat.st_size,
                mime_type=metadata.get("mime_type", "application/octet-stream"),
                description=metadata.get("description"),
                display_order=metadata.get("display_order", 0),
                is_deleted=False
                # created_by removed - redundant, already in parent note
                # is_exclusive_mode removed - always exclusive to parent note (cascade handles this)
            )
            
        elif module == "archive":
            from app.models.archive import ArchiveItem
            
            record = ArchiveItem(
                uuid=file_uuid,
                name=metadata.get("name", final_path.stem),
                description=metadata.get("description"),
                folder_uuid=metadata.get("folder_uuid"),
                original_filename=metadata.get("original_name", final_path.name),
                stored_filename=final_path.name,
                file_path=str(final_path.relative_to(get_file_storage_dir())),
                file_size=file_stat.st_size,
                mime_type=metadata.get("mime_type", "application/octet-stream"),
                upload_status=UploadStatus.COMPLETED,
                is_deleted=False,
                created_by=user
            )
            
        elif module == "diary":
            from app.models.diary import DiaryMedia
            
            record = DiaryMedia(
                uuid=file_uuid,
                diary_entry_uuid=metadata.get("entry_id"),
                filename=final_path.name,
                original_name=metadata.get("original_name", final_path.name),
                file_path=str(final_path.relative_to(get_file_storage_dir())),
                file_size=file_stat.st_size,
                mime_type=metadata.get("mime_type", "application/octet-stream"),
                media_type=metadata.get("media_type"),
                description=metadata.get("caption"),  # Note: caption -> description
                display_order=metadata.get("display_order", 0),
                is_deleted=False
                # is_encrypted removed - diary media is always encrypted by default
                # created_by removed - redundant, already in parent diary entry
                # is_exclusive_mode removed - always exclusive to parent diary entry (cascade handles this)
            )
            
        else:
            raise ValueError(f"Unsupported module: {module}")
        
        db.add(record)
        await db.flush()
        return record

    async def _handle_associations(self, db: AsyncSession, module: str, record: Any, metadata: Dict[str, Any], user: str) -> None:
        """Handle tags and project associations."""
        # Handle tags for modules that support them
        if module in ["documents", "notes", "archive"] and metadata.get("tags"):
            from app.services.tag_service import tag_service
            from app.models.tag_associations import document_tags, note_tags, archive_item_tags
            
            association_tables = {
                "documents": document_tags,
                "notes": note_tags,
                "archive": archive_item_tags
            }
            
            association_table = association_tables[module]
            await tag_service.handle_tags(
                db, record, metadata["tags"], user,
                None,  # ModuleType removed - tags are universal
                association_table
            )
        
        # Handle projects for modules that support them
        if module in ["documents", "notes"] and metadata.get("project_ids"):
            from app.models.associations import document_projects, note_projects
            from app.services.project_service import project_service
            
            project_associations = {
                "documents": document_projects,
                "notes": note_projects
            }
            
            association = project_associations[module]
            await project_service.handle_associations(
                db, record, metadata["project_ids"], user, association, f"{module}_uuid"
            )
        
        # Handle note file count update
        if module == "notes":
            await self._update_note_file_count(db, record.note_uuid)
        
        # Handle archive folder metadata
        if module == "archive" and metadata.get("folder_uuid"):
            await self._update_folder_metadata(db, metadata["folder_uuid"])
        
        # Handle diary media count update
        if module == "diary":
            await self._update_diary_media_count(db, metadata.get("entry_id"))

    async def _finalize_file(self, temp_path: Path, final_path: Path, record: Any, db: AsyncSession) -> None:
        """Move temp file to final location after DB commit."""
        try:
            await asyncio.to_thread(temp_path.rename, final_path)
            logger.info(f"SUCCESS: File moved to final location: {final_path}")
            
            # Update record with final path if needed
            if hasattr(record, 'file_path'):
                record.file_path = str(final_path.relative_to(get_file_storage_dir()))
                await db.commit()
                
        except Exception as e:
            logger.error(f"ERROR: Failed to move file to final location: {e}")
            # Clean up temp file
            try:
                if await asyncio.to_thread(temp_path.exists):
                    await asyncio.to_thread(temp_path.unlink)
            except Exception:
                pass
            raise HTTPException(status_code=500, detail="Failed to finalize file storage")

    async def _cleanup_on_error(self, db: AsyncSession, temp_path: Optional[Path], assembled_path: Optional[Path]) -> None:
        """Cleanup temporary files and rollback DB on error."""
        try:
            await db.rollback()
        except Exception:
            pass
        
        # Cleanup temp file if it exists
        if temp_path:
            try:
                if await asyncio.to_thread(temp_path.exists):
                    await asyncio.to_thread(temp_path.unlink)
            except Exception:
                pass
        
        # Cleanup assembled file if it exists
        if assembled_path:
            try:
                if await asyncio.to_thread(assembled_path.exists):
                    await asyncio.to_thread(assembled_path.unlink)
            except Exception:
                pass

    async def _update_note_file_count(self, db: AsyncSession, note_uuid: str) -> None:
        """Update note file count when files are added/removed."""
        from sqlalchemy import func, select
        from app.models.note import Note
        
        count_query = select(func.count(NoteFile.uuid)).where(
            NoteFile.note_uuid == note_uuid,
            NoteFile.is_deleted == False
        )
        result = await db.execute(count_query)
        file_count = result.scalar() or 0
        
        # Update note record
        update_stmt = (
            Note.__table__.update()
            .where(Note.uuid == note_uuid)
            .values(file_count=file_count)
        )
        await db.execute(update_stmt)

    async def _update_folder_metadata(self, db: AsyncSession, folder_uuid: str) -> None:
        """Update folder metadata when items are added/removed."""
        from app.models.archive import ArchiveFolder
        from sqlalchemy import func, select
        
        # Count items in folder
        count_query = select(func.count(ArchiveItem.uuid)).where(
            ArchiveItem.folder_uuid == folder_uuid,
            ArchiveItem.is_deleted == False
        )
        result = await db.execute(count_query)
        item_count = result.scalar() or 0
        
        # Calculate total size
        size_query = select(func.sum(ArchiveItem.file_size)).where(
            ArchiveItem.folder_uuid == folder_uuid,
            ArchiveItem.is_deleted == False
        )
        result = await db.execute(size_query)
        total_size = result.scalar() or 0
        
        # Update folder record
        update_stmt = (
            ArchiveFolder.__table__.update()
            .where(ArchiveFolder.uuid == folder_uuid)
            .values(item_count=item_count, total_size=total_size)
        )
        await db.execute(update_stmt)

    async def _update_diary_media_count(self, db: AsyncSession, entry_id: str) -> None:
        """Update diary entry media count when media is added/removed."""
        from app.models.diary import DiaryEntry, DiaryMedia
        from sqlalchemy import func, select
        
        # Count media items for entry
        count_query = select(func.count(DiaryMedia.uuid)).where(
            DiaryMedia.diary_entry_uuid == entry_id,
            DiaryMedia.is_deleted == False
        )
        result = await db.execute(count_query)
        media_count = result.scalar() or 0
        
        # Update entry record
        update_stmt = (
            DiaryEntry.__table__.update()
            .where(DiaryEntry.uuid == entry_id)
            .values(media_count=media_count)
        )
        await db.execute(update_stmt)

    async def _get_filesystem_path(self, folder_uuid: str, db: AsyncSession, created_by: Optional[str] = None) -> str:
        """Get filesystem path for archive folder."""
        from app.models.archive import ArchiveFolder
        
        if not db:
            # For path generation, we can't query DB, so return a default
            return "root"
        
        # Query folder and build path
        folder_result = await db.execute(
            select(ArchiveFolder).where(ArchiveFolder.uuid == folder_uuid)
        )
        folder = folder_result.scalar_one_or_none()
        
        if not folder:
            return "root"
        
        # Build path by traversing up the hierarchy
        path_parts = [folder.name]
        current_folder = folder
        
        while current_folder.parent_uuid:
            parent_result = await db.execute(
                select(ArchiveFolder).where(ArchiveFolder.uuid == current_folder.parent_uuid)
            )
            parent = parent_result.scalar_one_or_none()
            if parent:
                path_parts.insert(0, parent.name)
                current_folder = parent
            else:
                break
        
        return "/".join(path_parts)

    # Utility methods (keep existing functionality)
    async def verify_file_integrity(
        self,
        file_path: Path,
        expected_hash: str,
        algorithm: str = "sha256"
    ) -> bool:
        """
        Verify file integrity by comparing hash.
        
        Args:
            file_path: Path to the file to verify
            expected_hash: Expected hash value
            algorithm: Hash algorithm to use (default: sha256)
            
        Returns:
            True if file integrity is verified
        """
        try:
            actual_hash = await asyncio.to_thread(self._calculate_file_hash, file_path, algorithm)
            return actual_hash == expected_hash
        except Exception as e:
            logger.error(f"Error verifying file integrity: {e}")
            return False

    def _calculate_file_hash(self, file_path: Path, algorithm: str = "sha256") -> str:
        """Calculate file hash using specified algorithm."""
        hash_obj = hashlib.new(algorithm)
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_obj.update(chunk)
        return hash_obj.hexdigest()

    async def safe_delete_file(
        self,
        file_path: Path,
        backup: bool = True
    ) -> bool:
        """
        Safely delete a file with optional backup.
        
        Args:
            file_path: Path to the file to delete
            backup: Whether to create a backup before deletion
            
        Returns:
            True if deletion was successful
        """
        return await asyncio.to_thread(self._sync_delete_file, file_path, backup)

    def _sync_delete_file(self, file_path: Path, backup: bool) -> bool:
        """Synchronously delete file with optional backup."""
        try:
            if not file_path.exists():
                logger.warning(f"File does not exist: {file_path}")
                return True
            
            if backup:
                backup_path = file_path.with_suffix(file_path.suffix + ".backup")
                shutil.copy2(file_path, backup_path)
                logger.info(f"Created backup: {backup_path}")
            
            file_path.unlink()
            logger.info(f"Deleted file: {file_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete file {file_path}: {str(e)}")
            return False

    async def safe_move_file(
        self,
        src_path: Path,
        dest_path: Path,
        create_backup: bool = True
    ) -> bool:
        """
        Safely move a file with optional backup of destination.
        
        Args:
            src_path: Source file path
            dest_path: Destination file path
            create_backup: Whether to backup destination if it exists
            
        Returns:
            True if move was successful
        """
        return await asyncio.to_thread(self._sync_move_file, src_path, dest_path, create_backup)

    def _sync_move_file(self, src_path: Path, dest_path: Path, create_backup: bool) -> bool:
        """Synchronously move file with optional backup."""
        try:
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            if dest_path.exists() and create_backup:
                backup_path = dest_path.with_suffix(dest_path.suffix + ".backup")
                shutil.copy2(dest_path, backup_path)
                logger.info(f"Created backup: {backup_path}")
            
            try:
                src_path.rename(dest_path)
            except OSError as e:
                if e.errno == errno.EXDEV:
                    # Cross-device: copy then delete
                    shutil.move(str(src_path), str(dest_path))
                else:
                    raise
            
            logger.info(f"Moved file: {src_path} -> {dest_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to move file {src_path} -> {dest_path}: {str(e)}")
            return False


# Create singleton instance
unified_upload_service = UnifiedUploadService()