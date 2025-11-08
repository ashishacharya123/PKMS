/**
 * Project TypeScript interfaces matching backend schemas exactly
 */

import { BaseEntity, BaseCreateRequest, BaseUpdateRequest, BaseSummary } from './common';
import { ProjectStatus, TaskPriority } from './enums';

// Re-export enums for convenience
export { ProjectStatus, TaskPriority };

export interface ProjectBadge {
  uuid: string | null;  // null if project is deleted
  name: string;
  // NO color field (removed in backend)
  isProjectExclusive: boolean;
  isDeleted: boolean;  // True if project was deleted (using snapshot name)
}

export interface ProjectCreate extends BaseCreateRequest {
  name: string;
  description?: string;
  sortOrder?: number; // sort_order in backend
  status?: ProjectStatus;
  priority?: TaskPriority;
  isArchived?: boolean;
  isFavorite?: boolean;
  progressPercentage?: number; // 0-100
  startDate?: string;
  dueDate?: string;
  tags?: string[]; // Max 20 items
}

export interface ProjectUpdate extends BaseUpdateRequest {
  name?: string;
  description?: string;
  sortOrder?: number; // sort_order in backend
  status?: ProjectStatus;
  priority?: TaskPriority;
  isArchived?: boolean;
  isFavorite?: boolean;
  progressPercentage?: number; // 0-100
  startDate?: string;
  dueDate?: string;
  completionDate?: string; // When project was actually completed
  tags?: string[]; // Max 20 items
}

export interface Project extends BaseEntity {
  name: string;
  description?: string;
  status: ProjectStatus; // Enum type
  priority: TaskPriority; // Enum type
  sortOrder: number; // sort_order in backend
  isArchived: boolean;
  isFavorite: boolean;
  isDeleted: boolean;
  progressPercentage: number; // 0-100
  startDate?: string;
  dueDate?: string; // Professional project management
  completionDate?: string; // When project was actually completed
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  // Computed fields from backend
  todoCount: number; // todo_count in backend
  completedCount: number; // completed_count in backend
  documentCount: number; // document_count in backend
  noteCount: number; // note_count in backend
  tagCount: number; // tag_count in backend
  actualProgress: number; // actual_progress in backend
  daysRemaining?: number; // days_remaining in backend

  // Relationships
  tags: string[];

  // NO color, NO icon (removed in backend)
}

export interface ProjectSummary extends BaseSummary {
  name: string;
  description?: string;
  status: ProjectStatus;
  priority: TaskPriority;
  dueDate: string | null;
  progressPercentage: number;
  todoCount: number;
  completedCount: number;
  // Backend fields missing from frontend
  sortOrder: number;
  startDate?: string;
  documentCount: number;
  noteCount: number;
  tagCount: number;
  isArchived: boolean;
  isFavorite: boolean;
  isDeleted: boolean;
}

export interface ProjectBadgeResponse {
  uuid: string | null;
  name: string;
  isProjectExclusive: boolean;
  isDeleted: boolean;
}

export interface CreateProjectRequest extends BaseCreateRequest {
  name: string;
  description?: string;
  status?: ProjectStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  progressPercentage?: number;
  isArchived?: boolean;
  isFavorite?: boolean;
}

export interface UpdateProjectRequest extends BaseUpdateRequest {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  completionDate?: string | null;
  progressPercentage?: number;
  isArchived?: boolean;
  isFavorite?: boolean;
}

export interface ProjectDuplicateRequest {
  name: string;
  description?: string;
  duplicateTodos?: boolean;
  duplicateDocuments?: boolean;
  duplicateNotes?: boolean;
}

export interface ProjectDuplicateResponse {
  originalProject: Project;
  duplicatedProject: Project;
  duplicatedItems: {
    todos: number;
    documents: number;
    notes: number;
  };
}

// Document reordering interfaces
export interface ProjectDocumentsReorderRequest {
  documentUuids: string[];
}

export interface ProjectDocumentsLinkRequest {
  documentUuids: string[];
}

export interface ProjectDocumentUnlinkRequest {
  documentUuids: string[];
}

// Section reordering interfaces
export interface ProjectSectionReorderRequest {
  sectionNames: string[];
}

// Delete preflight interfaces
export interface DocumentDeletePreflightResponse {
  canDelete: boolean;
  reason?: string;
  affectedProjects: string[];
}

export interface NoteDeletePreflightResponse {
  canDelete: boolean;
  reason?: string;
  affectedProjects: string[];
}

export interface TodoDeletePreflightResponse {
  canDelete: boolean;
  reason?: string;
  affectedProjects: string[];
}

export interface UnifiedDeletePreflightResponse {
  canDelete: boolean;
  reason?: string;
  affectedProjects: string[];
  itemType: 'document' | 'note' | 'todo';
}
