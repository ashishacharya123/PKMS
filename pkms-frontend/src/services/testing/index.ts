/**
 * Testing Services Index
 * 
 * Centralized exports for all testing services.
 * Provides a clean API for testing functionality.
 */

export { databaseService } from './databaseService';
export { systemService } from './systemService';
export { authTestingService } from './authService';
export { crudTestingService } from './crudService';

// Re-export types for convenience
export type { DatabaseStats, TableSchema, SampleRowsResponse, FtsTablesData } from './databaseService';
export type { DetailedHealth, ConsoleCommands } from './systemService';
export type { SessionStatus, UserDatabase, HealthCheck, DiaryEncryptionDetails } from './authService';
export type { CrudTestResult, TestRunResult } from './crudService';
