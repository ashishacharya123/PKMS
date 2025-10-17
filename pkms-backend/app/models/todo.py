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
from app.models.associations import todo_projects, todo_dependencies


class TodoStatus(str, enum.Enum):
    """Todo status enum for better task management"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"
    CANCELLED = "cancelled"


class TodoType(str, enum.Enum):
    """Todo type enum for different kinds of tasks"""
    TASK = "task"  # Regular task
    CHECKLIST = "checklist"  # Task with checkboxes
    SUBTASK = "subtask"  # Subtask of another todo


class Todo(Base):
    """Todo model for task management"""
    
    __tablename__ = "todos"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)  # Primary key
    
    title = Column(String(255), nullable=False)
    description = Column(Text)
    status = Column(Enum(TodoStatus), default=TodoStatus.PENDING, nullable=False)
    todo_type = Column(Enum(TodoType), default=TodoType.TASK, nullable=False)  # task, checklist, subtask
    order_index = Column(Integer, default=0, nullable=False)  # For Kanban ordering
    
    # Checklist functionality (for todo_type = 'checklist')
    checklist_items = Column(Text, nullable=True)  # JSON array of {text, completed, order}
    
    # Phase 2: Subtasks and Dependencies
    parent_uuid = Column(String(36), ForeignKey("todos.uuid", ondelete="CASCADE"), nullable=True)  # For subtasks
    # blocked_by removed - replaced with todo_dependencies junction table
    
    # Phase 2: Time Tracking
    estimate_minutes = Column(Integer, nullable=True)  # Estimated time in minutes
    actual_minutes = Column(Integer, nullable=True)  # Actual time spent in minutes
    
    # Existing fields
    is_archived = Column(Boolean, default=False, nullable=False)
    is_favorite = Column(Boolean, default=False, nullable=False)
    is_exclusive_mode = Column(Boolean, default=False, nullable=False)  # If True, todo is deleted when any of its projects are deleted
    priority = Column(Integer, default=2, nullable=False)  # 1=low, 2=medium, 3=high, 4=urgent
    start_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Foreign keys
    user_uuid = Column(String(36), ForeignKey("users.uuid"), nullable=False)
    
    # Audit trail
    created_by = Column(String(36), ForeignKey("users.uuid"), nullable=False)
    
    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    
    # Progress Tracking
    completion_percentage = Column(Integer, default=0)  # 0-100 percentage complete
    
    
    
    # Relationships
    user = relationship("User", back_populates="todos")
    tag_objs = relationship("Tag", secondary=todo_tags, back_populates="todos")
    projects = relationship("Project", secondary=todo_projects, back_populates="todos_multi")
    
    # Phase 2: Dependency relationships (replaces blocked_by JSON field)
    blocking_todos = relationship(
        "Todo",
        secondary=todo_dependencies,
        primaryjoin="Todo.uuid == todo_dependencies.c.blocked_todo_uuid",
        secondaryjoin="Todo.uuid == todo_dependencies.c.blocking_todo_uuid",
        back_populates="blocked_todos"
    )
    blocked_todos = relationship(
        "Todo", 
        secondary=todo_dependencies,
        primaryjoin="Todo.uuid == todo_dependencies.c.blocking_todo_uuid",
        secondaryjoin="Todo.uuid == todo_dependencies.c.blocked_todo_uuid",
        back_populates="blocking_todos"
    )
    
    
    # Phase 2: Subtask relationships
    subtasks = relationship("Todo", backref="parent", remote_side=[uuid], cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Todo(uuid={self.uuid}, title='{self.title}', status='{self.status}')>"


class Project(Base):
    """Project model for organizing todos"""
    
    __tablename__ = "projects"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)  # Primary key
    
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    color = Column(String(7), default="#3498db")  # Hex color code
    is_archived = Column(Boolean, default=False, index=True)
    user_uuid = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now())
    
    # Project Lifecycle
    status = Column(String(20), default='active', index=True)  # active, on_hold, completed, cancelled
    start_date = Column(Date, nullable=True)  # Project timeline
    end_date = Column(Date, nullable=True)  # Project timeline
    progress_percentage = Column(Integer, default=0)  # 0-100 percentage complete
    
    # UI/UX
    icon = Column(String(50), nullable=True)
    sort_order = Column(Integer, default=0)
    is_favorite = Column(Boolean, default=False, index=True)
    
    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    
    
    # Relationships
    user = relationship("User", back_populates="projects")
    tag_objs = relationship("Tag", secondary=project_tags, back_populates="projects")
    
    # Many-to-many relationships
    from app.models.associations import note_projects, document_projects, todo_projects
    notes = relationship("Note", secondary=note_projects, back_populates="projects")
    documents_multi = relationship("Document", secondary=document_projects, back_populates="projects")
    todos_multi = relationship("Todo", secondary=todo_projects, back_populates="projects")
    
    def __repr__(self):
        return f"<Project(uuid={self.uuid}, name='{self.name}')>" 