/**
 * Cache-Aware Service Wrapper
 * 
 * Automatically handles cache checking, API calls, and revalidation
 * Eliminates boilerplate and provides stale-while-revalidate pattern
 */

import { archiveCache, todosCache, notesCache, documentsCache, projectsCache, diaryCache } from './unifiedCacheService';
import { logger } from '../utils/logger';

interface CacheAwareOptions {
  ttl?: number;
  tags?: string[];
  enableRevalidation?: boolean;
  revalidationInterval?: number; // in ms
}

class CacheAwareService {
  private revalidationTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Get data with automatic caching and revalidation
   */
  async get<T>(
    cacheKey: string,
    cache: any,
    apiCall: () => Promise<T>,
    options: CacheAwareOptions = {}
  ): Promise<T> {
    const {
      ttl = 300000, // 5 minutes default
      tags = [],
      enableRevalidation = true,
      revalidationInterval = 60000 // 1 minute
    } = options;

    // Check cache first
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug(`Cache hit: ${cacheKey}`, { cacheKey, responseTime: 'instant' });
      
      // Set up background revalidation if enabled
      if (enableRevalidation && !this.revalidationTimers.has(cacheKey)) {
        this.setupRevalidation(cacheKey, cache, apiCall, ttl, tags, revalidationInterval);
      }
      
      return cached;
    }

    logger.debug(`Cache miss: ${cacheKey}`, { cacheKey, action: 'fetching_from_api' });
    return this.fetchAndCache(cacheKey, cache, apiCall, ttl, tags);
  }

  /**
   * Fetch from API and cache the result
   */
  private async fetchAndCache<T>(
    cacheKey: string,
    cache: any,
    apiCall: () => Promise<T>,
    ttl: number,
    tags: string[]
  ): Promise<T> {
    try {
      const data = await apiCall();
      await cache.set(cacheKey, data, ttl, tags);
      logger.debug(`Cache set: ${cacheKey}`, { cacheKey, ttl, tags });
      return data;
    } catch (error) {
      logger.error(`API error: ${cacheKey}`, { cacheKey, error: error.message });
      throw error;
    }
  }

  /**
   * Set up background revalidation
   */
  private setupRevalidation<T>(
    cacheKey: string,
    cache: any,
    apiCall: () => Promise<T>,
    ttl: number,
    tags: string[],
    interval: number
  ) {
    const timer = setInterval(async () => {
      try {
        logger.debug(`Revalidating: ${cacheKey}`, { cacheKey, action: 'background_refresh' });
        const freshData = await apiCall();
        await cache.set(cacheKey, freshData, ttl, tags);
        logger.debug(`Revalidated: ${cacheKey}`, { cacheKey, action: 'updated' });
      } catch (error) {
        logger.warn(`Revalidation failed: ${cacheKey}`, { cacheKey, error: error.message });
      }
    }, interval);

    this.revalidationTimers.set(cacheKey, timer);
  }

  /**
   * Invalidate cache and clear revalidation
   */
  async invalidate(cacheKey: string, cache: any) {
    await cache.delete(cacheKey);
    
    // Clear revalidation timer
    const timer = this.revalidationTimers.get(cacheKey);
    if (timer) {
      clearInterval(timer);
      this.revalidationTimers.delete(cacheKey);
    }
    
    logger.debug(`Cache invalidated: ${cacheKey}`, { cacheKey });
  }

  /**
   * Invalidate by pattern and clear all related timers
   */
  async invalidatePattern(pattern: string, cache: any) {
    await cache.invalidatePattern(pattern);
    
    // Clear all timers for this pattern
    for (const [key, timer] of this.revalidationTimers.entries()) {
      if (key.includes(pattern)) {
        clearInterval(timer);
        this.revalidationTimers.delete(key);
      }
    }
    
    logger.debug(`Pattern invalidated: ${pattern}`, { pattern });
  }

  /**
   * Clean up all timers
   */
  cleanup() {
    for (const timer of this.revalidationTimers.values()) {
      clearInterval(timer);
    }
    this.revalidationTimers.clear();
  }
}

