/**
 * Notes Service - API communication for notes module
 */

import { apiService } from './api';

export interface Note {
  id: number;
  title: string;
  content: string;
  area: string;
  year: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  backlinks: Link[];
  links: Link[];
}

export interface NoteSummary {
  id: number;
  title: string;
  area: string;
  year: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  preview: string;
}

export interface Link {
  id: number;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  link_type: string;
  description: string;
  created_at: string;
}

export interface CreateNoteRequest {
  title: string;
  content: string;
  area?: string;
  tags?: string[];
}

export interface UpdateNoteRequest {
  title?: string;
  content?: string;
  area?: string;
  tags?: string[];
  is_archived?: boolean;
}

export interface NotesListResponse {
  notes: NoteSummary[];
  total: number;
}

export interface Area {
  name: string;
  count: number;
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
    area?: string;
    year?: number;
    archived?: boolean;
    tag?: string;
    search?: string;
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
   * Get list of all areas with note counts
   */
  async getAreas(): Promise<{ areas: Area[] }> {
    const response = await apiService.get<{ areas: Area[] }>('/notes/areas/list');
    return response.data;
  }

  /**
   * Get links for a specific note
   */
  async getNoteLinks(id: number): Promise<{
    outgoing_links: Link[];
    incoming_links: Link[];
  }> {
    return await apiService.get(`/notes/${id}/links`);
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
   * Get notes by area
   */
  async getNotesByArea(area: string, limit: number = 50): Promise<NoteSummary[]> {
    return await this.listNotes({ area, limit });
  }

  /**
   * Get notes by tag
   */
  async getNotesByTag(tag: string, limit: number = 50): Promise<NoteSummary[]> {
    return await this.listNotes({ tag, limit });
  }

  /**
   * Get recent notes
   */
  async getRecentNotes(limit: number = 10): Promise<NoteSummary[]> {
    return await this.listNotes({ limit, archived: false });
  }
}

export const notesService = new NotesService(); 