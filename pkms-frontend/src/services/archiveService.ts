import { apiService } from './api';

// Types for archive
export interface ArchiveFolder {
  uuid: string;
  name: string;
  description?: string;
  parent_uuid?: string;
  path: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  item_count: number;
  subfolder_count: number;
  total_size: number;
}

export interface ArchiveItem {
  uuid: string;
  name: string;
  description?: string;
  folder_uuid: string;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  file_size: number;
  extracted_text?: string;
  metadata: Record<string, any>;
  thumbnail_path?: string;
  is_archived: boolean;
  is_favorite: boolean;
  version: string;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface ArchiveItemSummary {
  uuid: string;
  name: string;
  folder_uuid: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  is_archived: boolean;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  preview: string;
}

export interface FolderCreate {
  name: string;
  description?: string;
  parent_uuid?: string;
}

export interface FolderUpdate {
  name?: string;
  description?: string;
  is_archived?: boolean;
}

export interface ItemUpdate {
  name?: string;
  description?: string;
  folder_uuid?: string;
  tags?: string[];
  is_archived?: boolean;
  is_favorite?: boolean;
}

export interface FolderTree {
  folder: ArchiveFolder;
  children: FolderTree[];
  items: ArchiveItemSummary[];
}

export interface UploadItemData {
  file: File;
  name?: string;
  description?: string;
  tags?: string[];
}

export interface SearchResult {
  uuid: string;
  name: string;
  original_filename: string;
  mime_type: string;
  highlight: string;
  folder_uuid: string;
  created_at: string;
}

export interface ArchiveListParams {
  parent_uuid?: string;
  archived?: boolean;
  search?: string;
  mime_type?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

class ArchiveService {
  private baseUrl = '/archive';

  // Folder methods
  async createFolder(folderData: FolderCreate): Promise<ArchiveFolder> {
    return await apiService.post<ArchiveFolder>(`${this.baseUrl}/folders`, folderData);
  }

  async getFolders(params: ArchiveListParams = {}): Promise<ArchiveFolder[]> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `${this.baseUrl}/folders${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return await apiService.get<ArchiveFolder[]>(url);
  }

  async getFolderTree(rootUuid?: string, archived = false): Promise<FolderTree[]> {
    const queryParams = new URLSearchParams();
    if (rootUuid) queryParams.append('root_uuid', rootUuid);
    if (archived) queryParams.append('archived', 'true');

    const url = `${this.baseUrl}/folders/tree${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return await apiService.get<FolderTree[]>(url);
  }

  async getFolder(uuid: string): Promise<ArchiveFolder> {
    return await apiService.get<ArchiveFolder>(`${this.baseUrl}/folders/${uuid}`);
  }

  async updateFolder(uuid: string, data: FolderUpdate): Promise<ArchiveFolder> {
    return await apiService.put<ArchiveFolder>(`${this.baseUrl}/folders/${uuid}`, data);
  }

  async deleteFolder(uuid: string, force = false): Promise<{ message: string }> {
    const params = force ? '?force=true' : '';
    return await apiService.delete<{ message: string }>(`${this.baseUrl}/folders/${uuid}${params}`);
  }

