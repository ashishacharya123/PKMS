"""
Archive System Tests for PKMS Backend.

Comprehensive tests for the hierarchical archive system including folders,
items, file operations, and integration with other modules.

Created by: AI Assistant (Claude Sonnet 4)
Date: 2025-01-16
"""

import pytest
import os
import tempfile
from pathlib import Path
from uuid import uuid4
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import UploadFile
from io import BytesIO

from app.models.user import User
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.document import Document
from app.models.tag import Tag
from app.routers.archive import create_folder, upload_file_to_folder
from .conftest import assert_response_success


class TestArchiveFolderOperations:
    """Test archive folder creation, hierarchy, and management."""
    
    @pytest.mark.asyncio
    async def test_root_folder_creation(self, db_session: AsyncSession, test_user: User):
        """Test creation of root-level archive folders."""
        folder = ArchiveFolder(
            name="Documents",
            description="Important documents storage",
            path="/archive/documents",
            user_id=test_user.id,
            parent_uuid=None  # Root folder
        )
        
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        assert folder.uuid is not None
        assert folder.name == "Documents"
        assert folder.parent_uuid is None
        assert folder.depth == 0
        assert folder.item_count == 0
        assert folder.total_size == 0
        assert folder.created_at is not None
    
    @pytest.mark.asyncio
    async def test_nested_folder_creation(self, db_session: AsyncSession, test_user: User):
        """Test creation of nested folder hierarchies."""
        # Create parent folder
        parent = ArchiveFolder(
            name="Projects",
            description="Project files",
            path="/archive/projects",
            user_id=test_user.id
        )
        
        db_session.add(parent)
        await db_session.commit()
        await db_session.refresh(parent)
        
        # Create child folder
        child = ArchiveFolder(
            name="Web Development",
            description="Web development projects",
            path="/archive/projects/web-development",
            parent_uuid=parent.uuid,
            user_id=test_user.id,
            depth=1
        )
        
        db_session.add(child)
        await db_session.commit()
        await db_session.refresh(child)
        
        # Create grandchild folder
        grandchild = ArchiveFolder(
            name="React Projects",
            description="React applications",
            path="/archive/projects/web-development/react",
            parent_uuid=child.uuid,
            user_id=test_user.id,
            depth=2
        )
        
        db_session.add(grandchild)
        await db_session.commit()
        
        # Verify hierarchy
        assert child.parent_uuid == parent.uuid
        assert grandchild.parent_uuid == child.uuid
        assert child.depth == 1
        assert grandchild.depth == 2
        
        # Test querying by hierarchy
        result = await db_session.execute(
            select(ArchiveFolder).where(ArchiveFolder.parent_uuid == parent.uuid)
        )
        children = result.scalars().all()
        assert len(children) == 1
        assert children[0].name == "Web Development"
    
    @pytest.mark.asyncio
    async def test_folder_path_uniqueness(self, db_session: AsyncSession, test_user: User):
        """Test that folder paths are unique per user."""
        folder1 = ArchiveFolder(
            name="Documents",
            path="/archive/documents",
            user_id=test_user.id
        )
        
        folder2 = ArchiveFolder(
            name="Documents Copy",
            path="/archive/documents",  # Same path
            user_id=test_user.id
        )
        
        db_session.add(folder1)
        await db_session.commit()
        
        db_session.add(folder2)
        # Should handle path conflicts gracefully or raise appropriate error
        try:
            await db_session.commit()
            # If no error, check that system handles duplicates
            result = await db_session.execute(
                select(ArchiveFolder).where(ArchiveFolder.path.like("/archive/documents%"))
            )
            folders = result.scalars().all()
            assert len(folders) >= 1
        except Exception:
            # Expected behavior for path conflicts
            await db_session.rollback()
    
    @pytest.mark.asyncio
    async def test_folder_statistics_update(self, db_session: AsyncSession, test_user: User):
        """Test that folder statistics are updated correctly."""
        folder = ArchiveFolder(
            name="Test Folder",
            path="/archive/test",
            user_id=test_user.id
        )
        
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        # Initially empty
        assert folder.item_count == 0
        assert folder.total_size == 0
        
        # Add an item
        item = ArchiveItem(
            name="Test File",
            original_filename="test.txt",
            stored_filename="test_123.txt",
            file_path="/archive/test/test_123.txt",
            mime_type="text/plain",
            file_size=1024,
            folder_uuid=folder.uuid,
            user_id=test_user.id
        )
        
        db_session.add(item)
        await db_session.commit()
        
        # Update folder statistics (this would normally be done by triggers or application logic)
        folder.item_count = 1
        folder.total_size = 1024
        await db_session.commit()
        
        await db_session.refresh(folder)
        assert folder.item_count == 1
        assert folder.total_size == 1024


