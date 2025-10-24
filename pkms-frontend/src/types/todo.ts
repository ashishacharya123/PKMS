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

export interface TodoCreate extends BaseCreateRequest {
  title: string;
  description?: string;
  status?: TodoStatus;
  priority?: TaskPriority;
  type?: TodoType;
  startDate?: string;
  dueDate?: string;
  projectIds?: string[];
  tags?: string[];
  subtasks?: ChecklistItem[];
  blockingTodos?: string[];
  blockedByTodos?: string[];
}

export interface TodoUpdate extends BaseUpdateRequest {
  title?: string;
  description?: string;
  status?: TodoStatus;
  priority?: TaskPriority;
  type?: TodoType;
  startDate?: string;
  dueDate?: string;
  projectIds?: string[];
  tags?: string[];
  subtasks?: ChecklistItem[];
  blockingTodos?: string[];
  blockedByTodos?: string[];
}

export interface Todo extends BaseEntity {
  title: string;
  description?: string;
  status: TodoStatus;
  priority: TaskPriority;
  isArchived: boolean;
  isFavorite: boolean;
  orderIndex: number;
  parentUuid?: string;
  subtasks: Todo[];
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  projects: ProjectBadge[];
  
  // Dependency management fields
  blockingTodos?: BlockingTodoSummary[];
  blockedByTodos?: BlockingTodoSummary[];
  blockerCount: number;
  
  // Single project fields (for backward compatibility)
  projectUuid?: string;
  projectName?: string;
}

export interface TodoSummary extends BaseSummary {
  status: TodoStatus;
  priority: TaskPriority;
  isArchived: boolean;
  isFavorite: boolean;
  orderIndex: number;
  startDate?: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  projects: ProjectBadge[];
  projectUuid?: string;
  projectName?: string;
  parentUuid?: string;
  subtasks: Todo[];
  blockingTodos?: BlockingTodoSummary[];
  blockedByTodos?: BlockingTodoSummary[];
  blockerCount: number;
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
