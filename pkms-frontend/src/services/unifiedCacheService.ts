/**
 * Unified Cache Service - Frontend-first caching for PKMS
 * 
 * Chromium-optimized caching with:
 * - IndexedDB for persistent storage
 * - Memory cache for fast access
 * - Service Worker integration
 * - Cache API for network requests
 * - Performance monitoring
 * 
 * Designed for local-first PKMS with offline capability
 */

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  version: number;
  tags?: string[];
}

interface CacheStats {
  hits: number;
  misses: number;
  expired: number;
  evictions: number;
  invalidations: number;
  sets: number;
  totalRequests: number;
  averageResponseTime: number;
  hitRate: number;
  currentSize: number;
  maxSize: number;
}

interface CacheConfig {
  maxSize: number;
  defaultTtl: number;
  enableIndexedDB: boolean;
  enableServiceWorker: boolean;
  enablePerformanceMonitoring: boolean;
}

class UnifiedCacheService<T = any> {
  private memoryCache: Map<string, CacheEntry<T>> = new Map();
  private config: CacheConfig;
  private stats: Omit<CacheStats, 'hitRate' | 'currentSize' | 'maxSize'> = {
    hits: 0,
    misses: 0,
    expired: 0,
    evictions: 0,
    invalidations: 0,
    sets: 0,
    totalRequests: 0,
    averageResponseTime: 0
  };
  private dbName: string;
  private dbVersion: number = 1;
  private db: IDBDatabase | null = null;

  constructor(
    name: string,
    config: Partial<CacheConfig> = {}
  ) {
    this.config = {
      maxSize: 1000,
      defaultTtl: 120000, // 2 minutes
      enableIndexedDB: true,
      enableServiceWorker: true,
      enablePerformanceMonitoring: true,
      ...config
    };
    
    this.dbName = `pkms_cache_${name}`;
    this.initializeIndexedDB();
  }

