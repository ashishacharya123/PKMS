"""
Database Model Tests for PKMS Backend.

Comprehensive tests for all database models including relationships,
validation, constraints, and business logic.

Created by: AI Assistant (Claude Sonnet 4)
Date: 2025-01-16
"""

import pytest
from datetime import datetime, timedelta
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select

from app.models.user import User, Session, RecoveryKey
from app.models.note import Note, NoteFile
from app.models.document import Document
from app.models.todo import Todo, Project
from app.models.diary import DiaryEntry, DiaryMedia
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.tag import Tag
from app.models.link import Link
from app.auth.security import hash_password
from .conftest import assert_response_success


class TestUserModel:
    """Test User model functionality and relationships."""
    
    @pytest.mark.asyncio
    async def test_user_creation(self, db_session: AsyncSession):
        """Test basic user creation."""
        user = User(
            username="testuser",
            email="test@example.com",
            password_hash=hash_password("TestPassword123!"),
            is_active=True
        )
        
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        
        assert user.id is not None
        assert user.username == "testuser"
        assert user.email == "test@example.com"
        assert user.is_active is True
        assert user.is_first_login is True  # Default value
        assert user.created_at is not None
    
    @pytest.mark.asyncio
    async def test_user_unique_constraints(self, db_session: AsyncSession):
        """Test unique constraints on username and email."""
        user1 = User(
            username="testuser",
            email="test@example.com",
            password_hash=hash_password("Password123!")
        )
        
        user2 = User(
            username="testuser",  # Same username
            email="different@example.com",
            password_hash=hash_password("Password123!")
        )
        
        db_session.add(user1)
        await db_session.commit()
        
        db_session.add(user2)
        with pytest.raises(IntegrityError):
            await db_session.commit()
    
    @pytest.mark.asyncio
    async def test_user_password_validation(self, db_session: AsyncSession):
        """Test password hashing and validation."""
        password = "TestPassword123!"
        user = User(
            username="testuser",
            email="test@example.com",
            password_hash=hash_password(password)
        )
        
        db_session.add(user)
        await db_session.commit()
        
        # Password should be hashed
        assert user.password_hash != password
        assert len(user.password_hash) > 50  # Hashed passwords are long
    
    @pytest.mark.asyncio
    async def test_user_relationships(self, db_session: AsyncSession):
        """Test user relationships with other models."""
        user = User(
            username="testuser",
            email="test@example.com",
            password_hash=hash_password("Password123!")
        )
        
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        
        # Create related objects
        note = Note(title="Test Note", content="Test content", user_id=user.id)
        document = Document(
            title="Test Document",
            filename="test.pdf",
            original_name="test.pdf",
            file_path="/docs/test.pdf",
            file_size=1024,
            mime_type="application/pdf",
            user_id=user.id
        )
        
        db_session.add_all([note, document])
        await db_session.commit()
        
        # Test relationships
        result = await db_session.execute(
            select(User).where(User.id == user.id)
        )
        loaded_user = result.scalar_one()
        
        assert hasattr(loaded_user, 'notes')
        assert hasattr(loaded_user, 'documents')


