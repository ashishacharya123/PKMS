/**
 * File Cache Service - Chromium-optimized file caching for PKMS
 * 
 * Caches files up to 50-100MB with:
 * - IndexedDB for file storage
 * - Cache API for network requests
 * - Thumbnail generation and caching
 * - LRU eviction for large files
 * - Performance monitoring
 */

interface FileCacheEntry {
  blob: Blob;
  timestamp: number;
  ttl: number;
  size: number;
  mimeType: string;
  isThumbnail: boolean;
  originalUrl?: string;
}

interface FileCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  totalSize: number;
  maxSize: number;
  hitRate: number;
  averageResponseTime: number;
}

interface FileCacheConfig {
  maxSize: number; // in MB
  maxFiles: number;
  defaultTtl: number; // in ms
  thumbnailSize: number; // in pixels
  enableThumbnails: boolean;
  enablePerformanceMonitoring: boolean;
}

class FileCacheService {
  private cache: Map<string, FileCacheEntry> = new Map();
  private config: FileCacheConfig;
  private stats: Omit<FileCacheStats, 'hitRate' | 'totalSize' | 'maxSize'> = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalRequests: 0,
    averageResponseTime: 0
  };
  private dbName: string;
  private db: IDBDatabase | null = null;

  constructor(
    name: string,
    config: Partial<FileCacheConfig> = {}
  ) {
    this.config = {
      maxSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 1000,
      defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
      thumbnailSize: 200,
      enableThumbnails: true,
      enablePerformanceMonitoring: true,
      ...config
    };
    
    this.dbName = `pkms_file_cache_${name}`;
    this.initializeIndexedDB();
  }

  /**
   * Initialize IndexedDB for file storage
   */
  private async initializeIndexedDB(): Promise<void> {
    if (!('indexedDB' in window)) {
      console.warn('IndexedDB not supported, using memory-only file cache');
      return;
    }

    try {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('files')) {
          const store = db.createObjectStore('files', { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('size', 'size', { unique: false });
          store.createIndex('isThumbnail', 'isThumbnail', { unique: false });
        }
      };

      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('IndexedDB initialization failed, using memory-only file cache:', error);
    }
  }

  /**
   * Get file from cache (memory first, then IndexedDB)
   */
  async getFile(key: string): Promise<Blob | null> {
    const startTime = performance.now();
    this.stats.totalRequests++;

    // Check memory cache first
    const memoryEntry = this.cache.get(key);
    if (memoryEntry && this.isValidEntry(memoryEntry)) {
      this.stats.hits++;
      this.updateStats(startTime);
      this.logCacheHit(key, 'memory', memoryEntry.size);
      return memoryEntry.blob;
    }

    // Check IndexedDB if available
    if (this.db) {
      try {
        const entry = await this.getFromIndexedDB(key);
        if (entry && this.isValidEntry(entry)) {
          // Restore to memory cache
          this.cache.set(key, entry);
          this.stats.hits++;
          this.updateStats(startTime);
          this.logCacheHit(key, 'indexeddb', entry.size);
          return entry.blob;
        }
      } catch (error) {
        console.warn('IndexedDB get failed:', error);
      }
    }

    this.stats.misses++;
    this.updateStats(startTime);
    this.logCacheMiss(key);
    return null;
  }

  /**
   * Cache file with automatic thumbnail generation
   */
  async cacheFile(
    key: string, 
    file: Blob | File, 
    ttl?: number, 
    generateThumbnail: boolean = true
  ): Promise<void> {
    const startTime = performance.now();
    
    // Convert File to Blob if needed
    const blob = file instanceof File ? file : file;
    
    // Check file size limit
    if (blob.size > this.config.maxSize) {
      console.warn(`File too large for cache: ${blob.size} bytes (max: ${this.config.maxSize} bytes)`);
      return;
    }

    const entry: FileCacheEntry = {
      blob,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTtl,
      size: blob.size,
      mimeType: blob.type,
      isThumbnail: false,
      originalUrl: key
    };

    // Cache original file
    this.cache.set(key, entry);
    this.updateStats(startTime);

    // Store in IndexedDB if available
    if (this.db) {
      try {
        await this.setInIndexedDB(key, entry);
      } catch (error) {
        console.warn('IndexedDB set failed:', error);
      }
    }

    // Generate thumbnail if requested and file is image
    if (generateThumbnail && this.config.enableThumbnails && this.isImageFile(blob.type)) {
      try {
        const thumbnail = await this.generateThumbnail(blob);
        const thumbnailKey = `${key}_thumbnail`;
        const thumbnailEntry: FileCacheEntry = {
          blob: thumbnail,
          timestamp: Date.now(),
          ttl: ttl || this.config.defaultTtl,
          size: thumbnail.size,
          mimeType: 'image/jpeg',
          isThumbnail: true,
          originalUrl: key
        };

        this.cache.set(thumbnailKey, thumbnailEntry);
        
        if (this.db) {
          try {
            await this.setInIndexedDB(thumbnailKey, thumbnailEntry);
          } catch (error) {
            console.warn('IndexedDB thumbnail set failed:', error);
          }
        }

        this.logCacheSet(thumbnailKey, thumbnail.size, true);
      } catch (error) {
        console.warn('Thumbnail generation failed:', error);
      }
    }

    // LRU eviction if over limits
    this.evictIfNeeded();

    this.logCacheSet(key, blob.size, false);
  }

  /**
   * Get thumbnail for file
   */
  async getThumbnail(key: string): Promise<Blob | null> {
    const thumbnailKey = `${key}_thumbnail`;
    return await this.getFile(thumbnailKey);
  }

  /**
   * Download and cache file from URL
   */
  async downloadAndCache(url: string, key?: string, generateThumbnail: boolean = true): Promise<Blob | null> {
    const cacheKey = key || url;
    
    // Check if already cached
    const cached = await this.getFile(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      console.log(`📥 DOWNLOADING: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      await this.cacheFile(cacheKey, blob, undefined, generateThumbnail);
      
      console.log(`✅ CACHED: ${url} (${this.formatFileSize(blob.size)})`);
      return blob;
    } catch (error) {
      console.error(`❌ DOWNLOAD FAILED: ${url}`, error);
      return null;
    }
  }

  /**
   * Invalidate file cache
   */
  async invalidateFile(key: string): Promise<boolean> {
    let invalidated = false;

    // Remove from memory
    if (this.cache.delete(key)) {
      invalidated = true;
    }

    // Remove thumbnail
    const thumbnailKey = `${key}_thumbnail`;
    if (this.cache.delete(thumbnailKey)) {
      invalidated = true;
    }

    // Remove from IndexedDB
    if (this.db) {
      try {
        await this.deleteFromIndexedDB(key);
        await this.deleteFromIndexedDB(thumbnailKey);
        invalidated = true;
      } catch (error) {
        console.warn('IndexedDB delete failed:', error);
      }
    }

    if (invalidated) {
      this.logCacheInvalidation(key);
    }

    return invalidated;
  }

  /**
   * Clear all file cache
   */
  async clear(): Promise<void> {
    const count = this.cache.size;
    this.cache.clear();

    if (this.db) {
      try {
        await this.clearIndexedDB();
      } catch (error) {
        console.warn('IndexedDB clear failed:', error);
      }
    }

    this.logCacheClear(count);
  }

  /**
   * Get cache statistics
   */
  getStats(): FileCacheStats {
    const totalRequests = this.stats.totalRequests;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;
    const totalSize = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0);

    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      totalSize,
      maxSize: this.config.maxSize
    };
  }

  /**
   * Log cache statistics
   */
  logStats(): void {
    const stats = this.getStats();
    console.log(`📊 FILE CACHE STATS [${this.dbName}]:`, {
      'Hit Rate': `${stats.hitRate}%`,
      'Total Requests': stats.totalRequests,
      'Cache Hits': stats.hits,
      'Cache Misses': stats.misses,
      'Evictions': stats.evictions,
      'Total Size': this.formatFileSize(stats.totalSize),
      'Max Size': this.formatFileSize(stats.maxSize),
      'Cache Files': this.cache.size,
      'Avg Response Time': `${Math.round(stats.averageResponseTime)}ms`
    });
  }

  // Private helper methods
  private isValidEntry(entry: FileCacheEntry): boolean {
    const now = Date.now();
    return (now - entry.timestamp) < entry.ttl;
  }

  private isImageFile(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  private async generateThumbnail(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      img.onload = () => {
        // Calculate thumbnail dimensions
        const maxSize = this.config.thumbnailSize;
        let { width, height } = img;
        
        if (width > height) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else {
          width = (width * maxSize) / height;
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw thumbnail
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob((thumbnailBlob) => {
          if (thumbnailBlob) {
            resolve(thumbnailBlob);
          } else {
            reject(new Error('Thumbnail generation failed'));
          }
        }, 'image/jpeg', 0.8);
      };

      img.onerror = () => reject(new Error('Image load failed'));
      img.src = URL.createObjectURL(blob);
    });
  }

  private evictIfNeeded(): void {
    // Evict by file count
    while (this.cache.size > this.config.maxFiles) {
      this.evictLRU();
    }

    // Evict by total size
    const totalSize = Array.from(this.cache.values()).reduce((sum, entry) => sum + entry.size, 0);
    while (totalSize > this.config.maxSize) {
      this.evictLRU();
    }
  }

  private evictLRU(): void {
    if (this.cache.size === 0) return;

    // Remove oldest entry (first in Map)
    const oldestKey = this.cache.keys().next().value;
    this.cache.delete(oldestKey);
    this.stats.evictions++;
  }

  private updateStats(responseTime: number): void {
    if (this.config.enablePerformanceMonitoring) {
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (this.stats.totalRequests - 1) + responseTime) / this.stats.totalRequests;
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private logCacheHit(key: string, source: 'memory' | 'indexeddb', size: number): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`🎯 FILE CACHE HIT [${source}]: ${key} (${this.formatFileSize(size)})`);
    }
  }

  private logCacheMiss(key: string): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`❌ FILE CACHE MISS: ${key}`);
    }
  }

  private logCacheSet(key: string, size: number, isThumbnail: boolean): void {
    if (this.config.enablePerformanceMonitoring) {
      const type = isThumbnail ? 'thumbnail' : 'file';
      console.log(`✅ FILE CACHE SET [${type}]: ${key} (${this.formatFileSize(size)})`);
    }
  }

  private logCacheInvalidation(key: string): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`🗑️ FILE CACHE INVALIDATE: ${key}`);
    }
  }

  private logCacheClear(count: number): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`🗑️ FILE CACHE CLEAR: ${count} files`);
    }
  }

  // IndexedDB helper methods
  private async getFromIndexedDB(key: string): Promise<FileCacheEntry | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['files'], 'readonly');
      const store = transaction.objectStore('files');
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result?.entry || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async setInIndexedDB(key: string, entry: FileCacheEntry): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');
      const request = store.put({ key, entry });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteFromIndexedDB(key: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async clearIndexedDB(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['files'], 'readwrite');
      const store = transaction.objectStore('files');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Global file cache instances for different use cases
export const documentFileCache = new FileCacheService('documents', {
  maxSize: 50 * 1024 * 1024, // 50MB
  maxFiles: 500,
  defaultTtl: 24 * 60 * 60 * 1000, // 24 hours
  thumbnailSize: 200,
  enableThumbnails: true
});

export const archiveFileCache = new FileCacheService('archive', {
  maxSize: 100 * 1024 * 1024, // 100MB
  maxFiles: 1000,
  defaultTtl: 7 * 24 * 60 * 60 * 1000, // 7 days
  thumbnailSize: 200,
  enableThumbnails: true
});

export const diaryFileCache = new FileCacheService('diary', {
  maxSize: 25 * 1024 * 1024, // 25MB
  maxFiles: 200,
  defaultTtl: 3 * 24 * 60 * 60 * 1000, // 3 days
  thumbnailSize: 150,
  enableThumbnails: true
});

export const thumbnailCache = new FileCacheService('thumbnails', {
  maxSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 2000,
  defaultTtl: 7 * 24 * 60 * 60 * 1000, // 7 days
  thumbnailSize: 200,
  enableThumbnails: false // This IS the thumbnail cache
});

// Utility function to get all file cache statistics
export const getAllFileCacheStats = () => ({
  documents: documentFileCache.getStats(),
  archive: archiveFileCache.getStats(),
  diary: diaryFileCache.getStats(),
  thumbnails: thumbnailCache.getStats()
});

// Utility function to log all file cache statistics
export const logAllFileCacheStats = () => {
  console.log('📊 ALL FILE CACHE STATISTICS:');
  documentFileCache.logStats();
  archiveFileCache.logStats();
  diaryFileCache.logStats();
  thumbnailCache.logStats();
};

// File Service - High-level API for file operations
class FileService {
  /**
   * Download and cache file from URL
   */
  async downloadFile(
    url: string, 
    module: 'documents' | 'archive' | 'diary',
    options: {
      generateThumbnail?: boolean;
      cacheKey?: string;
      maxSize?: number; // in MB
    } = {}
  ): Promise<Blob | null> {
    const {
      generateThumbnail = true,
      cacheKey,
      maxSize = 50 // 50MB default
    } = options;

    const key = cacheKey || url;
    const maxSizeBytes = maxSize * 1024 * 1024;

    // Select appropriate cache
    const cache = this.getCacheForModule(module);
    
    // Check if already cached
    const cached = await cache.getFile(key);
    if (cached) {
      console.log(`🎯 FILE CACHE HIT: ${url} (${this.formatFileSize(cached.size)})`);
      return cached;
    }

    try {
      console.log(`📥 DOWNLOADING: ${url} (max: ${maxSize}MB)`);
      
      // Check file size before download
      const headResponse = await fetch(url, { method: 'HEAD' });
      const contentLength = headResponse.headers.get('content-length');
      
      if (contentLength && parseInt(contentLength) > maxSizeBytes) {
        console.warn(`❌ FILE TOO LARGE: ${url} (${this.formatFileSize(parseInt(contentLength))} > ${maxSize}MB)`);
        return null;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      
      // Check actual file size
      if (blob.size > maxSizeBytes) {
        console.warn(`❌ FILE TOO LARGE: ${url} (${this.formatFileSize(blob.size)} > ${maxSize}MB)`);
        return null;
      }

      // Cache the file
      await cache.cacheFile(key, blob, undefined, generateThumbnail);
      
      console.log(`✅ FILE CACHED: ${url} (${this.formatFileSize(blob.size)})`);
      return blob;
      
    } catch (error) {
      console.error(`❌ DOWNLOAD FAILED: ${url}`, error);
      return null;
    }
  }

  /**
   * Get cached file
   */
  async getCachedFile(
    key: string, 
    module: 'documents' | 'archive' | 'diary'
  ): Promise<Blob | null> {
    const cache = this.getCacheForModule(module);
    return await cache.getFile(key);
  }

  /**
   * Get thumbnail for file
   */
  async getThumbnail(
    key: string, 
    module: 'documents' | 'archive' | 'diary'
  ): Promise<Blob | null> {
    const cache = this.getCacheForModule(module);
    return await cache.getThumbnail(key);
  }

  /**
   * Get cache for specific module
   */
  private getCacheForModule(module: 'documents' | 'archive' | 'diary') {
    switch (module) {
      case 'documents':
        return documentFileCache;
      case 'archive':
        return archiveFileCache;
      case 'diary':
        return diaryFileCache;
      default:
        throw new Error(`Unknown module: ${module}`);
    }
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Global file service instance
export const fileService = new FileService();
export default FileCacheService;
