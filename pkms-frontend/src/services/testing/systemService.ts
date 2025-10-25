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
    const response = await apiService.get('/testing/system/performance');
    return response.data;
  }
};
