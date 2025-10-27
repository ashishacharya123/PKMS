from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.models.base import Base
from app.config import nepal_now

class AppConfig(Base):
    """Centralized configuration storage for app-wide settings."""
    __tablename__ = "app_config"
    __table_args__ = (
        Index('ix_app_config_user_name', 'created_by', 'config_name'),
        Index('ix_app_config_name', 'config_name'),
    )

    config_name = Column(String(100), primary_key=True)  # e.g., 'default_habits', 'defined_habits'
    created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), primary_key=True, index=True)
    config_json = Column(Text, nullable=False, default='[]')  # JSON array or object
    created_at = Column(DateTime(timezone=True), server_default=nepal_now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=nepal_now(), onupdate=nepal_now(), nullable=False)

    # Relationships
    user = relationship("User", foreign_keys=[created_by])
