import { apiService } from './api';

export interface RecycleBinItem {
  uuid: string;
  type: 'project' | 'note' | 'todo' | 'document' | 'diary' | 'archive';
  title: string;
  deletedAt?: string;
  description?: string;
  tags?: string[];
  status?: string;
  priority?: string;
  dueDate?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectResponse {
  uuid: string;
  name: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  tags: string[];
}

export interface NoteResponse {
  uuid: string;
  title: string;
  content: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  tags: string[];
  projectUuids: string[];
}

export interface TodoResponse {
  uuid: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  tags: string[];
  projectUuid?: string;
  parentUuid?: string;
}

export interface DocumentResponse {
  uuid: string;
  title: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  tags: string[];
  isArchived: boolean;
}

export interface DiaryEntryResponse {
  uuid: string;
  title: string;
  content: string;
  mood?: string;
  weather?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  tags: string[];
  documentUuids: string[];
}

export interface ArchiveItemResponse {
  uuid: string;
  name: string;
  description?: string;
  type: 'folder' | 'file';
  parentUuid?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  tags: string[];
  filePath?: string;
  fileSize?: number;
  mimeType?: string;
}

class RecycleBinService {
  /**
   * Fetch all deleted items across all modules
   */
  async getAllDeletedItems(): Promise<RecycleBinItem[]> {
    try {
      const [projects, notes, todos, documents, diary, archive] = await Promise.all([
        this.getDeletedProjects(),
        this.getDeletedNotes(),
        this.getDeletedTodos(),
        this.getDeletedDocuments(),
        this.getDeletedDiaryEntries(),
        this.getDeletedArchiveItems()
      ]);

      const allItems: RecycleBinItem[] = [
        ...projects.map(item => ({ ...item, type: 'project' as const, title: item.name })),
        ...notes.map(item => ({ ...item, type: 'note' as const, title: item.title })),
        ...todos.map(item => ({ ...item, type: 'todo' as const, title: item.title })),
        ...documents.map(item => ({ ...item, type: 'document' as const, title: item.title })),
        ...diary.map(item => ({ ...item, type: 'diary' as const, title: item.title })),
        ...archive.map(item => ({ ...item, type: 'archive' as const, title: item.name }))
      ];

      // Sort by deletion date (most recent first)
      return allItems.sort((a, b) => {
        const dateA = new Date(a.deletedAt || a.updatedAt || 0).getTime();
        const dateB = new Date(b.deletedAt || b.updatedAt || 0).getTime();
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Error fetching all deleted items:', error);
      throw error;
    }
  }

  /**
   * Fetch ALL items (active + deleted) for management view
   */
  async getAllItems(): Promise<RecycleBinItem[]> {
    try {
      const [projects, notes, todos, documents, diary, archive] = await Promise.all([
        this.getAllProjects(),
        this.getAllNotes(),
        this.getAllTodos(),
        this.getAllDocuments(),
        this.getAllDiaryEntries(),
        this.getAllArchiveItems()
      ]);

      const allItems: RecycleBinItem[] = [
        ...projects.map(item => ({ ...item, type: 'project' as const, title: item.name })),
        ...notes.map(item => ({ ...item, type: 'note' as const, title: item.title })),
        ...todos.map(item => ({ ...item, type: 'todo' as const, title: item.title })),
        ...documents.map(item => ({ ...item, type: 'document' as const, title: item.title })),
        ...diary.map(item => ({ ...item, type: 'diary' as const, title: item.title })),
        ...archive.map(item => ({ ...item, type: 'archive' as const, title: item.name }))
      ];

      // Sort by updated date (most recent first)
      return allItems.sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return dateB - dateA;
      });
    } catch (error) {
      console.error('Error fetching all items:', error);
      throw error;
    }
  }

  /**
   * Fetch deleted projects
   */
  async getDeletedProjects(): Promise<ProjectResponse[]> {
    try {
      const response = await apiService.get<ProjectResponse[]>('/api/v1/projects/deleted');
      return response.data;
    } catch (error) {
      console.error('Error fetching deleted projects:', error);
      throw error;
    }
  }

  /**
   * Fetch deleted notes
   */
  async getDeletedNotes(): Promise<NoteResponse[]> {
    try {
      const response = await apiService.get<NoteResponse[]>('/api/v1/notes/deleted');
      return response.data;
    } catch (error) {
      console.error('Error fetching deleted notes:', error);
      throw error;
    }
  }

