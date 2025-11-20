import { v4 as uuidv4 } from 'uuid';
import { apiService } from '../api';
import { logger } from '../../utils/logger';

/**
 * CoreUploadService – shared chunked uploader usable by all modules (Archive,
 * Documents, Diary media, etc.). Callers should supply the module name so the
 * backend can route the chunks appropriately.
 */

const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB
const CONCURRENT_CHUNKS = 3;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

export interface UploadProgress {
  fileId: string;
  filename: string;
  bytesUploaded: number;
  totalSize: number;
  status: string;
  progress: number;
  error?: string;
}

export interface ChunkUploadOptions {
  module: string; // e.g. 'documents', 'archive', 'diary'
  additionalMeta?: Record<string, any>; // tags, folderUuid, etc.
  onProgress?: (progress: UploadProgress) => void;
  onComplete?: (fileId: string) => void;
  onError?: (error: Error) => void;
  onRetry?: (chunkNumber: number, attempt: number) => void;
}

interface ChunkState {
  number: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  retries: number;
}

class CoreUploadService {
  private activeUploads = new Map<string, {
    abort: AbortController;
    status: UploadProgress;
    chunks: Map<number, ChunkState>;
  }>();

  /**
   * Upload a file in chunks.  The caller must specify the API module so the
   * backend assembles the file in the right place.
   */
  async uploadFile(file: File, opts: ChunkUploadOptions): Promise<string> {
    const fileId = uuidv4();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const abortController = new AbortController();

    // Track state
    const chunks = new Map<number, ChunkState>();
    for (let i = 0; i < totalChunks; i++) {
      chunks.set(i, { number: i, status: 'pending', retries: 0 });
    }

    this.activeUploads.set(fileId, {
      abort: abortController,
      status: {
        fileId,
        filename: file.name,
        bytesUploaded: 0,
        totalSize: file.size,
        status: 'starting',
        progress: 0
      },
      chunks
    });

    // Use shared upload endpoints; module name is still included in metadata
    const endpointBase = `/uploads`;  // ✅ Plural, apiService adds /api/v1

    try {
      const chunkPromises: Promise<void>[] = [];
      let activeChunks = 0;
      let completedChunks = 0;

      const processNext = async () => {
        const next = Array.from(chunks.values()).find(c => c.status === 'pending' || (c.status === 'failed' && c.retries < RETRY_ATTEMPTS));
        if (!next) return;
        next.status = 'uploading';
        activeChunks++;
        try {
          await this.uploadChunk(file, fileId, next.number, totalChunks, endpointBase, opts);
          next.status = 'completed';
          completedChunks++;

          const progress = (completedChunks / totalChunks) * 100;
          const bytesUploaded = Math.min(completedChunks * CHUNK_SIZE, file.size);
          const status: UploadProgress = {
            fileId,
            filename: file.name,
            bytesUploaded,
            totalSize: file.size,
            status: completedChunks === totalChunks ? 'assembling' : 'uploading',
            progress
          };
          const uploadState = this.activeUploads.get(fileId);
          if (uploadState) {
            uploadState.status = status;
          }
          opts.onProgress?.(status);
        } catch (err) {
          next.status = 'failed';
          next.retries++;
          if (next.retries < RETRY_ATTEMPTS) {
            opts.onRetry?.(next.number, next.retries);
            await new Promise(r => setTimeout(r, RETRY_DELAY));
          } else {
            throw err;
          }
        } finally {
          activeChunks--;
          if (activeChunks < CONCURRENT_CHUNKS) {
            const np = processNext();
            if (np) chunkPromises.push(np);
          }
        }
      };

      for (let i = 0; i < Math.min(CONCURRENT_CHUNKS, totalChunks); i++) {
        chunkPromises.push(processNext());
      }

      await Promise.all(chunkPromises);

      // Wait for assembly
      await this.waitForAssembly(fileId, endpointBase, opts, file.size);

      this.activeUploads.delete(fileId);
      opts.onComplete?.(fileId);
      return fileId;
    } catch (e) {
      const err = e as Error;
      const upload = this.activeUploads.get(fileId);
      if (upload) upload.status = { ...upload.status, status: 'error', error: err.message };
      opts.onError?.(err);
      this.activeUploads.delete(fileId);
      throw err;
    }
  }

  private async uploadChunk(file: File, fileId: string, chunkNumber: number, totalChunks: number, base: string, opts: ChunkUploadOptions) {
    const start = chunkNumber * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);

