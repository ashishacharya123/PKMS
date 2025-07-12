import { apiService } from './api';
import { coreUploadService, UploadProgress } from './shared/coreUploadService';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';
import type { AxiosError } from 'axios';
import { ArchiveItem, ArchiveFolder } from '../types/archive';
import { FolderTree } from '../types/archive';

/* -------------------------------------------------------------------------- */
/*                               API ENDPOINTS                               */
/* -------------------------------------------------------------------------- */
const API_PREFIX = '/api/v1/archive';
const FOLDERS_ENDPOINT = `${API_PREFIX}/folders/`;
const UPLOAD_COMMIT_ENDPOINT = `${API_PREFIX}/upload/commit/`;

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

// Map common Axios errors to user-friendly messages
const handleAxiosError = (error: AxiosError): never => {
  const status = error.response?.status;
  switch (status) {
    case 404:
      throw new Error('Folder or item not found.');
    case 409:
      throw new Error('A file or folder with this name already exists.');
    case 413:
      throw new Error('File is too large. Please try a smaller file.');
    case 415:
      throw new Error('Unsupported file type.');
    default:
      throw new Error(error.message || 'An unexpected error occurred.');
  }
};

const LARGE_FILE_THRESHOLD = 3 * 1024 * 1024; // 3 MB

/* -------------------------------------------------------------------------- */
/*                               UPLOAD HELPERS                               */
/* -------------------------------------------------------------------------- */
const uploadSmallFile = async (
  file: File,
  folderUuid: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ArchiveItem> => {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const data = await coreUploadService.uploadDirect<ArchiveItem>(
      folderItemsPath(folderUuid),
      formData,
      {
        onProgress: (pct) => {
          if (onProgress) {
            onProgress({
              fileId: '',
              filename: file.name,
              bytesUploaded: Math.round((pct / 100) * file.size),
              totalSize: file.size,
              status: pct === 100 ? 'completed' : 'uploading',
              progress: pct,
            });
          }
        },
      },
    );
    return data;
  } catch (err) {
    handleAxiosError(err as AxiosError);
    throw err;
  }
};

const uploadLargeFile = async (
  file: File,
  folderUuid: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<ArchiveItem> => {
  try {
    const fileId = await coreUploadService.uploadFile(file, {
      module: 'archive',
      additionalMeta: { folder_uuid: folderUuid },
      onProgress,
    });

    const commitData = {
      file_id: fileId,
      original_filename: file.name,
      mime_type: file.type,
      folder_uuid: folderUuid,
      name: getBaseName(file.name),
    };

    const response = await apiService.post<ArchiveItem>(UPLOAD_COMMIT_ENDPOINT, commitData);
    return response.data;
  } catch (err) {
    handleAxiosError(err as AxiosError);
    throw err;
  }
};

/* -------------------------------------------------------------------------- */
/*                              PUBLIC SERVICE                                */
/* -------------------------------------------------------------------------- */
export const archiveService = {
  async listFolders(): Promise<ArchiveFolder[]> {
    const { data } = await apiService.get<ArchiveFolder[]>(FOLDERS_ENDPOINT);
    return data;
  },

  async getFolder(uuid: string): Promise<ArchiveFolder> {
    const { data } = await apiService.get<ArchiveFolder>(folderPath(uuid));
    return data;
  },

  async createFolder(name: string, parentUuid?: string): Promise<ArchiveFolder> {
    try {
      const { data } = await apiService.post<ArchiveFolder>(FOLDERS_ENDPOINT, {
        name,
        parent_uuid: parentUuid,
      });
      return data;
    } catch (err) {
      handleAxiosError(err as AxiosError);
      throw err;
    }
  },

  async updateFolder(uuid: string, data: Partial<ArchiveFolder>): Promise<ArchiveFolder> {
    try {
      const resp = await apiService.put<ArchiveFolder>(folderPath(uuid), data);
      return resp.data;
    } catch (err) {
      handleAxiosError(err as AxiosError);
      throw err;
    }
  },

  async deleteFolder(uuid: string): Promise<void> {
    try {
      await apiService.delete(folderPath(uuid));
    } catch (err) {
      handleAxiosError(err as AxiosError);
      throw err;
    }
  },

  async getFolderItems(folderUuid: string): Promise<ArchiveItem[]> {
    try {
      const { data } = await apiService.get<ArchiveItem[]>(folderItemsPath(folderUuid));
      return data;
    } catch (err) {
      handleAxiosError(err as AxiosError);
      throw err;
    }
  },

  async uploadFile(
    file: File,
    folderUuid: string,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<ArchiveItem> {
    if (file.size < LARGE_FILE_THRESHOLD) {
      return uploadSmallFile(file, folderUuid, onProgress);
    }
    return uploadLargeFile(file, folderUuid, onProgress);
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
}; 