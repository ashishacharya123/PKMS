"""
Todo and Project Models for Task Management
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Table, Boolean, Date
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base

# Junction table for todo-tag relationships
todo_tags = Table(
    'todo_tags',
    Base.metadata,
    Column('todo_id', Integer, ForeignKey('todos.id', ondelete='CASCADE'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id', ondelete='CASCADE'), primary_key=True)
)


class Project(Base):
    """Project model for organizing todos"""
    
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
    color = Column(String(7), default="#2196F3")  # Hex color code
    is_archived = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="projects")
    todos = relationship("Todo", back_populates="project", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Project(id={self.id}, name='{self.name}')>"


class Todo(Base):
    """Todo model for task management"""
    
    __tablename__ = "todos"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    due_date = Column(Date, nullable=True, index=True)
    priority = Column(Integer, default=1, index=True)  # 1=Low, 2=Medium, 3=High
    status = Column(String(20), default="pending", index=True)  # pending, completed, cancelled
    completed_at = Column(DateTime(timezone=True), nullable=True)
    is_recurring = Column(Boolean, default=False)
    recurrence_pattern = Column(String(100), nullable=True)  # JSON pattern for recurring tasks
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="todos")
    project = relationship("Project", back_populates="todos")
    tags = relationship("Tag", secondary=todo_tags, back_populates="todos")
    
    def __repr__(self):
        return f"<Todo(id={self.id}, title='{self.title}', status='{self.status}')>" 