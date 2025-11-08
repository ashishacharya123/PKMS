/**
 * Projects Service - Project operations and document management
 *
 * Handles project CRUD, document linking/unlinking, and project lifecycle
 * Extends BaseService for consistent caching and error handling
 * Follows architectural rules with proper naming and UX patterns
 */

import { BaseService } from './BaseService';
import { projectsCache } from './unifiedCacheService';
import { apiService } from './api';
import { documentsService } from './documentsService';
import { notifications } from '@mantine/notifications';
import type { DeletionImpact } from './deletionImpactService';
import deletionImpactService from './deletionImpactService';
import { logger } from '../utils/logger';

// Project interfaces following architectural rules
export interface Project {
  uuid: string;
  name: string;
  description?: string;
  status: string; // Use enum values per architectural rules
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  isDeleted: boolean;
  documentCount: number;
  lastActivityAt?: string;
}

export interface ProjectCreateRequest {
  name: string;
  description?: string;
  status?: string;
}

export interface ProjectUpdateRequest {
  name?: string;
  description?: string;
  status?: string;
}

export interface ProjectDocumentReorderRequest {
  documentUuids: string[];
}

export interface ProjectDocumentLinkRequest {
  documentUuids: string[];
  areItemsExclusive?: boolean;
}

export interface ProjectDocumentUnlinkRequest {
  documentUuid: string;
}

export interface ProjectSectionReorderRequest {
  sectionTypes: string[];
}


export interface ProjectStatistics {
  totalProjects: number;
  activeProjects: number;
  totalDocuments: number;
  recentActivity: number;
}

/**
 * ProjectsService - Professional project management
 * Provides excellent UX with confirmations, progress tracking, and error handling
 */
export class ProjectsService extends CacheAwareBaseService {
  private readonly baseUrl = '/projects';

  constructor() {
    super(projectsCache);
  }

  /**
   * Get project by UUID
   * Follows architectural rule: Use UUID as primary key
   */
  async getProject(projectUuid: string): Promise<Project> {
    return this.getCachedData(
      `project:${projectUuid}`,
      () => this.apiGet<Project>(`${this.baseUrl}/${projectUuid}`),
      {} as Project,
      { ttl: 300000, tags: ['project'] }
    );
  }

  /**
   * List projects with optional filtering
   * Returns array with consistent type safety
   */
  async listProjects(includeDeleted: boolean = false): Promise<Project[]> {
    const cacheKey = `projects:list:${includeDeleted}`;

    return this.getCachedData(
      cacheKey,
      () => this.apiGet<Project[]>(this.baseUrl, {
        params: { include_deleted: includeDeleted }
      }),
      [] as Project[],
      { ttl: 180000, tags: ['projects'] }
    );
  }

  /**
   * Create new project
   * Validates input and provides clear feedback
   */
  async createProject(projectData: ProjectCreateRequest): Promise<Project> {
    try {
      if (!projectData.name || projectData.name.trim().length === 0) {
        throw new Error('Project name is required');
      }

      if (projectData.name.length > 200) {
        throw new Error('Project name must be less than 200 characters');
      }

      const result = await this.apiPost<Project>(this.baseUrl, projectData);

      // Invalidate cache to ensure fresh data
      this.invalidateCache('projects:list');

      // Show success notification for excellent UX
      notifications.show({
        title: 'Success',
        message: `Project "${projectData.name}" created successfully`,
        color: 'green',
        autoClose: 3000
      });

      logger.info?.(`Successfully created project: ${result.uuid}`);
      return result;

    } catch (error) {
      logger.error?.(`Failed to create project ${projectData.name}:`, error);
      throw new Error('Failed to create project. Please try again.');
    }
  }

