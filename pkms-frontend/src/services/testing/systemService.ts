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
  database: {
    connectivity: string;
    version: string;
    table_count: number;
  };
  user_session: {
    user_id: number;
    username: string;
    account_created: string;
  };
  system_info: {
    table_count: number;
    tables: string[];
  };
  timestamp: string;
}

export interface ConsoleCommands {
  description: string;
  commands: {
    system_commands: Record<string, any>;
    recovery_commands: Record<string, any>;
    api_testing: Record<string, any>;
  };
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
    const response = await apiService.get('/testing/system/performance');
    return response.data;
  }
};
