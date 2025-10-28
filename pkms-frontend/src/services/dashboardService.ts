/**
 * Dashboard Service - Frontend-first caching with unified cache system
 * Local-first approach: Chromium-optimized caching with IndexedDB persistence
 */

import { dashboardCache } from './unifiedCacheService';

export interface DashboardStats {
  notes: {
    total: number;
    recent: number;
  };
  documents: {
    total: number;
    recent: number;
  };
  todos: {
    total: number;
    pending: number;
    completed: number;
    overdue: number;
  };
  projects: {
    total: number;
    active: number;
  };
  diary: {
    entries: number;
    streak: number;
  };
  archive: {
    items: number;
  };
  last_updated: string;
}

interface ModuleActivity {
  recent_notes: number;
  recent_documents: number;
  recent_todos: number;
  recent_diary_entries: number;
  recent_archive_items: number;
}

export interface QuickStats {
  total_items: number;
  active_projects: number;
  overdue_todos: number;
  current_diary_streak: number;
  storage_used_mb: number;
  storage_by_module: {
    documents_mb: number;
    archive_mb: number;
    notes_mb: number;
    diary_media_mb: number;
    diary_text_mb: number;
  };
}

export interface RecentActivityItem {
  id: string;
  type: 'project' | 'todo' | 'note' | 'document' | 'archive' | 'diary';
  title: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  isUpdated: boolean;
  attachmentCount?: number;
  metadata?: {
    status?: string;
    priority?: string;
    mood?: number;
    weather_code?: number;
    mime_type?: string;
    item_type?: string;
  };
}

export interface RecentActivityTimeline {
  items: RecentActivityItem[];
  totalCount: number;
  cutoffDays: number;
}

class DashboardService {

  /**
   * Get main dashboard data - unified cache with IndexedDB persistence
   */
  async getMainDashboardData(): Promise<DashboardStats> {
    const cacheKey = 'main_dashboard';
    
    // Check unified cache first (memory + IndexedDB)
    const cached = await dashboardCache.get(cacheKey);
    if (cached) {
      console.log(`🎯 CACHE HIT: Main dashboard data - INSTANT response!`);
      return cached;
    }

    console.log(`❌ CACHE MISS: Main dashboard data - fetching from backend`);
    
    const startTime = performance.now();
    try {
      const response = await fetch('/api/v1/dashboard/stats');
      const responseTime = performance.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`Dashboard API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache with tags for easy invalidation
      await dashboardCache.set(cacheKey, data, 120000, ['dashboard', 'stats']);
      
      console.log(`✅ CACHE SET: Main dashboard data cached (${responseTime.toFixed(0)}ms)`);
      
      return data;
    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      console.error(`❌ ERROR: Main dashboard data (${responseTime.toFixed(0)}ms):`, error);
      
      // Return default values on error
      return {
        notes: { total: 0, recent: 0 },
        documents: { total: 0, recent: 0 },
        todos: { total: 0, pending: 0, completed: 0, overdue: 0 },
        projects: { total: 0, active: 0 },
        diary: { entries: 0, streak: 0 },
        archive: { items: 0 },
        last_updated: new Date().toISOString()
      };
    }
  }

  /**
   * Get recent activity data - unified cache with IndexedDB persistence
   */
  async getRecentActivity(days: number = 7): Promise<ModuleActivity> {
    const cacheKey = `activity_${days}`;
    
    // Check unified cache first
    const cached = await dashboardCache.get(cacheKey);
    if (cached) {
      console.log(`🎯 CACHE HIT: Activity data (${days} days) - INSTANT response!`);
      return cached;
    }

    console.log(`❌ CACHE MISS: Activity data (${days} days) - fetching from backend`);
    
    const startTime = performance.now();
    try {
      const response = await fetch(`/api/v1/dashboard/activity?days=${days}`);
      const responseTime = performance.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`Activity API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache with tags
      await dashboardCache.set(cacheKey, data, 120000, ['dashboard', 'activity']);
      
      console.log(`✅ CACHE SET: Activity data cached (${responseTime.toFixed(0)}ms)`);
      
      return data;
    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      console.error(`❌ ERROR: Activity data (${responseTime.toFixed(0)}ms):`, error);
      
      return {
        recent_notes: 0,
        recent_documents: 0,
        recent_todos: 0,
        recent_diary_entries: 0,
        recent_archive_items: 0
      };
    }
  }

