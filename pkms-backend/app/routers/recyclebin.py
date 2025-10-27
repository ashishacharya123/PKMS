"""
Recycle Bin Router - Handles bulk operations on soft-deleted items
"""

import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.user import User
from app.models.project import Project
from app.models.note import Note
from app.models.todo import Todo
from app.models.document import Document
from app.models.diary import DiaryEntry
from app.models.archive import ArchiveItem
from app.auth.dependencies import get_current_user
from app.services.project_service import project_service
from app.services.note_crud_service import note_crud_service
from app.services.todo_crud_service import todo_crud_service
from app.services.document_crud_service import document_crud_service
from app.services.diary_crud_service import diary_crud_service
from app.services.archive_item_service import archive_item_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/empty")
async def empty_recycle_bin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    Permanently delete ALL soft-deleted items for the current user.
    WARNING: This is destructive and cannot be undone.
    """
    try:
        user_uuid = current_user.uuid
        deleted_count = 0
        
        logger.info(f"Starting bulk deletion for user {user_uuid}")
        
        # Get counts of soft-deleted items for each module
        project_count = await db.scalar(
            select(func.count(Project.uuid)).where(
                Project.created_by == user_uuid,
                Project.deleted_only()
            )
        ) or 0
        
        note_count = await db.scalar(
            select(func.count(Note.uuid)).where(
                Note.created_by == user_uuid,
                Note.deleted_only()
            )
        ) or 0
        
        todo_count = await db.scalar(
            select(func.count(Todo.uuid)).where(
                Todo.created_by == user_uuid,
                Todo.deleted_only()
            )
        ) or 0
        
        document_count = await db.scalar(
            select(func.count(Document.uuid)).where(
                Document.created_by == user_uuid,
                Document.deleted_only()
            )
        ) or 0
        
        diary_count = await db.scalar(
            select(func.count(DiaryEntry.uuid)).where(
                DiaryEntry.created_by == user_uuid,
                DiaryEntry.deleted_only()
            )
        ) or 0
        
        archive_count = await db.scalar(
            select(func.count(ArchiveItem.uuid)).where(
                ArchiveItem.created_by == user_uuid,
                ArchiveItem.deleted_only()
            )
        ) or 0
        
        total_items = project_count + note_count + todo_count + document_count + diary_count + archive_count
        
        if total_items == 0:
            return {
                "message": "Recycle bin is already empty",
                "deletedCount": 0,
                "breakdown": {
                    "projects": 0,
                    "notes": 0,
                    "todos": 0,
                    "documents": 0,
                    "diary_entries": 0,
                    "archive_items": 0
                }
            }
        
        logger.info(f"Found {total_items} soft-deleted items to purge")
        
        # Get all soft-deleted items for each module
        projects_result = await db.execute(
            select(Project.uuid).where(
                Project.created_by == user_uuid,
                Project.deleted_only()
            )
        )
        project_uuids = [row[0] for row in projects_result.all()]
        
        notes_result = await db.execute(
            select(Note.uuid).where(
                Note.created_by == user_uuid,
                Note.deleted_only()
            )
        )
        note_uuids = [row[0] for row in notes_result.all()]
        
        todos_result = await db.execute(
            select(Todo.uuid).where(
                Todo.created_by == user_uuid,
                Todo.deleted_only()
            )
        )
        todo_uuids = [row[0] for row in todos_result.all()]
        
        documents_result = await db.execute(
            select(Document.uuid).where(
                Document.created_by == user_uuid,
                Document.deleted_only()
            )
        )
        document_uuids = [row[0] for row in documents_result.all()]
        
        diary_result = await db.execute(
            select(DiaryEntry.uuid).where(
                DiaryEntry.created_by == user_uuid,
                DiaryEntry.deleted_only()
            )
        )
        diary_uuids = [row[0] for row in diary_result.all()]
        
        archive_result = await db.execute(
            select(ArchiveItem.uuid).where(
                ArchiveItem.created_by == user_uuid,
                ArchiveItem.deleted_only()
            )
        )
        archive_uuids = [row[0] for row in archive_result.all()]
        
        # Permanently delete all items
        # Note: We use the existing permanent delete methods to ensure proper cleanup
        
        # Delete projects (this will handle orphaned children)
        for project_uuid in project_uuids:
            try:
                await project_service.permanent_delete_project(db, user_uuid, project_uuid)
                deleted_count += 1
            except HTTPException as e:
                logger.info("Skip project %s: %s", project_uuid, e.detail)
            except Exception:
                logger.exception("Error permanently deleting project %s", project_uuid)
        
        # Delete notes
        for note_uuid in note_uuids:
            try:
                await note_crud_service.hard_delete_note(db, user_uuid, note_uuid)
                deleted_count += 1
            except HTTPException as e:
                logger.info("Skip note %s: %s", note_uuid, e.detail)
            except Exception:
                logger.exception("Error permanently deleting note %s", note_uuid)
        
        # Delete todos
        for todo_uuid in todo_uuids:
            try:
                await todo_crud_service.hard_delete_todo(db, user_uuid, todo_uuid)
                deleted_count += 1
            except HTTPException as e:
                logger.info("Skip todo %s: %s", todo_uuid, e.detail)
            except Exception:
                logger.exception("Error permanently deleting todo %s", todo_uuid)
        
        # Delete documents
        for document_uuid in document_uuids:
            try:
                await document_crud_service.permanent_delete_document(db, user_uuid, document_uuid)
                deleted_count += 1
            except HTTPException as e:
                logger.info("Skip document %s: %s", document_uuid, e.detail)
            except Exception:
                logger.exception("Error permanently deleting document %s", document_uuid)
        
        # Delete diary entries
        for diary_uuid in diary_uuids:
            try:
                await diary_crud_service.hard_delete_entry(db, user_uuid, diary_uuid)
                deleted_count += 1
            except HTTPException as e:
                logger.info("Skip diary entry %s: %s", diary_uuid, e.detail)
            except Exception:
                logger.exception("Error permanently deleting diary entry %s", diary_uuid)
        
        # Delete archive items
        for archive_uuid in archive_uuids:
            try:
                await archive_item_service.hard_delete_archive_item(db, user_uuid, archive_uuid)
                deleted_count += 1
            except HTTPException as e:
                logger.info("Skip archive item %s: %s", archive_uuid, e.detail)
            except Exception:
                logger.exception("Error permanently deleting archive item %s", archive_uuid)
        
        logger.info(f"Successfully purged {deleted_count} items from recycle bin for user {user_uuid}")
        
        return {
            "message": f"Recycle bin emptied successfully. {deleted_count} items permanently deleted.",
            "deletedCount": deleted_count,
            "breakdown": {
                "projects": len(project_uuids),
                "notes": len(note_uuids),
                "todos": len(todo_uuids),
                "documents": len(document_uuids),
                "diary_entries": len(diary_uuids),
                "archive_items": len(archive_uuids)
            }
        }
        
    except Exception as e:
        logger.error(f"Error emptying recycle bin for user {current_user.uuid}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to empty recycle bin: {str(e)}"
        )
