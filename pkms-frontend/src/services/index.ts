/**
 * Services Index - Clean exports for all PKMS services
 *
 * Provides centralized access to all service instances with proper TypeScript types
 * Follows Single Responsibility Principle with clean separation of concerns
 */

// Core base services
export { BaseService } from './BaseService';
export { BaseCRUDService } from './BaseCRUDService';

// Primary service instances - extend BaseService for optimal caching
export { notesService } from './notesService';
export { diaryService } from './diaryService';
export { documentsService } from './documentsService';
export { todosService } from './todosService';
export { projectsService } from './projectsService';
export { archiveService } from './archiveService';
export { tagsService } from './tagsService';
export { dashboardService } from './dashboardService';

// Legacy unified services (maintained for compatibility)
export { unifiedFileService } from './unifiedFileService';
export { unifiedCacheService } from './unifiedCacheService';

// Specialized services
export { backupService } from './backupService';
export { templateService } from './templateService';
export { default as deletionImpactService } from './deletionImpactService';

// Type exports for TypeScript usage
export type {
  // Document types
  Document,
  DocumentCreateRequest,
  DocumentUpdateRequest,
  DocumentSearchRequest
} from './documentsService';

export type {
  // Project types
  Project,
  ProjectCreateRequest,
  ProjectUpdateRequest,
  ProjectDocumentReorderRequest,
  ProjectDocumentLinkRequest,
  ProjectDocumentUnlinkRequest,
  ProjectSectionReorderRequest,
  ProjectStatistics
} from './projectsService';

// DeletionImpact type from centralized types
export type { DeletionImpactResponse } from '../types/project';
export type { DeletionImpact, ItemType, DeletionMode } from './deletionImpactService';

export type {
  // Todo types
  Todo,
  TodoCreateRequest,
  TodoUpdateRequest,
  TodoStatistics,
  TodoSummary,
  TodoStats,
  TodoListParams,
  ChecklistItem
} from './todosService';

export type {
  // Archive types
  ArchiveFolder,
  FolderTree,
  FolderCreate,
  ArchiveFolderSearchRequest
} from './archiveService';

export type {
  // Dashboard types
  DashboardStats,
  QuickStats,
  RecentActivityItem,
  RecentActivityTimeline
} from './dashboardService';

export type {
  // Backup types
  BackupFile,
  BackupListResponse,
  BackupCreateResponse,
  BackupRestoreResponse,
  BackupDeleteResponse,
  BackupInfoResponse
} from './backupService';

export type {
  // Template types
  TemplateItem
} from './templateService';

// Re-export commonly used utility types from shared services
export type {
  UploadProgress
} from './shared/coreUploadService';

export type {
  DownloadProgress
} from './shared/coreDownloadService';

/**
 * Service Registry - Provides access to all service instances
 * Useful for dependency injection and testing scenarios
 */
export const services = {
  notes: notesService,
  diary: diaryService,
  documents: documentsService,
  todos: todosService,
  projects: projectsService,
  archive: archiveService,
  tags: tagsService,
  dashboard: dashboardService,
  backup: backupService,
  template: templateService,
  deletionImpact: deletionImpactService,
  unified: {
    file: unifiedFileService,
    cache: unifiedCacheService
  }
} as const;

/**
 * Service type helper - Extract service instance type from registry
 */
export type ServiceName = keyof typeof services;
export type ServiceInstance = typeof services[ServiceName];

/**
 * Default export - All services for convenience
 */
export default {
  ...services,
  BaseService,
  BaseCRUDService,
  backupService,
  templateService
};