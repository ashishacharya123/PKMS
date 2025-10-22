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

export interface Project extends BaseEntity {
  name: string;
  description?: string;
  status: ProjectStatus; // Enum type
  priority: TaskPriority; // Enum type
  dueDate: string | null;  // NEW - Professional project management
  completionDate: string | null;  // NEW - When project was actually completed
  progressPercentage: number;
  todoCount: number;
  completedCount: number;
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
