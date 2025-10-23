/**
 * Todo TypeScript interfaces matching backend schemas exactly
 */

import { BaseEntity, BaseCreateRequest, BaseUpdateRequest, BaseSummary, ChecklistItem } from './common';
import { ProjectBadge } from './project';
import { TodoStatus, TaskPriority, TodoType } from './enums';

// NEW: Dependency management types
export interface BlockingTodoSummary {
  uuid: string;
  title: string;
  status: TodoStatus;
  priority: TaskPriority;
  isCompleted: boolean;
}

// Re-export enums for convenience
export { TodoStatus, TaskPriority, TodoType };

export interface Todo extends BaseEntity {
  title: string;
  description?: string;
  status: TodoStatus; // Enum type
  priority: TaskPriority; // Enum type
  type?: TodoType; // Renamed from todoType for consistency
  startDate: string | null;
  dueDate: string | null;
  orderIndex: number; // For drag-and-drop ordering
  completedAt: string | null;
  // Backend project relationship fields
  projectUuid?: string; // Single project reference (backend field)
  projectName?: string; // Single project name (backend field)
  projects: ProjectBadge[]; // Multiple projects (backend field)
  checklistItems?: ChecklistItem[];
  subtasks?: Todo[]; // For subtask support
  completionPercentage?: number; // For progress tracking
  isArchived?: boolean; // For archive support
  projectIds?: string[]; // For form handling
  // REMOVED: isExclusiveMode - exclusivity now handled via project_items association table
  
  // NEW: Dependency management fields
  blockingTodos?: BlockingTodoSummary[]; // Todos I'm blocking (others waiting on me)
  blockedByTodos?: BlockingTodoSummary[]; // Todos blocking me (I'm waiting on these)
  blockerCount?: number; // Number of incomplete todos blocking this one
  
  // NO estimateMinutes (backend removed)
  // Calculate days: dueDate - startDate
}

export interface TodoSummary extends BaseSummary {
  status: TodoStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  projects: ProjectBadge[];
  daysUntilDue?: number;
}

export interface CreateTodoRequest extends BaseCreateRequest {
  title: string;
  description?: string;
  projectIds?: string[]; // Multi-project support (UUIDs)
  // REMOVED: isProjectExclusive - exclusivity now handled via project_items association table
  parentId?: number; // For creating subtasks
  startDate?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  status?: TodoStatus; // Allow setting initial status
  orderIndex?: number; // Allow setting initial order
  todoType?: TodoType;
  checklistItems?: ChecklistItem[];
  isArchived?: boolean;
  
  // NEW: Set dependencies on creation
  blockedByUuids?: string[]; // UUIDs of todos that must complete before this one
}

export interface UpdateTodoRequest extends BaseUpdateRequest {
  title?: string;
  description?: string;
  projectIds?: string[]; // Multi-project support (UUIDs)
  // REMOVED: isProjectExclusive - exclusivity now handled via project_items association table
  parentId?: number; // For moving subtasks
  startDate?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  status?: TodoStatus;
  orderIndex?: number; // Allow updating order
  todoType?: TodoType;
  checklistItems?: ChecklistItem[];
  isArchived?: boolean;
  isFavorite?: boolean;
  
  // NEW: Modify dependencies
  addBlockerUuids?: string[]; // UUIDs of todos to add as blockers
  removeBlockerUuids?: string[]; // UUIDs of blocking todos to remove
}

export interface TodoStats {
  total: number;
  pending: number;
  inProgress: number;
  blocked: number;
  done: number;
  overdue: number;
  dueToday: number;
  completedToday: number;
  withinTime: number;
}

export interface TodoListParams {
  status?: TodoStatus;
  priority?: TaskPriority;
  projectId?: string;
  projectIds?: string[];
  isArchived?: boolean;
  isFavorite?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}
