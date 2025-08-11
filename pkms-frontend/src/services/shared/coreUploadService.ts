import { v4 as uuidv4 } from 'uuid';
import { apiService } from '../api';

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
  additionalMeta?: Record<string, any>; // tags, folder_uuid, etc.
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
    const endpointBase = `/upload`;

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
          this.activeUploads.get(fileId)!.status = status;
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
      await this.waitForAssembly(fileId, endpointBase, opts);

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
    formData.append('chunk_data', JSON.stringify({
      file_id: fileId,
      chunk_number: chunkNumber,
      total_chunks: totalChunks,
      filename: file.name,
      total_size: file.size,
      module: opts.module,
      ...opts.additionalMeta
    }));

    await apiService.post(`${base}/chunk`, formData, {
      signal: this.activeUploads.get(fileId)!.abort.signal,
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  async cancelUpload(fileId: string, _module: string) {
    const upload = this.activeUploads.get(fileId);
    if (upload) {
      upload.abort.abort();
      this.activeUploads.delete(fileId);
    }
    await apiService.delete(`/upload/${fileId}`);
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

  private async waitForAssembly(fileId: string, base: string, opts: ChunkUploadOptions) {
    // Allow more time for assembly on slower disks or large files
    for (let i = 0; i < 180; i++) {
      const resp = await apiService.get<UploadProgress>(`${base}/${fileId}/status`);
      const status = resp.data;
      this.activeUploads.get(fileId)!.status = status;
      opts.onProgress?.(status);
      if (status.status === 'completed') return;
      if (status.status === 'error') throw new Error('Assembly failed');
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error('Assembly timeout');
  }
}

export const coreUploadService = new CoreUploadService();
export { CoreUploadService }; 