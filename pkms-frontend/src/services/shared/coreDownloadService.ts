/* -------------------------------------------------------------------------- */
/*                            coreDownloadService                             */
/* -------------------------------------------------------------------------- */
// A shared downloader with caching & progress reporting.
// Keeps the last 10 files or up to 100 MB in an in-memory LRU cache to avoid
// re-downloading frequently accessed blobs.

import { AxiosRequestConfig } from 'axios';
import { apiService } from '../../services/api';

export interface DownloadProgress {
  fileId: string;
  bytesDownloaded: number;
  totalSize: number;
  progress: number; // percentage 0-100
  status: 'downloading' | 'completed';
}

interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  /** A stable identifier for the file – usually the item UUID. */
  fileId: string;
}

// Simple LRU cache implementation
const MAX_ITEMS = 10;
const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

interface CacheEntry {
  blob: Blob;
  size: number;
}

class LRUCache {
  private map = new Map<string, CacheEntry>();
  private totalSize = 0;

  get(key: string): Blob | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Refresh recency
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.blob;
  }

  set(key: string, blob: Blob): void {
    const size = blob.size;
    if (size > MAX_SIZE_BYTES) return; // Don't cache huge files

    // Evict items until within limits
    while (this.map.size >= MAX_ITEMS || this.totalSize + size > MAX_SIZE_BYTES) {
      const oldestKey = this.map.keys().next().value as string;
      const oldest = this.map.get(oldestKey)!;
      this.map.delete(oldestKey);
      this.totalSize -= oldest.size;
    }

    this.map.set(key, { blob, size });
    this.totalSize += size;
  }
}

const cache = new LRUCache();

export const coreDownloadService = {
  async downloadFile(url: string, { onProgress, fileId }: DownloadOptions): Promise<Blob> {
    // Check cache first
    const cached = cache.get(fileId);
    if (cached) {
      onProgress?.({ fileId, bytesDownloaded: cached.size, totalSize: cached.size, progress: 100, status: 'completed' });
      return cached;
    }

    const config: AxiosRequestConfig = {
      url,
      method: 'GET',
      responseType: 'blob',
      withCredentials: true,
      onDownloadProgress: (evt) => {
        if (evt.total) {
          onProgress?.({
            fileId,
            bytesDownloaded: evt.loaded,
            totalSize: evt.total,
            progress: Math.round((evt.loaded * 100) / evt.total),
            status: 'downloading',
          });
        }
      },
    };

    // Use the shared API instance so Authorization and interceptors are applied
    const response = await apiService.getAxiosInstance().request(config);
    const blob = response.data as Blob;

    cache.set(fileId, blob);
    onProgress?.({ fileId, bytesDownloaded: blob.size, totalSize: blob.size, progress: 100, status: 'completed' });
    return blob;
  },

  // Utility to create object URL (caller must revoke when done)
  async downloadAsObjectURL(url: string, opts: DownloadOptions): Promise<string> {
    const blob = await this.downloadFile(url, opts);
    return URL.createObjectURL(blob);
  },
}; 