  // Item methods
  async uploadItem(folderUuid: string, uploadData: UploadItemData): Promise<ArchiveItem> {
    const formData = new FormData();
    formData.append('file', uploadData.file);
    
    if (uploadData.name) formData.append('name', uploadData.name);
    if (uploadData.description) formData.append('description', uploadData.description);
    if (uploadData.tags?.length) {
      formData.append('tags', JSON.stringify(uploadData.tags));
    }

    // Use the axios instance directly for form data upload
    const axios = apiService.getAxiosInstance();
    const response = await axios.post(`${this.baseUrl}/folders/${folderUuid}/items`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  async getFolderItems(folderUuid: string, params: ArchiveListParams = {}): Promise<ArchiveItemSummary[]> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `${this.baseUrl}/folders/${folderUuid}/items${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return await apiService.get<ArchiveItemSummary[]>(url);
  }

  async getItem(uuid: string): Promise<ArchiveItem> {
    return await apiService.get<ArchiveItem>(`${this.baseUrl}/items/${uuid}`);
  }

  async updateItem(uuid: string, data: ItemUpdate): Promise<ArchiveItem> {
    return await apiService.put<ArchiveItem>(`${this.baseUrl}/items/${uuid}`, data);
  }

  async deleteItem(uuid: string): Promise<{ message: string }> {
    return await apiService.delete<{ message: string }>(`${this.baseUrl}/items/${uuid}`);
  }

  async downloadItem(uuid: string): Promise<Blob> {
    const axios = apiService.getAxiosInstance();
    const response = await axios.get(`${this.baseUrl}/items/${uuid}/download`, {
      responseType: 'blob'
    });
    return response.data;
  }

  getDownloadUrl(uuid: string): string {
    return `${apiService.getAxiosInstance().defaults.baseURL}${this.baseUrl}/items/${uuid}/download`;
  }

  // Search methods
  async searchArchive(query: string, params: {
    folder_uuid?: string;
    mime_type?: string;
    limit?: number;
  } = {}): Promise<{
    results: SearchResult[];
    total: number;
  }> {
    const queryParams = new URLSearchParams();
    queryParams.append('query', query);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `${this.baseUrl}/search?${queryParams.toString()}`;
    return await apiService.get<{
      results: SearchResult[];
      total: number;
    }>(url);
  }

  // Utility methods
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📋';
    if (mimeType === 'text/plain') return '📃';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('tar')) return '🗜️';
    return '📎';
  }

  getSupportedFileTypes(): string[] {
    return [
      // Documents
      '.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt',
      // Spreadsheets
      '.xls', '.xlsx', '.csv', '.ods',
      // Presentations
      '.ppt', '.pptx', '.odp',
      // Images
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',
      // Audio
      '.mp3', '.wav', '.ogg', '.m4a', '.flac',
      // Video
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
      // Archives
      '.zip', '.rar', '.7z', '.tar', '.gz',
      // Code
      '.js', '.ts', '.py', '.java', '.cpp', '.c', '.html', '.css', '.json', '.xml'
    ];
  }

  isFileTypeSupported(fileName: string): boolean {
    const extension = '.' + fileName.split('.').pop()?.toLowerCase();
    return this.getSupportedFileTypes().includes(extension);
  }

  getBreadcrumbPath(folder: ArchiveFolder): string[] {
    return folder.path.split('/').filter(part => part.length > 0);
  }

  getFolderDepth(folder: ArchiveFolder): number {
    return folder.path.split('/').filter(part => part.length > 0).length;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  formatDateTime(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }

  canMoveToFolder(sourceFolder: ArchiveFolder, targetFolder: ArchiveFolder): boolean {
    // Prevent moving a folder into itself or its children
    return !targetFolder.path.startsWith(sourceFolder.path + '/') && 
           targetFolder.uuid !== sourceFolder.uuid;
  }

  validateFolderName(name: string): { isValid: boolean; error?: string } {
    if (!name.trim()) {
      return { isValid: false, error: 'Folder name cannot be empty' };
    }

    if (name.length > 255) {
      return { isValid: false, error: 'Folder name too long (max 255 characters)' };
    }

    const unsafeChars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    const hasUnsafeChar = unsafeChars.some(char => name.includes(char));
    
    if (hasUnsafeChar) {
      return { 
        isValid: false, 
        error: `Folder name cannot contain: ${unsafeChars.join(' ')}` 
      };
    }

    return { isValid: true };
  }

  // Helper to build folder tree structure
  buildFolderHierarchy(folders: ArchiveFolder[], rootUuid?: string): FolderTree[] {
    const folderMap = new Map<string, ArchiveFolder>();
    const children = new Map<string, ArchiveFolder[]>();

    // Build maps
    folders.forEach(folder => {
      folderMap.set(folder.uuid, folder);
      
      const parentUuid = folder.parent_uuid || 'root';
      if (!children.has(parentUuid)) {
        children.set(parentUuid, []);
      }
      children.get(parentUuid)!.push(folder);
    });

    // Build tree recursively
    const buildTree = (parentUuid: string): FolderTree[] => {
      const childFolders = children.get(parentUuid) || [];
      return childFolders.map(folder => ({
        folder,
        children: buildTree(folder.uuid),
        items: [] // Items would be loaded separately when needed
      }));
    };

    return buildTree(rootUuid || 'root');
  }
}

export const archiveService = new ArchiveService(); 