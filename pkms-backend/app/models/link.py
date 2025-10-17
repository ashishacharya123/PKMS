"""
Link Model for URL Bookmarks and Web Resources
"""

from uuid import uuid4
from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.models.base import Base
from app.config import nepal_now


class Link(Base):
    """Link model for storing web bookmarks and URLs"""
    
    __tablename__ = "links"
    
    uuid = Column(String(36), primary_key=True, nullable=False, default=lambda: str(uuid4()), index=True)
    title = Column(String(255), nullable=False, index=True)
    url = Column(String(2000), nullable=False)
    description = Column(Text, nullable=True)
    user_uuid = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
    is_favorite = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=nepal_now())
    
    # Soft Delete
    is_deleted = Column(Boolean, default=False, index=True)
    
    # Relationships
    user = relationship("User")
    tag_objs = relationship("Tag", secondary="link_tags", back_populates="links")
    
    def __repr__(self):
        return f"<Link(uuid={self.uuid}, title='{self.title}', url='{self.url[:50]}')>"