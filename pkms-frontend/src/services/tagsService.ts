/**
 * Tags Service - Global tag operations
 * No module filtering - tags work across all modules
 */

import { BaseService } from './BaseService';
import { Tag, TagAutocompleteResponse, CreateTagRequest, UpdateTagRequest } from '../types/tag';

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
   * Get tags for autocomplete
   */
  async getAutocompleteTags(query?: string): Promise<TagAutocompleteResponse[]> {
    const params = query ? { search: query } : {};
    const response = await this.search(params);
    return response as TagAutocompleteResponse[];
  }

  /**
   * Get tags by usage count
   */
  async getPopularTags(limit: number = 10): Promise<Tag[]> {
    const response = await this.getAll({ sortBy: 'usageCount', sortOrder: 'desc', limit });
    return response;
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
