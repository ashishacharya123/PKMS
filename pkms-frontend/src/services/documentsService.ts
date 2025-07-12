/**
 * Documents Service - API communication for documents module
 */

import { apiService } from './api';
import { coreUploadService, UploadProgress } from './shared/coreUploadService';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';

const SMALL_FILE_THRESHOLD = 3 * 1024 * 1024; // 3 MB

// Map simple percent progress for UI
const forwardUploadPct = (cb?: (p: number) => void) => {
  return (pct: number) => cb?.(pct);
};

export interface Document {
  uuid: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  extracted_text?: string;
  metadata: Record<string, any>;
  thumbnail_path?: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface DocumentSummary {
  uuid: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  preview: string;
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
      return data;
    }

    const fileId = await coreUploadService.uploadFile(file, {
      module: 'documents',
      additionalMeta: { tags },
      onProgress: p => onProgress?.(p.progress)
    });

    // After assembly backend should have created document entry; fetch its metadata
    // via a dedicated endpoint e.g., /documents/by-upload/{file_id}. For now, re-fetch list.
    // Simplest: call GET /documents?limit=1&offset=0 and assume newest first.
    const docs = await this.listDocuments({ limit: 1 });
    if (docs.length) {
      const fullDoc = await this.getDocument(docs[0].uuid);
      return fullDoc;
    }
    throw new Error('Upload completed but document metadata not found');
  }

  /**
   * Get a specific document by UUID
   */
  async getDocument(uuid: string): Promise<Document> {
    const response = await apiService.get<Document>(`/documents/${uuid}`);
    return response.data;
  }

  /**
   * Update document metadata and tags
   */
  async updateDocument(uuid: string, data: UpdateDocumentRequest): Promise<Document> {
    const response = await apiService.put<Document>(`/documents/${uuid}`, data);
    return response.data;
  }

  /**
   * Delete a document
   */
  async deleteDocument(uuid: string): Promise<{ message: string }> {
    const response = await apiService.delete<{ message: string }>(`/documents/${uuid}`);
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

    // FastAPI router is mounted at `/api/v1/documents/` (note the trailing slash).
    // Omitting the slash triggers a 307 redirect which browsers may block for CORS requests.
    const basePath = '/documents/';
    const url = `${basePath}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiService.get<DocumentSummary[]>(url);
    return response.data;
  }

  /**
   * Download a document file
   */
  getDownloadUrl(uuid: string): string {
    return `${apiService.getAxiosInstance().defaults.baseURL}/documents/${uuid}/download`;
  }

  /**
   * Download document with authentication
   */
  async downloadDocument(uuid: string, onProgress?: (p: DownloadProgress) => void): Promise<Blob> {
    const url = `/documents/${uuid}/download`;
    return coreDownloadService.downloadFile(url, { fileId: uuid, onProgress });
  }

  /**
   * Get document preview (thumbnail or text preview)
   */
  async getDocumentPreview(uuid: string): Promise<any> {
    try {
      return await apiService.get(`/documents/${uuid}/preview`);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get preview URL for images
   */
  getPreviewUrl(uuid: string): string {
    return `${apiService.getAxiosInstance().defaults.baseURL}/documents/${uuid}/preview`;
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
  async toggleArchive(uuid: string, archived: boolean): Promise<Document> {
    return await this.updateDocument(uuid, { is_archived: archived });
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