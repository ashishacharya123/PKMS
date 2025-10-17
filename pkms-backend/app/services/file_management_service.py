"""
FileManagementService - Centralized file management functionality

Handles:
- Atomic file upload commits
- File integrity verification
- Temporary file management
- Cross-platform file operations
- Document and note file uploads
"""

import shutil
import hashlib
import uuid as uuid_lib
from pathlib import Path
from typing import Optional, Dict, Any, Type
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
import logging

from app.services.chunk_service import chunk_manager
from app.services.file_detection import FileTypeDetectionService
from app.config import get_data_dir, get_file_storage_dir
from app.utils.security import sanitize_filename, validate_file_size
from app.config import settings

logger = logging.getLogger(__name__)
file_detector = FileTypeDetectionService()


class FileManagementService:
    """Centralized service for file management operations"""

    async def commit_upload(
        self,
        db: AsyncSession,
        upload_id: str,
        parent_item: any,
        file_field_name: str,
        file_extension: str,
        subdirectory: str = "uploads"
    ) -> str:
        """
        Commit a chunked file upload atomically.
        
        Args:
            db: Database session
            upload_id: The upload ID from chunk manager
            parent_item: The parent item (note, document, diary entry)
            file_field_name: The field name to set on the parent item (e.g., 'file_path')
            file_extension: File extension (e.g., '.pdf', '.jpg')
            subdirectory: Subdirectory within data directory
            
        Returns:
            Final file path relative to data directory
        """
        try:
            # Check upload status
            status = chunk_manager.get_upload_status(upload_id)
            if status["status"] != "completed":
                raise HTTPException(
                    status_code=400,
                    detail=f"Upload not completed. Status: {status['status']}"
                )

            # Locate assembled file
            assembled_path = Path(status["file_path"])
            if not assembled_path.exists():
                raise HTTPException(
                    status_code=404,
                    detail="Assembled file not found"
                )

            # Verify parent item exists
            if not parent_item:
                raise HTTPException(
                    status_code=404,
                    detail="Parent item not found"
                )

            # Create final destination path
            data_dir = get_data_dir()
            final_dir = data_dir / subdirectory
            final_dir.mkdir(parents=True, exist_ok=True)
            
            final_filename = f"{parent_item.uuid}{file_extension}"
            final_path = final_dir / final_filename
            
            # Create temporary path for atomic operation
            temp_path = final_dir / f"temp_{final_filename}"

            # Move to temporary location first
            shutil.move(str(assembled_path), str(temp_path))
            logger.info(f"✅ File moved to temporary location: {temp_path}")

            # Update parent item with final path
            final_relative_path = f"{subdirectory}/{final_filename}"
            setattr(parent_item, file_field_name, final_relative_path)
            await db.flush()

            # Commit database transaction
            await db.commit()
            logger.info(f"✅ Database transaction committed for {parent_item.uuid}")

            # Move to final location after successful DB commit
            temp_path.rename(final_path)
            logger.info(f"✅ File moved to final location: {final_path}")

            # Clean up upload from chunk manager
            chunk_manager.remove_upload(upload_id)

            return final_relative_path

        except Exception as e:
            # Cleanup on failure
            try:
                if 'temp_path' in locals() and temp_path.exists():
                    temp_path.unlink()
                    logger.info(f"🧹 Cleaned up temporary file: {temp_path}")
            except Exception as cleanup_error:
                logger.error(f"❌ Failed to cleanup temp file: {cleanup_error}")

            try:
                if 'assembled_path' in locals() and assembled_path.exists():
                    assembled_path.unlink()
                    logger.info(f"🧹 Cleaned up assembled file: {assembled_path}")
            except Exception as cleanup_error:
                logger.error(f"❌ Failed to cleanup assembled file: {cleanup_error}")

            await db.rollback()
            logger.error(f"❌ Upload commit failed: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to commit upload: {str(e)}"
            )

    async def commit_document_upload(
        self,
        db: AsyncSession,
        upload_id: str,
        title: str,
        description: Optional[str],
        tags: Optional[list],
        project_ids: Optional[list],
        is_exclusive_mode: bool,
        user_id: int,
        document_model: Type,
        tag_service: any,
        project_service: any,
        document_tags: any,
        document_projects: any
    ) -> any:
        """
        Commit a document upload with full metadata handling.
        
        This method handles the complete document upload process including:
        - File assembly and validation
        - Metadata extraction
        - Database record creation
        - Tag and project associations
        - Atomic file operations
        
        Returns:
            Created Document object with all associations loaded
        """
        try:
            logger.info(f"Committing document upload: {title}")
            
            # Check assembled file status
            status_obj = await chunk_manager.get_upload_status(upload_id)
            logger.info(f"File status: {status_obj}")
            if not status_obj or status_obj.get("status") != "completed":
                logger.warning(f"File not ready - status: {status_obj.get('status') if status_obj else 'None'}")
                raise HTTPException(status_code=400, detail=f"File not yet assembled - status: {status_obj.get('status') if status_obj else 'None'}")

            # Locate assembled file path
            temp_dir = Path(get_data_dir()) / "temp_uploads"
            logger.info(f"Looking for assembled file in: {temp_dir}")
            assembled = next(temp_dir.glob(f"complete_{upload_id}_*"), None)
            if not assembled:
                # List what files are actually in temp_dir for debugging
                available_files = list(temp_dir.glob("*"))
                logger.error(f"Assembled file not found. Available files: {available_files}")
                raise HTTPException(status_code=404, detail=f"Assembled file not found in {temp_dir}")

            # Prepare destination directory
            docs_dir = get_file_storage_dir() / "assets" / "documents"
            docs_dir.mkdir(parents=True, exist_ok=True)

            # Generate human-readable filename: originalname_UUID.ext
            file_uuid = str(uuid_lib.uuid4())
            file_extension = assembled.suffix
            
            # Extract original filename from assembled filename (remove chunk prefixes)
            original_name = assembled.name.replace(f"complete_{upload_id}_", "")
            # Remove file extension from original name if present
            if original_name.endswith(file_extension):
                original_name = original_name[:-len(file_extension)]
            # SECURITY: Proper filename sanitization to prevent path traversal
            safe_original = sanitize_filename(original_name)
            # Limit filename length to prevent filesystem issues
            if len(safe_original) > 100:
                safe_original = safe_original[:100]
            
            stored_filename = f"{safe_original}_{file_uuid}{file_extension}"
            temp_dest_path = docs_dir / f"temp_{stored_filename}"  # Temporary location
            final_dest_path = docs_dir / stored_filename  # Final location

            # Move assembled file to TEMPORARY location first; handle cross-device moves (EXDEV)
            try:
                assembled.rename(temp_dest_path)
            except OSError as move_err:
                import errno as _errno
                if getattr(move_err, 'errno', None) == _errno.EXDEV:
                    # Fallback to shutil.move which copies across devices, then unlinks
                    shutil.move(str(assembled), str(temp_dest_path))
                else:
                    raise

            # Get file size before database operations
            file_size = temp_dest_path.stat().st_size
            
            # SECURITY: Validate file size to prevent DoS attacks
            validate_file_size(file_size, settings.max_file_size)
            
            file_path_relative = str(final_dest_path.relative_to(get_file_storage_dir()))
            
            # Detect file type and extract metadata
            detection_result = await file_detector.detect_file_type(
                file_path=temp_dest_path,
                file_content=None  # File is already on disk
            )

            # SECURITY: Validate and sanitize input fields
            if not title or len(title.strip()) == 0:
                raise HTTPException(status_code=400, detail="Title is required")
            from app.utils.security import sanitize_text_input
            sanitized_title = sanitize_text_input(title, 200)
            sanitized_description = sanitize_text_input(description or "", 1000)
            
            # Create Document record
            document = document_model(
                uuid=file_uuid,
                title=sanitized_title,
                original_name=original_name + file_extension,  # Use the cleaned original name
                filename=stored_filename,
                file_path=file_path_relative,
                file_size=file_size,
                mime_type=detection_result["mime_type"],
                description=sanitized_description,
                upload_status="completed",
                is_exclusive_mode=is_exclusive_mode or False,
                user_uuid=user_id,
                # Projects will be handled by project associations
            )
            
            db.add(document)
            await db.flush()  # Get the ID for tag associations

            # Handle tags
            if tags:
                # SECURITY: Sanitize tags to prevent XSS injection
                from app.utils.security import sanitize_tags
                sanitized_tags = sanitize_tags(tags)
                await tag_service.handle_tags(db, document, sanitized_tags, user_id, "documents", document_tags)

            # Handle projects (with ownership verification)
            if project_ids:
                await project_service.handle_associations(db, document, project_ids, user_id, document_projects, "document_uuid")

            await db.commit()
            
            # SECURITY: Move file to final location ONLY after successful DB commit
            try:
                temp_dest_path.rename(final_dest_path)
                logger.info(f"✅ File moved to final location: {final_dest_path}")
            except Exception as move_error:
                logger.error(f"❌ Failed to move file to final location: {move_error}")
                # Clean up temp file
                try:
                    if temp_dest_path.exists():
                        temp_dest_path.unlink()
                except Exception:
                    pass
                raise HTTPException(status_code=500, detail="Failed to finalize file storage")
            
            # Reload document with tags to avoid lazy loading issues in response conversion
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload
            result = await db.execute(
                select(document_model).options(selectinload(document_model.tag_objs)).where(
                    document_model.id == document.id
                )
            )
            document_with_tags = result.scalar_one()

            # Clean up temporary file tracking
            if upload_id in chunk_manager.uploads:
                del chunk_manager.uploads[upload_id]

            logger.info(f"Document committed successfully: {stored_filename}")
            
            return document_with_tags
            
        except HTTPException:
            await db.rollback()
            # Clean up temp file on DB rollback
            try:
                if 'temp_dest_path' in locals() and temp_dest_path.exists():
                    temp_dest_path.unlink()
            except Exception:
                pass
            raise
        except Exception as e:
            await db.rollback()
            # Clean up temp file on DB rollback
            try:
                if 'temp_dest_path' in locals() and temp_dest_path.exists():
                    temp_dest_path.unlink()
            except Exception:
                pass
            logger.exception("Error committing document upload")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to commit document upload: {str(e)}"
            )

    async def commit_note_file_upload(
        self,
        db: AsyncSession,
        upload_id: str,
        note_uuid: str,
        original_name: Optional[str],
        description: Optional[str],
        user_id: int
    ) -> any:
        """
        Commit a note file upload with full metadata handling.

        This method handles the complete note file upload process including:
        - File assembly and validation
        - Note verification
        - NoteFile record creation
        - Note file count update
        - Atomic file operations

        Returns:
            Created NoteFile object
        """
        try:
            logger.info(f"Committing note file upload: {note_uuid}")

            # Verify note exists and belongs to user
            from app.models.note import Note
            note_result = await db.execute(
                select(Note).where(
                    and_(Note.uuid == note_uuid, Note.user_uuid == user_id)
                )
            )
            note = note_result.scalar_one_or_none()
            if not note:
                raise HTTPException(status_code=404, detail="Note not found")

            # Check upload status
            status_obj = await chunk_manager.get_upload_status(upload_id)
            if not status_obj or status_obj.get("status") != "completed":
                raise HTTPException(status_code=400, detail="File not yet assembled")

            # Locate assembled file
            temp_dir = Path(get_data_dir()) / "temp_uploads"
            assembled = next(temp_dir.glob(f"complete_{upload_id}_*"), None)
            if not assembled:
                raise HTTPException(status_code=404, detail="Assembled file not found")

            # Prepare destination directory
            files_dir = get_file_storage_dir() / "assets" / "notes" / "files"
            files_dir.mkdir(parents=True, exist_ok=True)

            # Generate unique filename
            file_uuid = str(uuid_lib.uuid4())
            file_extension = assembled.suffix
            stored_filename = f"{file_uuid}{file_extension}"
            temp_dest_path = files_dir / f"temp_{stored_filename}"  # Temporary location
            final_dest_path = files_dir / stored_filename  # Final location

            # Move assembled file to TEMPORARY location first
            assembled.rename(temp_dest_path)

            # Get file info before database operations
            file_size = temp_dest_path.stat().st_size
            file_path_relative = str(final_dest_path.relative_to(get_file_storage_dir()))

            # Create NoteFile record
            note_file = NoteFile(
                note_uuid=note_uuid,
                user_uuid=user_id,
                filename=stored_filename,
                original_name=original_name or "uploaded_file",
                file_path=file_path_relative,
                file_size=file_size,
                mime_type=status_obj.get("mime_type", "application/octet-stream"),
                description=description
            )

            db.add(note_file)
            await db.flush()

            # Update note file count
            from sqlalchemy import func
            file_count_result = await db.execute(
                select(func.count(NoteFile.uuid)).where(NoteFile.note_uuid == note_uuid)
            )
            new_file_count = file_count_result.scalar() or 0
            note.file_count = new_file_count

            await db.commit()
            await db.refresh(note_file)

            # SECURITY: Move file to final location ONLY after successful DB commit
            try:
                temp_dest_path.rename(final_dest_path)
                logger.info(f"✅ File moved to final location: {final_dest_path}")
            except Exception as move_error:
                logger.error(f"❌ Failed to move file to final location: {move_error}")
                # Clean up temp file
                try:
                    if temp_dest_path.exists():
                        temp_dest_path.unlink()
                except Exception:
                    pass
                raise HTTPException(status_code=500, detail="Failed to finalize file storage")

            # Clean up temporary file tracking
            if upload_id in chunk_manager.uploads:
                del chunk_manager.uploads[upload_id]

            logger.info(f"Note file committed successfully: {stored_filename}")

            return note_file

        except HTTPException:
            await db.rollback()
            # Clean up temp file on HTTP exception
            try:
                if 'temp_dest_path' in locals() and temp_dest_path.exists():
                    temp_dest_path.unlink()
            except Exception:
                pass
            raise
        except Exception as e:
            await db.rollback()
            # Clean up temp file on DB rollback
            try:
                if 'temp_dest_path' in locals() and temp_dest_path.exists():
                    temp_dest_path.unlink()
            except Exception:
                pass
            logger.error(f"❌ Error committing note file upload: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to commit note file upload"
            )

    async def verify_file_integrity(
        self,
        file_path: Path,
        expected_size: Optional[int] = None,
        expected_hash: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Verify file integrity by checking size and/or hash.
        
        Args:
            file_path: Path to the file
            expected_size: Expected file size in bytes
            expected_hash: Expected file hash (SHA-256)
            
        Returns:
            Dictionary with verification results
        """
        if not file_path.exists():
            return {
                "valid": False,
                "error": "File does not exist"
            }

        # Check file size
        actual_size = file_path.stat().st_size
        if expected_size and actual_size != expected_size:
            return {
                "valid": False,
                "error": f"Size mismatch: expected {expected_size}, got {actual_size}"
            }

        # Check file hash
        if expected_hash:
            actual_hash = self._calculate_file_hash(file_path)
            if actual_hash != expected_hash:
                return {
                    "valid": False,
                    "error": f"Hash mismatch: expected {expected_hash}, got {actual_hash}"
                }

        return {
            "valid": True,
            "size": actual_size,
            "hash": actual_hash if expected_hash else None
        }

    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA-256 hash of a file."""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                sha256_hash.update(chunk)
        return sha256_hash.hexdigest()

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
        if not file_path.exists():
            logger.warning(f"⚠️ File does not exist: {file_path}")
            return True

        try:
            if backup:
                backup_path = file_path.with_suffix(file_path.suffix + ".backup")
                shutil.copy2(file_path, backup_path)
                logger.info(f"📦 Created backup: {backup_path}")

            file_path.unlink()
            logger.info(f"🗑️ Deleted file: {file_path}")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to delete file {file_path}: {str(e)}")
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
        try:
            # Create destination directory if it doesn't exist
            dest_path.parent.mkdir(parents=True, exist_ok=True)

            # Backup destination if it exists
            if dest_path.exists() and create_backup:
                backup_path = dest_path.with_suffix(dest_path.suffix + ".backup")
                shutil.copy2(dest_path, backup_path)
                logger.info(f"📦 Created backup: {backup_path}")

            # Move the file
            shutil.move(str(src_path), str(dest_path))
            logger.info(f"📁 Moved file: {src_path} -> {dest_path}")
            return True

        except Exception as e:
            logger.error(f"❌ Failed to move file {src_path} -> {dest_path}: {str(e)}")
            return False


# Create singleton instance
file_management_service = FileManagementService()
