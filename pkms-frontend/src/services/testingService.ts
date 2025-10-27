/**
 * Testing Service for PKMS Frontend
 * 
 * Modular testing service that provides comprehensive testing capabilities
 * including database diagnostics, encryption testing, and system health checks.
 * 
 * This service has been refactored into focused modules for better maintainability.
 */

// Re-export from modular testing services
export { 
  databaseService, 
  systemService, 
  authTestingService, 
  crudTestingService 
} from './testing';

// Re-export types for backward compatibility
export type {
  DatabaseStats,
  TableSchema,
  SampleRowsResponse,
  FtsTablesData,
  DetailedHealth,
  ConsoleCommands,
  SessionStatus,
  UserDatabase,
  HealthCheck,
  DiaryEncryptionDetails,
  CrudTestResult,
  TestRunResult
} from './testing';

// Legacy compatibility functions - these delegate to the new modular services
import { databaseService, systemService, authTestingService, crudTestingService } from './testing';

// Combined testing service for backward compatibility
export const testingService = {
  // Database methods
  getDatabaseStats: databaseService.getStats,
  getTableSchema: databaseService.getTableSchema,
  getSampleRows: databaseService.getSampleRows,
  getAllTables: databaseService.getAllTables,

  // System methods
  getDetailedHealth: systemService.getHealthDetailed,
  getConsoleCommands: systemService.getConsoleCommands,
  getPerformanceMetrics: systemService.getPerformanceMetrics,
  validateDataIntegrity: systemService.validateDataIntegrity,
  getResourceUsage: systemService.getResourceUsage,
  runFileSanityCheck: systemService.runFileSanityCheck,

  // Auth methods
  checkAuthentication: authTestingService.checkAuthentication,
  testAPIConnectivity: authTestingService.testAPIConnectivity,
  testDiaryEncryption: authTestingService.testDiaryEncryption,

  // CRUD methods
  runCrudTest: crudTestingService.runFullTest,

  // Utility methods
  downloadTestResults: crudTestingService.downloadResults,
  formatBytes: crudTestingService.formatBytes
};

/**
 * @deprecated Use databaseService.getStats() instead
 */
export const getDatabaseStats = databaseService.getStats;

/**
 * @deprecated Use systemService.getHealthDetailed() instead
 */
export const getHealthDetailed = systemService.getHealthDetailed;

/**
 * @deprecated Use authTestingService.getSessionStatus() instead
 */
export const getSessionStatus = authTestingService.getSessionStatus;

/**
 * @deprecated Use crudTestingService.runFullTest() instead
 */
export const runFullTest = crudTestingService.runFullTest;