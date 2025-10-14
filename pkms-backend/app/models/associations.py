"""
Many-to-Many Association Tables for Multi-Project Integration
"""

from sqlalchemy import Table, Column, Integer, String, ForeignKey, UniqueConstraint
from app.models.base import Base

# Junction table for Note-Project many-to-many relationship
# Uses surrogate PK + unique constraint for proper many-to-many
# SET NULL on project deletion to preserve deleted project names
note_projects = Table(
    'note_projects', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('note_id', Integer, ForeignKey('notes.id', ondelete='CASCADE'), nullable=False, index=True),
    Column('project_id', Integer, ForeignKey('projects.id', ondelete='SET NULL'), nullable=True, index=True),
    Column('project_name_snapshot', String(255), nullable=True),
    UniqueConstraint('note_id', 'project_id', name='uq_note_projects_note_project')  # Prevent duplicates
)

# Junction table for Document-Project many-to-many relationship
document_projects = Table(
    'document_projects', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('document_id', Integer, ForeignKey('documents.id', ondelete='CASCADE'), nullable=False, index=True),
    Column('project_id', Integer, ForeignKey('projects.id', ondelete='SET NULL'), nullable=True, index=True),
    Column('project_name_snapshot', String(255), nullable=True),
    UniqueConstraint('document_id', 'project_id', name='uq_document_projects_doc_project')  # Prevent duplicates
)

# Junction table for Todo-Project many-to-many relationship
todo_projects = Table(
    'todo_projects', 
    Base.metadata,
    Column('id', Integer, primary_key=True, autoincrement=True),  # Surrogate PK
    Column('todo_id', Integer, ForeignKey('todos.id', ondelete='CASCADE'), nullable=False, index=True),
    Column('project_id', Integer, ForeignKey('projects.id', ondelete='SET NULL'), nullable=True, index=True),
    Column('project_name_snapshot', String(255), nullable=True),
    UniqueConstraint('todo_id', 'project_id', name='uq_todo_projects_todo_project')  # Prevent duplicates
)

