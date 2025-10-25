import { apiService } from './api';

/**
 * NAMING CONVENTION RULES:
 * 
 * 🏷️ URL Parameters (Query String): MUST use snake_case
 * - Examples: ?sort_by=created_at, ?include_archived=true, ?mime_types=image/jpeg
 * - These are read directly by FastAPI without CamelCaseModel conversion
 * 
 * 📦 JSON Body/Response: MUST use camelCase  
 * - Examples: { "createdAt": "2024-01-01", "projectIds": ["uuid1"] }
 * - These are converted by the backend's CamelCaseModel
 * 
 * The Golden Rule: URL = snake_case, JSON = camelCase
 */

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
  highlightTitle?: string;
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
    includeTags?: string[];
    excludeTags?: string[];
    includeArchived?: boolean;
    excludeDiary?: boolean;
    fuzzyThreshold?: number;
    favoritesOnly?: boolean;
    sortBy?: 'relevance' | 'date' | 'title' | 'module';
    sortOrder?: 'asc' | 'desc';
    dateFrom?: string;
    dateTo?: string;
    mimeTypes?: string;
    minFileSize?: number;
    maxFileSize?: number;
    todoStatus?: string;
    todoPriority?: string;
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
      id: item.id ?? item.uuid ?? '',
      module: item.module ?? item.type ?? 'notes',
      title: item.title ?? item.name ?? 'Untitled',
      preview: item.preview ?? item.preview_text ?? '',
      tags: item.tags ?? [],
      score: item.score ?? item.relevance ?? item.relevanceScore,
      createdAt: item.createdAt ?? item.created_at,
      updatedAt: item.updatedAt ?? item.updated_at,
      metadata: item.metadata ?? {},
      highlight: item.highlight,
      highlight_title: item.highlight_title ?? item.highlightTitle,
    }));
  }

  async searchFTS(query: string, filters: SearchFilters = {}, page = 1, limit = 20): Promise<SearchResponse> {
    // URL parameters must use snake_case (not converted by CamelCaseModel)
    // These are sent as query parameters like ?sort_by=created_at&sort_order=desc
    const params: Record<string, string> = {
      q: query,
      offset: ((page - 1) * limit).toString(),
      limit: limit.toString(),
      sort_by: filters.sortBy ?? 'relevance',
      sort_order: filters.sortOrder ?? 'desc',
    };

    if (filters.modules?.length) params.modules = filters.modules.join(',');
    if (filters.includeTags?.length) params.include_tags = filters.includeTags.join(',');
    if (filters.excludeTags?.length) params.exclude_tags = filters.excludeTags.join(',');
    if (filters.includeArchived !== undefined) params.include_archived = String(filters.includeArchived);
    if (filters.excludeDiary !== undefined) params.exclude_diary = String(filters.excludeDiary);
    if (filters.favoritesOnly) params.favorites_only = 'true';
    if (filters.dateFrom) params.date_from = filters.dateFrom;
    if (filters.dateTo) params.date_to = filters.dateTo;
    // URL parameters must use snake_case (not converted by CamelCaseModel)
    if (filters.mimeTypes) params.mime_types = filters.mimeTypes;
    if (filters.minFileSize !== undefined) params.min_file_size = String(filters.minFileSize);
    if (filters.maxFileSize !== undefined) params.max_file_size = String(filters.maxFileSize);
    if (filters.todoStatus) params.todo_status = filters.todoStatus;
    if (filters.todoPriority) params.todo_priority = filters.todoPriority;

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
          tags: filters.includeTags,
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
    if (filters.fuzzyThreshold !== undefined) params.fuzzy_threshold = String(filters.fuzzyThreshold);

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
    if (filters.fuzzyThreshold !== undefined) params.fuzzy_threshold = String(filters.fuzzyThreshold);

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

    const response = await apiService.get(`/tags/autocomplete?q=${encodeURIComponent(query)}`);
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