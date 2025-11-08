/**
 * Base CRUD Service Class
 * Industry standard service layer abstraction
 * Extends for all module services (Todos, Documents, Projects)
 */

import { apiService } from './api';

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: any;
}

export abstract class BaseCRUDService<T, TCreate, TUpdate> {
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
  async getPaginated(params: PaginationParams): Promise<PaginatedResponse<T>> {
    const response = await apiService.get<PaginatedResponse<T>>(`${this.baseUrl}/paginated`, { params });
    return response.data;
  }
}