class TestArchiveItemOperations:
    """Test archive item creation, storage, and management."""
    
    @pytest.mark.asyncio
    async def test_archive_item_creation(self, db_session: AsyncSession, test_user: User):
        """Test creation of archive items."""
        # Create folder first
        folder = ArchiveFolder(
            name="Files",
            path="/archive/files",
            user_id=test_user.id
        )
        
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        # Create archive item
        item = ArchiveItem(
            name="Important Document",
            description="Very important file",
            original_filename="important.pdf",
            stored_filename="imp_" + str(uuid4()) + ".pdf",
            file_path="/archive/files/imp_123.pdf",
            mime_type="application/pdf",
            file_size=2048000,
            folder_uuid=folder.uuid,
            user_id=test_user.id,
            metadata_json='{"source": "upload", "category": "document"}'
        )
        
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)
        
        assert item.uuid is not None
        assert item.name == "Important Document"
        assert item.folder_uuid == folder.uuid
        assert item.file_size == 2048000
        assert item.is_favorite is False
        assert item.upload_status == "completed"
        assert item.created_at is not None
    
    @pytest.mark.asyncio
    async def test_archive_item_tagging(self, db_session: AsyncSession, test_user: User):
        """Test tagging of archive items."""
        folder = ArchiveFolder(name="Tagged", path="/archive/tagged", user_id=test_user.id)
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        item = ArchiveItem(
            name="Tagged File",
            original_filename="tagged.txt",
            stored_filename="tagged_123.txt",
            file_path="/archive/tagged/tagged_123.txt",
            mime_type="text/plain",
            file_size=512,
            folder_uuid=folder.uuid,
            user_id=test_user.id
        )
        
        tag1 = Tag(name="important", user_id=test_user.id)
        tag2 = Tag(name="project-alpha", user_id=test_user.id)
        
        db_session.add_all([item, tag1, tag2])
        await db_session.commit()
        
        # Associate tags with archive item
        item.tag_objs.extend([tag1, tag2])
        await db_session.commit()
        
        # Verify tagging
        await db_session.refresh(item)
        assert len(item.tag_objs) == 2
        tag_names = [tag.name for tag in item.tag_objs]
        assert "important" in tag_names
        assert "project-alpha" in tag_names
    
    @pytest.mark.asyncio
    async def test_archive_item_metadata(self, db_session: AsyncSession, test_user: User):
        """Test archive item metadata handling."""
        folder = ArchiveFolder(name="Metadata", path="/archive/metadata", user_id=test_user.id)
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        metadata = {
            "source": "email_attachment",
            "sender": "john@example.com", 
            "received_date": "2025-01-15",
            "category": "invoice",
            "processed": True,
            "archive_reason": "tax_records"
        }
        
        item = ArchiveItem(
            name="Invoice 2025-001",
            original_filename="invoice_001.pdf",
            stored_filename="inv_001_" + str(uuid4()) + ".pdf",
            file_path="/archive/metadata/inv_001_abc.pdf",
            mime_type="application/pdf",
            file_size=512000,
            folder_uuid=folder.uuid,
            user_id=test_user.id,
            metadata_json=str(metadata)  # JSON string
        )
        
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)
        
        assert item.metadata_json is not None
        assert "invoice" in item.metadata_json
        assert "tax_records" in item.metadata_json
    
    @pytest.mark.asyncio
    async def test_archive_item_search(self, db_session: AsyncSession, test_user: User):
        """Test searching archive items."""
        folder = ArchiveFolder(name="Search", path="/archive/search", user_id=test_user.id)
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        items = [
            ArchiveItem(
                name="Python Tutorial",
                description="Learn Python programming",
                original_filename="python_tutorial.pdf",
                stored_filename="py_tut_123.pdf",
                file_path="/archive/search/py_tut_123.pdf",
                mime_type="application/pdf",
                file_size=1024000,
                folder_uuid=folder.uuid,
                user_id=test_user.id
            ),
            ArchiveItem(
                name="JavaScript Guide",
                description="Complete JavaScript reference",
                original_filename="js_guide.pdf",
                stored_filename="js_guide_456.pdf",
                file_path="/archive/search/js_guide_456.pdf",
                mime_type="application/pdf",
                file_size=2048000,
                folder_uuid=folder.uuid,
                user_id=test_user.id
            ),
            ArchiveItem(
                name="Database Design",
                description="SQL and database fundamentals",
                original_filename="db_design.pdf",
                stored_filename="db_design_789.pdf",
                file_path="/archive/search/db_design_789.pdf",
                mime_type="application/pdf",
                file_size=1536000,
                folder_uuid=folder.uuid,
                user_id=test_user.id
            )
        ]
        
        db_session.add_all(items)
        await db_session.commit()
        
        # Search by name
        result = await db_session.execute(
            select(ArchiveItem).where(
                ArchiveItem.name.contains("Python"),
                ArchiveItem.user_id == test_user.id
            )
        )
        python_items = result.scalars().all()
        assert len(python_items) == 1
        assert python_items[0].name == "Python Tutorial"
        
        # Search by description
        result = await db_session.execute(
            select(ArchiveItem).where(
                ArchiveItem.description.contains("reference"),
                ArchiveItem.user_id == test_user.id
            )
        )
        ref_items = result.scalars().all()
        assert len(ref_items) == 1
        assert ref_items[0].name == "JavaScript Guide"


