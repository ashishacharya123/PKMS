#!/usr/bin/env python3
"""
User Deletion Script for PKMS
Completely removes a user and all associated data from the system.

Usage:
    python delete_user.py [username]
    
If no username provided, it will delete the only user in single-user systems.
"""

import asyncio
import sys
import os
from pathlib import Path

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from app.database import get_db_session
from app.models.user import User, Session, RecoveryKey
from app.models.note import Note, NoteFile
from app.models.document import Document
from app.models.todo import Todo, Project
from app.models.diary import DiaryEntry, DiaryMedia
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.tag import Tag
from app.config import get_data_dir
import shutil


class UserDeletionService:
    """Service to completely delete a user and all associated data."""
    
    def __init__(self):
        self.data_dir = get_data_dir()
        self.deleted_files = []
        self.deleted_db_records = {}
    
    async def delete_user_completely(self, username: str = None) -> dict:
        """Delete user and all associated data."""
        result = {
            "success": False,
            "user_deleted": None,
            "database_records_deleted": {},
            "files_deleted": [],
            "errors": []
        }
        
        try:
            async with get_db_session() as db:
                # Find user
                if username:
                    user_result = await db.execute(select(User).where(User.username == username))
                    user = user_result.scalar_one_or_none()
                    if not user:
                        result["errors"].append(f"User '{username}' not found")
                        return result
                else:
                    # Single user system - get the only user
                    user_result = await db.execute(select(User))
                    user = user_result.scalar_one_or_none()
                    if not user:
                        result["errors"].append("No users found in system")
                        return result
                
                result["user_deleted"] = {"uuid": user.uuid, "username": user.username}
                print(f"Deleting user: {user.username} (UUID: {user.uuid})")
                
                # Delete files first (before DB records)
                await self._delete_user_files(db, user.uuid)
                result["files_deleted"] = self.deleted_files
                
                # Delete database records in proper order (respecting foreign keys)
                await self._delete_database_records(db, user.uuid)
                result["database_records_deleted"] = self.deleted_db_records
                
                # Finally delete the user
                await db.delete(user)
                await db.commit()
                
                result["success"] = True
                print(f"User '{user.username}' and all associated data deleted successfully")
                
        except Exception as e:
            result["errors"].append(f"Error during deletion: {str(e)}")
            print(f"Error: {str(e)}")
        
        return result
    
    async def _delete_user_files(self, db: AsyncSession, created_by: str):
        """Delete all files associated with the user."""
        print("Deleting user files...")
        
        # Delete diary entry files
        diary_result = await db.execute(
            select(DiaryEntry.content_file_path).where(DiaryEntry.created_by == created_by)
        )
        for (file_path,) in diary_result.fetchall():
            if file_path:
                self._delete_file_safely(Path(file_path))
        
        # Delete diary media files
        media_result = await db.execute(
            select(DiaryMedia.file_path).where(DiaryMedia.created_by == created_by)
        )
        for (file_path,) in media_result.fetchall():
            if file_path:
                self._delete_file_safely(Path(file_path))
        
        # Delete document files
        doc_result = await db.execute(
            select(Document.file_path).where(Document.created_by == created_by)
        )
        for (file_path,) in doc_result.fetchall():
            if file_path:
                self._delete_file_safely(Path(file_path))
        
        # Delete note files
        note_file_result = await db.execute(
            select(NoteFile.file_path).where(NoteFile.created_by == created_by)
        )
        for (file_path,) in note_file_result.fetchall():
            if file_path:
                self._delete_file_safely(Path(file_path))
        
        # Delete archive item files
        archive_result = await db.execute(
            select(ArchiveItem.file_path).where(ArchiveItem.created_by == created_by)
        )
        for (file_path,) in archive_result.fetchall():
            if file_path:
                self._delete_file_safely(Path(file_path))
        
        # Delete user-specific directories if empty
        user_dirs = [
            self.data_dir / "secure" / "entries" / "text",
            self.data_dir / "secure" / "entries" / "media", 
            self.data_dir / "secure" / "photos",
            self.data_dir / "secure" / "videos",
            self.data_dir / "secure" / "voice",
            self.data_dir / "documents",
            self.data_dir / "notes" / "files",
            self.data_dir / "archive"
        ]
        
        for dir_path in user_dirs:
            self._delete_directory_if_empty(dir_path)
    
    async def _delete_database_records(self, db: AsyncSession, created_by: str):
        """Delete all database records for the user in proper order."""
        print("Deleting database records...")
        
        # Order matters due to foreign key constraints
        deletion_order = [
            ("sessions", Session, Session.created_by),
            ("recovery_keys", RecoveryKey, RecoveryKey.created_by),
            ("note_files", NoteFile, NoteFile.created_by),
            ("notes", Note, Note.created_by),
            ("documents", Document, Document.created_by),
            ("todos", Todo, Todo.created_by),
            ("projects", Project, Project.created_by),
            ("diary_media", DiaryMedia, DiaryMedia.created_by),
            ("diary_entries", DiaryEntry, DiaryEntry.created_by),
            ("archive_items", ArchiveItem, ArchiveItem.created_by),
            ("archive_folders", ArchiveFolder, ArchiveFolder.created_by),
            ("tags", Tag, Tag.created_by),
        ]
        
        for table_name, model_class, user_field in deletion_order:
            # Count records first
            count_result = await db.execute(
                select(func.count()).select_from(model_class).where(user_field == created_by)
            )
            record_count = count_result.scalar()
            
            if record_count > 0:
                # Delete records
                delete_result = await db.execute(
                    delete(model_class).where(user_field == created_by)
                )
                deleted_count = delete_result.rowcount
                self.deleted_db_records[table_name] = deleted_count
                print(f"   Deleted {deleted_count} records from {table_name}")
    
    def _delete_file_safely(self, file_path: Path):
        """Safely delete a file and track deletion."""
        try:
            if file_path.exists():
                file_path.unlink()
                self.deleted_files.append(str(file_path))
                print(f"   Deleted file: {file_path}")
        except Exception as e:
            print(f"   Warning: Could not delete file {file_path}: {e}")
    
    def _delete_directory_if_empty(self, dir_path: Path):
        """Delete directory if it's empty."""
        try:
            if dir_path.exists() and dir_path.is_dir():
                # Check if directory is empty
                if not any(dir_path.iterdir()):
                    dir_path.rmdir()
                    print(f"   Deleted empty directory: {dir_path}")
        except Exception as e:
            print(f"   Warning: Could not delete directory {dir_path}: {e}")


