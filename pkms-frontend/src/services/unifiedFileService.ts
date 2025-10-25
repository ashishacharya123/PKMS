/**
 * Unified File Service
 * 
 * Provides a consistent interface for file operations across all modules.
 * Handles the complexity of different backend endpoints, encryption, and data formats.
 */

import { apiService } from './api';
import { coreUploadService } from './shared/coreUploadService';
import { fileService } from './fileCacheService';

// Unified FileItem interface used across all modules
export interface UnifiedFileItem {
  uuid: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  description?: string;
  createdAt: string;
  mediaType?: string;
  isEncrypted?: boolean;
  filePath?: string;
  thumbnailPath?: string;
  // Module-specific metadata
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  entityId: string; // The parent entity (note, diary entry, project, etc.)
}

// File retrieval options
export interface FileRetrievalOptions {
  includeArchived?: boolean;
  includeEncrypted?: boolean;
  limit?: number;
  offset?: number;
}

// Upload options
export interface FileUploadOptions {
  description?: string;
  tags?: string[];
  caption?: string; // For diary entries
  isExclusive?: boolean; // For projects
  projectIds?: string[]; // For documents
  encryptionKey?: CryptoKey; // For diary encryption
  onProgress?: (progress: { progress: number; status: string }) => void;
}

// Audio recording options
export interface AudioRecordingOptions {
  filename?: string;
  description?: string;
  encryptionKey?: CryptoKey; // For diary encryption
  onProgress?: (progress: { progress: number; status: string }) => void;
}

class UnifiedFileService {
  /**
   * Get files for any module using a unified interface
   */
  async getFiles(
    module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects',
    entityId: string,
    options: FileRetrievalOptions = {}
  ): Promise<UnifiedFileItem[]> {
    switch (module) {
      case 'notes':
        return this.getNoteFiles(entityId, options);
      case 'diary':
        return this.getDiaryFiles(entityId, options);
      case 'documents':
        return this.getDocumentFiles(options);
      case 'archive':
        return this.getArchiveFiles(options);
      case 'projects':
        return this.getProjectFiles(entityId, options);
      default:
        throw new Error(`Unsupported module: ${module}`);
    }
  }

  /**
   * Get files for a note
   */
  private async getNoteFiles(noteUuid: string, _options: FileRetrievalOptions = {}): Promise<UnifiedFileItem[]> {
    const response = await apiService.get(`/notes/${noteUuid}/files`);
    const files = response.data as any[];
    
    return files.map(file => this.normalizeFileItem(file, 'notes', noteUuid));
  }

  /**
   * Get files for a diary entry
   */
  private async getDiaryFiles(entryUuid: string, _options: FileRetrievalOptions = {}): Promise<UnifiedFileItem[]> {
    const response = await apiService.get(`/diary/entries/${entryUuid}/documents`);
    const files = response.data as any[];
    
    return files.map(file => this.normalizeFileItem(file, 'diary', entryUuid));
  }

  /**
   * Get all documents
   */
  private async getDocumentFiles(options: FileRetrievalOptions = {}): Promise<UnifiedFileItem[]> {
    const params = new URLSearchParams();
    if (options.includeArchived !== undefined) {
      params.append('archived', String(options.includeArchived));
    }
    if (options.limit !== undefined) {
      params.append('limit', options.limit.toString());
    }
    if (options.offset !== undefined) {
      params.append('offset', options.offset.toString());
    }

    const response = await apiService.get(`/documents/?${params.toString()}`);
    const files = response.data as any[];
    
    return files.map(file => this.normalizeFileItem(file, 'documents', ''));
  }

  /**
   * Get archive files
   */
  private async getArchiveFiles(options: FileRetrievalOptions = {}): Promise<UnifiedFileItem[]> {
    const params = new URLSearchParams();
    params.append('archived', 'true'); // Archive files are always archived
    if (options.limit !== undefined) {
      params.append('limit', options.limit.toString());
    }
    if (options.offset !== undefined) {
      params.append('offset', options.offset.toString());
    }

    const response = await apiService.get(`/documents/?${params.toString()}`);
    const files = response.data as any[];
    
    return files.map(file => this.normalizeFileItem(file, 'archive', ''));
  }

  /**
   * Get files for a project
   */
  private async getProjectFiles(projectUuid: string, options: FileRetrievalOptions = {}): Promise<UnifiedFileItem[]> {
    const params = new URLSearchParams();
    params.append('project_uuid', projectUuid);
    if (options.includeArchived !== undefined) {
      params.append('archived', String(options.includeArchived));
    }
    if (options.limit !== undefined) {
      params.append('limit', options.limit.toString());
    }
    if (options.offset !== undefined) {
      params.append('offset', options.offset.toString());
    }

    const response = await apiService.get(`/documents/?${params.toString()}`);
    const files = response.data as any[];
    
    return files.map(file => this.normalizeFileItem(file, 'projects', projectUuid));
  }