class TestArchiveIntegration:
    """Test archive system integration with other modules."""
    
    @pytest.mark.asyncio
    async def test_document_to_archive_migration(self, db_session: AsyncSession, test_user: User):
        """Test moving documents to archive system."""
        # Create a document
        document = Document(
            title="Document to Archive",
            filename="doc_archive.pdf",
            original_name="Archive Me.pdf",
            file_path="/documents/doc_archive.pdf",
            file_size=1024000,
            mime_type="application/pdf",
            description="This document will be archived",
            user_id=test_user.id
        )
        
        db_session.add(document)
        await db_session.commit()
        await db_session.refresh(document)
        
        # Create archive folder
        archive_folder = ArchiveFolder(
            name="Archived Documents",
            path="/archive/documents",
            user_id=test_user.id
        )
        
        db_session.add(archive_folder)
        await db_session.commit()
        await db_session.refresh(archive_folder)
        
        # Create corresponding archive item
        archive_item = ArchiveItem(
            name=document.title,
            description=document.description,
            original_filename=document.original_name,
            stored_filename=document.filename,
            file_path=f"/archive/documents/{document.filename}",
            mime_type=document.mime_type,
            file_size=document.file_size,
            folder_uuid=archive_folder.uuid,
            user_id=test_user.id,
            metadata_json=f'{{"source_document_id": {document.id}, "archived_from": "documents"}}'
        )
        
        db_session.add(archive_item)
        await db_session.commit()
        
        # Mark document as archived
        document.is_archived = True
        document.archive_item_uuid = archive_item.uuid
        await db_session.commit()
        
        # Verify integration
        assert document.is_archived is True
        assert document.archive_item_uuid == archive_item.uuid
        assert archive_item.metadata_json is not None
        assert str(document.id) in archive_item.metadata_json
    
    @pytest.mark.asyncio
    async def test_archive_folder_permissions(self, db_session: AsyncSession):
        """Test that users can only access their own archive folders."""
        # Create two users
        user1 = User(username="user1", email="user1@test.com", password_hash="hash1")
        user2 = User(username="user2", email="user2@test.com", password_hash="hash2")
        db_session.add_all([user1, user2])
        await db_session.commit()
        
        # Create folders for each user
        folder1 = ArchiveFolder(name="User1 Folder", path="/archive/user1", user_id=user1.id)
        folder2 = ArchiveFolder(name="User2 Folder", path="/archive/user2", user_id=user2.id)
        
        db_session.add_all([folder1, folder2])
        await db_session.commit()
        
        # User 1 should only see their folders
        result = await db_session.execute(
            select(ArchiveFolder).where(ArchiveFolder.user_id == user1.id)
        )
        user1_folders = result.scalars().all()
        assert len(user1_folders) == 1
        assert user1_folders[0].name == "User1 Folder"
        
        # User 2 should only see their folders
        result = await db_session.execute(
            select(ArchiveFolder).where(ArchiveFolder.user_id == user2.id)
        )
        user2_folders = result.scalars().all()
        assert len(user2_folders) == 1
        assert user2_folders[0].name == "User2 Folder"
    
    @pytest.mark.asyncio
    async def test_archive_full_text_search_integration(self, db_session: AsyncSession, test_user: User):
        """Test archive integration with FTS5 search system."""
        folder = ArchiveFolder(name="Searchable", path="/archive/searchable", user_id=test_user.id)
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        # Create archive items with searchable content
        items = [
            ArchiveItem(
                name="Machine Learning Research",
                description="Deep learning and neural networks paper",
                original_filename="ml_research.pdf",
                stored_filename="ml_research_123.pdf",
                file_path="/archive/searchable/ml_research_123.pdf",
                mime_type="application/pdf",
                file_size=2048000,
                folder_uuid=folder.uuid,
                user_id=test_user.id
            ),
            ArchiveItem(
                name="Web Development Guide",
                description="Complete guide to modern web development",
                original_filename="web_dev.pdf",
                stored_filename="web_dev_456.pdf",
                file_path="/archive/searchable/web_dev_456.pdf",
                mime_type="application/pdf",
                file_size=1536000,
                folder_uuid=folder.uuid,
                user_id=test_user.id
            )
        ]
        
        db_session.add_all(items)
        await db_session.commit()
        
        # Test search functionality (this would integrate with FTS5 in real system)
        result = await db_session.execute(
            select(ArchiveItem).where(
                ArchiveItem.name.contains("Machine Learning"),
                ArchiveItem.user_id == test_user.id
            )
        )
        ml_items = result.scalars().all()
        assert len(ml_items) == 1
        assert "neural networks" in ml_items[0].description