  /**
   * Fetch deleted todos
   */
  async getDeletedTodos(): Promise<TodoResponse[]> {
    try {
      const response = await apiService.get<TodoResponse[]>('/api/v1/todos/deleted');
      return response.data;
    } catch (error) {
      console.error('Error fetching deleted todos:', error);
      throw error;
    }
  }

  /**
   * Fetch deleted documents
   */
  async getDeletedDocuments(): Promise<DocumentResponse[]> {
    try {
      const response = await apiService.get<DocumentResponse[]>('/api/v1/documents/deleted');
      return response.data;
    } catch (error) {
      console.error('Error fetching deleted documents:', error);
      throw error;
    }
  }

  /**
   * Fetch deleted diary entries
   */
  async getDeletedDiaryEntries(): Promise<DiaryEntryResponse[]> {
    try {
      const response = await apiService.get<DiaryEntryResponse[]>('/api/v1/diary/entries/deleted');
      return response.data;
    } catch (error) {
      console.error('Error fetching deleted diary entries:', error);
      throw error;
    }
  }

  /**
   * Fetch deleted archive items
   */
  async getDeletedArchiveItems(): Promise<ArchiveItemResponse[]> {
    try {
      const response = await apiService.get<ArchiveItemResponse[]>('/api/v1/archive/items/deleted');
      return response.data;
    } catch (error) {
      console.error('Error fetching deleted archive items:', error);
      throw error;
    }
  }

  // ===== NEW: "All" methods for showAll=true mode =====

  /**
   * Fetch ALL projects (active + deleted) for management view
   */
  async getAllProjects(): Promise<ProjectResponse[]> {
    try {
      const response = await apiService.get<ProjectResponse[]>('/api/v1/projects');
      return response.data;
    } catch (error) {
      console.error('Error fetching all projects:', error);
      throw error;
    }
  }

  /**
   * Fetch ALL notes (active + deleted) for management view
   */
  async getAllNotes(): Promise<NoteResponse[]> {
    try {
      const response = await apiService.get<NoteResponse[]>('/api/v1/notes');
      return response.data;
    } catch (error) {
      console.error('Error fetching all notes:', error);
      throw error;
    }
  }

  /**
   * Fetch ALL todos (active + deleted) for management view
   */
  async getAllTodos(): Promise<TodoResponse[]> {
    try {
      const response = await apiService.get<TodoResponse[]>('/api/v1/todos');
      return response.data;
    } catch (error) {
      console.error('Error fetching all todos:', error);
      throw error;
    }
  }

  /**
   * Fetch ALL documents (active + deleted) for management view
   */
  async getAllDocuments(): Promise<DocumentResponse[]> {
    try {
      const response = await apiService.get<DocumentResponse[]>('/api/v1/documents');
      return response.data;
    } catch (error) {
      console.error('Error fetching all documents:', error);
      throw error;
    }
  }

  /**
   * Fetch ALL diary entries (active + deleted) for management view
   * NOTE: Uses regular diary endpoint - RecycleBinPage handles showAll logic
   */
  async getAllDiaryEntries(): Promise<DiaryEntryResponse[]> {
    try {
      const response = await apiService.get<DiaryEntryResponse[]>('/api/v1/diary/entries');
      return response.data;
    } catch (error) {
      console.error('Error fetching all diary entries:', error);
      throw error;
    }
  }

  /**
   * Fetch ALL archive items (active + deleted) for management view
   */
  async getAllArchiveItems(): Promise<ArchiveItemResponse[]> {
    try {
      const response = await apiService.get<ArchiveItemResponse[]>('/api/v1/archive/items');
      return response.data;
    } catch (error) {
      console.error('Error fetching all archive items:', error);
      throw error;
    }
  }

  /**
   * Restore a project
   */
  async restoreProject(uuid: string): Promise<void> {
    try {
      await apiService.post(`/api/v1/projects/${uuid}/restore`);
    } catch (error) {
      console.error('Error restoring project:', error);
      throw error;
    }
  }

  /**
   * Restore a note
   */
  async restoreNote(uuid: string): Promise<void> {
    try {
      await apiService.post(`/api/v1/notes/${uuid}/restore`);
    } catch (error) {
      console.error('Error restoring note:', error);
      throw error;
    }
  }

  /**
   * Restore a todo
   */
  async restoreTodo(uuid: string): Promise<void> {
    try {
      await apiService.post(`/api/v1/todos/${uuid}/restore`);
    } catch (error) {
      console.error('Error restoring todo:', error);
      throw error;
    }
  }

