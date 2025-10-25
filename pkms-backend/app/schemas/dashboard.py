from pydantic import Field
from typing import Dict
from datetime import datetime
from app.models.enums import TodoStatsKey, ModuleStatsKey
from .base import CamelCaseModel

class DashboardStats(CamelCaseModel):
    """Dashboard statistics model"""
    notes: Dict[ModuleStatsKey, int]
    documents: Dict[ModuleStatsKey, int] 
    todos: Dict[str, int]  # Mixed: status enums + computed string keys
    diary: Dict[ModuleStatsKey, int]
    archive: Dict[ModuleStatsKey, int]
    projects: Dict[ModuleStatsKey, int] = Field(default_factory=dict)  # Added: active projects count
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
    storage_by_module: Dict[str, float] = Field(default_factory=dict)