class TestNoteModel:
    """Test Note model functionality."""
    
    @pytest.mark.asyncio
    async def test_note_creation(self, db_session: AsyncSession, test_user: User):
        """Test basic note creation."""
        note = Note(
            title="Test Note",
            content="This is test content for the note.",
            user_id=test_user.id,
            area="Personal"
        )
        
        db_session.add(note)
        await db_session.commit()
        await db_session.refresh(note)
        
        assert note.id is not None
        assert note.title == "Test Note"
        assert note.content == "This is test content for the note."
        assert note.user_id == test_user.id
        assert note.area == "Personal"
        assert note.is_favorite is False  # Default value
        assert note.created_at is not None
    
    @pytest.mark.asyncio
    async def test_note_tags_relationship(self, db_session: AsyncSession, test_user: User):
        """Test note-tag many-to-many relationship."""
        note = Note(
            title="Tagged Note",
            content="Note with tags",
            user_id=test_user.id
        )
        
        tag1 = Tag(name="python", user_id=test_user.id)
        tag2 = Tag(name="programming", user_id=test_user.id)
        
        db_session.add_all([note, tag1, tag2])
        await db_session.commit()
        
        # Associate tags with note
        note.tag_objs.extend([tag1, tag2])
        await db_session.commit()
        
        # Verify relationship
        await db_session.refresh(note)
        assert len(note.tag_objs) == 2
        tag_names = [tag.name for tag in note.tag_objs]
        assert "python" in tag_names
        assert "programming" in tag_names
    
    @pytest.mark.asyncio
    async def test_note_search_functionality(self, db_session: AsyncSession, test_user: User):
        """Test note search and filtering."""
        notes = [
            Note(title="Python Tutorial", content="Learn Python programming", user_id=test_user.id, area="Tech"),
            Note(title="Recipe Book", content="Delicious pasta recipes", user_id=test_user.id, area="Cooking"),
            Note(title="Travel Plans", content="Visit Python Island", user_id=test_user.id, area="Travel")
        ]
        
        db_session.add_all(notes)
        await db_session.commit()
        
        # Search by title
        result = await db_session.execute(
            select(Note).where(Note.title.contains("Python")).where(Note.user_id == test_user.id)
        )
        python_notes = result.scalars().all()
        assert len(python_notes) == 1
        assert python_notes[0].title == "Python Tutorial"
        
        # Search by area
        result = await db_session.execute(
            select(Note).where(Note.area == "Tech").where(Note.user_id == test_user.id)
        )
        tech_notes = result.scalars().all()
        assert len(tech_notes) == 1
    
    @pytest.mark.asyncio
    async def test_note_file_attachment(self, db_session: AsyncSession, test_user: User):
        """Test note file attachments."""
        note = Note(
            title="Note with Attachments",
            content="This note has files attached",
            user_id=test_user.id
        )
        
        db_session.add(note)
        await db_session.commit()
        await db_session.refresh(note)
        
        # Create note file attachment
        note_file = NoteFile(
            note_id=note.id,
            filename="attachment.pdf",
            original_name="document.pdf",
            file_path="/attachments/attachment.pdf",
            file_size=2048,
            mime_type="application/pdf"
        )
        
        db_session.add(note_file)
        await db_session.commit()
        
        # Verify attachment
        result = await db_session.execute(
            select(NoteFile).where(NoteFile.note_id == note.id)
        )
        attachments = result.scalars().all()
        assert len(attachments) == 1
        assert attachments[0].filename == "attachment.pdf"


