import { v4 as uuidv4 } from 'uuid';
import { apiService } from './api';

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
const CONCURRENT_CHUNKS = 3; // Number of concurrent chunk uploads
const RETRY_ATTEMPTS = 3; // Number of retry attempts per chunk
const RETRY_DELAY = 1000; // Delay between retries in milliseconds

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

class UploadService {
  private activeUploads: Map<string, { 
    abort: AbortController,
    status: UploadProgress,
    chunks: Map<number, ChunkState>
  }> = new Map();

  /**
   * Upload a file in chunks with progress tracking and resume capability
   */
  async uploadFile(file: File, options: ChunkUploadOptions = {}): Promise<string> {
    const fileId = uuidv4();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const abortController = new AbortController();

    // Initialize upload tracking
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

    try {
      // Process chunks in parallel with limited concurrency
      const chunkPromises: Promise<void>[] = [];
      let activeChunks = 0;
      let completedChunks = 0;

      const processNextChunk = async () => {
        // Find next pending chunk
        const nextChunk = Array.from(chunks.values())
          .find(chunk => chunk.status === 'pending' || 
                (chunk.status === 'failed' && chunk.retries < RETRY_ATTEMPTS));

        if (!nextChunk) return;

        nextChunk.status = 'uploading';
        activeChunks++;

        try {
          await this.uploadChunk(file, fileId, nextChunk.number, totalChunks, options);
          nextChunk.status = 'completed';
          completedChunks++;

          // Update progress
          const progress = (completedChunks / totalChunks) * 100;
          const bytesUploaded = Math.min(completedChunks * CHUNK_SIZE, file.size);
          
          const uploadStatus = {
            fileId,
            filename: file.name,
            bytesUploaded,
            totalSize: file.size,
            status: completedChunks === totalChunks ? 'assembling' : 'uploading',
            progress
          };

          this.activeUploads.get(fileId)!.status = uploadStatus;
          options.onProgress?.(uploadStatus);

        } catch (error) {
          nextChunk.status = 'failed';
          nextChunk.retries++;

          if (nextChunk.retries < RETRY_ATTEMPTS) {
            options.onRetry?.(nextChunk.number, nextChunk.retries);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            // Chunk will be retried in next iteration
          } else {
            throw new Error(`Failed to upload chunk ${nextChunk.number} after ${RETRY_ATTEMPTS} attempts`);
          }
        } finally {
          activeChunks--;
          
          // Start next chunk if available
          if (activeChunks < CONCURRENT_CHUNKS) {
            const nextPromise = processNextChunk();
            if (nextPromise) chunkPromises.push(nextPromise);
          }
        }
      };

      // Start initial batch of chunks
      for (let i = 0; i < Math.min(CONCURRENT_CHUNKS, totalChunks); i++) {
        chunkPromises.push(processNextChunk());
      }

      // Wait for all chunks to complete
      await Promise.all(chunkPromises);

      // Check if any chunks failed
      const failedChunks = Array.from(chunks.values())
        .filter(chunk => chunk.status === 'failed')
        .map(chunk => chunk.number);

      if (failedChunks.length > 0) {
        throw new Error(`Failed to upload ${failedChunks.length} chunks`);
      }

      // Wait for assembly
      await this.waitForAssembly(fileId, options);

      // Cleanup
      this.activeUploads.delete(fileId);
      options.onComplete?.(fileId);
      return fileId;

    } catch (error) {
      // Handle errors
      const uploadError = error as Error;
      this.activeUploads.get(fileId)!.status = {
        ...this.activeUploads.get(fileId)!.status,
        status: 'error',
        error: uploadError.message
      };
      options.onError?.(uploadError);
      this.activeUploads.delete(fileId);
      throw uploadError;
    }
  }

  /**
   * Upload a single chunk
   */
  private async uploadChunk(
    file: File,
    fileId: string,
    chunkNumber: number,
    totalChunks: number,
    options: ChunkUploadOptions
  ): Promise<void> {
    const start = chunkNumber * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    const formData = new FormData();
    formData.append('file', chunk);
    formData.append('chunk_data', JSON.stringify({
      chunk_number: chunkNumber,
      total_chunks: totalChunks,
      chunk_size: CHUNK_SIZE,
      total_size: file.size,
      filename: file.name,
      file_id: fileId
    }));

    const upload = this.activeUploads.get(fileId);
    if (!upload) throw new Error('Upload not found');

    await apiService.post('/archive/upload/chunk', formData, {
      signal: upload.abort.signal,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  }

  /**
   * Cancel an active upload
   */
  async cancelUpload(fileId: string): Promise<void> {
    const upload = this.activeUploads.get(fileId);
    if (upload) {
      upload.abort.abort();
      this.activeUploads.delete(fileId);
      
      // Tell backend to cleanup
      try {
        await apiService.delete(`/archive/upload/${fileId}`);
      } catch (error) {
        console.error('Error cleaning up upload:', error);
      }
    }
  }

  /**
   * Get current upload status
   */
  getUploadStatus(fileId: string): UploadProgress | null {
    return this.activeUploads.get(fileId)?.status || null;
  }

  /**
   * Get list of failed chunks for potential resume
   */
  getFailedChunks(fileId: string): number[] {
    const upload = this.activeUploads.get(fileId);
    if (!upload) return [];

    return Array.from(upload.chunks.values())
      .filter(chunk => chunk.status === 'failed')
      .map(chunk => chunk.number);
  }

  /**
   * Wait for file assembly to complete
   */
  private async waitForAssembly(fileId: string, options: ChunkUploadOptions): Promise<void> {
    const maxAttempts = 30; // 30 seconds
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await apiService.get(`/archive/upload/${fileId}/status`);
        const status = response.data as UploadProgress;

        this.activeUploads.get(fileId)!.status = status;
        options.onProgress?.(status);

        if (status.status === 'completed') {
          return;
        }
        if (status.status === 'error') {
          throw new Error(status.error || 'Assembly failed');
        }

        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;

      } catch (error) {
        const assemblyError = error as Error;
        throw new Error(`Assembly failed: ${assemblyError.message}`);
      }
    }

    throw new Error('Assembly timed out');
  }
}

export const uploadService = new UploadService(); 