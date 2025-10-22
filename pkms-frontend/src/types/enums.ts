/**
 * TypeScript Enums matching backend app/models/enums.py exactly
 * Ensures type safety and prevents typos in status/priority comparisons
 * 
 * ARCHITECTURAL_RULES.md Rule #6 (Enum Usage - Type Safety)
 * Rule #10 (Centralized Enum Definitions)
 */

export enum ModuleType {
  NOTES = "notes",
  DOCUMENTS = "documents",
  TODOS = "todos",
  PROJECTS = "projects",
  DIARY = "diary",
  ARCHIVE_ITEMS = "archive_items",
  ARCHIVE_FOLDERS = "archive_folders",
  GENERAL = "general"
}

export enum ProjectStatus {
  IS_RUNNING = "is_running",
  ON_HOLD = "on_hold",
  COMPLETED = "completed",
  CANCELLED = "cancelled"
}

export enum TodoStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  BLOCKED = "blocked",
  DONE = "done",
  CANCELLED = "cancelled"
}

export enum TodoType {
  TASK = "task",
  CHECKLIST = "checklist",
  SUBTASK = "subtask"
}

export enum TaskPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  URGENT = "urgent"
}

export enum UploadStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed"
}

export enum ChunkUploadStatus {
  UPLOADING = "uploading",
  ASSEMBLING = "assembling",
  COMPLETED = "completed",
  FAILED = "failed",
  ERROR = "error"
}

export enum TodoStatsKey {
  // Status-based counts (from TodoStatus enum)
  TOTAL = "total",
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  BLOCKED = "blocked",
  DONE = "done",
  
  // Time-based computed counts (calculated on the fly - active todos only)
  OVERDUE = "overdue",           // due_date < today AND status not DONE/CANCELLED
  DUE_TODAY = "due_today",       // due_date == today AND status not DONE/CANCELLED  
  COMPLETED_TODAY = "completed_today",  // completed_at == today (DONE status only)
  WITHIN_TIME = "within_time"   // due_date >= today AND status not DONE/CANCELLED
}

export enum ModuleStatsKey {
  TOTAL = "total",
  RECENT = "recent"
}
