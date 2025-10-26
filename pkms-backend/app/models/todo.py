"""
Todo Model for Task Management
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Enum, Date, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from uuid import uuid4
import enum

from app.models.base import Base, SoftDeleteMixin
from app.config import nepal_now
from app.models.tag_associations import todo_tags, project_tags
from app.models.associations import todo_dependencies
from app.models.enums import TodoStatus, TodoType, TaskPriority


class Todo(Base, SoftDeleteMixin):
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
    
    # Phase 2: Time Tracking - calculated in frontend from dates
    # estimate_days: frontend calculates (due_date - start_date).days
    # actual_days: frontend calculates (completion_date - start_date).days
    
    # Existing fields
    is_archived = Column(Boolean, default=False, nullable=False)
    is_favorite = Column(Boolean, default=False, nullable=False)
    # REMOVED: is_project_exclusive and is_todo_exclusive - exclusivity now handled via project_items association table
    priority = Column(Enum(TaskPriority), default=TaskPriority.MEDIUM, nullable=False)
    start_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)
    
    # Audit trail
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    
    # is_deleted now provided by SoftDeleteMixin
    
    # Composite indexes for common query patterns
    __table_args__ = (
        Index('ix_todo_user_status_archived', 'created_by', 'status', 'is_archived'),
        Index('ix_todo_user_parent', 'created_by', 'parent_uuid'),
        Index('ix_todo_user_created_desc', 'created_by', 'created_at'),
        Index('ix_todo_user_due_date', 'created_by', 'due_date'),
        Index('ix_todo_user_priority', 'created_by', 'priority'),
        Index('ix_todo_user_favorite', 'created_by', 'is_favorite'),
    )
    
    
    # Progress Tracking
    completion_percentage = Column(Integer, default=0)  # Auto-calculated from subtasks or manual override
    
    
    
    # Relationships
    user = relationship("User", back_populates="todos")
    tag_objs = relationship("Tag", secondary=todo_tags, back_populates="todos")
    # REMOVED: projects relationship - now handled via polymorphic project_items table
    
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
    subtasks = relationship("Todo", backref="parent", remote_side=[uuid], cascade="all")
    
    def __repr__(self):
        return f"<Todo(uuid={self.uuid}, title='{self.title}', status='{self.status}')>" 