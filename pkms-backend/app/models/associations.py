"""
Many-to-Many Association Tables for Multi-Project Integration
"""

from sqlalchemy import Table, Column, Integer, String, ForeignKey
from app.models.base import Base

# Junction table for Note-Project many-to-many relationship
# Uses SET NULL on project deletion to preserve deleted project names
note_projects = Table(
    'note_projects', 
    Base.metadata,
    Column('note_id', Integer, ForeignKey('notes.id', ondelete='CASCADE'), primary_key=True),
    Column('project_id', Integer, ForeignKey('projects.id', ondelete='SET NULL'), nullable=True),
    Column('project_name_snapshot', String(255), nullable=True)
)

# Junction table for Document-Project many-to-many relationship
document_projects = Table(
    'document_projects', 
    Base.metadata,
    Column('document_id', Integer, ForeignKey('documents.id', ondelete='CASCADE'), primary_key=True),
    Column('project_id', Integer, ForeignKey('projects.id', ondelete='SET NULL'), nullable=True),
    Column('project_name_snapshot', String(255), nullable=True)
)

# Junction table for Todo-Project many-to-many relationship
todo_projects = Table(
    'todo_projects', 
    Base.metadata,
    Column('todo_id', Integer, ForeignKey('todos.id', ondelete='CASCADE'), primary_key=True),
    Column('project_id', Integer, ForeignKey('projects.id', ondelete='SET NULL'), nullable=True),
    Column('project_name_snapshot', String(255), nullable=True)
)

