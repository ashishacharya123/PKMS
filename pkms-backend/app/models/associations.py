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

# Junction table for Document-Project many-to-many relationship
document_projects = Table(
    'document_projects', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('document_uuid', String(36), ForeignKey('documents.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('project_uuid', String(36), ForeignKey('projects.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('sort_order', Integer, nullable=False, default=0),
    Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column('updated_at', DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False),
    UniqueConstraint('document_uuid', 'project_uuid', name='uq_document_projects_doc_project')  # Prevent duplicates
)
Index('ix_docproj_project_order', document_projects.c.project_uuid, document_projects.c.sort_order)

# Junction table for Document-Diary many-to-many relationship
document_diary = Table(
    'document_diary', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('document_uuid', String(36), ForeignKey('documents.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('diary_entry_uuid', String(36), ForeignKey('diary_entries.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('sort_order', Integer, nullable=False, default=0),
    Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column('updated_at', DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False),
    UniqueConstraint('document_uuid', 'diary_entry_uuid', name='uq_document_diary_doc_entry')  # Prevent duplicates
)
Index('ix_docdiary_entry_order', document_diary.c.diary_entry_uuid, document_diary.c.sort_order)

# Junction table for Todo-Project many-to-many relationship
todo_projects = Table(
    'todo_projects', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('todo_uuid', String(36), ForeignKey('todos.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('project_uuid', String(36), ForeignKey('projects.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('is_project_exclusive', Boolean, default=False),  # Per-association project exclusive flag
    Column('sort_order', Integer, nullable=False, default=0),
    Column('created_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column('updated_at', DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False),
    UniqueConstraint('todo_uuid', 'project_uuid', name='uq_todo_projects_todo_project')  # Prevent duplicates
)
Index('ix_todoproj_project_order', todo_projects.c.project_uuid, todo_projects.c.sort_order)

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

