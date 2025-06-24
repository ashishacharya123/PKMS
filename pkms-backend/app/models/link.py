"""
Link Model for Cross-Module References
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class Link(Base):
    """Link model for cross-module references"""
    
    __tablename__ = "links"
    
    id = Column(Integer, primary_key=True, index=True)
    from_type = Column(String(20), nullable=False, index=True)  # note, document, todo
    from_id = Column(String(36), nullable=False, index=True)  # ID of source item
    to_type = Column(String(20), nullable=False, index=True)  # note, document, todo
    to_id = Column(String(36), nullable=False, index=True)  # ID of target item
    link_type = Column(String(20), default="reference", index=True)  # reference, attachment, related
    description = Column(Text, nullable=True)  # Optional description of the link
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Relationships for bidirectional linking (no direct relationships - use programmatic lookup)
    
    def __repr__(self):
        return f"<Link(id={self.id}, {self.from_type}:{self.from_id} -> {self.to_type}:{self.to_id})>" 