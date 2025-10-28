"""
SQLAlchemy Base class for all models
"""

from sqlalchemy import Column, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.declarative import declared_attr

# Base class for all models
Base = declarative_base()


class SoftDeleteMixin:
    """Mixin for soft-deletable models"""
    
    @declared_attr
    def is_deleted(cls):
        return Column(Boolean, default=False, nullable=False, index=True)
    
    @classmethod
    def active_only(cls):
        """Query scope to exclude soft-deleted items"""
        return ~cls.is_deleted
    
    @classmethod
    def deleted_only(cls):
        """Query scope for recycle bin"""
        return cls.is_deleted
    
    @classmethod
    def include_deleted(cls):
        """Query scope to include all items (for admin views)"""
        return True  # No filter 