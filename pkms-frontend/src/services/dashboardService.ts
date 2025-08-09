import { apiService } from './api';

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
  diary: {
    entries: number;
    streak: number;
  };
  archive: {
    folders: number;
    items: number;
  };
  last_updated: string;
}

export interface ModuleActivity {
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
}

class DashboardService {
  private baseUrl = '/dashboard';

  /**
   * Get aggregated dashboard statistics for all modules
   * This is optimized for fast loading and returns all stats in one call
   */
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const response = await apiService.get<DashboardStats>(`${this.baseUrl}/stats`);
      return response.data;
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
      // Return default stats on error to prevent dashboard crash
      return {
        notes: { total: 0, recent: 0 },
        documents: { total: 0, recent: 0 },
        todos: { total: 0, pending: 0, completed: 0, overdue: 0 },
        diary: { entries: 0, streak: 0 },
        archive: { folders: 0, items: 0 },
        last_updated: new Date().toISOString()
      };
    }
  }

  /**
   * Get recent activity across all modules
   * @param days Number of days to look back (default: 7)
   */
  async getRecentActivity(days: number = 7): Promise<ModuleActivity> {
    try {
      const response = await apiService.get<ModuleActivity>(`${this.baseUrl}/activity?days=${days}`);
      return response.data;
    } catch (error) {
      console.error('Failed to load recent activity:', error);
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
   * Get quick overview statistics for dashboard widgets
   */
  async getQuickStats(): Promise<QuickStats> {
    try {
      const response = await apiService.get<QuickStats>(`${this.baseUrl}/quick-stats`);
      return response.data;
    } catch (error) {
      console.error('Failed to load quick stats:', error);
      return {
        total_items: 0,
        active_projects: 0,
        overdue_todos: 0,
        current_diary_streak: 0,
        storage_used_mb: 0
      };
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(sizeInMB: number): string {
    if (sizeInMB < 1) {
      return `${Math.round(sizeInMB * 1024)} KB`;
    } else if (sizeInMB < 1024) {
      return `${sizeInMB.toFixed(1)} MB`;
    } else {
      return `${(sizeInMB / 1024).toFixed(2)} GB`;
    }
  }

  /**
   * Calculate percentage for completion stats
   */
  calculateCompletionPercentage(completed: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  }

  /**
   * Get streak status message
   */
  getStreakStatus(streak: number): string {
    if (streak === 0) {
      return "No streak yet";
    } else if (streak === 1) {
      return "1 day streak";
    } else if (streak < 7) {
      return `${streak} days streak`;
    } else if (streak < 30) {
      return `${streak} days streak 🔥`;
    } else {
      return `${streak} days streak 🚀`;
    }
  }

  /**
   * Get priority color for overdue todos
   */
  getOverdueColor(overdue: number): string {
    if (overdue === 0) return 'green';
    if (overdue <= 2) return 'orange';
    return 'red';
  }

  /**
   * Check if stats are recent (within last hour)
   */
  areStatsRecent(lastUpdated: string): boolean {
    const updateTime = new Date(lastUpdated);
    const now = new Date();
    const diffInMinutes = (now.getTime() - updateTime.getTime()) / (1000 * 60);
    return diffInMinutes < 60;
  }

  /**
   * Format last updated time
   */
  formatLastUpdated(lastUpdated: string): string {
    const updateTime = new Date(lastUpdated);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - updateTime.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) {
      return 'Just now';
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
    } else {
      const diffInHours = Math.floor(diffInMinutes / 60);
      return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
    }
  }
}

export const dashboardService = new DashboardService();
export default dashboardService; 