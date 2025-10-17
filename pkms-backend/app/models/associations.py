"""
Many-to-Many Association Tables for Multi-Project Integration
"""

from sqlalchemy import Table, Column, Integer, String, ForeignKey, UniqueConstraint, DateTime, func
from app.models.base import Base

# Junction table for Note-Project many-to-many relationship
# Uses UUID foreign keys for consistency
# SET NULL on project deletion to preserve deleted project names
note_projects = Table(
    'note_projects', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('note_uuid', String(36), ForeignKey('notes.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('project_uuid', String(36), ForeignKey('projects.uuid', ondelete='SET NULL'), nullable=True, index=True),
    Column('project_name_snapshot', String(255), nullable=True),
    UniqueConstraint('note_uuid', 'project_uuid', name='uq_note_projects_note_project')  # Prevent duplicates
)

# Junction table for Document-Project many-to-many relationship
document_projects = Table(
    'document_projects', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('document_uuid', String(36), ForeignKey('documents.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('project_uuid', String(36), ForeignKey('projects.uuid', ondelete='SET NULL'), nullable=True, index=True),
    Column('project_name_snapshot', String(255), nullable=True),
    UniqueConstraint('document_uuid', 'project_uuid', name='uq_document_projects_doc_project')  # Prevent duplicates
)

# Junction table for Todo-Project many-to-many relationship
todo_projects = Table(
    'todo_projects', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('todo_uuid', String(36), ForeignKey('todos.uuid', ondelete='CASCADE'), nullable=False, index=True),
    Column('project_uuid', String(36), ForeignKey('projects.uuid', ondelete='SET NULL'), nullable=True, index=True),
    Column('is_exclusive', Boolean, default=False),  # Per-association exclusive flag
    Column('project_name_snapshot', String(255), nullable=True),
    UniqueConstraint('todo_uuid', 'project_uuid', name='uq_todo_projects_todo_project')  # Prevent duplicates
)

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

