"""
Shared Enums for PKMS Models
"""
import enum

class ModuleType(str, enum.Enum):
    """Enum for different module types in the application."""
    NOTES = "notes"
    DOCUMENTS = "documents"
    TODOS = "todos"
    PROJECTS = "projects"
    DIARY = "diary"
    ARCHIVE_ITEMS = "archive_items"
    ARCHIVE_FOLDERS = "archive_folders"
    GENERAL = "general"

class ProjectStatus(str, enum.Enum):
    """Project status enum"""
    IS_RUNNING = "is_running"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class TodoStatus(str, enum.Enum):
    """Todo status enum for better task management"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"
    CANCELLED = "cancelled"

class TodoType(str, enum.Enum):
    """Todo type enum for different kinds of tasks"""
    TASK = "task"
    CHECKLIST = "checklist"
    SUBTASK = "subtask"

class TaskPriority(str, enum.Enum):
    """Priority levels for tasks, todos, and projects"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

class UploadStatus(str, enum.Enum):
    """Document upload status enum"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class ChunkUploadStatus(str, enum.Enum):
    """Chunked file upload status enum"""
    UPLOADING = "uploading"
    ASSEMBLING = "assembling"
    COMPLETED = "completed"
    FAILED = "failed"
    ERROR = "error"

class TodoStatsKey(str, enum.Enum):
    """Todo statistics keys for dashboard"""
    # Status-based counts (from TodoStatus enum)
    TOTAL = "total"
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"
    
    # Time-based computed counts (calculated on the fly - active todos only)
    OVERDUE = "overdue"           # due_date < today AND status not DONE/CANCELLED
    DUE_TODAY = "due_today"       # due_date == today AND status not DONE/CANCELLED  
    COMPLETED_TODAY = "completed_today"  # completed_at == today (DONE status only)
    WITHIN_TIME = "within_time"   # due_date >= today AND status not DONE/CANCELLED

class ModuleStatsKey(str, enum.Enum):
    """Module statistics keys for dashboard"""
    TOTAL = "total"
    RECENT = "recent"