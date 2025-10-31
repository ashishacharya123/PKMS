/**
 * Documents Service - Pure document management
 *
 * Handles document CRUD operations, uploads, downloads, and metadata management
 * Extends BaseService for consistent caching and error handling
 * Follows architectural rules with proper naming and UUID handling
 */

import { BaseService } from './BaseService';
import { documentsCache } from './unifiedCacheService';
import { apiService } from './api';
import { coreUploadService, UploadProgress } from './shared/coreUploadService';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';
import { notifications } from '@mantine/notifications';
import logger from '../utils/logger';

// Document interfaces following architectural rules
export interface Document {
  uuid: string;
  name: string;
  description?: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  filePath?: string;
  thumbnailPath?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  isDeleted: boolean;
}

export interface DocumentCreateRequest {
  name: string;
  description?: string;
  tags?: string[];
  folderUuid?: string;
}

export interface DocumentUpdateRequest {
  name?: string;
  description?: string;
  tags?: string[];
}

export interface DocumentSearchRequest {
  query?: string;
  tags?: string[];
  mimeType?: string;
  limit?: number;
  offset?: number;
}

/**
 * DocumentsService - Pure document operations
 * Extends BaseService with caching for optimal performance
 */
export class DocumentsService extends BaseService {
  private readonly baseUrl = '/documents';

  constructor() {
    super(documentsCache);
  }

  /**
   * Get document by UUID
   * Follows architectural rule: Use UUID as primary key
   */
  async getDocument(documentUuid: string): Promise<Document> {
    return this.getCachedData(
      `document:${documentUuid}`,
      () => this.apiGet<Document>(`${this.baseUrl}/${documentUuid}`),
      {} as Document,
      { ttl: 300000, tags: ['document'] }
    );
  }

  /**
   * List documents with optional filtering
   * Returns array with consistent type safety
   */
  async listDocuments(params: DocumentSearchRequest = {}): Promise<Document[]> {
    const cacheKey = `documents:list:${JSON.stringify(params)}`;

    return this.getCachedData(
      cacheKey,
      () => this.apiGet<Document[]>(this.baseUrl, { params }),
      [] as Document[],
      { ttl: 180000, tags: ['documents'] }
    );
  }

  /**
   * Upload document with progress tracking
   * Uses chunked upload for all files regardless of size
   * Provides excellent UX with real-time progress updates
   */
  async uploadDocument(
    file: File,
    options: {
      description?: string;
      tags?: string[];
      folderUuid?: string;
      onProgress?: (progress: UploadProgress) => void;
    } = {}
  ): Promise<Document> {
    try {
      // Stage 1: Upload file using chunked service
      const fileId = await coreUploadService.uploadFile(file, {
        module: 'documents',
        additionalMeta: {
          description: options.description || '',
          tags: options.tags || [],
          folderUuid: options.folderUuid
        },
        onProgress: options.onProgress
      });

      // Stage 2: Commit upload to create document record
      const commitResponse = await this.apiPost<Document>(`${this.baseUrl}/upload/commit`, {
        fileId,
        name: this.extractBaseName(file.name),
        description: options.description || '',
        tags: options.tags || [],
        folderUuid: options.folderUuid
      });

      // Invalidate cache to ensure fresh data
      this.invalidateCache('documents:list');

      logger.info?.(`Successfully uploaded document: ${commitResponse.uuid}`);
      return commitResponse;

    } catch (error) {
      logger.error?.(`Failed to upload document ${file.name}:`, error);
      throw new Error(`Failed to upload document: ${file.name}. Please try again.`);
    }
  }

  /**
   * Update document metadata
   * Validates input and provides clear error messages
   */
  async updateDocument(documentUuid: string, updates: DocumentUpdateRequest): Promise<Document> {
    try {
      if (!updates.name && !updates.description && !updates.tags) {
        throw new Error('At least one field must be provided for update');
      }

      const result = await this.apiPut<Document>(`${this.baseUrl}/${documentUuid}`, updates);

      // Invalidate caches
      this.invalidateCache(`document:${documentUuid}`);
      this.invalidateCache('documents:list');

      logger.info?.(`Successfully updated document: ${documentUuid}`);
      return result;

    } catch (error) {
      logger.error?.(`Failed to update document ${documentUuid}:`, error);
      throw new Error('Failed to update document metadata. Please check your connection and try again.');
    }
  }

  /**
   * Delete document (soft delete)
   * Follows architectural pattern: soft delete with restore capability
   */
  async deleteDocument(documentUuid: string): Promise<void> {
    try {
      await this.apiDelete(`${this.baseUrl}/${documentUuid}`);

      // Invalidate caches
      this.invalidateCache(`document:${documentUuid}`);
      this.invalidateCache('documents:list');

      logger.info?.(`Successfully deleted document: ${documentUuid}`);

    } catch (error) {
      logger.error?.(`Failed to delete document ${documentUuid}:`, error);
      throw new Error('Failed to delete document. The document may be in use by another module.');
    }
  }

  /**
   * Download document with progress tracking
   * Returns blob for file download/save operations
   */
  async downloadDocument(
    documentUuid: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<Blob> {
    try {
      const downloadUrl = this.getDownloadUrl(documentUuid);
      const blob = await coreDownloadService.downloadFile(downloadUrl, {
        fileId: documentUuid,
        onProgress
      });

      logger.info?.(`Successfully downloaded document: ${documentUuid}`);
      return blob;

    } catch (error) {
      logger.error?.(`Failed to download document ${documentUuid}:`, error);
      throw new Error('Failed to download document. The file may be unavailable or corrupted.');
    }
  }

  /**
   * Get download URL for document
   * Returns consistent URL format for direct downloads
   */
  getDownloadUrl(documentUuid: string): string {
    return `${this.baseUrl}/${documentUuid}/download`;
  }

  /**
   * Search documents with full-text search
   * Uses backend search capabilities for optimal performance
   */
  async searchDocuments(searchRequest: DocumentSearchRequest): Promise<Document[]> {
    try {
      const cacheKey = `documents:search:${JSON.stringify(searchRequest)}`;

      return this.getCachedData(
        cacheKey,
        () => this.apiGet<Document[]>(`${this.baseUrl}/search`, { params: searchRequest }),
        [] as Document,
        { ttl: 120000, tags: ['search'] }
      );

    } catch (error) {
      logger.error?.('Document search failed:', error);
      throw new Error('Search failed. Please try again.');
    }
  }

  /**
   * Helper: Extract base filename without extension
   * Handles edge cases: no extension, multiple dots
   */
  private extractBaseName(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot === -1 ? filename : filename.substring(0, lastDot);
  }

  /**
   * Get document statistics
   * Provides UX insights for dashboard and analytics
   */
  async getDocumentStatistics(): Promise<{
    totalDocuments: number;
    totalSize: number;
    mimeTypeBreakdown: Record<string, number>;
    recentUploads: number;
  }> {
    try {
      return this.getCachedData(
        'documents:stats',
        () => this.apiGet(`${this.baseUrl}/statistics`),
        {
          totalDocuments: 0,
          totalSize: 0,
          mimeTypeBreakdown: {},
          recentUploads: 0
        },
        { ttl: 600000, tags: ['statistics'] }
      );

    } catch (error) {
      logger.error?.('Failed to get document statistics:', error);
      throw new Error('Failed to load document statistics.');
    }
  }
}

// Export singleton instance for consistent usage across application
export const documentsService = new DocumentsService();