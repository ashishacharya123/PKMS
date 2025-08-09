"""Association tables between Tag and content models (Note, Document, Todo, ArchiveItem)"""

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

# Archive items using UUID primary key
archive_tags = Table(
    "archive_tags",
    Base.metadata,
    Column("item_uuid", String(36), ForeignKey("archive_items.uuid", ondelete="CASCADE"), primary_key=True),
    Column("tag_uuid", String(36), ForeignKey("tags.uuid", ondelete="CASCADE"), primary_key=True),
)

# Diary entries using UUID primary key
diary_tags = Table(
    "diary_tags",
    Base.metadata,
    Column("diary_entry_uuid", String(36), ForeignKey("diary_entries.uuid", ondelete="CASCADE"), primary_key=True),
    Column("tag_uuid", String(36), ForeignKey("tags.uuid", ondelete="CASCADE"), primary_key=True),
)

# Links using UUID primary key
link_tags = Table(
    "link_tags",
    Base.metadata,
    Column("link_uuid", String(36), ForeignKey("links.uuid", ondelete="CASCADE"), primary_key=True),
    Column("tag_uuid", String(36), ForeignKey("tags.uuid", ondelete="CASCADE"), primary_key=True),
) 