  /**
   * Normalize file items from different backend responses to unified format
   */
  private normalizeFileItem(file: any, module: string, entityId: string): UnifiedFileItem {
    return {
      uuid: file.uuid,
      filename: file.filename,
      originalName: file.originalName || file.original_name,
      mimeType: file.mimeType || file.mime_type,
      fileSize: file.fileSize || file.file_size,
      description: file.description,
      createdAt: file.createdAt || file.created_at,
      mediaType: file.mediaType || file.media_type,
      isEncrypted: file.isEncrypted || file.is_encrypted,
      filePath: file.filePath || file.file_path,
      thumbnailPath: file.thumbnailPath || file.thumbnail_path,
      module: module as any,
      entityId
    };
  }

  /**
   * Get download URL for a file
   */
  getDownloadUrl(file: UnifiedFileItem): string {
    switch (file.module) {
      case 'documents':
        return `/documents/${file.uuid}/download`;
      case 'notes':
      case 'diary':
        return `/${file.module}/files/${file.uuid}/download`;
      case 'archive':
        return `/archive/items/${file.uuid}/download`;
      case 'projects':
        return `/documents/${file.uuid}/download`; // Projects use documents endpoint
      default:
        throw new Error(`Unsupported module for download: ${file.module}`);
    }
  }

  /**
   * Delete a file with preflight checks
   */
  async deleteFile(file: UnifiedFileItem): Promise<void> {
    // Get preflight check for file deletion
    const { projectApi } = await import('./projectApi');
    
    let itemType: 'document' | 'note_file' | 'diary_file';
    switch (file.module) {
      case 'notes':
        itemType = 'note_file';
        break;
      case 'diary':
        itemType = 'diary_file';
        break;
      case 'documents':
      case 'archive':
      case 'projects':
        itemType = 'document';
        break;
      default:
        throw new Error(`Unsupported module for delete: ${file.module}`);
    }

    // Check if file can be safely deleted
    const canDelete = await projectApi.canDeleteSafely(itemType, file.uuid);
    if (!canDelete) {
      const warning = await projectApi.getDeleteWarning(itemType, file.uuid);
      throw new Error(warning || 'Cannot delete file: it has associations that would be affected');
    }

    // Perform the actual deletion
    switch (file.module) {
      case 'notes':
        await apiService.delete(`/notes/files/${file.uuid}`);
        break;
      case 'diary':
        await apiService.post(`/diary/entries/${file.entityId}/documents:unlink`, {
          documentUuid: file.uuid
        });
        break;
      case 'documents':
      case 'archive':
      case 'projects':
        await apiService.delete(`/documents/${file.uuid}`);
        break;
      default:
        throw new Error(`Unsupported module for delete: ${file.module}`);
    }
  }

  /**
   * Unlink a file from a project (for project context) with preflight checks
   */
  async unlinkFile(file: UnifiedFileItem): Promise<void> {
    if (file.module !== 'projects') {
      throw new Error(`Unlink only supported for projects, got: ${file.module}`);
    }
    
    // Get preflight check for unlinking
    const { projectApi } = await import('./projectApi');
    const canDelete = await projectApi.canDeleteSafely('document', file.uuid);
    if (!canDelete) {
      const warning = await projectApi.getDeleteWarning('document', file.uuid);
      throw new Error(warning || 'Cannot unlink file: it has associations that would be affected');
    }
    
    await apiService.post(`/projects/${file.entityId}/items/documents/unlink`, {
      documentUuids: [file.uuid]
    });
  }

  /**
   * Upload files with module-specific handling
   */
  async uploadFiles(
    module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects',
    entityId: string,
    files: File[],
    options: FileUploadOptions = {}
  ): Promise<UnifiedFileItem[]> {
    const uploadedFiles: UnifiedFileItem[] = [];

    for (const file of files) {
      try {
        const uploadedFile = await this.uploadFile(module, entityId, file, options);
        uploadedFiles.push(uploadedFile);
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        throw error;
      }
    }

    return uploadedFiles;
  }

  /**
   * Upload a single file with module-specific handling
   */
  async uploadFile(
    module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects',
    entityId: string,
    file: File,
    options: FileUploadOptions = {}
  ): Promise<UnifiedFileItem> {
    switch (module) {
      case 'notes':
        return this.uploadToNote(entityId, file, options);
      case 'diary':
        return this.uploadToDiary(entityId, file, options);
      case 'documents':
        return this.uploadToDocuments(file, options);
      case 'archive':
        return this.uploadToArchive(entityId, file, options);
      case 'projects':
        return this.uploadToProject(entityId, file, options);
      default:
        throw new Error(`Unsupported module: ${module}`);
    }
  }