  /**
   * Get quick stats - unified cache with IndexedDB persistence
   */
  async getQuickStats(): Promise<QuickStats> {
    const cacheKey = 'quick_stats';
    
    // Check unified cache first
    const cached = await dashboardCache.get(cacheKey);
    if (cached) {
      console.log(`🎯 CACHE HIT: Quick stats - INSTANT response!`);
      return cached;
    }

    console.log(`❌ CACHE MISS: Quick stats - fetching from backend`);
    
    const startTime = performance.now();
    try {
      const response = await fetch('/api/v1/dashboard/quick-stats');
      const responseTime = performance.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`Quick stats API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache with tags
      await dashboardCache.set(cacheKey, data, 120000, ['dashboard', 'stats']);
      
      console.log(`✅ CACHE SET: Quick stats cached (${responseTime.toFixed(0)}ms)`);
      
      return data;
    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      console.error(`❌ ERROR: Quick stats (${responseTime.toFixed(0)}ms):`, error);
      
      return {
        total_items: 0,
        active_projects: 0,
        overdue_todos: 0,
        current_diary_streak: 0,
        storage_used_mb: 0,
        storage_by_module: {
          documents_mb: 0,
          archive_mb: 0,
          notes_mb: 0,
          diary_media_mb: 0,
          diary_text_mb: 0
        }
      };
    }
  }

  /**
   * Get module-specific detailed data using existing backend APIs
   * Only use APIs that are already cached by backend
   */
  async getModuleDashboardData(module: string): Promise<any> {
    try {
      switch (module) {
        case 'todos':
          return await this.fetchTodosDetailedData();
        case 'diary':
          return await this.fetchDiaryDetailedData();
        default:
          console.warn(`Module ${module} doesn't have cached analytics endpoints yet`);
          return {};
      }
    } catch (error) {
      console.error(`Failed to fetch ${module} dashboard data:`, error);
      return {};
    }
  }

  /**
   * Get recent activity timeline
   */
  async getRecentActivityTimeline(days: number = 3, limit: number = 20): Promise<RecentActivityTimeline> {
    const cacheKey = `timeline_${days}_${limit}`;
    
    // Check unified cache first
    const cached = await dashboardCache.get(cacheKey);
    if (cached) {
      console.log(`🎯 CACHE HIT: Activity timeline (${days} days, ${limit} items) - INSTANT response!`);
      return cached;
    }

    console.log(`❌ CACHE MISS: Activity timeline (${days} days, ${limit} items) - fetching from backend`);
    
    const startTime = performance.now();
    try {
      const response = await fetch(`/api/v1/dashboard/timeline?days=${days}&limit=${limit}`);
      const responseTime = performance.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`Timeline API returned ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache with tags
      await dashboardCache.set(cacheKey, data, 120000, ['dashboard', 'timeline']);
      
      console.log(`✅ CACHE SET: Activity timeline cached (${responseTime.toFixed(0)}ms)`);
      
      return data;
    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      console.error(`❌ ERROR: Activity timeline (${responseTime.toFixed(0)}ms):`, error);
      
      return {
        items: [],
        totalCount: 0,
        cutoffDays: days
      };
    }
  }

  /**
   * Force refresh by invalidating all caches
   */
  async forceRefresh() {
    console.log(`🔄 FORCE REFRESH: Invalidating all caches`);
    
    // Invalidate dashboard cache
    await dashboardCache.invalidatePattern('dashboard');
    
    // Invalidate backend cache
    try {
      await fetch('/api/v1/dashboard/cache/invalidate', { method: 'POST' });
      console.log(`✅ Backend cache invalidated`);
    } catch (error) {
      console.error('Failed to invalidate backend cache:', error);
    }
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    return dashboardCache.getStats();
  }

  /**
   * Log cache statistics
   */
  logCacheStats() {
    dashboardCache.logStats();
  }

  // Module-specific data fetchers using existing backend APIs
  private async fetchTodosDetailedData(): Promise<any> {
    try {
      const response = await fetch('/api/v1/todos/stats');
      if (!response.ok) {
        throw new Error(`Todos stats API returned ${response.status}`);
      }
      const stats = await response.json();
      
      return {
        stats,
        completionRate: stats.total > 0 ? (stats.completed / stats.total) * 100 : 0,
        // Add more calculated metrics as needed
      };
    } catch (error) {
      console.error('Failed to fetch todos detailed data:', error);
      return {};
    }
  }

  private async fetchDiaryDetailedData(): Promise<any> {
    try {
      const [habitsResponse, wellnessResponse] = await Promise.all([
        fetch('/api/v1/diary/habits/analytics'),
        fetch('/api/v1/diary/habits/wellness-score-analytics')
      ]);

      const [habits, wellness] = await Promise.all([
        habitsResponse.ok ? habitsResponse.json() : {},
        wellnessResponse.ok ? wellnessResponse.json() : {}
      ]);

      return {
        habits,
        wellness,
        wellnessScore: wellness.overall_wellness_score || 0,
        habitStreaks: habits.streaks || {}
      };
    } catch (error) {
      console.error('Failed to fetch diary detailed data:', error);
      return {};
    }
  }
}

export const dashboardService = new DashboardService();
export default dashboardService;