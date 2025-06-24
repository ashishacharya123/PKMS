"""
Tag Model for Cross-Module Content Organization
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class Tag(Base):
    """Tag model for organizing content across modules"""
    
    __tablename__ = "tags"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, index=True)
    color = Column(String(7), default="#757575")  # Hex color code
    module_type = Column(String(20), nullable=False, index=True)  # notes, documents, todos
    is_archived = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Relationships
    user = relationship("User", back_populates="tags")
    notes = relationship("Note", secondary="note_tags", back_populates="tags")
    documents = relationship("Document", secondary="document_tags", back_populates="tags")
    todos = relationship("Todo", secondary="todo_tags", back_populates="tags")
    
    def __repr__(self):
        return f"<Tag(id={self.id}, name='{self.name}', module_type='{self.module_type}')>" 