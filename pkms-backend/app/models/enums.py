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