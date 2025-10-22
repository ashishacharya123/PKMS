/**
 * Common TypeScript interfaces shared across all modules
 * Single source of truth matching backend schemas exactly
 */

// Enums imported for type references in interfaces
// import { TaskPriority, ProjectStatus, TodoStatus } from './enums';

// ProjectBadge moved to project.ts to avoid circular dependencies

export interface BaseEntity {
  uuid: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  isFavorite: boolean;
  isDeleted: boolean;
}

export interface ChecklistItem {
  text: string;
  completed: boolean;
  order: number;
}

// Common form interfaces
export interface BaseCreateRequest {
  title?: string;
  description?: string;
  tags?: string[];
  isFavorite?: boolean;
}

export interface BaseUpdateRequest {
  title?: string;
  description?: string;
  tags?: string[];
  isFavorite?: boolean;
  isDeleted?: boolean;
}

// Common response interfaces
export interface BaseSummary {
  uuid: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  isFavorite: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