  /**
   * Restore a document
   */
  async restoreDocument(uuid: string): Promise<void> {
    try {
      await apiService.post(`/api/v1/documents/${uuid}/restore`);
    } catch (error) {
      console.error('Error restoring document:', error);
      throw error;
    }
  }

  /**
   * Restore a diary entry
   */
  async restoreDiaryEntry(uuid: string): Promise<void> {
    try {
      await apiService.post(`/api/v1/diary/entries/${uuid}/restore`);
    } catch (error) {
      console.error('Error restoring diary entry:', error);
      throw error;
    }
  }

  /**
   * Restore an archive item
   */
  async restoreArchiveItem(uuid: string): Promise<void> {
    try {
      await apiService.post(`/api/v1/archive/items/${uuid}/restore`);
    } catch (error) {
      console.error('Error restoring archive item:', error);
      throw error;
    }
  }

  /**
   * Permanently delete a project
   */
  async permanentDeleteProject(uuid: string): Promise<void> {
    try {
      await apiService.delete(`/api/v1/projects/${uuid}/permanent`);
    } catch (error) {
      console.error('Error permanently deleting project:', error);
      throw error;
    }
  }

  /**
   * Permanently delete a note
   */
  async permanentDeleteNote(uuid: string): Promise<void> {
    try {
      await apiService.delete(`/api/v1/notes/${uuid}/permanent`);
    } catch (error) {
      console.error('Error permanently deleting note:', error);
      throw error;
    }
  }

  /**
   * Permanently delete a todo
   */
  async permanentDeleteTodo(uuid: string): Promise<void> {
    try {
      await apiService.delete(`/api/v1/todos/${uuid}/permanent`);
    } catch (error) {
      console.error('Error permanently deleting todo:', error);
      throw error;
    }
  }

  /**
   * Permanently delete a document
   */
  async permanentDeleteDocument(uuid: string): Promise<void> {
    try {
      await apiService.delete(`/api/v1/documents/${uuid}/permanent`);
    } catch (error) {
      console.error('Error permanently deleting document:', error);
      throw error;
    }
  }

  /**
   * Permanently delete a diary entry
   */
  async permanentDeleteDiaryEntry(uuid: string): Promise<void> {
    try {
      await apiService.delete(`/api/v1/diary/entries/${uuid}/permanent`);
    } catch (error) {
      console.error('Error permanently deleting diary entry:', error);
      throw error;
    }
  }

  /**
   * Permanently delete an archive item
   */
  async permanentDeleteArchiveItem(uuid: string): Promise<void> {
    try {
      await apiService.delete(`/api/v1/archive/items/${uuid}/permanent`);
    } catch (error) {
      console.error('Error permanently deleting archive item:', error);
      throw error;
    }
  }

  /**
   * Empty the entire recycle bin
   */
  async emptyRecycleBin(): Promise<{ deletedCount: number }> {
    try {
      const response = await apiService.post<{ deletedCount: number }>('/api/v1/recycle-bin/empty');
      return response.data;
    } catch (error) {
      console.error('Error emptying recycle bin:', error);
      throw error;
    }
  }

  /**
   * Restore an item based on its type
   */
  async restoreItem(item: RecycleBinItem): Promise<void> {
    switch (item.type) {
      case 'project':
        return this.restoreProject(item.uuid);
      case 'note':
        return this.restoreNote(item.uuid);
      case 'todo':
        return this.restoreTodo(item.uuid);
      case 'document':
        return this.restoreDocument(item.uuid);
      case 'diary':
        return this.restoreDiaryEntry(item.uuid);
      case 'archive':
        return this.restoreArchiveItem(item.uuid);
      default:
        throw new Error(`Unknown item type: ${item.type}`);
    }
  }

  /**
   * Permanently delete an item based on its type
   */
  async permanentDeleteItem(item: RecycleBinItem): Promise<void> {
    switch (item.type) {
      case 'project':
        return this.permanentDeleteProject(item.uuid);
      case 'note':
        return this.permanentDeleteNote(item.uuid);
      case 'todo':
        return this.permanentDeleteTodo(item.uuid);
      case 'document':
        return this.permanentDeleteDocument(item.uuid);
      case 'diary':
        return this.permanentDeleteDiaryEntry(item.uuid);
      case 'archive':
        return this.permanentDeleteArchiveItem(item.uuid);
      default:
        throw new Error(`Unknown item type: ${item.type}`);
    }
  }
}

export default new RecycleBinService();