  /**
   * Upload audio recording with module-specific handling
   */
  async uploadAudioRecording(
    module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects',
    entityId: string,
    audioBlob: Blob,
    options: AudioRecordingOptions = {}
  ): Promise<UnifiedFileItem> {
    const filename = options.filename || `recording-${Date.now()}.webm`;
    const audioFile = new File([audioBlob], filename, { type: 'audio/webm' });
    
    return this.uploadFile(module, entityId, audioFile, {
      ...options,
      description: options.description || 'Audio recording'
    });
  }

  /**
   * Reorder files (ONLY for projects using project_items.sort_order)
   */
  async reorderFiles(
    module: 'projects',
    entityId: string,
    fileUuids: string[]
  ): Promise<void> {
    if (module !== 'projects') {
      throw new Error(`Reordering only supported for projects, got: ${module}`);
    }
    
    await apiService.patch(`/projects/${entityId}/items/documents/reorder`, {
      documentUuids: fileUuids
    });
  }

  /**
   * Get cached file with encryption handling
   */
  async getCachedFile(file: UnifiedFileItem): Promise<Blob | null> {
    const cacheKey = `${file.uuid}_${file.originalName}`;
    const module = this.getCacheModule(file.module);
    
    return await fileService.getCachedFile(cacheKey, module);
  }

  /**
   * Download file with encryption handling
   */
  async downloadFile(file: UnifiedFileItem, encryptionKey?: CryptoKey): Promise<Blob> {
    // Handle encrypted diary files
    if (file.module === 'diary' && file.isEncrypted && encryptionKey) {
      return this.downloadEncryptedDiaryFile(file, encryptionKey);
    }

    // Handle regular files
    const downloadUrl = this.getDownloadUrl(file);
    const module = this.getCacheModule(file.module);
    
    return await fileService.downloadFile(downloadUrl, module, {
      generateThumbnail: true,
      cacheKey: `${file.uuid}_${file.originalName}`,
      maxSize: 100 // 100MB limit
    }) as Blob;
  }

  /**
   * Get thumbnail for file
   */
  async getThumbnail(file: UnifiedFileItem): Promise<string | null> {
    if (file.thumbnailPath) {
      return file.thumbnailPath;
    }

    const cacheKey = `${file.uuid}_thumbnail`;
    const module = this.getCacheModule(file.module);
    
    const thumbnailBlob = await fileService.getThumbnail(cacheKey, module);
    if (thumbnailBlob) {
      return URL.createObjectURL(thumbnailBlob);
    }

    return null;
  }

  /**
   * Get a specific document by ID
   */
  async getDocument(uuid: string): Promise<any> {
    const response = await apiService.get(`/documents/${uuid}`);
    return response.data;
  }

  /**
   * Update document metadata and tags
   */
  async updateDocument(uuid: string, data: any): Promise<any> {
    const response = await apiService.put(`/documents/${uuid}`, data);
    return response.data;
  }

  /**
   * List documents with filtering and pagination
   */
  async listDocuments(params: any = {}): Promise<any[]> {
    // URL parameters must use snake_case (not converted by CamelCaseModel)
    const queryParams = new URLSearchParams();
    
    // Convert camelCase to snake_case for URL parameters
    if (params.mimeType !== undefined) queryParams.append('mime_type', params.mimeType);
    if (params.archived !== undefined) queryParams.append('archived', String(params.archived));
    if (params.isFavorite !== undefined) queryParams.append('is_favorite', String(params.isFavorite));
    if (params.tag !== undefined) queryParams.append('tag', params.tag);
    if (params.projectUuid !== undefined) queryParams.append('project_uuid', params.projectUuid);
    if (params.project_only !== undefined) queryParams.append('project_only', String(params.project_only));
    if (params.unassigned_only !== undefined) queryParams.append('unassigned_only', String(params.unassigned_only));
    if (params.search !== undefined) queryParams.append('search', params.search);
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params.offset !== undefined) queryParams.append('offset', params.offset.toString());

