/**
 * Enhanced Database Testing Service
 * 
 * Handles comprehensive database testing operations including:
 * - Detailed statistics with all recent changes
 * - Association table analysis
 * - FTS5 table performance metrics
 * - Data integrity validation
 * - Migration status checking
 * - Schema analysis with recent updates
 */

import { apiService } from '../api';

// Enhanced Database Statistics Types
export interface DatabaseStats {
  // Core table counts
  usersCount: number;
  notesCount: number;
  documentsCount: number;
  todosCount: number;
  projectsCount: number;
  diaryEntriesCount: number;
  diaryDailyMetadataCount: number;
  archiveFoldersCount: number;
  archiveItemsCount: number;
  tagsCount: number;
  
  // Association table counts
  noteDocumentsCount: number;
  documentDiaryCount: number;
  todoDependenciesCount: number;
  projectItemsCount: number;
  
  // Size information for each table
  usersSizeBytes: number;
  notesSizeBytes: number;
  documentsSizeBytes: number;
  todosSizeBytes: number;
  projectsSizeBytes: number;
  diaryEntriesSizeBytes: number;
  archiveFoldersSizeBytes: number;
  archiveItemsSizeBytes: number;
  tagsSizeBytes: number;
  
  // FTS5 analysis
  ftsTablesCount: number;
  ftsTablesList: string[];
  
  // Database file information
  databaseFileSizeBytes: number;
  databaseFileSizeKb: number;
  databaseFileSizeMb: number;
  databaseFilePath: string;
  
  // SQLite metrics
  sqlitePageCount: number;
  sqlitePageSize: number;
  calculatedDbSizeBytes: number;
  calculatedDbSizeKb: number;
  calculatedDbSizeMb: number;
  journalMode: string;
  walCheckpointInfo: {
    pages: number;
    walSizeBytes: number;
    checkpointedFrames: number;
  };
  
  // Data integrity checks
  integrityChecks: {
    notesWithoutUser: number;
    documentsWithoutUser: number;
    todosWithoutUser: number;
    projectsWithoutUser: number;
    noteDocumentsIntegrity: number;
    documentDiaryIntegrity: number;
    projectItemsIntegrity: number;
  };
  
  // Migration status
  migrationTableExists: boolean;
  currentMigrationVersion: string;
  
  // Performance metrics
  processingTimeSeconds: number;
  timestamp: string;
}

export interface TableColumn {
  columnId: number;
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  primaryKey: boolean;
}

export interface TableSchema {
  table: string;
  columnCount: number;
  columns: TableColumn[];
  rowCount: number;
  sizeInfo: {
    sizeBytes: number;
    sizeMb: number;
    pageCount: number;
    pageSize?: number;
    error?: string;
  };
  timestamp: string;
}

export interface SampleRowsResponse {
  table: string;
  rowCount: number;
  sampleRows: Array<Record<string, any>>;
  timestamp: string;
}

export interface FtsTablesData {
  ftsGroups: Record<string, {
    tables: any[];
    description: string;
  }>;
  allFtsTables: any[];
  totalFtsTables: number;
  sampleData?: any;
  ftsExplanation: {
    whatIsFts5: string;
    whyMultipleTables: string;
    storageOverhead: string;
    performanceBenefit: string;
    automaticMaintenance: string;
  };
}

// Enhanced Database Testing Functions
export const databaseService = {
  // Comprehensive statistics with all recent changes
  async getComprehensiveStats(): Promise<DatabaseStats> {
    const response = await apiService.get('/testing/database/comprehensive-stats');
    return response.data;
  },

  // Legacy endpoint for backward compatibility
  async getStats(): Promise<DatabaseStats> {
    return this.getComprehensiveStats();
  },

  // Detailed table analysis
  async getTableAnalysis(tableName: string): Promise<TableSchema> {
    const response = await apiService.get(`/testing/database/table-analysis/${tableName}`);
    return response.data;
  },

  // FTS5 analysis
  async getFtsAnalysis(): Promise<FtsTablesData> {
    const response = await apiService.get('/testing/database/fts-analysis');
    return response.data;
  },

  // Sample data from tables
  async getSampleData(tableName: string, limit: number = 5): Promise<SampleRowsResponse> {
    const response = await apiService.get(`/testing/database/sample-data/${tableName}?limit=${limit}`);
    return response.data;
  },

  // Legacy methods for backward compatibility
  async getAllTables(): Promise<TableSchema[]> {
    // This would need to be implemented in the backend
    throw new Error('getAllTables not implemented in enhanced version');
  },

  async getTableSchema(tableName: string): Promise<TableSchema> {
    return this.getTableAnalysis(tableName);
  },

  async getSampleRows(tableName: string, limit: number = 5): Promise<SampleRowsResponse> {
    return this.getSampleData(tableName, limit);
  },

  async getFtsTables(): Promise<FtsTablesData> {
    return this.getFtsAnalysis();
  }
};
