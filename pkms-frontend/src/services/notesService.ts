/**
 * Notes Service with File Attachment Support
 * Extends BaseService for DRY CRUD operations
 */

import { apiService } from './api';
import { BaseService } from './BaseService';
import { coreUploadService, UploadProgress } from './shared/coreUploadService';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';

// Removed SMALL_FILE_THRESHOLD since we're using chunked upload consistently

export interface ProjectBadge {
  uuid: string | null;  // null if project is deleted (snapshot)
  name: string;
  color: string;
  isProjectExclusive: boolean;
  isDeleted: boolean;  // True if project was deleted (using snapshot name)
}

export interface Note {
  uuid: string;
  name: string; // BaseItem requires 'name'
  title: string;
  content: string;
  description?: string;  // Brief description for FTS5 search
  fileCount: number;
  isFavorite: boolean;
  isArchived: boolean;
  isProjectExclusive: boolean;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  projects: ProjectBadge[];
  createdBy?: string;
  
  // Additional metadata fields
  /** Version number for note content tracking */
  version?: number;
}

export interface NoteSummary {
  uuid: string;
  name: string; // BaseItem requires 'name'
  title: string;
  content?: string;
  description?: string;
  fileCount: number;
  isFavorite: boolean;
  isArchived: boolean;
  isExclusiveMode?: boolean;
  isProjectExclusive?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  tags: string[];
  preview?: string;
  projects: ProjectBadge[];
  
  // NEW: Additional fields
  version?: number;
}

export interface NoteFile {
  uuid: string;
  noteUuid: string;
  filename: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  isDeleted: boolean;  // Consistent soft delete
  createdAt: string;
}

export interface CreateNoteRequest {
  title: string;
  content: string;
  tags?: string[];
  projectIds?: string[];
  isExclusiveMode?: boolean;
  forceFileStorage?: boolean;  // Force content to be saved as file even if small
}

export interface UpdateNoteRequest {
  title?: string;
  content?: string;
  tags?: string[];
  isArchived?: boolean;
  isFavorite?: boolean;
  projectIds?: string[];
  isExclusiveMode?: boolean;
  forceFileStorage?: boolean;  // Force content to be saved as file even if small
}

class NotesService extends BaseService<Note, CreateNoteRequest, UpdateNoteRequest> {
  constructor() {
    super('/api/v1/notes');
  }
  /**
   * Create a new note
   */
  async createNote(data: CreateNoteRequest): Promise<Note> {
    return this.create(data);
  }

  /**
   * Get a specific note by ID
   */
  async getNote(uuid: string): Promise<Note> {
    return this.getById(uuid);
  }

  /**
   * Update a note
   */
  async updateNote(uuid: string, data: UpdateNoteRequest): Promise<Note> {
    return this.update(uuid, data);
  }

  /**
   * Delete a note
   */
  async deleteNote(uuid: string): Promise<void> {
    return this.delete(uuid);
  }

  /**
   * List notes with filtering and pagination
   */
  async listNotes(params: {
    archived?: boolean;
    search?: string;
    tag?: string;
    has_files?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<NoteSummary[]> {
    // URL parameters must use snake_case (not converted by CamelCaseModel)
    const queryParams = new URLSearchParams();
    
    // Convert camelCase to snake_case for URL parameters
    if (params.archived !== undefined) queryParams.append('archived', String(params.archived));
    if (params.search !== undefined) queryParams.append('search', params.search);
    if (params.tag !== undefined) queryParams.append('tag', params.tag);
    if (params.has_files !== undefined) queryParams.append('has_files', String(params.has_files));
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    if (params.offset !== undefined) queryParams.append('offset', params.offset.toString());

    const url = `/notes/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiService.get<NoteSummary[]>(url);
    return response.data;
  }

  /**
   * Search notes by content
   */
  async searchNotes(query: string, limit: number = 20): Promise<NoteSummary[]> {
    return await this.listNotes({ search: query, limit });
  }

  /**
   * Archive/unarchive a note
   */
  async toggleArchive(uuid: string, archived: boolean): Promise<Note> {
    const response = await apiService.patch<Note>(`/notes/${uuid}/archive?archive=${archived}`);
    return response.data;
  }

  /**
   * Get notes by tag
   */
  async getNotesByTag(tag: string, limit: number = 50): Promise<NoteSummary[]> {
    return await this.listNotes({ tag, limit });
  }

  /**
   * Get notes with file attachments
   */
  async getNotesWithFiles(limit: number = 50): Promise<NoteSummary[]> {
    return await this.listNotes({ has_files: true, limit });
  }

  /**
   * Get recent notes
   */
  async getRecentNotes(limit: number = 10): Promise<NoteSummary[]> {
    return await this.listNotes({ limit, archived: false });
  }

  // --- File Attachment Methods ---

  /**
   * Get all files attached to a note
   */
  async getNoteFiles(noteUuid: string): Promise<NoteFile[]> {
    const response = await apiService.get<NoteFile[]>(`/notes/${noteUuid}/files`);
    return response.data;
  }

  /**
   * Upload a file and attach it to a note
   */
  async uploadFile(
    file: File, 
    noteUuid: string,
    description?: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<NoteFile> {
    // For small files, we could use direct upload, but let's use chunked upload consistently
    const fileId = await coreUploadService.uploadFile(file, {
      module: 'notes',
      onProgress
    });

    // Commit the upload to the note using the UUID directly
    // JSON body must use camelCase (converted by CamelCaseModel)
    const response = await apiService.post<NoteFile>('/notes/files/upload/commit', {
      fileId: fileId,
      noteUuid: noteUuid,
      description
    });

    return response.data;
  }

  /**
   * Download a note file attachment
   */
  async downloadFile(fileUuid: string, onProgress?: (p: DownloadProgress) => void): Promise<Blob> {
    const url = `/notes/files/${fileUuid}/download`;
    return coreDownloadService.downloadFile(url, { fileId: fileUuid, onProgress });
  }

  /**
   * Get download URL for a file attachment
   */
  getFileDownloadUrl(fileUuid: string): string {
    return `${apiService.getAxiosInstance().defaults.baseURL}/notes/files/${fileUuid}/download`;
  }

  /**
   * Delete a file attachment
   */
  async deleteFile(fileUuid: string): Promise<{ message: string }> {
    const response = await apiService.delete<{ message: string }>(`/notes/files/${fileUuid}`);
    return response.data;
  }

  /**
   * Get links extracted from a note's content
   */
  async getNoteLinks(uuid: string): Promise<any[]> {
    const response = await apiService.get<any[]>(`/notes/${uuid}/links`);
    return response.data;
  }



  /**
   * Get file icon based on MIME type
   */
  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📊';
    if (mimeType.startsWith('text/')) return '📄';
    return '📎';
  }

  }

export const notesService = new NotesService(); 