    const basePath = '/documents/';
    const url = `${basePath}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiService.get(url);
    return response.data as any[];
  }

  /**
   * Get download URL for a file
   */
  getFileDownloadUrl(uuid: string, module: string = 'documents'): string {
    const baseURL = apiService.getAxiosInstance().defaults.baseURL;
    switch (module) {
      case 'notes':
        return `${baseURL}/notes/files/${uuid}/download`;
      case 'diary':
        return `${baseURL}/documents/${uuid}/download`;
      case 'documents':
      case 'archive':
      case 'projects':
        return `${baseURL}/documents/${uuid}/download`;
      default:
        return `${baseURL}/documents/${uuid}/download`;
    }
  }

  /**
   * Download file with progress tracking
   */
  async downloadFileWithProgress(
    file: UnifiedFileItem, 
    onProgress?: (progress: any) => void,
    encryptionKey?: CryptoKey
  ): Promise<Blob> {
    // Handle encrypted diary files
    if (file.module === 'diary' && file.isEncrypted && encryptionKey) {
      return this.downloadEncryptedDiaryFile(file, encryptionKey);
    }

    // Use coreDownloadService for progress tracking
    const { coreDownloadService } = await import('./shared/coreDownloadService');
    const downloadUrl = this.getDownloadUrl(file);
    
    return await coreDownloadService.downloadFile(downloadUrl, { 
      fileId: file.uuid, 
      onProgress 
    });
  }

  // Private helper methods

  private async uploadToNote(noteUuid: string, file: File, options: FileUploadOptions): Promise<UnifiedFileItem> {
    const fileId = await coreUploadService.uploadFile(file, {
      module: 'notes',
      onProgress: options.onProgress
    });

    const response = await apiService.post('/notes/files/upload/commit', {
      fileId,
      noteUuid,
      description: options.description
    });

    return this.normalizeFileItem(response.data, 'notes', noteUuid);
  }

  private async uploadToDiary(entryUuid: string, file: File, options: FileUploadOptions): Promise<UnifiedFileItem> {
    // Use diaryService for proper encryption handling
    const { diaryService } = await import('./diaryService');
    
    // Determine file type from mime type
    let fileType: 'photo' | 'video' | 'voice' = 'photo';
    if (file.type.startsWith('video/')) fileType = 'video';
    if (file.type.startsWith('audio/')) fileType = 'voice';
    
    const result = await diaryService.uploadFile(
      entryUuid,
      file,
      fileType,
      options.caption || options.description,
      options.encryptionKey,
      options.onProgress
    );

    return this.normalizeFileItem(result, 'diary', entryUuid);
  }

  private async uploadToDocuments(file: File, options: FileUploadOptions): Promise<UnifiedFileItem> {
    const fileId = await coreUploadService.uploadFile(file, {
      module: 'documents',
      additionalMeta: { tags: options.tags },
      onProgress: options.onProgress
    });

    const response = await apiService.post('/documents/upload/commit', {
      fileId,
      title: file.name,
      description: options.description,
      tags: options.tags || [],
      projectIds: options.projectIds,
      isExclusiveMode: options.isExclusive
    });

    return this.normalizeFileItem(response.data, 'documents', '');
  }

  private async uploadToArchive(folderUuid: string, file: File, options: FileUploadOptions): Promise<UnifiedFileItem> {
    const fileId = await coreUploadService.uploadFile(file, {
      module: 'archive',
      additionalMeta: { folderUuid },
      onProgress: options.onProgress
    });

    const response = await apiService.post('/archive/items/upload/commit', {
      fileId,
      folderUuid,
      name: file.name,
      description: options.description || '',
      tags: options.tags || []
    });

    return this.normalizeFileItem(response.data, 'archive', folderUuid);
  }

  private async uploadToProject(projectUuid: string, file: File, options: FileUploadOptions): Promise<UnifiedFileItem> {
    const fileId = await coreUploadService.uploadFile(file, {
      module: 'documents',
      additionalMeta: { tags: options.tags },
      onProgress: options.onProgress
    });

    const response = await apiService.post('/documents/upload/commit', {
      fileId,
      title: file.name,
      description: options.description,
      tags: options.tags || [],
      projectIds: [projectUuid],
      isExclusiveMode: options.isExclusive
    });

    return this.normalizeFileItem(response.data, 'projects', projectUuid);
  }

  private async downloadEncryptedDiaryFile(file: UnifiedFileItem, encryptionKey: CryptoKey): Promise<Blob> {
    const downloadUrl = this.getDownloadUrl(file);
    const response = await apiService.get(downloadUrl, { responseType: 'blob' });
    const encryptedBlob = response.data as Blob;
    
    const { diaryCryptoService } = await import('./diaryCryptoService');
    const decryptedFile = await diaryCryptoService.decryptFile(encryptedBlob, encryptionKey, file.originalName);
    
    return decryptedFile;
  }

  private getCacheModule(module: string): 'documents' | 'archive' | 'diary' {
    switch (module) {
      case 'documents':
      case 'notes':
      case 'projects':
        return 'documents';
      case 'archive':
        return 'archive';
      case 'diary':
        return 'diary';
      default:
        return 'documents';
    }
  }
}

export const unifiedFileService = new UnifiedFileService();