// Global instance
export const cacheAwareService = new CacheAwareService();

/**
 * Archive-specific cache-aware methods
 */
export const archiveCacheAware = {
  async getFolder(folderId: string) {
    return cacheAwareService.get(
      `folder_${folderId}`,
      archiveCache,
      () => import('./archiveService').then(s => s.archiveService.getFolder(folderId)),
      { tags: ['archive', 'folders'], enableRevalidation: true }
    );
  },

  async getFolderItems(folderId: string) {
    return cacheAwareService.get(
      `items_${folderId}`,
      archiveCache,
      () => import('./archiveService').then(s => s.archiveService.getFolderItems(folderId)),
      { tags: ['archive', 'items'], enableRevalidation: true }
    );
  },

  async getFolders(rootUuid?: string) {
    return cacheAwareService.get(
      `folders_${rootUuid || 'root'}`,
      archiveCache,
      () => import('./archiveService').then(s => s.archiveService.listFolders(rootUuid)),
      { tags: ['archive', 'folders'], enableRevalidation: true }
    );
  },

  async invalidateFolder(folderId: string) {
    await cacheAwareService.invalidate(`folder_${folderId}`, archiveCache);
    await cacheAwareService.invalidate(`items_${folderId}`, archiveCache);
  },

  async invalidateAll() {
    await cacheAwareService.invalidatePattern('archive', archiveCache);
  }
};

/**
 * Todos-specific cache-aware methods
 */
export const todosCacheAware = {
  async getTodos() {
    return cacheAwareService.get(
      'todos_list',
      todosCache,
      () => import('./todosService').then(s => s.todosService.getTodos()),
      { tags: ['todos'], enableRevalidation: true }
    );
  },

  async getTodoStats() {
    return cacheAwareService.get(
      'todos_stats',
      todosCache,
      () => import('./todosService').then(s => s.todosService.getTodoStats()),
      { tags: ['todos', 'stats'], enableRevalidation: true }
    );
  },

  async invalidateAll() {
    await cacheAwareService.invalidatePattern('todos', todosCache);
  }
};

/**
 * Notes-specific cache-aware methods
 */
export const notesCacheAware = {
  async getNotes() {
    return cacheAwareService.get(
      'notes_list',
      notesCache,
      () => import('./notesService').then(s => s.notesService.listNotes({})),
      { tags: ['notes'], enableRevalidation: true }
    );
  },

  async invalidateAll() {
    await cacheAwareService.invalidatePattern('notes', notesCache);
  }
};

/**
 * Documents-specific cache-aware methods
 */
export const documentsCacheAware = {
  async getDocuments() {
    return cacheAwareService.get(
      'documents_list',
      documentsCache,
      () => import('./unifiedFileService').then(s => s.unifiedFileService.getDocumentFiles()),
      { tags: ['documents'], enableRevalidation: true }
    );
  },

  async invalidateAll() {
    await cacheAwareService.invalidatePattern('documents', documentsCache);
  }
};

/**
 * Projects-specific cache-aware methods
 */
export const projectsCacheAware = {
  async getProjects() {
    return cacheAwareService.get(
      'projects_list',
      projectsCache,
      () => import('./projectApi').then(s => s.projectApi.getProjects()),
      { tags: ['projects'], enableRevalidation: true }
    );
  },

  async invalidateAll() {
    await cacheAwareService.invalidatePattern('projects', projectsCache);
  }
};

/**
 * Diary-specific cache-aware methods
 */
export const diaryCacheAware = {
  async getEntries(date?: string) {
    return cacheAwareService.get(
      `diary_entries_${date || 'all'}`,
      diaryCache,
      () => import('./diaryService').then(s => s.diaryService.getEntries(date)),
      { tags: ['diary', 'entries'], enableRevalidation: true }
    );
  },

  async invalidateAll() {
    await cacheAwareService.invalidatePattern('diary', diaryCache);
  }
};

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    cacheAwareService.cleanup();
  });
}
