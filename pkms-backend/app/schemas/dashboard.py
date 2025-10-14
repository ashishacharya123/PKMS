from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Dict
from datetime import datetime

class CamelCaseModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

class DashboardStats(CamelCaseModel):
    """Dashboard statistics model"""
    notes: Dict[str, int]
    documents: Dict[str, int] 
    todos: Dict[str, int]
    diary: Dict[str, int]
    archive: Dict[str, int]
    projects: Dict[str, int]  # Added: active projects count
    last_updated: datetime

class ModuleActivity(CamelCaseModel):
    """Recent activity across modules"""
    recent_notes: int
    recent_documents: int
    recent_todos: int
    recent_diary_entries: int
    recent_archive_items: int

class QuickStats(CamelCaseModel):
    """Quick overview statistics"""
    total_items: int
    active_projects: int
    overdue_todos: int
    current_diary_streak: int
    storage_used_mb: float