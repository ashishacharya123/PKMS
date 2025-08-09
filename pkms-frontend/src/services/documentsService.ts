/**
 * Documents Service - API communication for documents module
 */

import { apiService } from './api';
import { coreUploadService, UploadProgress } from './shared/coreUploadService';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';
import { searchService } from './searchService';

const SMALL_FILE_THRESHOLD = 3 * 1024 * 1024; // 3 MB

// Map simple percent progress for UI
const forwardUploadPct = (cb?: (p: number) => void) => {
  return (pct: number) => cb?.(pct);
};

export interface Document {
  id: number;
  uuid: string;
  title: string;
  original_name: string;
  filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  description?: string;
  is_favorite: boolean;
  is_archived: boolean;
  archive_item_uuid?: string;
  upload_status: string;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface DocumentSummary {
  id: number;
  uuid: string;
  title: string;
  original_name: string;
  filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  description?: string;
  is_favorite: boolean;
  is_archived: boolean;
  archive_item_uuid?: string;
  upload_status: string;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface UploadDocumentRequest {
  file: File;
  tags?: string[];
}

export interface UpdateDocumentRequest {
  tags?: string[];
  is_archived?: boolean;
  metadata?: Record<string, any>;
}

export interface SearchResult {
  id: number;
  uuid: string;
  original_name: string;
  mime_type: string;
  highlight: string;
  created_at: string;
}

export interface DocumentsListParams {
  mime_type?: string;
  archived?: boolean;
  tag?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

class DocumentsService {
  /**
   * Upload a new document with optional tags
   */
  async uploadDocument(
    file: File, 
    tags: string[] = [],
    onProgress?: (progress: number) => void
  ): Promise<Document> {
    const formData = new FormData();
    formData.append('file', file);
    if (tags.length > 0) {
      formData.append('tags', JSON.stringify(tags));
    }

    if (file.size <= SMALL_FILE_THRESHOLD) {
      const data = await coreUploadService.uploadDirect<Document>('/documents/', formData, { onProgress: forwardUploadPct(onProgress) });
      // Invalidate search cache for documents
      searchService.invalidateCacheForContentType('document');
      return data;
    }

    await coreUploadService.uploadFile(file, {
      module: 'documents',
      additionalMeta: { tags },
      onProgress: p => onProgress?.(p.progress)
    });

    // After assembly backend should have created document entry; fetch its metadata
    // via a dedicated endpoint e.g., /documents/by-upload/{file_id}. For now, re-fetch list.
    // Simplest: call GET /documents?limit=1&offset=0 and assume newest first.
    const docs = await this.listDocuments({ limit: 1 });
    if (docs.length) {
      const fullDoc = await this.getDocument(docs[0].id);
      // Invalidate search cache for documents
      searchService.invalidateCacheForContentType('document');
      return fullDoc;
    }
    throw new Error('Upload completed but document metadata not found');
  }

  /**
   * Get a specific document by ID
   */
  async getDocument(id: number): Promise<Document> {
    const response = await apiService.get<Document>(`/documents/${id}`);
    return response.data;
  }

  /**
   * Update document metadata and tags
   */
  async updateDocument(id: number, data: UpdateDocumentRequest): Promise<Document> {
    const response = await apiService.put<Document>(`/documents/${id}`, data);
    // Invalidate search cache for documents
    searchService.invalidateCacheForContentType('document');
    return response.data;
  }

  /**
   * Delete a document
   */
  async deleteDocument(id: number): Promise<{ message: string }> {
    const response = await apiService.delete<{ message: string }>(`/documents/${id}`);
    // Invalidate search cache for documents
    searchService.invalidateCacheForContentType('document');
    return response.data;
  }

  /**
   * List documents with filtering and pagination
   */
  async listDocuments(params: DocumentsListParams = {}): Promise<DocumentSummary[]> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    // FastAPI router endpoint for document list is `/documents/` 
    const basePath = '/documents/';
    const url = `${basePath}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiService.get<DocumentSummary[]>(url);
    return response.data;
  }

  /**
   * Download a document file
   */
  getDownloadUrl(id: number): string {
    return `${apiService.getAxiosInstance().defaults.baseURL}/documents/${id}/download`;
  }

  /**
   * Download document with authentication
   */
  async downloadDocument(id: number, onProgress?: (p: DownloadProgress) => void): Promise<Blob> {
    const url = `/documents/${id}/download`;
    return coreDownloadService.downloadFile(url, { fileId: id.toString(), onProgress });
  }

  /**
   * Get document preview (thumbnail or text preview)
   */
  async getDocumentPreview(id: number): Promise<any> {
    try {
      return await apiService.get(`/documents/${id}/preview`);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get preview URL for images
   */
  getPreviewUrl(id: number): string {
    return `${apiService.getAxiosInstance().defaults.baseURL}/documents/${id}/preview`;
  }

  /**
   * Full-text search across all documents
   */
  async searchDocuments(query: string, limit: number = 20): Promise<{
    results: SearchResult[];
    total: number;
  }> {
    const params = new URLSearchParams({
      query,
      limit: limit.toString()
    });

    const response = await apiService.get<{
      results: SearchResult[];
      total: number;
    }>(`/documents/search/fulltext?${params.toString()}`);
    return response.data;
  }

  /**
   * Get documents by MIME type
   */
  async getDocumentsByType(mimeType: string, limit: number = 50): Promise<DocumentSummary[]> {
    return await this.listDocuments({ mime_type: mimeType, limit });
  }

  /**
   * Get documents by tag
   */
  async getDocumentsByTag(tag: string, limit: number = 50): Promise<DocumentSummary[]> {
    return await this.listDocuments({ tag, limit });
  }

  /**
   * Archive/unarchive a document
   */
  async toggleArchive(id: number, archived: boolean): Promise<Document> {
    return await this.updateDocument(id, { is_archived: archived });
  }

  /**
   * Get recent documents
   */
  async getRecentDocuments(limit: number = 10): Promise<DocumentSummary[]> {
    return await this.listDocuments({ limit, archived: false });
  }

  /**
   * Get supported file types
   */
  getSupportedFileTypes(): string[] {
    return [
      '.pdf',
      '.docx',
      '.doc', 
      '.txt',
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp'
    ];
  }

  /**
   * Check if file type is supported
   */
  isFileTypeSupported(fileName: string): boolean {
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return this.getSupportedFileTypes().includes(extension);
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get file icon based on MIME type
   */
  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType === 'text/plain') return '📋';
    return '📎';
  }
}

export const documentsService = new DocumentsService(); 