  /**
   * Initialize IndexedDB for persistent storage
   */
  private async initializeIndexedDB(): Promise<void> {
    if (!this.config.enableIndexedDB || !('indexedDB' in window)) {
      return;
    }

    try {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        }
      };

      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('IndexedDB initialization failed, using memory-only cache:', error);
    }
  }

  /**
   * Get value from cache (memory first, then IndexedDB)
   */
  async get(key: string, defaultValue: T | null = null): Promise<T | null> {
    const startTime = performance.now();
    this.stats.totalRequests++;

    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && this.isValidEntry(memoryEntry)) {
      this.stats.hits++;
      this.updateStats(startTime);
      this.logCacheHit(key, 'memory');
      return memoryEntry.data;
    }

    // Check IndexedDB if available
    if (this.db) {
      try {
        const entry = await this.getFromIndexedDB(key);
        if (entry && this.isValidEntry(entry)) {
          // Restore to memory cache
          this.memoryCache.set(key, entry);
          this.stats.hits++;
          this.updateStats(startTime);
          this.logCacheHit(key, 'indexeddb');
          return entry.data;
        }
      } catch (error) {
        console.warn('IndexedDB get failed:', error);
      }
    }

    this.stats.misses++;
    this.updateStats(startTime);
    this.logCacheMiss(key);
    return defaultValue;
  }

  /**
   * Set value in cache (memory + IndexedDB)
   */
  async set(key: string, value: T, ttl?: number, tags?: string[]): Promise<void> {
    const startTime = performance.now();
    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTtl,
      version: 1,
      tags
    };

    // Set in memory cache
    this.memoryCache.set(key, entry);
    this.stats.sets++;

    // Set in IndexedDB if available
    if (this.db) {
      try {
        await this.setInIndexedDB(key, entry);
      } catch (error) {
        console.warn('IndexedDB set failed:', error);
      }
    }

    // LRU eviction if over max size
    if (this.memoryCache.size > this.config.maxSize) {
      this.evictLRU();
    }

    this.updateStats(startTime);
    this.logCacheSet(key, ttl || this.config.defaultTtl);
  }

  /**
   * Invalidate specific key
   */
  async invalidate(key: string): Promise<boolean> {
    let invalidated = false;

    // Remove from memory
    if (this.memoryCache.delete(key)) {
      invalidated = true;
    }

    // Remove from IndexedDB
    if (this.db) {
      try {
        await this.deleteFromIndexedDB(key);
        invalidated = true;
      } catch (error) {
        console.warn('IndexedDB delete failed:', error);
      }
    }

    if (invalidated) {
      this.stats.invalidations++;
      this.logCacheInvalidation(key);
    }

    return invalidated;
  }

  /**
   * Invalidate by pattern (keys starting with prefix)
   */
  async invalidatePattern(pattern: string): Promise<number> {
    let count = 0;

    // Memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith(pattern)) {
        this.memoryCache.delete(key);
        count++;
      }
    }

    // IndexedDB
    if (this.db) {
      try {
        count += await this.deleteFromIndexedDBPattern(pattern);
      } catch (error) {
        console.warn('IndexedDB pattern delete failed:', error);
      }
    }

    if (count > 0) {
      this.stats.invalidations += count;
      this.logCachePatternInvalidation(pattern, count);
    }

    return count;
  }

  /**
   * Invalidate by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    let count = 0;

    // Memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.tags && entry.tags.some(tag => tags.includes(tag))) {
        this.memoryCache.delete(key);
        count++;
      }
    }

    // IndexedDB
    if (this.db) {
      try {
        count += await this.deleteFromIndexedDBByTags(tags);
      } catch (error) {
        console.warn('IndexedDB tag delete failed:', error);
      }
    }

    if (count > 0) {
      this.stats.invalidations += count;
      this.logCacheTagInvalidation(tags, count);
    }

    return count;
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    const count = this.memoryCache.size;
    this.memoryCache.clear();

    if (this.db) {
      try {
        await this.clearIndexedDB();
      } catch (error) {
        console.warn('IndexedDB clear failed:', error);
      }
    }

    this.stats.invalidations += count;
    this.logCacheClear(count);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.totalRequests;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      currentSize: this.memoryCache.size,
      maxSize: this.config.maxSize
    };
  }

  /**
   * Log cache statistics to console
   */
  logStats(): void {
    const stats = this.getStats();
    console.log(`📊 CACHE STATS [${this.dbName}]:`, {
      'Hit Rate': `${stats.hitRate}%`,
      'Total Requests': stats.totalRequests,
      'Cache Hits': stats.hits,
      'Cache Misses': stats.misses,
      'Expired': stats.expired,
      'Evictions': stats.evictions,
      'Invalidations': stats.invalidations,
      'Cache Size': `${stats.currentSize}/${stats.maxSize}`,
      'Avg Response Time': `${Math.round(stats.averageResponseTime)}ms`
    });
  }

  // Private helper methods
  private isValidEntry(entry: CacheEntry<T>): boolean {
    const now = Date.now();
    return (now - entry.timestamp) < entry.ttl;
  }

  private evictLRU(): void {
    if (this.memoryCache.size === 0) return;

    // Remove oldest entry (first in Map)
    const oldestKey = this.memoryCache.keys().next().value;
    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
    }
    this.stats.evictions++;
  }

  private updateStats(responseTime: number): void {
    if (this.config.enablePerformanceMonitoring) {
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (this.stats.totalRequests - 1) + responseTime) / this.stats.totalRequests;
    }
  }

  private logCacheHit(key: string, source: 'memory' | 'indexeddb'): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`🎯 CACHE HIT [${source}]: ${key}`);
    }
  }

  private logCacheMiss(key: string): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`❌ CACHE MISS: ${key}`);
    }
  }

  private logCacheSet(key: string, ttl: number): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`✅ CACHE SET: ${key} (TTL: ${ttl / 1000}s)`);
    }
  }

  private logCacheInvalidation(key: string): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`🗑️ CACHE INVALIDATE: ${key}`);
    }
  }

  private logCachePatternInvalidation(pattern: string, count: number): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`🗑️ CACHE PATTERN INVALIDATE: ${pattern} (${count} entries)`);
    }
  }

  private logCacheTagInvalidation(tags: string[], count: number): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`🗑️ CACHE TAG INVALIDATE: [${tags.join(', ')}] (${count} entries)`);
    }
  }

  private logCacheClear(count: number): void {
    if (this.config.enablePerformanceMonitoring) {
      console.log(`🗑️ CACHE CLEAR: ${count} entries`);
    }
  }

  // IndexedDB helper methods
  private async getFromIndexedDB(key: string): Promise<CacheEntry<T> | null> {
    if (!this.db) return null;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readonly');
      const store = transaction.objectStore('cache');
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result?.entry || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async setInIndexedDB(key: string, entry: CacheEntry<T>): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.put({ key, entry });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteFromIndexedDB(key: string): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteFromIndexedDBPattern(pattern: string): Promise<number> {
    if (!this.db) return 0;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result;
        let count = 0;
        
        for (const item of items) {
          if (item.key.startsWith(pattern)) {
            store.delete(item.key);
            count++;
          }
        }
        resolve(count);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteFromIndexedDBByTags(tags: string[]): Promise<number> {
    if (!this.db) return 0;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result;
        let count = 0;
        
        for (const item of items) {
          if (item.entry.tags && item.entry.tags.some((tag: string) => tags.includes(tag))) {
            store.delete(item.key);
            count++;
          }
        }
        resolve(count);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async clearIndexedDB(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Global cache instances - OPTIMIZED for dashboard display (50 items max)
export const dashboardCache = new UnifiedCacheService('dashboard', {
  maxSize: 50, // Only cache what we show in dashboard
  defaultTtl: 120000, // 2 minutes
  enableIndexedDB: true,
  enablePerformanceMonitoring: true
});

export const todosCache = new UnifiedCacheService('todos', {
  maxSize: 50, // Only cache visible todos
  defaultTtl: 180000, // 3 minutes
  enableIndexedDB: true,
  enablePerformanceMonitoring: true
});

export const notesCache = new UnifiedCacheService('notes', {
  maxSize: 50, // Only cache visible notes
  defaultTtl: 300000, // 5 minutes
  enableIndexedDB: true,
  enablePerformanceMonitoring: true
});

export const documentsCache = new UnifiedCacheService('documents', {
  maxSize: 50, // Only cache visible documents
  defaultTtl: 600000, // 10 minutes
  enableIndexedDB: true,
  enablePerformanceMonitoring: true
});

export const projectsCache = new UnifiedCacheService('projects', {
  maxSize: 50, // Only cache visible projects
  defaultTtl: 300000, // 5 minutes
  enableIndexedDB: true,
  enablePerformanceMonitoring: true
});

export const diaryCache = new UnifiedCacheService('diary', {
  maxSize: 50, // Only cache visible diary entries
  defaultTtl: 60000, // 1 minute
  enableIndexedDB: true,
  enablePerformanceMonitoring: true
});

export const archiveCache = new UnifiedCacheService('archive', {
  maxSize: 50, // Only cache visible archive items
  defaultTtl: 300000, // 5 minutes
  enableIndexedDB: true,
  enablePerformanceMonitoring: true
});

export const searchCache = new UnifiedCacheService('search', {
  maxSize: 100, // Cache more search results
  defaultTtl: 180000, // 3 minutes
  enableIndexedDB: true,
  enablePerformanceMonitoring: true
});

export const userCache = new UnifiedCacheService('user', {
  maxSize: 10, // Minimal user data
  defaultTtl: 900000, // 15 minutes
  enableIndexedDB: true,
  enablePerformanceMonitoring: true
});

// Utility function to get all cache statistics
export const getAllCacheStats = () => ({
  dashboard: dashboardCache.getStats(),
  todos: todosCache.getStats(),
  notes: notesCache.getStats(),
  documents: documentsCache.getStats(),
  projects: projectsCache.getStats(),
  diary: diaryCache.getStats(),
  archive: archiveCache.getStats(),
  search: searchCache.getStats(),
  user: userCache.getStats()
});

// Utility function to log all cache statistics
export const logAllCacheStats = () => {
  console.log('📊 ALL CACHE STATISTICS:');
  dashboardCache.logStats();
  todosCache.logStats();
  notesCache.logStats();
  documentsCache.logStats();
  projectsCache.logStats();
  diaryCache.logStats();
  archiveCache.logStats();
  searchCache.logStats();
  userCache.logStats();
};

export default UnifiedCacheService;
