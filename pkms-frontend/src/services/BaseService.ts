import { apiService } from './api';
import logger from '../utils/logger';

export interface CacheConfig {
  ttl?: number;
  tags?: string[];
}

export abstract class BaseService {
  protected cache: any;
  protected defaultCacheTtl = 300000; // 5 minutes

  constructor(cache: any) {
    this.cache = cache;
  }

  protected async getCachedData<T>(
    cacheKey: string,
    apiCall: () => Promise<T>,
    defaultData: T,
    config: CacheConfig = {}
  ): Promise<T> {
    const { ttl = this.defaultCacheTtl, tags = [] } = config;

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      logger.debug?.(`Cache hit: ${cacheKey}`);
      return cached as T;
    }

    logger.debug?.(`Cache miss: ${cacheKey}`);

    try {
      const data = await apiCall();
      await this.cache.set(cacheKey, data, ttl, tags);
      logger.debug?.(`Cache set: ${cacheKey}`);
      return data;
    } catch (error: any) {
      logger.error?.(`API error for ${cacheKey}: ${error?.message || error}`);
      return defaultData;
    }
  }

  protected async invalidateCache(keyOrTags: string | string[]) {
    if (Array.isArray(keyOrTags)) {
      await this.cache.invalidateByTags(keyOrTags);
    } else {
      await this.cache.delete(keyOrTags);
    }
  }

  protected async apiGet<T>(endpoint: string, params?: any): Promise<T> {
    const { data } = await apiService.get<T>(endpoint, { params });
    return data;
  }

  protected async apiPost<T>(endpoint: string, body: any): Promise<T> {
    const { data } = await apiService.post<T>(endpoint, body);
    return data;
  }

  protected async apiPut<T>(endpoint: string, body: any): Promise<T> {
    const { data } = await apiService.put<T>(endpoint, body);
    return data;
  }

  protected async apiDelete<T>(endpoint: string): Promise<T> {
    const { data } = await apiService.delete<T>(endpoint);
    return data;
  }
}

/**
 * Base Service Class for CRUD operations
 * Industry standard service layer abstraction
 * Extends for all module services (Notes, Todos, Documents, Projects)
 */

import { apiService } from './api';

export abstract class BaseService<T, TCreate, TUpdate> {
  constructor(protected baseUrl: string) {}
  
  /**
   * Get all items with optional query parameters
   */
  async getAll(params?: Record<string, any>): Promise<T[]> {
    const response = await apiService.get<T[]>(this.baseUrl, { params });
    return response.data;
  }
  
  /**
   * Get item by UUID
   */
  async getById(uuid: string): Promise<T> {
    const response = await apiService.get<T>(`${this.baseUrl}/${uuid}`);
    return response.data;
  }
  
  /**
   * Create new item
   */
  async create(data: TCreate): Promise<T> {
    const response = await apiService.post<T>(this.baseUrl, data as any);
    return response.data;
  }
  
  /**
   * Update existing item
   */
  async update(uuid: string, data: TUpdate): Promise<T> {
    const response = await apiService.patch<T>(`${this.baseUrl}/${uuid}`, data as any);
    return response.data;
  }
  
  /**
   * Delete item
   */
  async delete(uuid: string): Promise<void> {
    await apiService.delete(`${this.baseUrl}/${uuid}`);
  }
  
  /**
   * Search items with query parameters
   */
  async search(params: Record<string, any>): Promise<T[]> {
    const response = await apiService.get<T[]>(`${this.baseUrl}/search`, { params });
    return response.data;
  }
  
  /**
   * Get paginated results
   */
  async getPaginated(params: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    [key: string]: any;
  }): Promise<{ items: T[]; total: number; page: number; limit: number; totalPages: number }> {
    const response = await apiService.get<{
      items: T[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`${this.baseUrl}/paginated`, { params });
    return response.data;
  }
}