    const formData = new FormData();
    formData.append('file', blob);
    formData.append('metadata', JSON.stringify({
      file_id: fileId,
      chunk_number: chunkNumber,
      total_chunks: totalChunks,
      filename: file.name,
      total_size: file.size,
      module: opts.module,
      ...opts.additionalMeta
    }));

    const uploadState = this.activeUploads.get(fileId);
    await apiService.post(`${base}/chunk`, formData, {
      signal: uploadState?.abort.signal,
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  async cancelUpload(fileId: string, _module: string) {
    const upload = this.activeUploads.get(fileId);
    if (upload) {
      upload.abort.abort();
      this.activeUploads.delete(fileId);
    }
    await apiService.delete(`/uploads/cleanup/${fileId}`);  // ✅ Match backend endpoint
  }

  /* ---------------------------------------------------------------------- */
  /*                           DIRECT UPLOAD HELPER                          */
  /* ---------------------------------------------------------------------- */
  async uploadDirect<T = any>(
    url: string,
    formData: FormData,
    opts: {
      onProgress?: (pct: number) => void;
      retries?: number;
    } = {},
  ): Promise<T> {
    const attempts = opts.retries ?? 3;
    const axios = apiService.getAxiosInstance();

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const resp = await axios.post<T>(url, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (evt) => {
            if (evt.total) {
              const pct = Math.round((evt.loaded * 100) / evt.total);
              opts.onProgress?.(pct);
            }
          },
        });
        opts.onProgress?.(100);
        return resp.data;
      } catch (err) {
        if (attempt === attempts) throw err;
        await new Promise((res) => setTimeout(res, attempt * 1000));
      }
    }
    throw new Error('Upload failed');
  }

  private async waitForAssembly(
  fileId: string,
  base: string,
  opts: ChunkUploadOptions,
  fileSize?: number
) {
    // Use fileSize if provided, otherwise default to 30s minimum
    const maxWaitTime = fileSize ? Math.max(30000, fileSize * 0.1) : 30000;
    const startTime = Date.now();
    let consecutiveErrors = 0;

    logger.debug(`[Upload] Starting assembly check for ${fileId}, max wait: ${Math.round(maxWaitTime/1000)}s`);

    for (let i = 0; i < 180; i++) {
      // Circuit breaker: timeout protection
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error(`Upload timeout after ${Math.round(maxWaitTime/1000)}s`);
      }

      try {
        logger.debug(`[Upload] Status check ${i+1}/180 for ${fileId}`);

        const resp = await apiService.get<UploadProgress>(`${base}/status/${fileId}`, {
          timeout: 10000 // 10s timeout for status request
        });

        const status = resp.data;
        consecutiveErrors = 0; // Reset on success

        const uploadState = this.activeUploads.get(fileId);
        if (uploadState) {
          uploadState.status = status;
        }
        opts.onProgress?.(status);

        // More precise check - handles various status formats
        const statusValue = status.status?.toLowerCase();
        const isCompleted = statusValue === 'completed' ||
                           statusValue?.endsWith('.completed');

        if (isCompleted) {
          logger.debug(`[Upload] Completed successfully for ${fileId}`);
          return;
        }

        if (status.status?.toLowerCase() === 'failed' || status.status?.toLowerCase() === 'error') {
          throw new Error(`Assembly failed: ${status.error || 'Unknown error'}`);
        }

        // Fast fail for small files stuck in ASSEMBLING with no progress
        if (fileSize && fileSize < 1024*1024 && i > 10 &&
            status.status === 'assembling' && status.progress === 0) {
          throw new Error('Small upload appears stuck - assembly not progressing');
        }

      } catch (error: any) {
        consecutiveErrors++;
        logger.warn(`[Upload] Status check failed (${consecutiveErrors}/3):`, error.message);

        if (consecutiveErrors >= 3) {
          throw new Error(`Upload failed after ${consecutiveErrors} consecutive errors`);
        }

        if (error.response?.status === 404) {
          throw new Error('Upload not found or was cleaned up');
        }

        if (error.response?.status >= 500) {
          // Server errors - continue retrying with backoff
          await new Promise(r => setTimeout(r, 2000 * consecutiveErrors));
          continue;
        }

        throw error; // Re-throw other errors
      }

      // Progressive delay: increase delay over time
      const delay = Math.min(1000 + (i * 100), 5000);
      await new Promise(r => setTimeout(r, delay));
    }

    throw new Error('Assembly timeout after maximum attempts');
  }
}

export const coreUploadService = new CoreUploadService();
export { CoreUploadService }; 