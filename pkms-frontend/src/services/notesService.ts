/**
 * Notes Service with File Attachment Support
 */

import { apiService } from './api';
import { coreUploadService, UploadProgress } from './shared/coreUploadService';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';

// Removed SMALL_FILE_THRESHOLD since we're using chunked upload consistently

export interface ProjectBadge {
  id: number | null;  // null if project is deleted
  name: string;
  color: string;
  isExclusive: boolean;
  isDeleted: boolean;  // True if project was deleted (using snapshot name)
}

export interface Note {
  id: number;
  uuid: string;
  title: string;
  content: string;
  file_count: number;
  is_favorite: boolean;
  is_archived: boolean;
  isExclusiveMode: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  projects: ProjectBadge[];
  
  // NEW: Additional fields
  note_type?: string;
  version?: number;
}

export interface NoteSummary {
  id: number;
  uuid: string;
  title: string;
  file_count: number;
  is_favorite: boolean;
  is_archived: boolean;
  isExclusiveMode: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  preview: string;
  projects: ProjectBadge[];
  
  // NEW: Additional fields
  note_type?: string;
  version?: number;
}

export interface NoteFile {
  uuid: string;
  note_uuid: string;
  filename: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  description?: string;
  created_at: string;
}

export interface CreateNoteRequest {
  title: string;
  content: string;
  tags?: string[];
  projectIds?: string[];
  isExclusiveMode?: boolean;
}

export interface UpdateNoteRequest {
  title?: string;
  content?: string;
  tags?: string[];
  is_archived?: boolean;
  is_favorite?: boolean;
  projectIds?: string[];
  isExclusiveMode?: boolean;
}

export interface UploadFileRequest {
  file: File;
  noteId: number;
  description?: string;
}

class NotesService {
  /**
   * Create a new note
   */
  async createNote(data: CreateNoteRequest): Promise<Note> {
    const response = await apiService.post<Note>('/notes/', data);
    // Invalidate search cache for notes
    // searchService.invalidateCacheForContentType('note'); // Method removed in search refactor
    return response.data;
  }

  /**
   * Get a specific note by ID
   */
  async getNote(uuid: string): Promise<Note> {
    const response = await apiService.get<Note>(`/notes/${uuid}`);
    return response.data;
  }

  /**
   * Update a note
   */
  async updateNote(uuid: string, data: UpdateNoteRequest): Promise<Note> {
    const response = await apiService.put<Note>(`/notes/${uuid}`, data);
    // Invalidate search cache for notes
    // searchService.invalidateCacheForContentType('note'); // Method removed in search refactor
    return response.data;
  }

  /**
   * Delete a note
   */
  async deleteNote(uuid: string): Promise<void> {
    await apiService.delete(`/notes/${uuid}`);
    // Invalidate search cache for notes
    // searchService.invalidateCacheForContentType('note'); // Method removed in search refactor
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
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

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
    const response = await apiService.post<NoteFile>('/notes/files/upload/commit', {
      file_id: fileId,
      note_uuid: noteUuid,
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
}

export const notesService = new NotesService(); 