/**
 * System Testing Service
 * 
 * Handles system health checks, performance monitoring,
 * and system diagnostics.
 */

import { apiService } from '../api';

// System Health Types
export interface DetailedHealth {
  status: string;
  database: Record<string, any>;
  userSession: Record<string, any>;
  systemInfo: Record<string, any>;
  timestamp: string;
}

export interface ConsoleCommands {
  status: string;
  commands: {
    databaseOperations: Record<string, any>;
    systemMonitoring: Record<string, any>;
    debuggingCommands: Record<string, any>;
    recoveryCommands: Record<string, any>;
    apiTesting: Record<string, any>;
  };
  userUuid: string;
  timestamp: string;
  note?: string;
}

// System Testing Functions
export const systemService = {
  async getHealthDetailed(): Promise<DetailedHealth> {
    const response = await apiService.get('/testing/system/health-detailed');
    return response.data;
  },

  async getConsoleCommands(): Promise<ConsoleCommands> {
    const response = await apiService.get('/testing/system/console-commands');
    return response.data;
  },

  async getPerformanceMetrics(): Promise<any> {
    try {
      // Try the dedicated performance endpoint first (if it exists)
      const response = await apiService.get('/testing/system/performance');
      return response.data;
    } catch (error) {
      // Fallback: Combine resource usage and database metrics
      const [resourceResponse, dbResponse] = await Promise.all([
        apiService.get('/testing/system/resource-usage'),
        apiService.get('/testing/system/database-metrics')
      ]);

      return {
        performance: {
          ...resourceResponse.data,
          ...dbResponse.data,
          combined: true,
          note: 'Combined from resource usage and database metrics'
        }
      };
    }
  },

  async validateDataIntegrity(): Promise<any> {
    const response = await apiService.get('/testing/system/data-integrity');
    return response.data;
  },

  async getResourceUsage(): Promise<any> {
    const response = await apiService.get('/testing/system/resource-usage');
    return response.data;
  },

  async runFileSanityCheck(options: any): Promise<any> {
    const response = await apiService.post('/testing/system/files/sanity-check', options);
    return response.data;
  }
};