async def main():
    """Main function to run user deletion."""
    print("PKMS User Deletion Script")
    print("=" * 50)
    
    # Get username from command line or prompt
    username = None
    if len(sys.argv) > 1:
        username = sys.argv[1]
    else:
        print("No username provided. Will delete the only user in single-user systems.")
    
    # Confirm deletion
    if username:
        confirm = input(f"Are you sure you want to delete user '{username}' and ALL their data? (type 'DELETE' to confirm): ")
    else:
        confirm = input("Are you sure you want to delete the user and ALL their data? (type 'DELETE' to confirm): ")
    
    if confirm != "DELETE":
        print("Deletion cancelled.")
        return
    
    # Perform deletion
    service = UserDeletionService()
    result = await service.delete_user_completely(username)
    
    print("\n" + "=" * 50)
    print("DELETION SUMMARY")
    print("=" * 50)
    
    if result["success"]:
        user_info = result["user_deleted"]
        print(f"Successfully deleted user: {user_info['username']} (UUID: {user_info['uuid']})")
        
        print(f"\nDatabase records deleted:")
        for table, count in result["database_records_deleted"].items():
            print(f"   * {table}: {count} records")
        
        print(f"\nFiles deleted: {len(result['files_deleted'])} files")
        
        print(f"\nSystem is now clean and ready for new user registration!")
    else:
        print("Deletion failed:")
        for error in result["errors"]:
            print(f"   * {error}")


if __name__ == "__main__":
    asyncio.run(main()) 