class TestDocumentModel:
    """Test Document model functionality."""
    
    @pytest.mark.asyncio
    async def test_document_creation(self, db_session: AsyncSession, test_user: User):
        """Test document creation with all fields."""
        document = Document(
            title="Important Document",
            filename="doc_123.pdf",
            original_name="Important Document.pdf",
            file_path="/documents/doc_123.pdf",
            file_size=1024000,
            mime_type="application/pdf",
            description="This is an important document",
            user_id=test_user.id,
            is_favorite=True
        )
        
        db_session.add(document)
        await db_session.commit()
        await db_session.refresh(document)
        
        assert document.id is not None
        assert document.uuid is not None
        assert UUID(document.uuid)  # Valid UUID
        assert document.title == "Important Document"
        assert document.filename == "doc_123.pdf"
        assert document.original_name == "Important Document.pdf"
        assert document.is_favorite is True
        assert document.upload_status == "completed"  # Default value
    
    @pytest.mark.asyncio
    async def test_document_archive_functionality(self, db_session: AsyncSession, test_user: User):
        """Test document archiving functionality."""
        document = Document(
            title="Document to Archive",
            filename="archive_me.pdf",
            original_name="archive_me.pdf",
            file_path="/documents/archive_me.pdf",
            file_size=512000,
            mime_type="application/pdf",
            user_id=test_user.id
        )
        
        db_session.add(document)
        await db_session.commit()
        
        # Archive the document
        document.is_archived = True
        await db_session.commit()
        
        assert document.is_archived is True
    
    @pytest.mark.asyncio
    async def test_document_tags_relationship(self, db_session: AsyncSession, test_user: User):
        """Test document-tag relationship."""
        document = Document(
            title="Tagged Document",
            filename="tagged.pdf",
            original_name="tagged.pdf",
            file_path="/documents/tagged.pdf",
            file_size=256000,
            mime_type="application/pdf",
            user_id=test_user.id
        )
        
        tag1 = Tag(name="important", user_id=test_user.id)
        tag2 = Tag(name="work", user_id=test_user.id)
        
        db_session.add_all([document, tag1, tag2])
        await db_session.commit()
        
        # Associate tags
        document.tag_objs.extend([tag1, tag2])
        await db_session.commit()
        
        # Verify relationship
        await db_session.refresh(document)
        assert len(document.tag_objs) == 2


class TestTodoModel:
    """Test Todo and Project model functionality."""
    
    @pytest.mark.asyncio
    async def test_todo_creation(self, db_session: AsyncSession, test_user: User):
        """Test basic todo creation."""
        todo = Todo(
            title="Complete Testing",
            description="Write comprehensive tests for the application",
            user_id=test_user.id,
            priority="high",
            status="pending"
        )
        
        db_session.add(todo)
        await db_session.commit()
        await db_session.refresh(todo)
        
        assert todo.id is not None
        assert todo.title == "Complete Testing"
        assert todo.priority == "high"
        assert todo.status == "pending"
        assert todo.is_favorite is False
        assert todo.created_at is not None
    
    @pytest.mark.asyncio
    async def test_todo_project_relationship(self, db_session: AsyncSession, test_user: User):
        """Test todo-project relationship."""
        project = Project(
            name="Test Project",
            description="Project for testing",
            user_id=test_user.id,
            status="active"
        )
        
        db_session.add(project)
        await db_session.commit()
        await db_session.refresh(project)
        
        todo = Todo(
            title="Project Task",
            description="Task for the project",
            user_id=test_user.id,
            project_id=project.id
        )
        
        db_session.add(todo)
        await db_session.commit()
        
        # Verify relationship
        result = await db_session.execute(
            select(Todo).where(Todo.project_id == project.id)
        )
        project_todos = result.scalars().all()
        assert len(project_todos) == 1
        assert project_todos[0].title == "Project Task"
    
    @pytest.mark.asyncio
    async def test_todo_due_date_functionality(self, db_session: AsyncSession, test_user: User):
        """Test todo due date and overdue logic."""
        # Create overdue todo
        overdue_todo = Todo(
            title="Overdue Task",
            description="This task is overdue",
            user_id=test_user.id,
            due_date=datetime.now() - timedelta(days=1)
        )
        
        # Create future todo
        future_todo = Todo(
            title="Future Task",
            description="This task is due in the future",
            user_id=test_user.id,
            due_date=datetime.now() + timedelta(days=7)
        )
        
        db_session.add_all([overdue_todo, future_todo])
        await db_session.commit()
        
        # Query overdue todos
        result = await db_session.execute(
            select(Todo).where(
                Todo.due_date < datetime.now(),
                Todo.user_id == test_user.id,
                Todo.status != "completed"
            )
        )
        overdue_todos = result.scalars().all()
        assert len(overdue_todos) == 1
        assert overdue_todos[0].title == "Overdue Task"


