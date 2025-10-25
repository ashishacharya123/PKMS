import { apiService } from './api';

export interface SearchResult {
  id: string;
  module: 'notes' | 'documents' | 'todos' | 'archive' | 'archive-folder' | 'diary' | 'projects' | 'folders';
  title: string;
  preview: string;
  tags: string[];
  score?: number;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, any>;
  // optional HTML highlights if backend provides
  highlight?: string;
  highlight_title?: string;
}

export interface SearchStats {
  totalResults: number;
  searchTime?: number;
  query: string;
  appliedFilters: {
    modules?: string[];
    tags?: string[];
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

export interface SearchFilters {
    modules?: string[];
    include_tags?: string[];
    exclude_tags?: string[];
    include_archived?: boolean;
    exclude_diary?: boolean;
  favorites_only?: boolean;
  sort_by?: 'relevance' | 'date' | 'title' | 'module';
  sort_order?: 'asc' | 'desc';
    date_from?: string;
    date_to?: string;
    mimeTypes?: string;
    minFileSize?: number;
    maxFileSize?: number;
    todoStatus?: string;
    todoPriority?: string;
  fuzzyThreshold?: number;
}

interface CacheEntry {
  response: SearchResponse;
  timestamp: number;
}

class SearchService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL = 5 * 60 * 1000;

  private generateCacheKey(query: string, params: Record<string, string>): string {
    const sortedEntries = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
    return `${query}::${sortedEntries.map(([k, v]) => `${k}=${v}`).join('&')}`;
  }

  private getFromCache(key: string): SearchResponse | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.response;
  }

  private setCache(key: string, response: SearchResponse): void {
    this.cache.set(key, { response, timestamp: Date.now() });
  }

  private normaliseResults(results: any[]): SearchResult[] {
    return results.map((item) => ({
      uuid: item.uuid ?? '',
      module: item.module ?? item.type ?? 'notes',
      title: item.title ?? item.name ?? 'Untitled',
      preview: item.preview ?? item.preview_text ?? '',
      tags: item.tags ?? [],
      score: item.score,
      createdAt: item.createdAt ?? item.createdAt,
      updatedAt: item.updatedAt ?? item.updatedAt,
      metadata: item.metadata ?? {},
      highlight: item.highlight,
      highlight_title: item.highlight_title,
    }));
  }

  async searchFTS(query: string, filters: SearchFilters = {}, page = 1, limit = 20): Promise<SearchResponse> {
    const params: Record<string, string> = {
      q: query,
      offset: ((page - 1) * limit).toString(),
      limit: limit.toString(),
      sort_by: filters.sort_by ?? 'relevance',
      sort_order: filters.sort_order ?? 'desc',
    };

    if (filters.modules?.length) params.modules = filters.modules.join(',');
    if (filters.include_tags?.length) params.include_tags = filters.include_tags.join(',');
    if (filters.exclude_tags?.length) params.exclude_tags = filters.exclude_tags.join(',');
    if (filters.include_archived !== undefined) params.include_archived = String(filters.include_archived);
    if (filters.exclude_diary !== undefined) params.exclude_diary = String(filters.exclude_diary);
    if (filters.favorites_only) params.favorites_only = 'true';
    if (filters.date_from) params.date_from = filters.date_from;
    if (filters.date_to) params.date_to = filters.date_to;
    if (filters.mimeTypes) params.mimeTypes = filters.mimeTypes;
    if (filters.minFileSize !== undefined) params.minFileSize = String(filters.minFileSize);
    if (filters.maxFileSize !== undefined) params.maxFileSize = String(filters.maxFileSize);
    if (filters.todoStatus) params.todoStatus = filters.todoStatus;
    if (filters.todoPriority) params.todoPriority = filters.todoPriority;

    const cacheKey = this.generateCacheKey(`fts_${query}`, params);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const response = await apiService.get(`/search/fts5?${new URLSearchParams(params)}`);
    const payload = response.data as any;
    const results = this.normaliseResults(payload.results || []);

    const finalResponse: SearchResponse = {
      results,
        stats: {
        totalResults: payload.total ?? results.length,
        searchTime: payload.stats?.searchTime,
        query,
        appliedFilters: {
          modules: filters.modules,
          tags: filters.include_tags,
        },
      },
      suggestions: payload.suggestions || [],
    };

    this.setCache(cacheKey, finalResponse);
    return finalResponse;
  }

  async searchFuzzy(query: string, filters: SearchFilters = {}, _page = 1, limit = 20): Promise<SearchResponse> {
    // Light fuzzy search - title, description, tags only (NO full content)
    const params: Record<string, string> = {
      query: query,
      limit: limit.toString(),
    };

    if (filters.modules?.length) params.modules = filters.modules.join(',');

    const cacheKey = this.generateCacheKey(`fuzzy_light_${query}`, params);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const response = await apiService.get(`/fuzzy-search-light?${new URLSearchParams(params)}`);
    const payload = response.data as any;
    const results = this.normaliseResults(Array.isArray(payload) ? payload : []);

    const finalResponse: SearchResponse = {
      results,
      stats: {
        totalResults: results.length,
        query,
        appliedFilters: {
          modules: filters.modules,
        },
      },
      suggestions: [],
    };

    this.setCache(cacheKey, finalResponse);
    return finalResponse;
  }

  async searchAdvancedFuzzy(query: string, filters: SearchFilters = {}, _page = 1, limit = 20): Promise<SearchResponse> {
    // Advanced fuzzy loads all content into memory and searches - SLOW but comprehensive
    const params: Record<string, string> = {
      query: query,
      limit: limit.toString(),
    };

    if (filters.modules?.length) params.modules = filters.modules.join(',');

    const cacheKey = this.generateCacheKey(`advanced_fuzzy_${query}`, params);
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const response = await apiService.get(`/advanced-fuzzy-search?${new URLSearchParams(params)}`);
    const payload = response.data as any;
    const results = this.normaliseResults(Array.isArray(payload) ? payload : []);

    const finalResponse: SearchResponse = {
      results,
      stats: {
        totalResults: results.length,
        query,
        appliedFilters: {
          modules: filters.modules,
        },
      },
      suggestions: [],
    };

    this.setCache(cacheKey, finalResponse);
    return finalResponse;
  }

  async getSearchSuggestions(query: string): Promise<string[]> {
    if (query.length < 2) return [];

    const response = await apiService.get(`/search/suggestions?q=${encodeURIComponent(query)}`);
    return (response.data as any)?.suggestions ?? [];
  }

  async getPopularTags(moduleType?: string): Promise<TagInfo[]> {
    const params = moduleType ? `?module_type=${moduleType}` : '';
    const response = await apiService.get(`/search/popular-tags${params}`);
    return (response.data as any)?.tags ?? [];
  }

  async getTagAutocomplete(query: string, moduleType?: string): Promise<TagInfo[]> {
    if (!query) return [];

    const params = new URLSearchParams({ q: query });
    if (moduleType) params.append('module_type', moduleType);

    const response = await apiService.get(`/tags/autocomplete-enhanced?${params}`);
    return (response.data as any)?.tags ?? [];
  }
}

export const searchService = new SearchService();
export const { searchFTS, searchFuzzy, getSearchSuggestions, getPopularTags, getTagAutocomplete } = searchService;
export default searchService; 