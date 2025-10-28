import { apiService } from './api';
import { coreUploadService, UploadProgress } from './shared/coreUploadService';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';

import { ArchiveItem, ArchiveFolder, FolderCreate } from '../types/archive';
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
    additionalMeta: { folderUuid: folderUuid },
    onProgress,
  });

  const commitData = {
    fileId: fileId,
    folderUuid: folderUuid,
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
): Promise<{ succeeded: Array<any>, failed: Array<{ file: string, error: string }> }> => {
  const results: Array<any> = [];
  const failed: Array<{ file: string, error: string }> = [];
  
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
            progress,
          });
        }
      );
      results.push({ success: true, item: result, filename: file.name });
    } catch (error) {
      failed.push({
        file: file.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  return { succeeded: results, failed };
};

/* -------------------------------------------------------------------------- */
/*                              PUBLIC SERVICE                                */
/* -------------------------------------------------------------------------- */
export const archiveService = {
  async listFolders(parentUuid?: string): Promise<ArchiveFolder[]> {
    // URL query parameter - remains snake_case (not converted by CamelCaseModel)
    const qs = parentUuid ? `?parent_uuid=${encodeURIComponent(parentUuid)}` : '';
    const { data } = await apiService.get<ArchiveFolder[]>(`${FOLDERS_ENDPOINT}${qs}`);
    return data;
  },

  async getFolderTree(rootUuid?: string): Promise<FolderTree[]> {
    // URL query parameter - remains snake_case
    const qs = rootUuid ? `?root_uuid=${encodeURIComponent(rootUuid)}` : '';
    const { data } = await apiService.get<FolderTree[]>(`${API_PREFIX}/folders/tree${qs}`);
    return data;
  },

  async getFolder(uuid: string): Promise<ArchiveFolder> {
    const { data } = await apiService.get<ArchiveFolder>(folderPath(uuid));
    return data;
  },

  async createFolder(name: string, parentUuid?: string, description?: string): Promise<ArchiveFolder> {
    const payload: FolderCreate = { name };
    if (parentUuid) payload.parentUuid = parentUuid;
    if (description !== undefined) payload.description = description;
    const { data } = await apiService.post<ArchiveFolder>(FOLDERS_ENDPOINT, payload);
    return data;
  },

  async updateFolder(uuid: string, data: Partial<ArchiveFolder>): Promise<ArchiveFolder> {
    const resp = await apiService.put<ArchiveFolder>(folderPath(uuid), data);
    return resp.data;
  },

  async updateItem(uuid: string, data: Partial<ArchiveItem>): Promise<ArchiveItem> {
    const resp = await apiService.put<ArchiveItem>(`${API_PREFIX}/items/${uuid}`, data);
    return resp.data;
  },

  async deleteFolder(uuid: string, force: boolean = false): Promise<void> {
    // URL query parameter - remains snake_case
    const url = force ? `${folderPath(uuid)}?force=true` : folderPath(uuid);
    await apiService.delete(url);
  },

  async getFolderItems(folderUuid: string, isDeleted?: boolean): Promise<ArchiveItem[]> {
    const params = new URLSearchParams();
    if (isDeleted !== undefined) {
      params.append('is_deleted', String(isDeleted));
    }
    const queryString = params.toString();
    const url = queryString ? `${folderItemsPath(folderUuid)}?${queryString}` : folderItemsPath(folderUuid);
    const { data } = await apiService.get<ArchiveItem[]>(url);
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
  ): Promise<{ succeeded: Array<any>, failed: Array<{ file: string, error: string }> }> {
    return uploadMultipleFiles(files, folderUuid, tags, onProgress);
  },

  async searchFoldersFTS(query: string): Promise<FolderTree[]> {
    // URL query parameter - remains snake_case
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
  async renameFolder(folderUuid: string, newName: string): Promise<ArchiveFolder> {
    const { data } = await apiService.put<ArchiveFolder>(`${API_PREFIX}/folders/${folderUuid}`, { name: newName });
    return data;
  },

  async renameItem(itemUuid: string, newName: string): Promise<ArchiveItem> {
    const { data } = await apiService.put<ArchiveItem>(`${API_PREFIX}/items/${itemUuid}`, { name: newName });
    return data;
  },

  async deleteItem(itemUuid: string): Promise<void> {
    await apiService.delete(`${API_PREFIX}/items/${itemUuid}`);
  },

  async downloadFolder(folderUuid: string, onProgress?: (progress: DownloadProgress) => void): Promise<Blob> {
    const url = `${API_PREFIX}/folders/${folderUuid}/download`;
    return coreDownloadService.downloadFile(url, { fileId: folderUuid, onProgress });
  },
}; 