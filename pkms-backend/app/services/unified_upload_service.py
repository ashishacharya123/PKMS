'''
UnifiedUploadService - Ensures atomic file operations and database consistency
'''

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
from app.services.thumbnail_service import thumbnail_service
from app.config import get_data_dir, get_file_storage_dir
from app.utils.security import sanitize_filename
from sqlalchemy import select, and_, func

from app.models.note import NoteFile
from app.models.enums import UploadStatus, ModuleType

logger = logging.getLogger(__name__)
file_detector = FileTypeDetectionService()


class UnifiedUploadService:
    """Ensures atomic file operations and database consistency across all modules"""

    async def commit_upload(
        self,
        db: AsyncSession,
        upload_id: str,
        module: str,
        created_by: str,
        metadata: Dict[str, Any],
        pre_commit_callback: Optional[Callable] = None
    ) -> Any:
        temp_path = None
        assembled_path = None
        
        try:
            assembled_path = await self._locate_assembled_file(upload_id, created_by)
            
            if pre_commit_callback:
                assembled_path, metadata = await pre_commit_callback(assembled_path, metadata)
            
            final_path, temp_path = await self._generate_paths(module, assembled_path, metadata, db)
            
            await self._move_to_temp(assembled_path, temp_path)
            
            record = await self._create_record(db, module, temp_path, final_path, metadata, created_by)
            
            await self._handle_associations(db, module, record, metadata, created_by)
            
            await db.commit()
            
            await self._finalize_file(temp_path, final_path, record, db)
            
            # Generate thumbnails after successful upload
            await self._generate_thumbnails(final_path)
            
            await chunk_manager.cleanup_upload(upload_id)
            
            return record
            
        except Exception as e:
            await self._cleanup_on_error(db, temp_path, assembled_path)
            raise
    
    async def _generate_thumbnails(self, file_path: Path):
        """Generate thumbnails for uploaded file"""
        try:
            # Get thumbnail directory (same level as file storage)
            thumbnail_dir = get_file_storage_dir() / "thumbnails"
            
            # Generate all thumbnail sizes
            await thumbnail_service.generate_all_sizes(file_path, thumbnail_dir)
            logger.info(f"Generated thumbnails for: {file_path}")
            
        except Exception as e:
            logger.error(f"Failed to generate thumbnails for {file_path}: {e}")
            # Don't fail the upload if thumbnail generation fails

    async def _locate_assembled_file(self, upload_id: str, created_by: str) -> Path:
        status_obj = await chunk_manager.get_upload_status(upload_id)
        if not status_obj:
            raise HTTPException(status_code=404, detail="Upload not found")
        
        if status_obj.get("created_by") != created_by:
            raise HTTPException(status_code=403, detail="Access denied: upload does not belong to you")
        
        if status_obj.get("status") != ChunkUploadStatus.COMPLETED:
            raise HTTPException(status_code=400, detail="File not yet assembled")
        
        temp_dir = Path(get_data_dir()) / "temp_uploads"
        assembled = await asyncio.to_thread(lambda: next(temp_dir.glob(f"complete_{upload_id}_*"), None))
        
        if not assembled:
            raise HTTPException(status_code=404, detail=f"Assembled file not found in {temp_dir}")
        
        return assembled

    async def _generate_paths(self, module: str, assembled: Path, metadata: Dict[str, Any], db: Optional[AsyncSession] = None) -> tuple[Path, Path]:
        file_uuid = metadata.get("file_uuid", str(uuid_lib.uuid4()))
        extension = assembled.suffix
        
        if module == "documents":
            original_name = metadata.get("original_name", assembled.name.replace(f"complete_{metadata.get('upload_id', '')}_", ""))
            safe_original = sanitize_filename(original_name.replace(extension, ""))
            stored_filename = f"{safe_original[:100]}_{file_uuid}{extension}"
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
            if folder_uuid and db:
                folder_path = await self._get_filesystem_path(folder_uuid, db)
                archive_dir = get_file_storage_dir() / "assets" / "archive" / folder_path
            else:
                archive_dir = get_file_storage_dir() / "assets" / "archive"
            final_path = archive_dir / filename
            temp_path = archive_dir / f"temp_{filename}"
            
        elif module == "diary":
            filename = metadata.get("filename", f"{file_uuid}{extension}")
            files_dir = get_file_storage_dir() / "secure" / "entries" / "files"
            final_path = files_dir / filename
            temp_path = files_dir / f"temp_{filename}"
            
        else:
            raise ValueError(f"Unsupported module: {module}")
        
        return final_path, temp_path

    async def _move_to_temp(self, src: Path, temp_dest: Path) -> None:
        temp_dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            await asyncio.to_thread(src.rename, temp_dest)
        except OSError as e:
            if e.errno == errno.EXDEV:
                await asyncio.to_thread(shutil.move, str(src), str(temp_dest))
            else:
                raise

    async def _create_record(self, db: AsyncSession, module: str, temp_path: Path, final_path: Path, metadata: Dict[str, Any], user: str) -> Any:
        file_stat = await asyncio.to_thread(temp_path.stat)
        file_uuid = metadata.get("file_uuid", str(uuid_lib.uuid4()))
        
        if module == "documents":
            from app.models.document import Document
            detection_result = await file_detector.detect_file_type(file_path=temp_path)
            record = Document(
                uuid=file_uuid,
                title=metadata.get("title", ""),
                original_name=metadata.get("original_name", final_path.name),
                filename=final_path.name,
                file_path=str(final_path.relative_to(get_file_storage_dir())),
                file_size=file_stat.st_size,
                mime_type=detection_result["mime_type"],
                description=metadata.get("description"),
                is_project_exclusive=metadata.get("is_project_exclusive", False),
                is_diary_exclusive=metadata.get("is_diary_exclusive", False),
                created_by=user
            )
            
        elif module == "notes":
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
                created_by=user
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
                created_by=user
            )
            
        # Diary files now use Document + document_diary association, handled in documents module
            
        else:
            raise ValueError(f"Unsupported module: {module}")
        
        db.add(record)
        await db.flush()
        return record

    async def _handle_associations(self, db: AsyncSession, module: str, record: Any, metadata: Dict[str, Any], user: str) -> None:
        if module in ["documents", "notes", "archive"] and metadata.get("tags"):
            from app.services.tag_service import tag_service
            from app.models.tag_associations import document_tags, note_tags, archive_item_tags
            association_tables = {"documents": document_tags, "notes": note_tags, "archive": archive_item_tags}
            await tag_service.handle_tags(db, record, metadata["tags"], user, None, association_tables[module])
        
        if module in ["documents", "notes"] and metadata.get("project_ids"):
            from app.models.associations import document_projects, note_projects
            from app.services.project_service import project_service
            project_associations = {"documents": document_projects, "notes": note_projects}
            await project_service.handle_associations(db, record, metadata["project_ids"], user, project_associations[module], f"{module}_uuid")
        
        if module == "notes":
            await self._update_note_file_count(db, record.note_uuid)
        
        if module == "archive" and metadata.get("folder_uuid"):
            await self._update_folder_metadata(db, metadata["folder_uuid"])
        
        # Diary files now use Document + document_diary association, no special handling needed

    async def _finalize_file(self, temp_path: Path, final_path: Path, record: Any, db: AsyncSession) -> None:
        try:
            await asyncio.to_thread(temp_path.rename, final_path)
            logger.info(f"SUCCESS: File moved to final location: {final_path}")
            if hasattr(record, 'file_path'):
                record.file_path = str(final_path.relative_to(get_file_storage_dir()))
                await db.commit()
        except Exception as e:
            logger.error(f"ERROR: Failed to move file to final location: {e}")
            if await asyncio.to_thread(temp_path.exists):
                await asyncio.to_thread(temp_path.unlink)
            raise HTTPException(status_code=500, detail="Failed to finalize file storage")

    async def _cleanup_on_error(self, db: AsyncSession, temp_path: Optional[Path], assembled_path: Optional[Path]) -> None:
        try:
            await db.rollback()
        except Exception:
            pass
        if temp_path and await asyncio.to_thread(temp_path.exists):
            await asyncio.to_thread(temp_path.unlink)
        if assembled_path and await asyncio.to_thread(assembled_path.exists):
            await asyncio.to_thread(assembled_path.unlink)

    async def _update_note_file_count(self, db: AsyncSession, note_uuid: str) -> None:
        from app.models.note import Note
        count_query = select(func.count(NoteFile.uuid)).where(NoteFile.note_uuid == note_uuid, NoteFile.is_deleted.is_(False))
        result = await db.execute(count_query)
        await db.execute(Note.__table__.update().where(Note.uuid == note_uuid).values(file_count=result.scalar() or 0))

    async def _update_folder_metadata(self, db: AsyncSession, folder_uuid: str) -> None:
        from app.models.archive import ArchiveFolder, ArchiveItem
        count_query = select(func.count(ArchiveItem.uuid)).where(ArchiveItem.folder_uuid == folder_uuid, ArchiveItem.is_deleted.is_(False))
        size_query = select(func.sum(ArchiveItem.file_size)).where(ArchiveItem.folder_uuid == folder_uuid, ArchiveItem.is_deleted.is_(False))
        count_res = await db.execute(count_query)
        size_res = await db.execute(size_query)
        await db.execute(ArchiveFolder.__table__.update().where(ArchiveFolder.uuid == folder_uuid).values(item_count=count_res.scalar() or 0, total_size=size_res.scalar() or 0))

    # Diary file count updates are now handled by DiaryDocumentService
    # when documents are linked/unlinked via document_diary association

    async def _get_filesystem_path(self, folder_uuid: str, db: AsyncSession) -> str:
        from app.models.archive import ArchiveFolder
        if not db:
            return "root"
        folder_res = await db.execute(select(ArchiveFolder).where(ArchiveFolder.uuid == folder_uuid))
        folder = folder_res.scalar_one_or_none()
        if not folder:
            return "root"
        path_parts = [folder.name]
        current_folder = folder
        while current_folder.parent_uuid:
            parent_res = await db.execute(select(ArchiveFolder).where(ArchiveFolder.uuid == current_folder.parent_uuid))
            parent = parent_res.scalar_one_or_none()
            if parent:
                path_parts.insert(0, parent.name)
                current_folder = parent
            else:
                break
        return "/".join(path_parts)


# Global instance
unified_upload_service = UnifiedUploadService()
