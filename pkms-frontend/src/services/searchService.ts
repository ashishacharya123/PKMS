import { apiService } from './api';

export interface SearchResult {
  id: string;
  type: 'note' | 'document' | 'todo' | 'archive' | 'archive-folder' | 'diary' | 'project' | 'folder';
  title: string;
  content: string;
  preview: string;
  thumbnail?: string;
  path: string;
  score: number;
  relevance: 'high' | 'medium' | 'low';
  tags: string[];
  createdAt: string;
  updatedAt: string;
  metadata: {
    [key: string]: any;
    hasContent?: boolean;
  };
}

export interface SearchFilters {
  types?: ('note' | 'document' | 'todo' | 'archive' | 'archive-folder' | 'diary' | 'project' | 'folder')[];
  tags?: string[];
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'relevance' | 'date' | 'title' | 'module';
  sortOrder?: 'asc' | 'desc';
  includeContent?: boolean;
  include_tags?: string[];
  exclude_tags?: string[];
  favorites_only?: boolean;
  include_archived?: boolean;
  exclude_diary?: boolean;
  fuzzy_threshold?: number;
  min_file_size?: number;
  max_file_size?: number;
  todo_status?: string;
  todo_priority?: string;
  mime_types?: string;
}

export interface SearchSuggestion {
  text: string;
  module: string;
  type: string;
  score: number;
}

export interface SearchStats {
  totalResults: number;
  resultsByType: {
    note: number;
    document: number;
    todo: number;
    archive: number;
    'archive-folder': number;
    diary: number;
    project: number;
    folder: number;
  };
  searchTime: number;
  query: string;
  includeContent: boolean;
  appliedFilters: {
    contentTypes: string[];
    tags: string[];
  };
}

export interface SearchResponse {
  results: SearchResult[];
  stats: SearchStats;
  suggestions?: string[];
}

export interface TagInfo {
  name: string;
  color: string;
  type: string;
  count?: number;
}

export interface ModuleSearchOptions {
  module: 'notes' | 'documents' | 'todos' | 'archive' | 'global';
  query: string;
  filters?: {
    contentTypes?: string[];
    tags?: string[];
    dateRange?: {
      start?: string;
      end?: string;
    };
    moduleSpecific?: {
      // Notes
      area?: string;
      year?: number;
      // Documents  
      mimeType?: string;
      sizeRange?: { min?: number; max?: number };
      // Todos
      status?: string;
      priority?: string;
      projectId?: number;
      // Archive
      folderUuid?: string;
    };
  };
  sortBy?: 'relevance' | 'date' | 'title';
  includeContent?: boolean;
  limit?: number;
  offset?: number;
}

class SearchService {
  private cache = new Map<string, SearchResponse>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private cacheTimestamps = new Map<string, number>();

