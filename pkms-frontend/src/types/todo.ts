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
  projectUuids?: string[]; // List of project UUIDs to link this todo to (max 10)
  areProjectsExclusive?: boolean; // Apply exclusive flag to all project associations
  blockedByUuids?: string[]; // UUIDs of todos that must complete before this one
  startDate?: string; // Date object from backend
  dueDate?: string; // Date object from backend
  priority?: TaskPriority;
  tags?: string[]; // Max 20 items
}

export interface UpdateTodoRequest extends BaseUpdateRequest {
  title?: string;
  description?: string;
  status?: TodoStatus;
  orderIndex?: number;
  projectUuids?: string[]; // List of project UUIDs to link this todo to (max 10)
  areProjectsExclusive?: boolean; // Apply exclusive flag to all project associations
  addBlockerUuids?: string[]; // UUIDs of todos to add as blockers
  removeBlockerUuids?: string[]; // UUIDs of blocking todos to remove
  startDate?: string; // Date object from backend
  dueDate?: string; // Date object from backend
  priority?: TaskPriority;
  tags?: string[]; // Max 20 items
  isArchived?: boolean;
  isFavorite?: boolean;
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
