/**
 * Notes Service with File Attachment Support
 */

import { apiService } from './api';
import { coreUploadService, UploadProgress } from './shared/coreUploadService';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';

const SMALL_FILE_THRESHOLD = 3 * 1024 * 1024; // 3 MB

export interface Note {
  id: number;
  title: string;
  content: string;
  content_type: string;
  file_count: number;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface NoteSummary {
  id: number;
  title: string;
  file_count: number;
  is_favorite: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  preview: string;
}

export interface NoteFile {
  id: number;
  note_id: number;
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
}

export interface UpdateNoteRequest {
  title?: string;
  content?: string;
  tags?: string[];
  is_archived?: boolean;
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
    return response.data;
  }

  /**
   * Get a specific note by ID
   */
  async getNote(id: number): Promise<Note> {
    const response = await apiService.get<Note>(`/notes/${id}`);
    return response.data;
  }

  /**
   * Update a note
   */
  async updateNote(id: number, data: UpdateNoteRequest): Promise<Note> {
    const response = await apiService.put<Note>(`/notes/${id}`, data);
    return response.data;
  }

  /**
   * Delete a note
   */
  async deleteNote(id: number): Promise<{ message: string }> {
    const response = await apiService.delete<{ message: string }>(`/notes/${id}`);
    return response.data;
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
  async toggleArchive(id: number, archived: boolean): Promise<Note> {
    return await this.updateNote(id, { is_archived: archived });
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
  async getNoteFiles(noteId: number): Promise<NoteFile[]> {
    const response = await apiService.get<NoteFile[]>(`/notes/${noteId}/files`);
    return response.data;
  }

  /**
   * Upload a file and attach it to a note
   */
  async uploadFile(
    file: File, 
    noteId: number,
    description?: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<NoteFile> {
    // For small files, we could use direct upload, but let's use chunked upload consistently
    const fileId = await coreUploadService.uploadFile(file, {
      module: 'notes',
      onProgress
    });

    // Commit the upload to the note
    const response = await apiService.post<NoteFile>('/notes/files/upload/commit', {
      file_id: fileId,
      note_id: noteId,
      description
    });

    return response.data;
  }

  /**
   * Download a note file attachment
   */
  async downloadFile(fileId: number, onProgress?: (p: DownloadProgress) => void): Promise<Blob> {
    const url = `/notes/files/${fileId}/download`;
    return coreDownloadService.downloadFile(url, { fileId: String(fileId), onProgress });
  }

  /**
   * Get download URL for a file attachment
   */
  getFileDownloadUrl(fileId: number): string {
    return `${apiService.getAxiosInstance().defaults.baseURL}/notes/files/${fileId}/download`;
  }

  /**
   * Delete a file attachment
   */
  async deleteFile(fileId: number): Promise<{ message: string }> {
    const response = await apiService.delete<{ message: string }>(`/notes/files/${fileId}`);
    return response.data;
  }

  /**
   * Get links extracted from a note's content
   */
  async getNoteLinks(id: number): Promise<any[]> {
    const response = await apiService.get<any[]>(`/notes/${id}/links`);
    return response.data;
  }

  /**
   * Download a note as file (e.g., markdown export)
   */
  getDownloadUrl(id: number): string {
    return `/notes/${id}/download`;
  }

  async downloadNote(id: number, onProgress?: (p: DownloadProgress) => void): Promise<Blob> {
    return coreDownloadService.downloadFile(this.getDownloadUrl(id), { fileId: String(id), onProgress });
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