class TestArchiveModel:
    """Test Archive folder and item models."""
    
    @pytest.mark.asyncio
    async def test_archive_folder_creation(self, db_session: AsyncSession, test_user: User):
        """Test archive folder creation."""
        folder = ArchiveFolder(
            name="Documents",
            description="Important documents folder",
            path="/archive/documents",
            user_id=test_user.id
        )
        
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        assert folder.uuid is not None
        assert UUID(folder.uuid)  # Valid UUID
        assert folder.name == "Documents"
        assert folder.path == "/archive/documents"
        assert folder.parent_uuid is None  # Root folder
    
    @pytest.mark.asyncio
    async def test_archive_folder_hierarchy(self, db_session: AsyncSession, test_user: User):
        """Test archive folder parent-child relationships."""
        parent_folder = ArchiveFolder(
            name="Main",
            description="Main folder",
            path="/archive/main",
            user_id=test_user.id
        )
        
        db_session.add(parent_folder)
        await db_session.commit()
        await db_session.refresh(parent_folder)
        
        child_folder = ArchiveFolder(
            name="Subfolder",
            description="Child folder",
            path="/archive/main/subfolder",
            parent_uuid=parent_folder.uuid,
            user_id=test_user.id
        )
        
        db_session.add(child_folder)
        await db_session.commit()
        
        # Verify hierarchy
        result = await db_session.execute(
            select(ArchiveFolder).where(ArchiveFolder.parent_uuid == parent_folder.uuid)
        )
        children = result.scalars().all()
        assert len(children) == 1
        assert children[0].name == "Subfolder"
    
    @pytest.mark.asyncio
    async def test_archive_item_creation(self, db_session: AsyncSession, test_user: User):
        """Test archive item creation."""
        folder = ArchiveFolder(
            name="Files",
            description="Files folder",
            path="/archive/files",
            user_id=test_user.id
        )
        
        db_session.add(folder)
        await db_session.commit()
        await db_session.refresh(folder)
        
        item = ArchiveItem(
            name="Important File",
            description="An important archived file",
            original_filename="important.pdf",
            stored_filename="arch_important_123.pdf",
            file_path="/archive/files/arch_important_123.pdf",
            mime_type="application/pdf",
            file_size=1024000,
            folder_uuid=folder.uuid,
            user_id=test_user.id
        )
        
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)
        
        assert item.uuid is not None
        assert item.name == "Important File"
        assert item.folder_uuid == folder.uuid
        assert item.mime_type == "application/pdf"


class TestDiaryModel:
    """Test Diary entry and media models."""
    
    @pytest.mark.asyncio
    async def test_diary_entry_creation(self, db_session: AsyncSession, test_user: User):
        """Test diary entry creation."""
        entry = DiaryEntry(
            title="My Day",
            date=datetime.now().date(),
            mood="happy",
            user_id=test_user.id,
            encrypted_content=b"encrypted_content_here",
            encrypted_metadata=b"encrypted_metadata_here"
        )
        
        db_session.add(entry)
        await db_session.commit()
        await db_session.refresh(entry)
        
        assert entry.id is not None
        assert entry.title == "My Day"
        assert entry.mood == "happy"
        assert entry.encrypted_content is not None
        assert entry.encryption_method == "AES-GCM"  # Default
    
    @pytest.mark.asyncio
    async def test_diary_unique_date_constraint(self, db_session: AsyncSession, test_user: User):
        """Test that users can only have one diary entry per date."""
        today = datetime.now().date()
        
        entry1 = DiaryEntry(
            title="First Entry",
            date=today,
            user_id=test_user.id,
            encrypted_content=b"content1"
        )
        
        entry2 = DiaryEntry(
            title="Second Entry",
            date=today,  # Same date
            user_id=test_user.id,
            encrypted_content=b"content2"
        )
        
        db_session.add(entry1)
        await db_session.commit()
        
        db_session.add(entry2)
        with pytest.raises(IntegrityError):
            await db_session.commit()
    
    @pytest.mark.asyncio
    async def test_diary_media_attachment(self, db_session: AsyncSession, test_user: User):
        """Test diary media attachments."""
        entry = DiaryEntry(
            title="Entry with Media",
            date=datetime.now().date(),
            user_id=test_user.id,
            encrypted_content=b"encrypted_content"
        )
        
        db_session.add(entry)
        await db_session.commit()
        await db_session.refresh(entry)
        
        media = DiaryMedia(
            entry_id=entry.id,
            filename="photo.jpg",
            original_name="vacation_photo.jpg",
            file_path="/diary/media/photo.jpg",
            file_size=512000,
            mime_type="image/jpeg",
            media_type="photo",
            user_id=test_user.id,
            encrypted_file_data=b"encrypted_image_data"
        )
        
        db_session.add(media)
        await db_session.commit()
        
        # Verify relationship
        result = await db_session.execute(
            select(DiaryMedia).where(DiaryMedia.entry_id == entry.id)
        )
        media_files = result.scalars().all()
        assert len(media_files) == 1
        assert media_files[0].original_name == "vacation_photo.jpg"


