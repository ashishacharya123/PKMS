from pydantic import Field
from typing import Dict, List, Optional, Any
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

class RecentActivityItem(CamelCaseModel):
    """Individual recent activity item"""
    id: str
    type: str  # 'project', 'todo', 'note', 'document', 'archive', 'diary'
    title: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_updated: bool = False  # True if updated recently, False if just created
    attachment_count: Optional[int] = None  # For notes and diary
    metadata: Optional[Dict[str, Any]] = None  # mood, weather, status, etc.

class RecentActivityTimeline(CamelCaseModel):
    """Unified recent activity timeline"""
    items: List[RecentActivityItem]
    total_count: int
    cutoff_days: int