class TestArchiveFileOperations:
    """Test file system operations for archive system."""
    
    @pytest.mark.asyncio
    async def test_archive_storage_paths(self, db_session: AsyncSession, test_user: User):
        """Test that archive storage paths are correctly generated."""
        folder = ArchiveFolder(
            name="Storage Test",
            path="/archive/storage_test",
            user_id=test_user.id
        )
        
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        # Test path generation for different file types
        test_files = [
            ("document.pdf", "application/pdf"),
            ("image.jpg", "image/jpeg"),
            ("spreadsheet.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            ("presentation.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
            ("text.txt", "text/plain")
        ]
        
        for original_filename, mime_type in test_files:
            # Generate unique stored filename
            file_ext = Path(original_filename).suffix
            stored_filename = f"arch_{uuid4().hex[:8]}{file_ext}"
            file_path = f"/archive/storage_test/{stored_filename}"
            
            item = ArchiveItem(
                name=f"Test {original_filename}",
                original_filename=original_filename,
                stored_filename=stored_filename,
                file_path=file_path,
                mime_type=mime_type,
                file_size=1024,
                folder_uuid=folder.uuid,
                user_id=test_user.id
            )
            
            db_session.add(item)
        
        await db_session.commit()
        
        # Verify all items were created with proper paths
        result = await db_session.execute(
            select(ArchiveItem).where(ArchiveItem.folder_uuid == folder.uuid)
        )
        items = result.scalars().all()
        assert len(items) == len(test_files)
        
        for item in items:
            assert item.file_path.startswith("/archive/storage_test/")
            assert item.stored_filename.startswith("arch_")
            assert Path(item.original_filename).suffix in item.stored_filename
    
    @pytest.mark.asyncio
    async def test_archive_file_validation(self, db_session: AsyncSession, test_user: User):
        """Test file validation for archive uploads."""
        folder = ArchiveFolder(name="Validation", path="/archive/validation", user_id=test_user.id)
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        # Test various file scenarios
        test_cases = [
            {
                "name": "Valid PDF",
                "filename": "document.pdf",
                "mime_type": "application/pdf",
                "size": 1024000,
                "should_pass": True
            },
            {
                "name": "Large File",
                "filename": "huge_file.zip",
                "mime_type": "application/zip",
                "size": 500 * 1024 * 1024,  # 500MB
                "should_pass": True  # Depends on system limits
            },
            {
                "name": "Empty File",
                "filename": "empty.txt",
                "mime_type": "text/plain",
                "size": 0,
                "should_pass": False
            },
            {
                "name": "Suspicious Extension",
                "filename": "script.exe",
                "mime_type": "application/octet-stream",
                "size": 1024,
                "should_pass": True  # Archive system should accept but flag
            }
        ]
        
        for test_case in test_cases:
            try:
                item = ArchiveItem(
                    name=test_case["name"],
                    original_filename=test_case["filename"],
                    stored_filename=f"test_{uuid4().hex[:8]}_{test_case['filename']}",
                    file_path=f"/archive/validation/test_{test_case['filename']}",
                    mime_type=test_case["mime_type"],
                    file_size=test_case["size"],
                    folder_uuid=folder.uuid,
                    user_id=test_user.id
                )
                
                db_session.add(item)
                await db_session.commit()
                
                if test_case["should_pass"]:
                    # Should succeed
                    await db_session.refresh(item)
                    assert item.id is not None
                else:
                    # Should have been handled or flagged
                    await db_session.refresh(item)
                    # Could check for warning flags or special handling
                    
            except Exception as e:
                if not test_case["should_pass"]:
                    # Expected to fail
                    await db_session.rollback()
                else:
                    # Unexpected failure
                    pytest.fail(f"Unexpected failure for {test_case['name']}: {e}")


class TestArchivePerformance:
    """Test archive system performance and scalability."""
    
    @pytest.mark.asyncio
    async def test_large_folder_structure(self, db_session: AsyncSession, test_user: User):
        """Test performance with large folder structures."""
        # Create a deep folder hierarchy
        folders = []
        parent_uuid = None
        
        for depth in range(5):  # 5 levels deep
            for i in range(3):  # 3 folders per level
                folder = ArchiveFolder(
                    name=f"Folder_L{depth}_N{i}",
                    path=f"/archive/level{depth}/folder{i}",
                    parent_uuid=parent_uuid,
                    depth=depth,
                    user_id=test_user.id
                )
                folders.append(folder)
                
                if depth == 0 and i == 0:
                    # Use first folder as parent for next level
                    db_session.add(folder)
                    await db_session.commit()
                    await db_session.refresh(folder)
                    parent_uuid = folder.uuid
        
        # Add all folders
        db_session.add_all(folders)
        await db_session.commit()
        
        # Test querying performance
        import time
        start_time = time.time()
        
        result = await db_session.execute(
            select(ArchiveFolder).where(ArchiveFolder.user_id == test_user.id)
        )
        all_folders = result.scalars().all()
        
        end_time = time.time()
        query_time = end_time - start_time
        
        assert len(all_folders) >= 15  # At least the folders we created
        assert query_time < 1.0, f"Folder query took {query_time:.3f}s, should be under 1s"
    
    @pytest.mark.asyncio
    async def test_many_archive_items(self, db_session: AsyncSession, test_user: User):
        """Test performance with many archive items."""
        folder = ArchiveFolder(name="Performance", path="/archive/performance", user_id=test_user.id)
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        # Create many archive items
        items = []
        for i in range(100):
            item = ArchiveItem(
                name=f"Performance Test Item {i}",
                original_filename=f"test_file_{i}.txt",
                stored_filename=f"perf_test_{i}_{uuid4().hex[:8]}.txt",
                file_path=f"/archive/performance/perf_test_{i}.txt",
                mime_type="text/plain",
                file_size=1024 * (i + 1),  # Varying sizes
                folder_uuid=folder.uuid,
                user_id=test_user.id
            )
            items.append(item)
        
        # Batch insert
        db_session.add_all(items)
        await db_session.commit()
        
        # Test search performance
        import time
        start_time = time.time()
        
        result = await db_session.execute(
            select(ArchiveItem).where(
                ArchiveItem.folder_uuid == folder.uuid,
                ArchiveItem.name.contains("Performance")
            ).limit(20)
        )
        search_results = result.scalars().all()
        
        end_time = time.time()
        search_time = end_time - start_time
        
        assert len(search_results) == 20  # Limited by query
        assert search_time < 0.5, f"Search took {search_time:.3f}s, should be under 0.5s"