  /**
   * Update project information
   * Validates input and maintains data integrity
   */
  async updateProject(projectUuid: string, updates: ProjectUpdateRequest): Promise<Project> {
    try {
      if (updates.name !== undefined) {
        if (!updates.name || updates.name.trim().length === 0) {
          throw new Error('Project name cannot be empty');
        }
        if (updates.name.length > 200) {
          throw new Error('Project name must be less than 200 characters');
        }
      }

      const result = await this.apiPut<Project>(`${this.baseUrl}/${projectUuid}`, updates);

      // Invalidate caches
      this.invalidateCache(`project:${projectUuid}`);
      this.invalidateCache('projects:list');

      // Show success notification
      notifications.show({
        title: 'Success',
        message: 'Project updated successfully',
        color: 'green',
        autoClose: 3000
      });

      logger.info?.(`Successfully updated project: ${projectUuid}`);
      return result;

    } catch (error) {
      logger.error?.(`Failed to update project ${projectUuid}:`, error);
      throw new Error('Failed to update project. Please try again.');
    }
  }

  /**
   * Delete project with preflight checks
   * Provides excellent UX with confirmations and warnings
   */
  async deleteProject(projectUuid: string, force: boolean = false): Promise<void> {
    try {
      // Deletion impact analysis to understand impact
      const impact = await this.getDeletionImpact('project', projectUuid, 'hard');

      if (!force) {
        // Check for blockers that prevent deletion
        if (impact.blockers.length > 0) {
          throw new Error(`Cannot delete project: ${impact.blockers.join('; ')}`);
        }

        // Check for impact that requires confirmation
        if (impact.orphanItems.length > 0 || impact.warnings.length > 0) {
          const summary = [
            impact.orphanItems.length > 0 && `Will delete ${impact.orphanItems.length} items`,
            impact.warnings.length > 0 && `${impact.warnings.length} warnings`,
            impact.impactSummary
          ].filter(Boolean).join('. ');

          throw new Error(`Project deletion requires confirmation: ${summary}. Use force=true to proceed.`);
        }
      }

      await this.apiDelete(`${this.baseUrl}/${projectUuid}?force=${force}`);

      // Invalidate caches
      this.invalidateCache(`project:${projectUuid}`);
      this.invalidateCache('projects:list');

      // Show success notification
      notifications.show({
        title: 'Success',
        message: 'Project deleted successfully',
        color: 'green',
        autoClose: 3000
      });

      logger.info?.(`Successfully deleted project: ${projectUuid}`);

    } catch (error) {
      logger.error?.(`Failed to delete project ${projectUuid}:`, error);
      throw new Error('Failed to delete project. Please try again.');
    }
  }

  /**
   * Reorder documents within a project
   * Handles concurrency with If-Unmodified-Since header
   */
  async reorderDocuments(
    projectUuid: string,
    documentUuids: string[],
    ifUnmodifiedSince?: string
  ): Promise<void> {
    try {
      const headers: Record<string, string> = {};
      if (ifUnmodifiedSince) {
        headers['If-Unmodified-Since'] = ifUnmodifiedSince;
      }

      await this.apiPut(
        `${this.baseUrl}/${projectUuid}/items/documents/reorder`,
        { documentUuids },
        { headers }
      );

      // Invalidate project cache
      this.invalidateCache(`project:${projectUuid}`);

      logger.info?.(`Successfully reordered documents for project: ${projectUuid}`);

    } catch (error) {
      logger.error?.(`Failed to reorder documents for project ${projectUuid}:`, error);
      throw new Error('Failed to reorder documents. The project may have been modified by another user. Please refresh and try again.');
    }
  }

  /**
   * Link existing documents to a project
   * Includes preflight checks and exclusivity warnings
   */
  async linkDocuments(
    projectUuid: string,
    documentUuids: string[],
    areItemsExclusive: boolean = false
  ): Promise<void> {
    try {
      // Impact analysis for exclusivity conflicts
      if (areItemsExclusive) {
        for (const documentUuid of documentUuids) {
          const impact = await this.getDeletionImpact('document', documentUuid, 'hard');
          if (impact.blockers.length > 0) {
            throw new Error(`Cannot make document exclusive: ${impact.blockers.join('; ')}`);
          }
          if (impact.orphanItems.length > 0 || impact.warnings.length > 0) {
            const summary = [
              impact.orphanItems.length > 0 && `Will break ${impact.orphanItems.length} associations`,
              impact.warnings.length > 0 && `${impact.warnings.length} warnings`,
              impact.impactSummary
            ].filter(Boolean).join('. ');

            throw new Error(`Document exclusivity requires confirmation: ${summary}. This must be confirmed in UI before proceeding.`);
          }
        }
      }

      await this.apiPost(`${this.baseUrl}/${projectUuid}/items/documents/link`, {
        documentUuids,
        areItemsExclusive
      });

      // Invalidate caches
      this.invalidateCache(`project:${projectUuid}`);
      this.invalidateCache('projects:list');

      // Show success notification
      notifications.show({
        title: 'Success',
        message: `Linked ${documentUuids.length} document(s) to project`,
        color: 'green',
        autoClose: 3000
      });

      logger.info?.(`Successfully linked documents to project: ${projectUuid}`);

    } catch (error) {
      logger.error?.(`Failed to link documents to project ${projectUuid}:`, error);
      throw new Error('Failed to link documents to project. Please try again.');
    }
  }

