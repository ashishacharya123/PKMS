import { apiService } from './api';
import { coreUploadService, UploadProgress } from './shared/coreUploadService';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';

import { ArchiveItem, ArchiveFolder } from '../types/archive';
import { FolderTree } from '../types/archive';

/* -------------------------------------------------------------------------- */
/*                               API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
const API_PREFIX = '/archive';
const FOLDERS_ENDPOINT = `${API_PREFIX}/folders/`;
const UPLOAD_COMMIT_ENDPOINT = `${API_PREFIX}/upload/commit`;

// Helper to build folder-scoped routes
const folderPath = (folderUuid: string) => `${FOLDERS_ENDPOINT}${folderUuid}/`;
const folderItemsPath = (folderUuid: string) => `${folderPath(folderUuid)}items/`;

/* -------------------------------------------------------------------------- */
/*                              HELPER FUNCTIONS                              */
/* -------------------------------------------------------------------------- */
// Extract base filename without extension – handles no-extension & multi-dot names.
const getBaseName = (filename: string): string => {
  const lastDot = filename.lastIndexOf('.');
  return lastDot === -1 ? filename : filename.substring(0, lastDot);
};

// Removed custom error handling - letting apiService handle all errors consistently

/* -------------------------------------------------------------------------- */
/*                               UPLOAD HELPERS                               */
/* -------------------------------------------------------------------------- */

// Unified upload function - uses chunking service for ALL files (no size distinction)
const uploadFileUnified = async (
  file: File,
  folderUuid: string,
  tags: string[] = [],
  onProgress?: (progress: UploadProgress) => void,
): Promise<ArchiveItem> => {
  // Use chunked upload for ALL files
  const fileId = await coreUploadService.uploadFile(file, {
    module: 'archive',
    additionalMeta: { folder_uuid: folderUuid },
    onProgress,
  });

  const commitData = {
    file_id: fileId,
    folder_uuid: folderUuid,
    name: getBaseName(file.name),
    description: '',
    tags: tags
  };

  const response = await apiService.post<ArchiveItem>(UPLOAD_COMMIT_ENDPOINT, commitData);
  return response.data;
};

// Multiple files upload function
const uploadMultipleFiles = async (
  files: File[],
  folderUuid: string,
  tags: string[] = [],
  onProgress?: (progress: { fileIndex: number; fileName: string; progress: UploadProgress }) => void,
): Promise<ArchiveItem[]> => {
  const results: ArchiveItem[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const result = await uploadFileUnified(
        file,
        folderUuid,
        tags,
        (progress) => {
          onProgress?.({
            fileIndex: i,
            fileName: file.name,
            progress
          });
        }
      );
      results.push(result);
    } catch (error) {
      console.error(`Failed to upload ${file.name}:`, error);
      // Continue with other files even if one fails
    }
  }
  
  return results;
};

/* -------------------------------------------------------------------------- */
/*                              PUBLIC SERVICE                                */
/* -------------------------------------------------------------------------- */
export const archiveService = {
  async listFolders(parentUuid?: string): Promise<ArchiveFolder[]> {
    const qs = parentUuid ? `?parent_uuid=${encodeURIComponent(parentUuid)}` : '';
    const { data } = await apiService.get<ArchiveFolder[]>(`${FOLDERS_ENDPOINT}${qs}`);
    return data;
  },

  async getFolderTree(rootUuid?: string): Promise<FolderTree[]> {
    const qs = rootUuid ? `?root_uuid=${encodeURIComponent(rootUuid)}` : '';
    const { data } = await apiService.get<FolderTree[]>(`${API_PREFIX}/folders/tree${qs}`);
    return data;
  },

  async getFolder(uuid: string): Promise<ArchiveFolder> {
    const { data } = await apiService.get<ArchiveFolder>(folderPath(uuid));
    return data;
  },

  async createFolder(name: string, parentUuid?: string, description?: string): Promise<ArchiveFolder> {
    const payload: any = { name };
    if (parentUuid) payload.parent_uuid = parentUuid;
    if (description !== undefined) payload.description = description;
    const { data } = await apiService.post<ArchiveFolder>(FOLDERS_ENDPOINT, payload);
    return data;
  },

  async updateFolder(uuid: string, data: Partial<ArchiveFolder>): Promise<ArchiveFolder> {
    const resp = await apiService.put<ArchiveFolder>(folderPath(uuid), data);
    return resp.data;
  },

  async deleteFolder(uuid: string): Promise<void> {
    await apiService.delete(folderPath(uuid));
  },

  async getFolderItems(folderUuid: string): Promise<ArchiveItem[]> {
    const { data } = await apiService.get<ArchiveItem[]>(folderItemsPath(folderUuid));
    return data;
  },

  async uploadFile(
    file: File,
    folderUuid: string,
    tags: string[] = [],
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<ArchiveItem> {
    return uploadFileUnified(file, folderUuid, tags, onProgress);
  },

  async uploadMultipleFiles(
    files: File[],
    folderUuid: string,
    tags: string[] = [],
    onProgress?: (progress: { fileIndex: number; fileName: string; progress: UploadProgress }) => void,
  ): Promise<ArchiveItem[]> {
    return uploadMultipleFiles(files, folderUuid, tags, onProgress);
  },

  async searchFoldersFTS(query: string): Promise<FolderTree[]> {
    const { data } = await apiService.get<FolderTree[]>(`${API_PREFIX}/folders/tree?search=${encodeURIComponent(query)}`);
    return data;
  },

  // Convenience helper for direct download links
  getDownloadUrl(itemUuid: string): string {
    return `${API_PREFIX}/items/${itemUuid}/download`;
  },

  async downloadItem(
    itemUuid: string,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<Blob> {
    const url = this.getDownloadUrl(itemUuid);
    return coreDownloadService.downloadFile(url, { fileId: itemUuid, onProgress });
  },

  // New management endpoints
  async renameFolder(folderUuid: string, newName: string): Promise<any> {
    const formData = new FormData();
    formData.append('new_name', newName);
    return apiService.patch(`${API_PREFIX}/folders/${folderUuid}/rename`, formData);
  },

  async renameItem(itemUuid: string, newName: string): Promise<any> {
    const formData = new FormData();
    formData.append('new_name', newName);
    return apiService.patch(`${API_PREFIX}/items/${itemUuid}/rename`, formData);
  },

  async deleteItem(itemUuid: string): Promise<any> {
    return apiService.delete(`${API_PREFIX}/items/${itemUuid}`);
  },

  async downloadFolder(folderUuid: string): Promise<any> {
    return apiService.get(`${API_PREFIX}/folders/${folderUuid}/download`);
  },
}; 