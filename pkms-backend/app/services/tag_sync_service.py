"""
Tag Synchronization Service
Automatically keeps tags_text columns in sync with tag relationships for FTS5 search
"""

import logging
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, update
from sqlalchemy.orm import selectinload

from ..models.note import Note
from ..models.document import Document
from ..models.todo import Todo, Project
from ..models.archive import ArchiveItem, ArchiveFolder
from ..models.diary import DiaryEntry
from ..models.tag import Tag

logger = logging.getLogger(__name__)


class TagSyncService:
    """Service for keeping tags_text columns synchronized with tag relationships"""
    
    @staticmethod
    async def sync_note_tags(db: AsyncSession, note_uuid: str) -> bool:
        """Sync tags_text for a specific note"""
        try:
            # Get note with tags
            result = await db.execute(
                select(Note).options(selectinload(Note.tag_objs)).where(Note.uuid == note_uuid)
            )
            note = result.scalar_one_or_none()
            
            if not note:
                return False
            
            # Build tags_text from tag names
            tag_names = [tag.name for tag in note.tag_objs]
            tags_text = " ".join(tag_names)
            
            # Update tags_text column
            await db.execute(
                update(Note)
                .where(Note.uuid == note_uuid)
                .values(tags_text=tags_text)
            )
            
            await db.commit()
            logger.debug(f"Synced tags_text for note {note_uuid}: {tags_text}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to sync tags_text for note {note_uuid}: {e}")
            await db.rollback()
            return False
    
    @staticmethod
    async def sync_document_tags(db: AsyncSession, document_uuid: str) -> bool:
        """Sync tags_text for a specific document"""
        try:
            # Get document with tags
            result = await db.execute(
                select(Document).options(selectinload(Document.tag_objs)).where(Document.uuid == document_uuid)
            )
            document = result.scalar_one_or_none()
            
            if not document:
                return False
            
            # Build tags_text from tag names
            tag_names = [tag.name for tag in document.tag_objs]
            tags_text = " ".join(tag_names)
            
            # Update tags_text column
            await db.execute(
                update(Document)
                .where(Document.uuid == document_uuid)
                .values(tags_text=tags_text)
            )
            
            await db.commit()
            logger.debug(f"Synced tags_text for document {document_uuid}: {tags_text}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to sync tags_text for document {document_uuid}: {e}")
            await db.rollback()
            return False
    
    @staticmethod
    async def sync_todo_tags(db: AsyncSession, todo_id: int) -> bool:
        """Sync tags_text for a specific todo"""
        try:
            # Get todo with tags
            result = await db.execute(
                select(Todo).options(selectinload(Todo.tag_objs)).where(Todo.uuid == todo_id)
            )
            todo = result.scalar_one_or_none()
            
            if not todo:
                return False
            
            # Build tags_text from tag names
            tag_names = [tag.name for tag in todo.tag_objs]
            tags_text = " ".join(tag_names)
            
            # Update tags_text column
            await db.execute(
                update(Todo)
                .where(Todo.uuid == todo_id)
                .values(tags_text=tags_text)
            )
            
            await db.commit()
            logger.debug(f"Synced tags_text for todo {todo_id}: {tags_text}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to sync tags_text for todo {todo_id}: {e}")
            await db.rollback()
            return False
    
    @staticmethod
    async def sync_project_tags(db: AsyncSession, project_uuid: str) -> bool:
        """Sync tags_text for a specific project"""
        try:
            # Get project with tags
            result = await db.execute(
                select(Project).options(selectinload(Project.tag_objs)).where(Project.uuid == project_uuid)
            )
            project = result.scalar_one_or_none()
            
            if not project:
                return False
            
            # Build tags_text from tag names
            tag_names = [tag.name for tag in project.tag_objs]
            tags_text = " ".join(tag_names)
            
            # Update tags_text column
            await db.execute(
                update(Project)
                .where(Project.uuid == project_uuid)
                .values(tags_text=tags_text)
            )
            
            await db.commit()
            logger.debug(f"Synced tags_text for project {project_uuid}: {tags_text}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to sync tags_text for project {project_uuid}: {e}")
            await db.rollback()
            return False
    
    @staticmethod
    async def sync_archive_item_tags(db: AsyncSession, item_uuid: str) -> bool:
        """Sync tags_text for a specific archive item"""
        try:
            # Get archive item with tags
            result = await db.execute(
                select(ArchiveItem).options(selectinload(ArchiveItem.tag_objs)).where(ArchiveItem.uuid == item_uuid)
            )
            item = result.scalar_one_or_none()
            
            if not item:
                return False
            
            # Build tags_text from tag names
            tag_names = [tag.name for tag in item.tag_objs]
            tags_text = " ".join(tag_names)
            
            # Update tags_text column
            await db.execute(
                update(ArchiveItem)
                .where(ArchiveItem.uuid == item_uuid)
                .values(tags_text=tags_text)
            )
            
            await db.commit()
            logger.debug(f"Synced tags_text for archive item {item_uuid}: {tags_text}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to sync tags_text for archive item {item_uuid}: {e}")
            await db.rollback()
            return False
    
    @staticmethod
    async def sync_archive_folder_tags(db: AsyncSession, folder_uuid: str) -> bool:
        """Sync tags_text for a specific archive folder"""
        try:
            # Get archive folder with tags
            result = await db.execute(
                select(ArchiveFolder).options(selectinload(ArchiveFolder.tag_objs)).where(ArchiveFolder.uuid == folder_uuid)
            )
            folder = result.scalar_one_or_none()
            
            if not folder:
                return False
            
            # Build tags_text from tag names
            tag_names = [tag.name for tag in folder.tag_objs]
            tags_text = " ".join(tag_names)
            
            # Update tags_text column
            await db.execute(
                update(ArchiveFolder)
                .where(ArchiveFolder.uuid == folder_uuid)
                .values(tags_text=tags_text)
            )
            
            await db.commit()
            logger.debug(f"Synced tags_text for archive folder {folder_uuid}: {tags_text}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to sync tags_text for archive folder {folder_uuid}: {e}")
            await db.rollback()
            return False
    
    @staticmethod
    async def sync_diary_entry_tags(db: AsyncSession, entry_uuid: str) -> bool:
        """Sync tags_text for a specific diary entry"""
        try:
            # Get diary entry with tags
            result = await db.execute(
                select(DiaryEntry).options(selectinload(DiaryEntry.tag_objs)).where(DiaryEntry.uuid == entry_uuid)
            )
            entry = result.scalar_one_or_none()
            
            if not entry:
                return False
            
            # Build tags_text from tag names
            tag_names = [tag.name for tag in entry.tag_objs]
            tags_text = " ".join(tag_names)
            
            # Update tags_text column
            await db.execute(
                update(DiaryEntry)
                .where(DiaryEntry.uuid == entry_uuid)
                .values(tags_text=tags_text)
            )
            
            await db.commit()
            logger.debug(f"Synced tags_text for diary entry {entry_uuid}: {tags_text}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to sync tags_text for diary entry {entry_uuid}: {e}")
            await db.rollback()
            return False
    
    @staticmethod
    async def sync_all_tags(db: AsyncSession) -> bool:
        """Sync tags_text for all content items"""
        try:
            logger.info("Starting full tags_text synchronization...")
            
            # Sync notes
            notes = await db.execute(select(Note.uuid))
            for note in notes:
                await TagSyncService.sync_note_tags(db, note[0])
            
            # Sync documents
            documents = await db.execute(select(Document.uuid))
            for document in documents:
                await TagSyncService.sync_document_tags(db, document[0])
            
            # Sync todos
            todos = await db.execute(select(Todo.uuid))
            for todo in todos:
                await TagSyncService.sync_todo_tags(db, todo[0])
            
            # Sync projects
            projects = await db.execute(select(Project.uuid))
            for project in projects:
                await TagSyncService.sync_project_tags(db, project[0])
            
            # Sync archive items
            archive_items = await db.execute(select(ArchiveItem.uuid))
            for item in archive_items:
                await TagSyncService.sync_archive_item_tags(db, item[0])
            
            # Sync archive folders
            archive_folders = await db.execute(select(ArchiveFolder.uuid))
            for folder in archive_folders:
                await TagSyncService.sync_archive_folder_tags(db, folder[0])
            
            # Sync diary entries
            diary_entries = await db.execute(select(DiaryEntry.uuid))
            for entry in diary_entries:
                await TagSyncService.sync_diary_entry_tags(db, entry[0])
            
            logger.info("SUCCESS: Full tags_text synchronization completed successfully")
            return True
            
        except Exception as e:
            logger.error(f"ERROR: Full tags_text synchronization failed: {e}")
            return False


# Global instance
tag_sync_service = TagSyncService()
