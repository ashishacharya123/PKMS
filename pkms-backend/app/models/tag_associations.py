"""Association tables between Tag and content models (Note, Document, Todo, Project, ArchiveItem, ArchiveFolder, DiaryEntry)"""

from sqlalchemy import Table, Column, Integer, String, ForeignKey
from app.models.base import Base

# Many-to-many linking tables
note_tags = Table(
    "note_tags",
    Base.metadata,
    Column("note_uuid", String(36), ForeignKey("notes.uuid", ondelete="CASCADE"), primary_key=True),
    Column("tag_uuid", String(36), ForeignKey("tags.uuid", ondelete="CASCADE"), primary_key=True),
)

document_tags = Table(
    "document_tags",
    Base.metadata,
    Column("document_uuid", String(36), ForeignKey("documents.uuid", ondelete="CASCADE"), primary_key=True),
    Column("tag_uuid", String(36), ForeignKey("tags.uuid", ondelete="CASCADE"), primary_key=True),
)

todo_tags = Table(
    "todo_tags",
    Base.metadata,
    Column("todo_uuid", String(36), ForeignKey("todos.uuid", ondelete="CASCADE"), primary_key=True),
    Column("tag_uuid", String(36), ForeignKey("tags.uuid", ondelete="CASCADE"), primary_key=True),
)

# Projects using UUID primary key
project_tags = Table(
    "project_tags",
    Base.metadata,
    Column("project_uuid", String(36), ForeignKey("projects.uuid", ondelete="CASCADE"), primary_key=True),
    Column("tag_uuid", String(36), ForeignKey("tags.uuid", ondelete="CASCADE"), primary_key=True),
)

# Archive items using UUID primary key
archive_item_tags = Table(
    "archive_item_tags",
    Base.metadata,
    Column("item_uuid", String(36), ForeignKey("archive_items.uuid", ondelete="CASCADE"), primary_key=True),
    Column("tag_uuid", String(36), ForeignKey("tags.uuid", ondelete="CASCADE"), primary_key=True),
)

# Archive folders using UUID primary key
archive_folder_tags = Table(
    "archive_folder_tags",
    Base.metadata,
    Column("folder_uuid", String(36), ForeignKey("archive_folders.uuid", ondelete="CASCADE"), primary_key=True),
    Column("tag_uuid", String(36), ForeignKey("tags.uuid", ondelete="CASCADE"), primary_key=True),
)

# Diary entries using UUID primary key
diary_entry_tags = Table(
    "diary_entry_tags",
    Base.metadata,
    Column("entry_uuid", String(36), ForeignKey("diary_entries.uuid", ondelete="CASCADE"), primary_key=True),
    Column("tag_uuid", String(36), ForeignKey("tags.uuid", ondelete="CASCADE"), primary_key=True),
)

# Links module removed - users can create bookmark notes instead

# Alias for archive_tags to refer to archive_item_tags
archive_tags = archive_item_tags

# Alias for diary_tags to refer to diary_entry_tags
diary_tags = diary_entry_tags 