class TestTagModel:
    """Test Tag model and relationships."""
    
    @pytest.mark.asyncio
    async def test_tag_creation(self, db_session: AsyncSession, test_user: User):
        """Test tag creation and uniqueness."""
        tag = Tag(
            name="python",
            user_id=test_user.id,
            color="#3776ab",
            description="Python programming language"
        )
        
        db_session.add(tag)
        await db_session.commit()
        await db_session.refresh(tag)
        
        assert tag.id is not None
        assert tag.name == "python"
        assert tag.color == "#3776ab"
        assert tag.created_at is not None
    
    @pytest.mark.asyncio
    async def test_tag_unique_per_user(self, db_session: AsyncSession):
        """Test that tag names are unique per user."""
        user1 = User(username="user1", email="user1@test.com", password_hash="hash1")
        user2 = User(username="user2", email="user2@test.com", password_hash="hash2")
        db_session.add_all([user1, user2])
        await db_session.commit()
        
        # Same tag name for different users should be allowed
        tag1 = Tag(name="work", user_id=user1.id)
        tag2 = Tag(name="work", user_id=user2.id)
        
        db_session.add_all([tag1, tag2])
        await db_session.commit()  # Should not raise an error
        
        # Duplicate tag for same user should fail
        tag3 = Tag(name="work", user_id=user1.id)
        db_session.add(tag3)
        
        with pytest.raises(IntegrityError):
            await db_session.commit()
    
    @pytest.mark.asyncio
    async def test_tag_relationships(self, db_session: AsyncSession, test_user: User):
        """Test tag relationships with content items."""
        tag = Tag(name="important", user_id=test_user.id)
        note = Note(title="Important Note", content="Content", user_id=test_user.id)
        document = Document(
            title="Important Doc",
            filename="doc.pdf",
            original_name="doc.pdf",
            file_path="/docs/doc.pdf",
            file_size=1024,
            mime_type="application/pdf",
            user_id=test_user.id
        )
        
        db_session.add_all([tag, note, document])
        await db_session.commit()
        
        # Associate tag with content
        note.tag_objs.append(tag)
        document.tag_objs.append(tag)
        await db_session.commit()
        
        # Verify relationships
        await db_session.refresh(tag)
        assert len(tag.notes) >= 1
        assert len(tag.documents) >= 1


