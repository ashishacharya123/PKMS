"""
Many-to-Many Association Tables for Multi-Project Integration
"""

from sqlalchemy import Table, Column, Integer, String, ForeignKey, UniqueConstraint, DateTime, Boolean, func, Index
from app.models.base import Base

# Junction table for Note-Project many-to-many relationship
# Uses UUID foreign keys for consistency
# SET NULL on project deletion to preserve deleted project names
note_projects = Table(
    'note_projects', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('note_uuid', String(36), ForeignKey('notes.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('project_uuid', String(36), ForeignKey('projects.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('sort_order', Integer, nullable=False, default=0),
    Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column('updated_at', DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False),
    UniqueConstraint('note_uuid', 'project_uuid', name='uq_note_projects_note_project')  # Prevent duplicates
)
Index('ix_noteproj_project_order', note_projects.c.project_uuid, note_projects.c.sort_order)

# Junction table for Note-Document many-to-many relationship
note_documents = Table(
    'note_documents', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('note_uuid', String(36), ForeignKey('notes.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('document_uuid', String(36), ForeignKey('documents.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('sort_order', Integer, nullable=False, default=0),
    Column('is_exclusive', Boolean, nullable=False, default=False),  # Exclusivity on the link
    Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column('updated_at', DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False),
    UniqueConstraint('note_uuid', 'document_uuid', name='uq_note_documents_note_doc')  # Prevent duplicates
)
Index('ix_notedoc_note_order', note_documents.c.note_uuid, note_documents.c.sort_order)

# REMOVED: document_projects table - replaced with polymorphic project_items table

# Junction table for Document-Diary many-to-many relationship
document_diary = Table(
    'document_diary', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('document_uuid', String(36), ForeignKey('documents.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('diary_entry_uuid', String(36), ForeignKey('diary_entries.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('sort_order', Integer, nullable=False, default=0),
    Column('is_exclusive', Boolean, nullable=False, default=True),  # Diary files always exclusive (encrypted, private)
    Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column('updated_at', DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False),
    UniqueConstraint('document_uuid', 'diary_entry_uuid', name='uq_document_diary_doc_entry')  # Prevent duplicates
)
Index('ix_docdiary_entry_order', document_diary.c.diary_entry_uuid, document_diary.c.sort_order)

# REMOVED: todo_projects table - migrated to polymorphic project_items table
# See migration: remove_todo_projects_migrate_to_project_items.py
# All todo-project associations now use project_items with item_type='Todo'

# Junction table for Todo Dependencies (replaces blocked_by JSON field)
# Represents: blocked_todo depends on blocking_todo (blocking_todo blocks blocked_todo)
todo_dependencies = Table(
    'todo_dependencies',
    Base.metadata,
    Column('blocked_todo_uuid', String(36), ForeignKey('todos.uuid', ondelete='CASCADE'), primary_key=True),
    Column('blocking_todo_uuid', String(36), ForeignKey('todos.uuid', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=func.now()),
    Column('dependency_type', String(20), default='blocks')  # blocks, depends_on, related_to
)

# Polymorphic Project Items table
# Links Notes, Documents, and Todos to Projects with exclusivity
project_items = Table(
    'project_items',
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('project_uuid', String(36), ForeignKey('projects.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('item_type', String(20), nullable=False, index=True),  # 'Note', 'Document', 'Todo'
    Column('item_uuid', String(36), nullable=False, index=True),  # UUID of the item (no FK due to polymorphism)
    Column('sort_order', Integer, nullable=False, default=0),
    Column('is_exclusive', Boolean, nullable=False, default=False),  # Exclusivity on the link
    Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column('updated_at', DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False),
    UniqueConstraint('project_uuid', 'item_type', 'item_uuid', name='uq_project_items_project_type_uuid')  # Prevent duplicates
)
Index('ix_projitems_project_order', project_items.c.project_uuid, project_items.c.sort_order)
Index('ix_projitems_type_uuid', project_items.c.item_type, project_items.c.item_uuid)

