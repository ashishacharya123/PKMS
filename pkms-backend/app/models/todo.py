"""
Todo Model for Task Management
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Enum, Date
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from uuid import uuid4
import enum

from app.models.base import Base
from app.config import nepal_now
from app.models.tag_associations import todo_tags, project_tags
from app.models.associations import todo_projects


class TodoStatus(str, enum.Enum):
    """Todo status enum for better task management"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"
    CANCELLED = "cancelled"


class Todo(Base):
    """Todo model for task management"""
    
    __tablename__ = "todos"
    
    id = Column(Integer, primary_key=True, index=True)  # Legacy counter (keeps counting lifetime entries)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)  # API identifier
    title = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(Enum(TodoStatus), default=TodoStatus.PENDING, nullable=False)
    order_index = Column(Integer, default=0, nullable=False)  # For Kanban ordering
    
    # Phase 2: Subtasks and Dependencies
    parent_id = Column(Integer, ForeignKey("todos.id", ondelete="CASCADE"), nullable=True)  # For subtasks
    blocked_by = Column(Text, nullable=True)  # JSON array of blocking todo IDs
    
    # Phase 2: Time Tracking
    estimate_minutes = Column(Integer, nullable=True)  # Estimated time in minutes
    actual_minutes = Column(Integer, nullable=True)  # Actual time spent in minutes
    
    # Existing fields
    is_completed = Column(Boolean, default=False, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    is_favorite = Column(Boolean, default=False, nullable=False)
    is_exclusive_mode = Column(Boolean, default=False, nullable=False)  # If True, todo is deleted when any of its projects are deleted
    priority = Column(Integer, default=2, nullable=False)  # 1=low, 2=medium, 3=high, 4=urgent
    start_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    
    # Foreign keys
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)  # Legacy single project support
    
    # FTS5 Search Support
    tags_text = Column(Text, nullable=True, default="")  # Denormalized tags for FTS5 search
    
    # Relationships
    user = relationship("User", back_populates="todos")
    project = relationship("Project", back_populates="todos")  # Legacy single project
    tag_objs = relationship("Tag", secondary=todo_tags, back_populates="todos")
    projects = relationship("Project", secondary=todo_projects, back_populates="todos_multi")
    
    # Phase 2: Subtask relationships
    subtasks = relationship("Todo", backref="parent", remote_side=[id], cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Todo(id={self.id}, uuid={self.uuid}, title='{self.title}', status='{self.status}')>"


class Project(Base):
    """Project model for organizing todos"""
    
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)  # Legacy counter (keeps counting lifetime entries)
    uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid4()), index=True)  # API identifier
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    color = Column(String(7), default="#3498db")  # Hex color code
    is_archived = Column(Boolean, default=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # FTS5 Search Support
    tags_text = Column(Text, nullable=True, default="")  # Denormalized tags for FTS5 search
    
    # Relationships
    user = relationship("User", back_populates="projects")
    todos = relationship("Todo", back_populates="project")  # Legacy single project (no delete-orphan to avoid conflicts with M2M)
    # Optional: documents associated with this project (images/files)
    documents = relationship("Document", back_populates="project")  # Legacy single project (no delete-orphan to avoid conflicts with M2M)
    tag_objs = relationship("Tag", secondary=project_tags, back_populates="projects")
    
    # Many-to-many relationships
    from app.models.associations import note_projects, document_projects, todo_projects
    notes = relationship("Note", secondary=note_projects, back_populates="projects")
    documents_multi = relationship("Document", secondary=document_projects, back_populates="projects")
    todos_multi = relationship("Todo", secondary=todo_projects, back_populates="projects")
    
    def __repr__(self):
        return f"<Project(id={self.id}, uuid={self.uuid}, name='{self.name}')>" 