class TestLinkModel:
    """Test Link model for cross-references."""
    
    @pytest.mark.asyncio
    async def test_link_creation(self, db_session: AsyncSession, test_user: User):
        """Test link creation between content items."""
        # Create source and target notes
        source_note = Note(title="Source Note", content="Links to target", user_id=test_user.id)
        target_note = Note(title="Target Note", content="Referenced note", user_id=test_user.id)
        
        db_session.add_all([source_note, target_note])
        await db_session.commit()
        await db_session.refresh(source_note)
        await db_session.refresh(target_note)
        
        # Create link
        link = Link(
            source_type="note",
            source_id=source_note.id,
            target_type="note",
            target_id=target_note.id,
            user_id=test_user.id,
            link_type="reference",
            description="Reference link between notes"
        )
        
        db_session.add(link)
        await db_session.commit()
        await db_session.refresh(link)
        
        assert link.id is not None
        assert link.source_type == "note"
        assert link.target_type == "note"
        assert link.link_type == "reference"
    
    @pytest.mark.asyncio
    async def test_cross_module_links(self, db_session: AsyncSession, test_user: User):
        """Test links between different content types."""
        note = Note(title="Research Note", content="Research content", user_id=test_user.id)
        document = Document(
            title="Research Paper",
            filename="research.pdf",
            original_name="research.pdf",
            file_path="/docs/research.pdf",
            file_size=2048000,
            mime_type="application/pdf",
            user_id=test_user.id
        )
        
        db_session.add_all([note, document])
        await db_session.commit()
        await db_session.refresh(note)
        await db_session.refresh(document)
        
        # Link note to document
        link = Link(
            source_type="note",
            source_id=note.id,
            target_type="document",
            target_id=document.id,
            user_id=test_user.id,
            link_type="attachment",
            description="Note references this document"
        )
        
        db_session.add(link)
        await db_session.commit()
        
        # Verify cross-module link
        result = await db_session.execute(
            select(Link).where(
                Link.source_type == "note",
                Link.target_type == "document",
                Link.user_id == test_user.id
            )
        )
        links = result.scalars().all()
        assert len(links) == 1
        assert links[0].description == "Note references this document"


class TestModelValidation:
    """Test model validation and constraints."""
    
    @pytest.mark.asyncio
    async def test_required_fields_validation(self, db_session: AsyncSession, test_user: User):
        """Test that required fields are enforced."""
        # Note without title should fail
        invalid_note = Note(content="Content without title", user_id=test_user.id)
        
        db_session.add(invalid_note)
        with pytest.raises((IntegrityError, ValueError)):
            await db_session.commit()
        
        await db_session.rollback()
        
        # Document without required fields should fail
        invalid_doc = Document(title="Title Only", user_id=test_user.id)
        
        db_session.add(invalid_doc)
        with pytest.raises((IntegrityError, ValueError)):
            await db_session.commit()
    
    @pytest.mark.asyncio
    async def test_foreign_key_constraints(self, db_session: AsyncSession):
        """Test foreign key constraints."""
        # Note with invalid user_id should fail
        invalid_note = Note(
            title="Invalid Note",
            content="Content",
            user_id=99999  # Non-existent user
        )
        
        db_session.add(invalid_note)
        with pytest.raises(IntegrityError):
            await db_session.commit()
    
    @pytest.mark.asyncio
    async def test_cascade_deletion(self, db_session: AsyncSession):
        """Test cascade deletion behavior."""
        user = User(
            username="testuser",
            email="test@example.com",
            password_hash=hash_password("Password123!")
        )
        
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        
        # Create user's content
        note = Note(title="User Note", content="Content", user_id=user.id)
        document = Document(
            title="User Document",
            filename="doc.pdf",
            original_name="doc.pdf",
            file_path="/docs/doc.pdf",
            file_size=1024,
            mime_type="application/pdf",
            user_id=user.id
        )
        
        db_session.add_all([note, document])
        await db_session.commit()
        
        # Delete user
        await db_session.delete(user)
        await db_session.commit()
        
        # User's content should be cascade deleted
        result = await db_session.execute(select(Note).where(Note.user_id == user.id))
        remaining_notes = result.scalars().all()
        assert len(remaining_notes) == 0
        
        result = await db_session.execute(select(Document).where(Document.user_id == user.id))
        remaining_docs = result.scalars().all()
        assert len(remaining_docs) == 0