  /**
   * Unlink a document from a project
   * Simple operation with proper error handling
   */
  async unlinkDocument(projectUuid: string, documentUuid: string): Promise<void> {
    try {
      await this.apiPost(`${this.baseUrl}/${projectUuid}/items/documents/unlink`, {
        documentUuid
      });

      // Invalidate caches
      this.invalidateCache(`project:${projectUuid}`);

      // Show success notification
      notifications.show({
        title: 'Success',
        message: 'Document unlinked from project',
        color: 'green',
        autoClose: 3000
      });

      logger.info?.(`Successfully unlinked document ${documentUuid} from project ${projectUuid}`);

    } catch (error) {
      logger.error?.(`Failed to unlink document ${documentUuid} from project ${projectUuid}:`, error);
      throw new Error('Failed to unlink document from project. Please try again.');
    }
  }

  /**
   * Reorder project sections
   * Maintains consistent project layout
   */
  async reorderSections(
    projectUuid: string,
    sectionTypes: string[]
  ): Promise<void> {
    try {
      await this.apiPut(`${this.baseUrl}/${projectUuid}/sections/reorder`, {
        sectionTypes
      });

      // Invalidate project cache
      this.invalidateCache(`project:${projectUuid}`);

      logger.info?.(`Successfully reordered sections for project: ${projectUuid}`);

    } catch (error) {
      logger.error?.(`Failed to reorder sections for project ${projectUuid}:`, error);
      throw new Error('Failed to reorder project sections. Please try again.');
    }
  }

  /**
   * Get deletion impact analysis
   * Provides comprehensive analysis of what will happen when deleting an item
   */
  async getDeletionImpact(itemType: 'project' | 'document', itemUuid: string, mode: 'soft' | 'hard' = 'soft'): Promise<DeletionImpact> {
    return deletionImpactService.analyzeDeletionImpact(itemType, itemUuid, mode);
  }

  /**
   * Get project statistics
   * Provides insights for dashboard and analytics
   */
  async getProjectStatistics(): Promise<ProjectStatistics> {
    try {
      return this.getCachedData(
        'projects:stats',
        () => this.apiGet(`${this.baseUrl}/statistics`),
        {
          totalProjects: 0,
          activeProjects: 0,
          totalDocuments: 0,
          recentActivity: 0
        },
        { ttl: 600000, tags: ['statistics'] }
      );

    } catch (error) {
      logger.error?.('Failed to get project statistics:', error);
      throw new Error('Failed to load project statistics.');
    }
  }

  /**
   * Get projects with their documents
   * Convenience method for dashboard views
   */
  async getProjectsWithDocuments(): Promise<Array<Project & { documents: any[] }>> {
    try {
      const projects = await this.listProjects();

      // Load documents for each project in parallel
      const projectsWithDocuments = await Promise.all(
        projects.map(async (project) => {
          try {
            // This would typically be a projects/${projectUuid}/documents endpoint
            // For now, we'll return the project without documents
            return { ...project, documents: [] };
          } catch (error) {
            logger.warn?.(`Failed to load documents for project ${project.uuid}:`, error);
            return { ...project, documents: [] };
          }
        })
      );

      return projectsWithDocuments;

    } catch (error) {
      logger.error?.('Failed to get projects with documents:', error);
      throw new Error('Failed to load projects with documents.');
    }
  }
}

// Export singleton instance for consistent usage across application
export const projectsService = new ProjectsService();