  // Dedicated fuzzy search using the enhanced fuzzy endpoint
  async fuzzySearch(options: {
    q: string;
    modules?: string[];
    include_tags?: string[];
    exclude_tags?: string[];
    sort_by?: string;
    sort_order?: string;
    limit?: number;
    offset?: number;
    [key: string]: any;
  }): Promise<SearchResponse> {
    const searchParams: Record<string, string> = {
      q: options.q,
      limit: (options.limit || 50).toString(),
      offset: (options.offset || 0).toString(),
      sort_by: options.sort_by || 'relevance',
      sort_order: options.sort_order || 'desc'
    };

    if (options.modules?.length) {
      searchParams.modules = this.frontendToBackendModules(options.modules).join(',');
    }

    if (options.include_tags?.length) {
      searchParams.include_tags = options.include_tags.join(',');
    }

    if (options.exclude_tags?.length) {
      searchParams.exclude_tags = options.exclude_tags.join(',');
    }

    const cacheKey = this.generateCacheKey(options.q, searchParams, options.limit || 50, options.offset || 0);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const params = new URLSearchParams(searchParams);
      const response = await apiService.get(`/search/fuzzy?${params}`);
      const backendData = response.data as any;
      
      const searchResponse: SearchResponse = {
        results: this.processSearchResults(backendData.results || []),
        stats: {
          totalResults: backendData.total || 0,
          resultsByType: this.calculateResultsByType(backendData.results || []),
          searchTime: 0,
          query: options.q,
          includeContent: true,
          appliedFilters: {
            contentTypes: options.modules || [],
            tags: options.include_tags || []
          }
        }
      };
      
      this.setCache(cacheKey, searchResponse);
      return searchResponse;
    } catch (error) {
      console.error('Fuzzy search failed:', error);
      throw new Error('Fuzzy search failed');
    }
  }

  async globalSearch(
    optionsOrQuery: string | {
      q: string;
      modules?: string;
      include_content?: boolean;
      use_fuzzy?: boolean;
      sort_by?: string;
      sort_order?: string;
      limit?: number;
      offset?: number;
      [key: string]: any;
    },
    filters: SearchFilters = {},
    limit: number = 50,
    offset: number = 0
  ): Promise<SearchResponse> {
    // Handle both old and new calling patterns
    let searchParams: any;
    
    if (typeof optionsOrQuery === 'string') {
      // Legacy call pattern
      searchParams = {
        q: optionsOrQuery,
        limit: limit.toString(),
        offset: offset.toString(),
        sort_by: filters.sortBy || 'relevance',
        include_content: (filters.includeContent === true).toString(),
      };

      if (filters.types?.length) {
        searchParams.content_types = this.frontendToBackendModules(filters.types).join(',');
      }

      if (filters.tags?.length) {
        searchParams.tags = filters.tags.join(',');
      }
    } else {
      // New call pattern from AdvancedFuzzySearchPage
      const tmpParams: Record<string, string> = {
        q: optionsOrQuery.q,
        include_content: (optionsOrQuery.include_content ?? false).toString(),
        use_fuzzy: (optionsOrQuery.use_fuzzy ?? true).toString(),
        sort_by: optionsOrQuery.sort_by || 'relevance',
        sort_order: optionsOrQuery.sort_order || 'desc',
        limit: (optionsOrQuery.limit ?? 50).toString(),
        offset: (optionsOrQuery.offset ?? 0).toString(),
      };

      if (optionsOrQuery.modules && optionsOrQuery.modules.length > 0) {
        tmpParams.modules = optionsOrQuery.modules;
      }

      // Allow diary search only if explicitly requested
      const excludeDiary = !(optionsOrQuery.modules?.includes('diary') ||
                             (optionsOrQuery as any).content_types?.includes?.('diary'));
      tmpParams.exclude_diary = excludeDiary.toString();

      searchParams = tmpParams;
    }

    const cacheKey = this.generateCacheKey(searchParams.q, searchParams, 
      parseInt(searchParams.limit), parseInt(searchParams.offset));
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const params = new URLSearchParams(searchParams);
      const response = await apiService.get(`/search/hybrid?${params}`);
      // The response is wrapped in ApiResponse.data
      const backendData = response.data as any;
      const searchResponse: SearchResponse = {
        results: this.processSearchResults(backendData.results || []),
        stats: {
          totalResults: backendData.total || 0,
          resultsByType: this.calculateResultsByType(backendData.results || []),
          searchTime: 0, // Backend doesn't currently provide this
          query: searchParams.q,
          includeContent: searchParams.include_content === 'true',
          appliedFilters: {
            contentTypes: searchParams.modules ? searchParams.modules.split(',') : [],
            tags: []
          }
        }
      };
      this.setCache(cacheKey, searchResponse);
      return searchResponse;
    } catch (error) {
      console.error('Global search failed:', error);
      throw new Error('Search failed');
    }
  }

  async getSearchSuggestions(query: string): Promise<string[]> {
    if (query.length < 2) return [];

    try {
      const response = await apiService.get(`/search/suggestions?q=${encodeURIComponent(query)}`);
      return (response.data as any)?.suggestions || [];
    } catch (error) {
      console.error('Failed to get search suggestions:', error);
      return [];
    }
  }

  async getPopularTags(moduleType?: string): Promise<TagInfo[]> {
    try {
      const params = moduleType ? `?module_type=${moduleType}` : '';
      const response = await apiService.get(`/search/popular-tags${params}`);
      return (response.data as any)?.tags || [];
    } catch (error) {
      console.error('Failed to get popular tags:', error);
      return [];
    }
  }

  async getTagAutocomplete(query: string, moduleType?: string): Promise<TagInfo[]> {
    if (query.length < 1) return [];

    try {
      const params = new URLSearchParams({ q: query });
      // Optionally include module_type when provided
      if (moduleType) params.append('module_type', moduleType);
      
      const response = await apiService.get(`/tags/autocomplete-enhanced?${params}`);
      return (response.data as any)?.tags || [];
    } catch (error) {
      console.error('Failed to get tag autocomplete:', error);
      return [];
    }
  }

  async createTag(name: string, color: string = '#757575', moduleType: string): Promise<TagInfo> {
    try {
      const params = new URLSearchParams({
        name,
        color,
        module_type: moduleType
      });

      const response = await apiService.post(`/search/tags/create?${params}`);
      return response.data as TagInfo;
    } catch (error) {
      console.error('Failed to create tag:', error);
      throw new Error('Failed to create tag');
    }
  }

  async updateTag(tagId: number, updates: { name?: string; color?: string }): Promise<TagInfo> {
    try {
      const params = new URLSearchParams();
      if (updates.name) params.append('name', updates.name);
      if (updates.color) params.append('color', updates.color);

      const response = await apiService.put(`/search/tags/${tagId}?${params}`);
      return response.data as TagInfo;
    } catch (error) {
      console.error('Failed to update tag:', error);
      throw new Error('Failed to update tag');
    }
  }

  async deleteTag(tagId: number): Promise<void> {
    try {
      await apiService.delete(`/search/tags/${tagId}`);
    } catch (error) {
      console.error('Failed to delete tag:', error);
      throw new Error('Failed to delete tag');
    }
  }

  async getRecentSearches(): Promise<string[]> {
    // Get from localStorage
    const stored = localStorage.getItem('pkms_recent_searches');
    return stored ? JSON.parse(stored) : [];
  }

  async saveRecentSearch(query: string): Promise<void> {
    const recent = await this.getRecentSearches();
    const filtered = recent.filter(q => q.toLowerCase() !== query.toLowerCase());
    const updated = [query, ...filtered].slice(0, 10);
    localStorage.setItem('pkms_recent_searches', JSON.stringify(updated));
  }

  async clearRecentSearches(): Promise<void> {
    localStorage.removeItem('pkms_recent_searches');
  }

  private processSearchResults(results: any[]): SearchResult[] {
    return results.map(result => ({
      id: result.uuid || result.id,
      type: result.module || result.type,
      title: result.title,
      content: result.content || '',
      preview: result.preview || result.snippet || this.generatePreview(result),
      thumbnail: result.thumbnail,
      path: result.path || this.generatePath(result),
      score: result.relevance_score || result.combined_score || result.score || 0,
      relevance: result.relevance_level || this.calculateRelevance(result.relevance_score || result.score || 0),
      tags: result.tags || [],
      createdAt: result.created_at || result.createdAt,
      updatedAt: result.updated_at || result.updatedAt,
      metadata: result.metadata || {}
    }));
  }

  private calculateResultsByType(results: any[]): { note: number; document: number; todo: number; archive: number; 'archive-folder': number; diary: number; project: number; folder: number } {
    const counts = { note: 0, document: 0, todo: 0, archive: 0, 'archive-folder': 0, diary: 0, project: 0, folder: 0 };

    results.forEach(result => {
      const type = result.module || result.type;
      // Backend module name mapping to frontend type
      if (type === 'notes') counts.note++;
      else if (type === 'documents') counts.document++;
      else if (type === 'todos') counts.todo++;
      else if (type === 'archive' || type === 'archive_items') counts.archive++;
      else if (type === 'folders' || type === 'archive_folders') counts['archive-folder']++;
      else if (type === 'diary') counts.diary++;
      else if (type === 'projects') counts.project++;
      else if (type === 'folders') counts.folder++;
    });

    return counts;
  }

  private generatePreview(result: any): string {
    if (result.content) return result.content.substring(0, 200) + '...';
    if (result.description) return result.description.substring(0, 200) + '...';
    return result.title || '';
  }

  private generatePath(result: any): string {
    const type = result.module || result.type;
    switch (type) {
      case 'notes':
      case 'note': return `/notes/${result.id}`;
      case 'documents':
      case 'document': return '/documents';
      case 'todos':
      case 'todo': return '/todos';
      case 'archive':
      case 'archive_items':
      case 'archive': return '/archive';
      case 'diary': return '/diary';
      case 'projects':
      case 'project': return '/todos';
      case 'folders':
      case 'archive_folders':
      case 'folder': return '/archive';
      default: return '/';
    }
  }

  private calculateRelevance(score: number): 'high' | 'medium' | 'low' {
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
  }

  private generateCacheKey(
    query: string,
    filters: SearchFilters,
    limit: number,
    offset: number
  ): string {
    return `search:${query}:${JSON.stringify(filters)}:${limit}:${offset}`;
  }

  /**
   * Convert frontend module names to backend module names
   */
  frontendToBackendModules(frontendTypes: string[]): string[] {
    const mapping: Record<string, string> = {
      'note': 'notes',
      'document': 'documents',
      'todo': 'todos',
      'archive': 'archive_items',
      'archive-folder': 'folders',
      'diary': 'diary',
      'project': 'projects',
      'folder': 'folders'
    };

    return frontendTypes.map(type => mapping[type] || type);
  }

  /**
   * Convert backend module names to frontend type names
   */
  backendToFrontendTypes(backendModules: string[]): string[] {
    const mapping: Record<string, string> = {
      'notes': 'note',
      'documents': 'document',
      'todos': 'todo',
      'archive_items': 'archive',
      'folders': 'folder',
      'archive_folders': 'folder',
      'diary': 'diary',
      'projects': 'project'
    };

    return backendModules.map(module => mapping[module] || module);
  }

  private getFromCache(key: string): SearchResponse | null {
    const timestamp = this.cacheTimestamps.get(key);
    if (!timestamp || Date.now() - timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
      return null;
    }
    return this.cache.get(key) || null;
  }

  private setCache(key: string, value: SearchResponse): void {
    this.cache.set(key, value);
    this.cacheTimestamps.set(key, Date.now());
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }

  /**
   * Invalidate cache for specific content types when items are created/updated/deleted
   */
  invalidateCacheForContentType(contentType: 'note' | 'document' | 'todo' | 'archive' | 'diary'): void {
    // Remove all cache entries that include this content type
    const keysToRemove: string[] = [];
    
    for (const [key] of this.cache) {
      // Parse the cache key to check if it includes this content type
      try {
        const parts = key.split(':');
        if (parts.length >= 3) {
          const filtersStr = parts[2];
          const filters = JSON.parse(filtersStr);
          
          // If no specific types are filtered (searches all types) or includes this type
          if (!filters.types || filters.types.includes(contentType)) {
            keysToRemove.push(key);
          }
        }
      } catch (error) {
        // If we can't parse the key, remove it to be safe
        keysToRemove.push(key);
      }
    }
    
    // Remove the invalid cache entries
    keysToRemove.forEach(key => {
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
    });
  }

  /**
   * Invalidate cache when tags are modified
   */
  invalidateCacheForTags(): void {
    // Clear all cache since tag changes can affect search results
    this.clearCache();
  }

  /**
   * Invalidate cache for specific search queries (e.g., when content matching query changes)
   */
  invalidateCacheForQuery(query: string): void {
    const keysToRemove: string[] = [];
    
    for (const [key] of this.cache) {
      // Remove cache entries that match this query (case-insensitive)
      const parts = key.split(':');
      if (parts.length >= 2) {
        const cachedQuery = parts[1].toLowerCase();
        if (cachedQuery.includes(query.toLowerCase()) || query.toLowerCase().includes(cachedQuery)) {
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => {
      this.cache.delete(key);
      this.cacheTimestamps.delete(key);
    });
  }

  getSearchResultsCount(results: SearchResult[], type?: string): number {
    return type ? results.filter(r => r.type === type).length : results.length;
  }

  groupResultsByType(results: SearchResult[]): Record<string, SearchResult[]> {
    return results.reduce((groups, result) => {
      const type = result.type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(result);
      return groups;
    }, {} as Record<string, SearchResult[]>);
  }

  formatSearchTime(milliseconds: number): string {
    if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
    return `${(milliseconds / 1000).toFixed(2)}s`;
  }

  async searchInModule(options: ModuleSearchOptions): Promise<SearchResponse> {
    // For module-specific search, we can use the global search with type filtering
    const filters: SearchFilters = {
      types: options.module === 'global' ? undefined : [options.module as any],
      tags: options.filters?.tags,
      sortBy: options.sortBy || 'relevance',
      includeContent: options.includeContent !== false
    };

    return this.globalSearch(
      options.query,
      filters,
      options.limit || 50,
      options.offset || 0
    );
  }

  // Enhanced search with advanced filtering
  async advancedSearch(
    query: string,
    options: {
      modules: string[];
      includeArchived?: boolean;
      tagFilters?: { include?: string[]; exclude?: string[] };
      dateFilters?: { created?: string; modified?: string; range?: string };
      contentFilters?: { hasImages?: boolean; hasLinks?: boolean; minLength?: number };
      sorting?: { primary: string; secondary?: string; direction?: 'asc' | 'desc' };
      groupBy?: 'module' | 'date' | 'tag' | 'relevance';
      includeContent?: boolean;
    }
  ): Promise<SearchResponse> {
    // Convert advanced options to standard filters
    const filters: SearchFilters = {
      types: options.modules as ('note' | 'document' | 'todo' | 'archive')[],
      tags: options.tagFilters?.include,
      sortBy: (options.sorting?.primary as 'relevance' | 'date' | 'title') || 'relevance',
      includeContent: options.includeContent !== false
    };

    return this.globalSearch(query, filters);
  }

  // Tag management helpers
  async getAllTagsForModule(moduleType: string): Promise<TagInfo[]> {
    return this.getPopularTags(moduleType);
  }

  async searchTags(query: string, moduleType?: string): Promise<TagInfo[]> {
    return this.getTagAutocomplete(query, moduleType);
  }

  // Content exclusion helper
  getContentExcludedPreview(result: SearchResult): string {
    const hasContent = result.metadata?.hasContent;
    if (!hasContent) {
      return result.title;
    }
    return `${result.title} (Content available - enable "Include Content" to see full preview)`;
  }

  // Unified FTS5 Search
  async fts5Search(options: {
    query: string;
    modules?: string[];
    page?: number;
    limit?: number;
    include_tags?: string[];
    exclude_tags?: string[];
    favorites_only?: boolean;
    include_archived?: boolean;
    exclude_diary?: boolean;
    sort_by?: string;
    sort_order?: string;
    date_from?: string;
    date_to?: string;
    mime_types?: string;
    min_file_size?: number;
    max_file_size?: number;
    todo_status?: string;
    todo_priority?: string;
  }): Promise<SearchResponse> {
    const searchParams: Record<string, string> = {
      q: options.query,
      limit: (options.limit || 20).toString(),
      offset: ((options.page || 1) - 1).toString(),
      sort_by: options.sort_by || 'relevance',
      sort_order: options.sort_order || 'desc'
    };

    if (options.modules?.length) {
      searchParams.modules = this.frontendToBackendModules(options.modules).join(',');
    }

    if (options.include_tags?.length) {
      searchParams.include_tags = options.include_tags.join(',');
    }

    if (options.exclude_tags?.length) {
      searchParams.exclude_tags = options.exclude_tags.join(',');
    }

    if (options.favorites_only) {
      searchParams.favorites_only = 'true';
    }

    if (options.include_archived !== undefined) {
      searchParams.include_archived = options.include_archived.toString();
    }

    if (options.exclude_diary !== undefined) {
      searchParams.exclude_diary = options.exclude_diary.toString();
    }

    if (options.date_from) {
      searchParams.date_from = options.date_from;
    }

    if (options.date_to) {
      searchParams.date_to = options.date_to;
    }

    const cacheKey = this.generateCacheKey(options.query, searchParams, options.limit || 20, options.page || 1);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await apiService.get(`/search/fts5?${new URLSearchParams(searchParams)}`);
      const processed = this.processSearchResults((response.data as any)?.results || []);
      const searchResponse: SearchResponse = {
        results: processed,
        total: (response.data as any)?.total || processed.length,
        query: options.query,
        search_type: 'fts5',
        performance: (response.data as any)?.performance || 'high',
        stats: {
          totalResults: (response.data as any)?.total || processed.length,
          resultsByType: this.calculateResultsByType((response.data as any)?.results || []),
          searchTime: (response.data as any)?.stats?.searchTime || 0,
          query: options.query,
          includeContent: false,
          appliedFilters: (response.data as any)?.stats?.appliedFilters || {}
        }
      };

      this.setToCache(cacheKey, searchResponse);
      return searchResponse;
    } catch (error) {
      console.error('FTS5 search error:', error);
      return {
        results: [],
        total: 0,
        query: options.query,
        search_type: 'fts5',
        performance: 'low',
        stats: {
          totalResults: 0,
          resultsByType: { note: 0, document: 0, todo: 0, archive: 0, 'archive-folder': 0, diary: 0, project: 0, folder: 0 },
          searchTime: 0,
          query: options.query,
          includeContent: false,
          appliedFilters: {}
        }
      };
    }
  }

  // Unified Fuzzy Search
  async fuzzySearch(options: {
    query: string;
    modules?: string[];
    page?: number;
    limit?: number;
    include_tags?: string[];
    exclude_tags?: string[];
    include_archived?: boolean;
    exclude_diary?: boolean;
    sort_by?: string;
    sort_order?: string;
    fuzzy_threshold?: number;
  }): Promise<SearchResponse> {
    const searchParams: Record<string, string> = {
      q: options.query,
      limit: (options.limit || 20).toString(),
      offset: ((options.page || 1) - 1).toString(),
      sort_by: options.sort_by || 'relevance',
      sort_order: options.sort_order || 'desc',
      fuzzy_threshold: (options.fuzzy_threshold || 60).toString()
    };

    if (options.modules?.length) {
      searchParams.modules = this.frontendToBackendModules(options.modules).join(',');
    }

    if (options.include_tags?.length) {
      searchParams.include_tags = options.include_tags.join(',');
    }

    if (options.exclude_tags?.length) {
      searchParams.exclude_tags = options.exclude_tags.join(',');
    }

    if (options.include_archived !== undefined) {
      searchParams.include_archived = options.include_archived.toString();
    }

    if (options.exclude_diary !== undefined) {
      searchParams.exclude_diary = options.exclude_diary.toString();
    }

    const cacheKey = this.generateCacheKey(`fuzzy_${options.query}`, searchParams, options.limit || 20, options.page || 1);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await apiService.get(`/search/fuzzy?${new URLSearchParams(searchParams)}`);
      const processed = this.processSearchResults((response.data as any)?.results || []);
      const searchResponse: SearchResponse = {
        results: processed,
        total: (response.data as any)?.total || processed.length,
        query: options.query,
        search_type: 'fuzzy',
        performance: (response.data as any)?.performance || 'deep',
        stats: {
          totalResults: (response.data as any)?.total || processed.length,
          resultsByType: this.calculateResultsByType((response.data as any)?.results || []),
          searchTime: (response.data as any)?.stats?.searchTime || 0,
          query: options.query,
          includeContent: false,
          appliedFilters: (response.data as any)?.stats?.appliedFilters || {}
        }
      };

      this.setToCache(cacheKey, searchResponse);
      return searchResponse;
    } catch (error) {
      console.error('Fuzzy search error:', error);
      return {
        results: [],
        total: 0,
        query: options.query,
        search_type: 'fuzzy',
        performance: 'low',
        stats: {
          totalResults: 0,
          resultsByType: { note: 0, document: 0, todo: 0, archive: 0, 'archive-folder': 0, diary: 0, project: 0, folder: 0 },
          searchTime: 0,
          query: options.query,
          includeContent: false,
          appliedFilters: {}
        }
      };
    }
  }

  // Hybrid Search (combines FTS5 and Fuzzy)
  async hybridSearch(options: {
    query: string;
    modules?: string[];
    page?: number;
    limit?: number;
    include_tags?: string[];
    exclude_tags?: string[];
    include_archived?: boolean;
    exclude_diary?: boolean;
    sort_by?: string;
    sort_order?: string;
    use_fuzzy?: boolean;
  }): Promise<SearchResponse> {
    const searchParams: Record<string, string> = {
      q: options.query,
      limit: (options.limit || 20).toString(),
      offset: ((options.page || 1) - 1).toString(),
      sort_by: options.sort_by || 'relevance',
      sort_order: options.sort_order || 'desc'
    };

    if (options.modules?.length) {
      searchParams.modules = this.frontendToBackendModules(options.modules).join(',');
    }

    if (options.include_tags?.length) {
      searchParams.include_tags = options.include_tags.join(',');
    }

    if (options.exclude_tags?.length) {
      searchParams.exclude_tags = options.exclude_tags.join(',');
    }

    if (options.include_archived !== undefined) {
      searchParams.include_archived = options.include_archived.toString();
    }

    if (options.exclude_diary !== undefined) {
      searchParams.exclude_diary = options.exclude_diary.toString();
    }

    if (options.use_fuzzy !== undefined) {
      searchParams.use_fuzzy = options.use_fuzzy.toString();
    }

    const cacheKey = this.generateCacheKey(`hybrid_${options.query}`, searchParams, options.limit || 20, options.page || 1);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const response = await apiService.get(`/search/hybrid?${new URLSearchParams(searchParams)}`);
      const processed = this.processSearchResults((response.data as any)?.results || []);
      const searchResponse: SearchResponse = {
        results: processed,
        total: (response.data as any)?.total || processed.length,
        query: options.query,
        search_type: (response.data as any)?.search_type || 'hybrid',
        performance: (response.data as any)?.performance || 'high',
        stats: {
          totalResults: (response.data as any)?.total || processed.length,
          resultsByType: this.calculateResultsByType((response.data as any)?.results || []),
          searchTime: (response.data as any)?.stats?.searchTime || 0,
          query: options.query,
          includeContent: false,
          appliedFilters: (response.data as any)?.stats?.appliedFilters || {}
        }
      };

      this.setToCache(cacheKey, searchResponse);
      return searchResponse;
    } catch (error) {
      console.error('Hybrid search error:', error);
      return {
        results: [],
        total: 0,
        query: options.query,
        search_type: 'hybrid',
        performance: 'low',
        stats: {
          totalResults: 0,
          resultsByType: { note: 0, document: 0, todo: 0, archive: 0, 'archive-folder': 0, diary: 0, project: 0, folder: 0 },
          searchTime: 0,
          query: options.query,
          includeContent: false,
          appliedFilters: {}
        }
      };
    }
  }

  // Cross-module search that searches across all modules
  async crossModuleSearch(query: string, options: {
    modules?: string[];
    limit?: number;
    offset?: number;
    use_fuzzy?: boolean;
    include_archived?: boolean;
    exclude_diary?: boolean;
  } = {}): Promise<SearchResponse> {
    const searchParams: Record<string, string> = {
      q: query,
      limit: (options.limit || 50).toString(),
      offset: (options.offset || 0).toString()
    };

    if (options.modules?.length) {
      searchParams.content_types = options.modules.join(',');
    }

    if (options.use_fuzzy !== undefined) {
      searchParams.use_fuzzy = options.use_fuzzy.toString();
    }

    if (options.include_archived !== undefined) {
      searchParams.include_archived = options.include_archived.toString();
    }

    if (options.exclude_diary !== undefined) {
      searchParams.exclude_diary = options.exclude_diary.toString();
    }

    try {
      const response = await apiService.get(`/search/global?${new URLSearchParams(searchParams)}`);
      const processed = this.processSearchResults((response.data as any)?.results || []);
      return {
        results: processed,
        total: (response.data as any)?.total || processed.length,
        query: query,
        search_type: (response.data as any)?.search_type || 'global',
        performance: (response.data as any)?.performance || 'high',
        stats: {
          totalResults: (response.data as any)?.total || processed.length,
          resultsByType: this.calculateResultsByType((response.data as any)?.results || []),
          searchTime: (response.data as any)?.stats?.searchTime || 0,
          query: query,
          includeContent: false,
          appliedFilters: (response.data as any)?.stats?.appliedFilters || {}
        }
      };
    } catch (error) {
      console.error('Cross-module search error:', error);
      return {
        results: [],
        total: 0,
        query: query,
        search_type: 'global',
        performance: 'low',
        stats: {
          totalResults: 0,
          resultsByType: { note: 0, document: 0, todo: 0, archive: 0, 'archive-folder': 0, diary: 0, project: 0, folder: 0 },
          searchTime: 0,
          query: query,
          includeContent: false,
          appliedFilters: {}
        }
      };
    }
  }

  // Get available tags for search filtering
  async getAvailableTags(moduleType?: string): Promise<TagInfo[]> {
    try {
      const params = new URLSearchParams();
      if (moduleType) {
        params.append('module_type', moduleType);
      }

      const response = await apiService.get(`/search/tags/available?${params}`);
      return (response.data as any)?.tags || [];
    } catch (error) {
      console.error('Failed to get available tags:', error);
      return [];
    }
  }

  // Get real-time search suggestions
  async getSearchSuggestions(query: string, options: {
    modules?: string[];
    limit?: number;
  } = {}): Promise<SearchSuggestion[]> {
    try {
      const params = new URLSearchParams({
        q: query,
        limit: (options.limit || 10).toString()
      });

      if (options.modules?.length) {
        params.append('content_types', options.modules.join(','));
      }

      const response = await apiService.get(`/search/suggestions?${params}`);
      return (response.data as any)?.suggestions || [];
    } catch (error) {
      console.error('Failed to get search suggestions:', error);
      return [];
    }
  }
}

export const searchService = new SearchService(); 