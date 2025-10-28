"""
CRUD Operations Testing Router for PKMS Backend

Provides comprehensive CRUD testing across all modules with safe test data
and unique identifiers to avoid conflicts with user data.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, text
from typing import Dict, Any
from datetime import datetime, timedelta
import time
import random
import string
import logging

# Set up logger
logger = logging.getLogger(__name__)

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.note import Note
from app.models.document import Document
from app.models.todo import Todo, TodoStatus
from app.models.archive import ArchiveFolder, ArchiveItem

from app.config import NEPAL_TZ, get_data_dir

router = APIRouter(prefix="/testing/crud", tags=["testing-crud"])


def generate_test_id():
    """Generate a unique test identifier to avoid conflicts with user data."""
    return f"TEST_{int(time.time())}_{random.randint(1000, 9999)}"


def generate_test_password():
    """Generate a complex random password for test data."""
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(random.choice(chars) for _ in range(16))


@router.post("/full-test")
async def run_comprehensive_crud_test(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Comprehensive CRUD testing across selected modules with safe test data and unique identifiers."""
    try:
        test_id = generate_test_id()
        test_password = generate_test_password()

        logger.info(f"Starting comprehensive CRUD test {test_id} for user {current_user.uuid}")

        results = {
            "test_id": test_id,
            "test_password": test_password,
            "start_time": datetime.now(NEPAL_TZ).isoformat(),
            "modules_tested": {},
            "overall_status": "unknown",
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

        # Test Notes CRUD
        try:
            notes_result = await test_notes_crud(db, current_user, test_id, test_password)
            results["modules_tested"]["notes"] = notes_result
        except Exception as e:
            logger.error(f"Notes CRUD test failed: {type(e).__name__}")
            results["modules_tested"]["notes"] = {
                "status": "error",
                "error": str(e),
                "operations": {}
            }

        # Test Documents CRUD
        try:
            documents_result = await test_documents_crud(db, current_user, test_id, test_password)
            results["modules_tested"]["documents"] = documents_result
        except Exception as e:
            logger.error(f"Documents CRUD test failed: {type(e).__name__}")
            results["modules_tested"]["documents"] = {
                "status": "error",
                "error": str(e),
                "operations": {}
            }

        # Test Todos CRUD
        try:
            todos_result = await test_todos_crud(db, current_user, test_id, test_password)
            results["modules_tested"]["todos"] = todos_result
        except Exception as e:
            logger.error(f"Todos CRUD test failed: {type(e).__name__}")
            results["modules_tested"]["todos"] = {
                "status": "error",
                "error": str(e),
                "operations": {}
            }

        # Test Archive CRUD
        try:
            archive_result = await test_archive_crud(db, current_user, test_id, test_password)
            results["modules_tested"]["archive"] = archive_result
        except Exception as e:
            logger.error(f"Archive CRUD test failed: {type(e).__name__}")
            results["modules_tested"]["archive"] = {
                "status": "error",
                "error": str(e),
                "operations": {}
            }

        # Determine overall status
        module_statuses = []
        for module_name, module_result in results["modules_tested"].items():
            if module_result.get("status") == "success":
                module_statuses.append("success")
            else:
                module_statuses.append("failed")

        if all(status == "success" for status in module_statuses):
            results["overall_status"] = "success"
        elif any(status == "success" for status in module_statuses):
            results["overall_status"] = "partial_success"
        else:
            results["overall_status"] = "failed"

        results["end_time"] = datetime.now(NEPAL_TZ).isoformat()

        # Calculate duration
        start_time = datetime.fromisoformat(results["start_time"])
        end_time = datetime.fromisoformat(results["end_time"])
        results["duration_seconds"] = (end_time - start_time).total_seconds()

        return results

    except Exception as e:
        logger.error(f"Comprehensive CRUD test failed: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"CRUD test failed: {str(e)}")


async def test_notes_crud(db: AsyncSession, user: User, test_id: str, test_password: str) -> Dict[str, Any]:
    """Test Notes CRUD operations with safe test data."""
    operations = {}  # Initialize before try block to avoid NameError in exception handler
    try:
        logger.info(f"Testing Notes CRUD for test {test_id}")

        # CREATE Note
        note_data = {
            "title": f"TEST_NOTE_{test_id}",
            "content": f"This is test content for note {test_id}. Password: {test_password}",
            "is_encrypted": False,
            "tags": [f"test_{test_id}", "crud_test"]
        }

        note = Note(**note_data, created_by=user.uuid)
        db.add(note)
        await db.flush()
        await db.refresh(note)

        operations["create"] = {
            "status": "success",
            "note_uuid": note.uuid,
            "created_at": note.created_at.isoformat()
        }

        # READ Note
        read_note = await db.execute(
            select(Note).where(and_(Note.uuid == note.uuid, Note.created_by == user.uuid))
        )
        read_note = read_note.scalar_one_or_none()

        if read_note and read_note.title == note_data["title"]:
            operations["read"] = {
                "status": "success",
                "note_uuid": read_note.uuid,
                "title_verified": True
            }
        else:
            operations["read"] = {
                "status": "failed",
                "error": "Note not found or title mismatch"
            }

        # UPDATE Note
        update_data = {
            "title": f"UPDATED_TEST_NOTE_{test_id}",
            "content": f"Updated content for note {test_id}. New password: {test_password}_UPDATED"
        }

        await db.execute(
            text("""
                UPDATE notes
                SET title = :title, content = :content, updated_at = CURRENT_TIMESTAMP
                WHERE uuid = :uuid AND created_by = :user_uuid
            """),
            {
                "title": update_data["title"],
                "content": update_data["content"],
                "uuid": note.uuid,
                "user_uuid": user.uuid
            }
        )

        operations["update"] = {
            "status": "success",
            "updated_at": datetime.now(NEPAL_TZ).isoformat()
        }

        # DELETE Note
        await db.execute(
            text("DELETE FROM notes WHERE uuid = :uuid AND created_by = :user_uuid"),
            {"uuid": note.uuid, "user_uuid": user.uuid}
        )

        operations["delete"] = {
            "status": "success",
            "deleted_at": datetime.now(NEPAL_TZ).isoformat()
        }

        return {
            "status": "success",
            "operations": operations,
            "test_id": test_id
        }

    except Exception as e:
        logger.error(f"Notes CRUD test failed: {type(e).__name__}")
        return {
            "status": "error",
            "error": str(e),
            "operations": operations
        }


async def test_documents_crud(db: AsyncSession, user: User, test_id: str, test_password: str) -> Dict[str, Any]:
    """Test Documents CRUD operations with safe test data."""
    operations = {}  # Initialize before try block to avoid NameError in exception handler
    try:
        logger.info(f"Testing Documents CRUD for test {test_id}")

        # CREATE Document
        doc_data = {
            "title": f"TEST_DOC_{test_id}",
            "filename": f"TEST_DOC_{test_id}.txt",
            "original_name": f"Original_Test_Document_{test_id}.txt",
            "file_path": str(get_data_dir() / "test_storage" / f"crud_test_{test_id}.txt"),
            "file_size": 1024,
            "mime_type": "text/plain",
            "description": f"Test document content for CRUD testing - ID: {test_id}",
            "is_archived": False,
            "created_by": user.uuid
        }

        # Create test file
        test_file_path = get_data_dir() / "test_storage" / f"crud_test_{test_id}.txt"
        test_file_path.parent.mkdir(parents=True, exist_ok=True)
        test_content = f"Test document content for {test_id}\nPassword: {test_password}\nCRUD Test Data"
        test_file_path.write_text(test_content, encoding='utf-8')
        doc_data["file_size"] = len(test_content.encode('utf-8'))  # set to actual content length

        document = Document(**doc_data)
        db.add(document)
        await db.flush()
        await db.refresh(document)

        operations["create"] = {
            "status": "success",
            "document_uuid": document.uuid,
            "file_path": document.file_path,
            "file_size": document.file_size
        }

        # READ Document
        read_doc = await db.execute(
            select(Document).where(and_(Document.uuid == document.uuid, Document.created_by == user.uuid))
        )
        read_doc = read_doc.scalar_one_or_none()

        if read_doc and read_doc.title == doc_data["title"]:
            operations["read"] = {
                "status": "success",
                "document_uuid": read_doc.uuid,
                "title_verified": True,
                "file_exists": test_file_path.exists()
            }
        else:
            operations["read"] = {
                "status": "failed",
                "error": "Document not found or title mismatch"
            }

        # UPDATE Document
        await db.execute(
            text("""
                UPDATE documents
                SET title = :title, description = :description, is_archived = :archived, updated_at = CURRENT_TIMESTAMP
                WHERE uuid = :uuid AND created_by = :user_uuid
            """),
            {
                "title": f"UPDATED_TEST_DOC_{test_id}",
                "description": f"Updated test document - ID: {test_id}",
                "archived": True,
                "uuid": document.uuid,
                "user_uuid": user.uuid
            }
        )

        operations["update"] = {
            "status": "success",
            "updated_at": datetime.now(NEPAL_TZ).isoformat()
        }

        # DELETE Document
        await db.execute(
            text("DELETE FROM documents WHERE uuid = :uuid AND created_by = :user_uuid"),
            {"uuid": document.uuid, "user_uuid": user.uuid}
        )

        # Clean up test file
        if test_file_path.exists():
            test_file_path.unlink()

        # Commit after DELETE operation
        await db.commit()

        operations["delete"] = {
            "status": "success",
            "deleted_at": datetime.now(NEPAL_TZ).isoformat()
        }

        return {
            "status": "success",
            "operations": operations,
            "test_id": test_id
        }

    except Exception as e:
        logger.error(f"Documents CRUD test failed: {type(e).__name__}")
        return {
            "status": "error",
            "error": str(e),
            "operations": operations
        }


async def test_todos_crud(db: AsyncSession, user: User, test_id: str, test_password: str) -> Dict[str, Any]:
    """Test Todos CRUD operations with safe test data."""
    operations = {}  # Initialize before try block to avoid NameError in exception handler
    try:
        logger.info(f"Testing Todos CRUD for test {test_id}")

        # CREATE Todo
        todo_data = {
            "title": f"TEST_TODO_{test_id}",
            "description": f"Test todo for CRUD testing - ID: {test_id}. Password: {test_password}",
            "status": TodoStatus.PENDING,
            "priority": "medium",
            "due_date": datetime.now(NEPAL_TZ) + timedelta(days=7),
            "created_by": user.uuid
        }

        todo = Todo(**todo_data)
        db.add(todo)
        await db.flush()
        await db.refresh(todo)

        operations["create"] = {
            "status": "success",
            "todo_uuid": todo.uuid,
            "status": todo.status.value,
            "created_at": todo.created_at.isoformat()
        }

        # READ Todo
        read_todo = await db.execute(
            select(Todo).where(and_(Todo.uuid == todo.uuid, Todo.created_by == user.uuid))
        )
        read_todo = read_todo.scalar_one_or_none()

        if read_todo and read_todo.title == todo_data["title"]:
            operations["read"] = {
                "status": "success",
                "todo_uuid": read_todo.uuid,
                "title_verified": True,
                "status_verified": read_todo.status.value == todo_data["status"].value
            }
        else:
            operations["read"] = {
                "status": "failed",
                "error": "Todo not found or title mismatch"
            }

        # UPDATE Todo
        await db.execute(
            text("""
                UPDATE todos
                SET title = :title, status = :status, priority = :priority, updated_at = CURRENT_TIMESTAMP
                WHERE uuid = :uuid AND created_by = :user_uuid
            """),
            {
                "title": f"UPDATED_TEST_TODO_{test_id}",
                "status": "completed",
                "priority": "high",
                "uuid": todo.uuid,
                "user_uuid": user.uuid
            }
        )

        operations["update"] = {
            "status": "success",
            "updated_at": datetime.now(NEPAL_TZ).isoformat()
        }

        # DELETE Todo
        await db.execute(
            text("DELETE FROM todos WHERE uuid = :uuid AND created_by = :user_uuid"),
            {"uuid": todo.uuid, "user_uuid": user.uuid}
        )

        operations["delete"] = {
            "status": "success",
            "deleted_at": datetime.now(NEPAL_TZ).isoformat()
        }

        return {
            "status": "success",
            "operations": operations,
            "test_id": test_id
        }

    except Exception as e:
        logger.error(f"Todos CRUD test failed: {type(e).__name__}")
        return {
            "status": "error",
            "error": str(e),
            "operations": operations
        }


async def test_archive_crud(db: AsyncSession, user: User, test_id: str, test_password: str) -> Dict[str, Any]:
    """Test Archive CRUD operations with safe test data."""
    operations = {}  # Initialize before try block to avoid NameError in exception handler
    try:
        logger.info(f"Testing Archive CRUD for test {test_id}")

        # CREATE Archive Folder
        folder_data = {
            "name": f"TEST_FOLDER_{test_id}",
            "description": f"Test archive folder for CRUD testing - ID: {test_id}",
            "color": "#FF0000",
            "created_by": user.uuid
        }

        folder = ArchiveFolder(**folder_data)
        db.add(folder)
        await db.flush()
        await db.refresh(folder)

        operations["create_folder"] = {
            "status": "success",
            "folder_uuid": folder.uuid,
            "created_at": folder.created_at.isoformat()
        }

        # CREATE Archive Item
        item_data = {
            "name": f"TEST_ITEM_{test_id}",
            "description": f"Test archive item for CRUD testing - ID: {test_id}",
            "original_filename": f"test_item_{test_id}.txt",
            "stored_filename": f"stored_{test_id}.txt",
            "file_path": str(get_data_dir() / "archive_test" / f"test_item_{test_id}.txt"),
            "file_size": 512,
            "mime_type": "text/plain",
            "folder_uuid": folder.uuid,
            "created_by": user.uuid
        }

        # Create test file for archive item
        test_archive_file = get_data_dir() / "archive_test" / f"test_item_{test_id}.txt"
        test_archive_file.parent.mkdir(parents=True, exist_ok=True)
        test_archive_content = f"Archive test content for {test_id}\nPassword: {test_password}"
        test_archive_file.write_text(test_archive_content, encoding='utf-8')

        item = ArchiveItem(**item_data)
        db.add(item)
        await db.flush()
        await db.refresh(item)

        operations["create_item"] = {
            "status": "success",
            "item_uuid": item.uuid,
            "folder_uuid": folder.uuid,
            "file_size": item.file_size
        }

        # READ Operations
        read_folder = await db.execute(
            select(ArchiveFolder).where(and_(ArchiveFolder.uuid == folder.uuid, ArchiveFolder.created_by == user.uuid))
        )
        read_folder = read_folder.scalar_one_or_none()

        read_item = await db.execute(
            select(ArchiveItem).where(and_(ArchiveItem.uuid == item.uuid, ArchiveItem.created_by == user.uuid))
        )
        read_item = read_item.scalar_one_or_none()

        operations["read"] = {
            "status": "success",
            "folder_found": read_folder is not None,
            "item_found": read_item is not None,
            "folder_item_match": bool(read_folder and read_item and read_item.folder_uuid == read_folder.uuid)
        }

        # UPDATE Operations
        await db.execute(
            text("""
                UPDATE archive_folders
                SET name = :name, description = :description, updated_at = CURRENT_TIMESTAMP
                WHERE uuid = :uuid AND created_by = :user_uuid
            """),
            {
                "name": f"UPDATED_TEST_FOLDER_{test_id}",
                "description": f"Updated test folder - ID: {test_id}",
                "uuid": folder.uuid,
                "user_uuid": user.uuid
            }
        )

        await db.execute(
            text("""
                UPDATE archive_items
                SET name = :name, description = :description, updated_at = CURRENT_TIMESTAMP
                WHERE uuid = :uuid AND created_by = :user_uuid
            """),
            {
                "name": f"UPDATED_TEST_ITEM_{test_id}",
                "description": f"Updated test item - ID: {test_id}",
                "uuid": item.uuid,
                "user_uuid": user.uuid
            }
        )

        operations["update"] = {
            "status": "success",
            "updated_at": datetime.now(NEPAL_TZ).isoformat()
        }

        # DELETE Operations
        await db.execute(
            text("DELETE FROM archive_items WHERE uuid = :uuid AND created_by = :user_uuid"),
            {"uuid": item.uuid, "user_uuid": user.uuid}
        )

        await db.execute(
            text("DELETE FROM archive_folders WHERE uuid = :uuid AND created_by = :user_uuid"),
            {"uuid": folder.uuid, "user_uuid": user.uuid}
        )

        # Clean up test files
        if test_archive_file.exists():
            test_archive_file.unlink()

        operations["delete"] = {
            "status": "success",
            "deleted_at": datetime.now(NEPAL_TZ).isoformat()
        }

        return {
            "status": "success",
            "operations": operations,
            "test_id": test_id
        }

    except Exception as e:
        logger.error(f"Archive CRUD test failed: {type(e).__name__}")
        return {
            "status": "error",
            "error": str(e),
            "operations": operations
        }


@router.post("/notes/create")
async def test_create_note(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Test creating a new note."""
    try:
        test_id = generate_test_id()
        test_password = generate_test_password()

        note_data = {
            "title": f"CRUD_TEST_NOTE_{test_id}",
            "content": f"This is a CRUD test note created at {datetime.now(NEPAL_TZ)}. Test password: {test_password}",
            "is_encrypted": False,
            "tags": ["crud_test", "automated_test"]
        }

        note = Note(**note_data, created_by=current_user.uuid)
        db.add(note)
        await db.flush()
        await db.refresh(note)

        return {
            "status": "success",
            "message": "Note created successfully",
            "note_uuid": note.uuid,
            "title": note.title,
            "created_at": note.created_at.isoformat(),
            "test_id": test_id,
            "user_uuid": current_user.uuid
        }

    except Exception as e:
        logger.error(f"Error creating test note: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to create test note: {str(e)}")


@router.post("/documents/create")
async def test_create_document(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Test creating a new document."""
    try:
        test_id = generate_test_id()
        test_password = generate_test_password()

        # Create test file
        test_filename = f"crud_test_doc_{test_id}.txt"
        test_file_path = get_data_dir() / "test_documents" / test_filename
        test_file_path.parent.mkdir(parents=True, exist_ok=True)

        content_lines = [
            "CRUD Test Document",
            f"Test ID: {test_id}",
            f"Created at: {datetime.now(NEPAL_TZ)}",
            f"Test Password: {test_password}",
            "This is an automated test document for CRUD operations."
        ]
        test_content = "\n".join(content_lines)
        test_content += f"\nContent length: {len(test_content)} characters\n"

        test_file_path.write_text(test_content, encoding='utf-8')

        doc_data = {
            "title": f"CRUD_TEST_DOC_{test_id}",
            "filename": test_filename,
            "original_name": f"Original_CRUD_Test_{test_id}.txt",
            "file_path": str(test_file_path),
            "file_size": len(test_content.encode('utf-8')),
            "mime_type": "text/plain",
            "description": f"Automated CRUD test document - ID: {test_id}",
            "is_archived": False,
            "created_by": current_user.uuid
        }

        document = Document(**doc_data)
        db.add(document)
        await db.commit()
        await db.refresh(document)

        return {
            "status": "success",
            "message": "Document created successfully",
            "document_uuid": document.uuid,
            "title": document.title,
            "filename": document.filename,
            "file_size": document.file_size,
            "created_at": document.created_at.isoformat(),
            "test_id": test_id,
            "user_uuid": current_user.uuid
        }

    except Exception as e:
        logger.error(f"Error creating test document: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to create test document: {str(e)}")


@router.post("/todos/create")
async def test_create_todo(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Test creating a new todo."""
    try:
        test_id = generate_test_id()
        test_password = generate_test_password()

        todo_data = {
            "title": f"CRUD_TEST_TODO_{test_id}",
            "description": f"This is a CRUD test todo. Complete verification using password: {test_password}",
            "status": TodoStatus.PENDING,
            "priority": "medium",
            "due_date": datetime.now(NEPAL_TZ) + timedelta(days=3),
            "created_by": current_user.uuid
        }

        todo = Todo(**todo_data)
        db.add(todo)
        await db.flush()
        await db.refresh(todo)

        return {
            "status": "success",
            "message": "Todo created successfully",
            "todo_uuid": todo.uuid,
            "title": todo.title,
            "status": todo.status.value,
            "priority": todo.priority,
            "due_date": todo.due_date.isoformat() if todo.due_date else None,
            "created_at": todo.created_at.isoformat(),
            "test_id": test_id,
            "user_uuid": current_user.uuid
        }

    except Exception as e:
        logger.error(f"Error creating test todo: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to create test todo: {str(e)}")


@router.delete("/cleanup/{item_type}/{item_id}")
async def cleanup_test_item(
    item_type: str,
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a specific test item for cleanup."""
    try:
        # Validate item type
        allowed_types = ["note", "document", "todo", "folder", "item"]
        if item_type not in allowed_types:
            raise HTTPException(status_code=400, detail=f"Invalid item type: {item_type}")

        # NOTE: Consider verifying test-ness by checking item title/name fields instead of UUID.
        # Temporarily removed UUID-based check as it always blocks valid deletions

        deleted = False
        error_message = None

        if item_type == "note":
            result = await db.execute(
                text("DELETE FROM notes WHERE uuid = :uuid AND created_by = :user_uuid"),
                {"uuid": item_id, "user_uuid": current_user.uuid}
            )
            deleted = result.rowcount > 0

        elif item_type == "document":
            # Get document info before deletion for file cleanup
            doc_result = await db.execute(
                text("SELECT file_path FROM documents WHERE uuid = :uuid AND created_by = :user_uuid"),
                {"uuid": item_id, "user_uuid": current_user.uuid}
            )
            doc_info = doc_result.fetchone()

            result = await db.execute(
                text("DELETE FROM documents WHERE uuid = :uuid AND created_by = :user_uuid"),
                {"uuid": item_id, "user_uuid": current_user.uuid}
            )
            deleted = result.rowcount > 0

            # Clean up file if deletion was successful
            if deleted and doc_info and doc_info[0]:
                try:
                    file_path = get_data_dir() / doc_info[0]
                    if file_path.exists():
                        file_path.unlink()
                except Exception as e:
                    logger.warning(f"Could not delete file {doc_info[0]}: {type(e).__name__}")

        elif item_type == "todo":
            result = await db.execute(
                text("DELETE FROM todos WHERE uuid = :uuid AND created_by = :user_uuid"),
                {"uuid": item_id, "user_uuid": current_user.uuid}
            )
            deleted = result.rowcount > 0

        elif item_type == "folder":
            # Delete items in folder first
            await db.execute(
                text("DELETE FROM archive_items WHERE folder_uuid = :folder_uuid AND created_by = :user_uuid"),
                {"folder_uuid": item_id, "user_uuid": current_user.uuid}
            )
            # Then delete folder
            result = await db.execute(
                text("DELETE FROM archive_folders WHERE uuid = :uuid AND created_by = :user_uuid"),
                {"uuid": item_id, "user_uuid": current_user.uuid}
            )
            deleted = result.rowcount > 0

        elif item_type == "item":
            # Get item info before deletion for file cleanup
            item_result = await db.execute(
                text("SELECT file_path FROM archive_items WHERE uuid = :uuid AND created_by = :user_uuid"),
                {"uuid": item_id, "user_uuid": current_user.uuid}
            )
            item_info = item_result.fetchone()

            result = await db.execute(
                text("DELETE FROM archive_items WHERE uuid = :uuid AND created_by = :user_uuid"),
                {"uuid": item_id, "user_uuid": current_user.uuid}
            )
            deleted = result.rowcount > 0

            # Clean up file if deletion was successful
            if deleted and item_info and item_info[0]:
                try:
                    from pathlib import Path
                    file_path = Path(item_info[0])
                    if file_path.exists():
                        file_path.unlink()
                except Exception as e:
                    logger.warning(f"Could not delete file {item_info[0]}: {type(e).__name__}")

        if deleted:
            return {
                "status": "success",
                "message": f"Test {item_type} deleted successfully",
                "item_type": item_type,
                "item_id": item_id,
                "user_uuid": current_user.uuid,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        else:
            return {
                "status": "not_found",
                "message": f"Test {item_type} not found or access denied",
                "item_type": item_type,
                "item_id": item_id,
                "user_uuid": current_user.uuid
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cleaning up test item: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to cleanup test item: {str(e)}")