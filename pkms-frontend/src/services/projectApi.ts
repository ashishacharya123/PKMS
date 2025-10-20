/**
 * Project API Service - Frontend helpers for project operations
 * 
 * Handles:
 * - Document reordering, linking, unlinking
 * - Section reordering
 * - Delete preflight checks
 */

import { apiService } from './api';

export interface ProjectDocumentReorderRequest {
  documentUuids: string[];
}

export interface ProjectDocumentLinkRequest {
  documentUuids: string[];
}

export interface ProjectDocumentUnlinkRequest {
  documentUuid: string;
}

export interface ProjectSectionReorderRequest {
  sectionTypes: string[];
}

export interface DeletePreflightResponse {
  canDelete: boolean;
  linkCount: number;
  linkedItems: {
    [key: string]: {
      items: string[];
      count: number;
    };
  };
  warningMessage?: string;
}

export class ProjectApiService {
  /**
   * Reorder documents within a project
   */
  static async reorderDocuments(
    projectUuid: string, 
    documentUuids: string[],
    ifUnmodifiedSince?: string
  ): Promise<void> {
    const headers: Record<string, string> = {};
    if (ifUnmodifiedSince) {
      headers['If-Unmodified-Since'] = ifUnmodifiedSince;
    }

    await apiService.patch(
      `/projects/${projectUuid}/documents/reorder`,
      { documentUuids },
      { headers }
    );
  }

  /**
   * Link existing documents to a project
   */
  static async linkDocuments(
    projectUuid: string, 
    documentUuids: string[]
  ): Promise<void> {
    await apiService.post(
      `/projects/${projectUuid}/documents:link`,
      { documentUuids }
    );
  }

  /**
   * Unlink a document from a project
   */
  static async unlinkDocument(
    projectUuid: string, 
    documentUuid: string
  ): Promise<void> {
    await apiService.post(
      `/projects/${projectUuid}/documents:unlink`,
      { documentUuid }
    );
  }

  /**
   * Reorder sections within a project
   */
  static async reorderSections(
    projectUuid: string, 
    sectionTypes: string[]
  ): Promise<void> {
    await apiService.patch(
      `/projects/${projectUuid}/sections/reorder`,
      { sectionTypes }
    );
  }

  /**
   * Get delete preflight information for any item
   */
  static async getDeletePreflight(
    itemType: 'document' | 'note' | 'todo' | 'note_file' | 'diary_file',
    itemUuid: string
  ): Promise<DeletePreflightResponse> {
    const response = await apiService.get(
      `/delete-preflight/${itemType}/${itemUuid}/delete-preflight`
    );
    return response as DeletePreflightResponse;
  }

  /**
   * Check if an item can be safely deleted
   */
  static async canDeleteSafely(
    itemType: 'document' | 'note' | 'todo' | 'note_file' | 'diary_file',
    itemUuid: string
  ): Promise<boolean> {
    try {
      const preflight = await this.getDeletePreflight(itemType, itemUuid);
      return preflight.linkCount === 0;
    } catch (error) {
      console.error('Error checking delete safety:', error);
      return false;
    }
  }

  /**
   * Get warning message for item deletion
   */
  static async getDeleteWarning(
    itemType: 'document' | 'note' | 'todo' | 'note_file' | 'diary_file',
    itemUuid: string
  ): Promise<string | null> {
    try {
      const preflight = await this.getDeletePreflight(itemType, itemUuid);
      return preflight.warningMessage || null;
    } catch (error) {
      console.error('Error getting delete warning:', error);
      return null;
    }
  }
}

// Export for easy importing
export const projectApi = ProjectApiService;
