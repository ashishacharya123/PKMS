/**
 * Tags Service - Global tag operations
 * No module filtering - tags work across all modules
 */

import { BaseService } from './BaseService';
import { apiService } from './api';
import { Tag, TagResponse, CreateTagRequest, UpdateTagRequest } from '../types/tag';

class TagsService extends BaseService<Tag, CreateTagRequest, UpdateTagRequest> {
  constructor() {
    super('/tags');
  }

  /**
   * Get all tags with usage statistics
   */
  async getAllTags(): Promise<Tag[]> {
    return this.getAll();
  }

  /**
   * Get tags for autocomplete using the upgraded /autocomplete endpoint
   * Backend now returns List[TagResponse] directly (not wrapped)
   */
  async getAutocompleteTags(query: string): Promise<TagResponse[]> {
    const endpoint = `${this.baseUrl}/autocomplete`;
    const response = await apiService.get<TagResponse[]>(endpoint, { 
      params: { q: query, limit: 20 } 
    });
    
    // Backend returns List[TagResponse] directly
    return response.data;
  }

  /**
   * Get most popular tags (for quick filters widget)
   */
  async getPopularTags(limit: number = 10): Promise<TagResponse[]> {
    const endpoint = `${this.baseUrl}/autocomplete`;
    const response = await apiService.get<TagResponse[]>(endpoint, { 
      params: { q: '', limit }  // Empty query returns most-used tags
    });
    return response.data;
  }

  /**
   * Get tags by name pattern
   */
  async searchTags(pattern: string): Promise<Tag[]> {
    return this.search({ name: pattern });
  }

  /**
   * Create a new tag
   */
  async createTag(tagData: CreateTagRequest): Promise<Tag> {
    return this.create(tagData);
  }

  /**
   * Update an existing tag
   */
  async updateTag(tagUuid: string, tagData: UpdateTagRequest): Promise<Tag> {
    return this.update(tagUuid, tagData);
  }

  /**
   * Delete a tag
   */
  async deleteTag(tagUuid: string): Promise<void> {
    return this.delete(tagUuid);
  }

  /**
   * Get tag usage statistics
   */
  async getTagStats(): Promise<{
    totalTags: number;
    mostUsedTag: Tag | null;
    leastUsedTag: Tag | null;
    averageUsage: number;
  }> {
    const tags = await this.getAll();
    
    if (tags.length === 0) {
      return {
        totalTags: 0,
        mostUsedTag: null,
        leastUsedTag: null,
        averageUsage: 0
      };
    }

    const sortedByUsage = tags.sort((a, b) => b.usageCount - a.usageCount);
    const totalUsage = tags.reduce((sum, tag) => sum + tag.usageCount, 0);
    const averageUsage = totalUsage / tags.length;

    return {
      totalTags: tags.length,
      mostUsedTag: sortedByUsage[0],
      leastUsedTag: sortedByUsage[sortedByUsage.length - 1],
      averageUsage: Math.round(averageUsage * 100) / 100
    };
  }
}

export const tagsService = new TagsService();
