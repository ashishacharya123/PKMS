/**
 * Testing Service for PKMS Frontend
 * 
 * Provides comprehensive testing capabilities including database diagnostics,
 * encryption testing, and system health checks accessible from the UI.
 */

import { apiService } from './api';

// Export types needed by testing interface
export type DatabaseStats = {
  table_counts: Record<string, number>;
  table_sizes: Record<string, any>;
  fts_tables?: any[];
  database_info: {
    size_bytes: number;
    size_mb: number;
    total_pages: number;
    page_size: number;
  };
  size_explanation?: {
    note: string;
    accuracy: string;
    efficiency: string;
    fts_overhead: string;
  };
  timestamp: string;
};

export type FtsTablesData = {
  fts_groups: Record<string, {
    tables: any[];
    description: string;
  }>;
  all_fts_tables: any[];
  total_fts_tables: number;
  sample_data?: any;
  fts_explanation: {
    what_is_fts5: string;
    why_multiple_tables: string;
    storage_overhead: string;
    performance_benefit: string;
    automatic_maintenance: string;
  };
};

export interface SampleRowsResponse {
  table: string;
  row_count: number;
  sample_rows: Array<Record<string, any>>;
  timestamp: string;
}

export interface TableColumn {
  column_id: number;
  name: string;
  type: string;
  not_null: boolean;
  default_value: string | null;
  primary_key: boolean;
}

export interface TableSchema {
  table: string;
  column_count: number;
  columns: TableColumn[];
  row_count: number;
  size_info: {
    size_bytes: number;
    size_mb: number;
    page_count: number;
    page_size?: number;
    error?: string;
  };
  timestamp: string;
}

export interface DiaryEncryptionDetails {
  encrypted_blob_length: number;
  iv_length: number;
  tag_length: number;
}

export interface SampleDiaryEntry {
  id: number;
  date: string;
  title?: string;
  mood?: string;
  encryption_details?: DiaryEncryptionDetails;
  metadata?: Record<string, any>;
}

export interface DiaryEncryptionTest {
  status: string;
  message: string;
  encryption_test: boolean;
  sample_entry?: SampleDiaryEntry;
  media_count?: number;
  timestamp: string;
}

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

export interface ConsoleCommand {
  description: string;
  command: string;
}

export interface ConsoleCommandCategory {
  title: string;
  description: string;
  commands: Record<string, ConsoleCommand>;
}

export interface ConsoleCommands {
  [category: string]: ConsoleCommandCategory;
}

export interface AllTablesResponse {
  total_tables: number;
  tables: Array<{
    name: string;
    type: string;
    category: string;
    sql: string;
    is_application_table: boolean;
  }>;
  by_category: Record<string, string[]>;
  explanation: {
    application_tables: string;
    fts_tables: string;
    system_tables: string;
    why_37_tables: string;
  };
  timestamp: string;
}

export interface PerformanceMetrics {
  query_timings_ms: {
    simple_count: number;
    complex_join: number;
  };
  database_configuration: Record<string, any>;
  total_execution_time_ms: number;
  performance_score: 'good' | 'slow' | 'critical';
  recommendations: string[];
  timestamp: string;
}

export interface DataIntegrityValidation {
  validation_results: {
    checks_performed: string[];
    issues_found: string[];
    warnings: string[];
    passed_checks: string[];
  };
  overall_status: 'passed' | 'warning' | 'critical';
  summary: {
    total_checks: number;
    passed: number;
    issues: number;
    warnings: number;
  };
  timestamp: string;
}

export interface ResourceUsage {
  process_memory: {
    rss_mb: number;
    vms_mb: number;
    percent: number;
  };
  process_cpu: {
    percent: number;
    num_threads: number;
  };
  database_stats: Record<string, any>;
  system_resources: {
    cpu_count: number;
    memory_total_mb: number;
    memory_available_mb: number;
    disk_usage_percent: number;
  };
  recommendations: string[];
  timestamp: string;
}

export interface APIConnectivityTest {
  backend_health: {
    success: boolean;
    status_code?: number;
    response_time_ms?: number;
    error?: string;
  };
  cors_test: {
    success: boolean;
    error?: string;
  };
  auth_test: {
    success: boolean;
    status_code?: number;
    error?: string;
  };
  timestamp: string;
}

export interface AuthenticationCheck {
  hasToken: boolean;
  isExpired: boolean;
  tokenPayload?: any;
  expiresAt?: Date;
  remainingTimeSeconds?: number;
  error?: string;
}

export interface FileSanityCheckResult {
  filename: string;
  filePath: string;
  operations: {
    write?: {
      status: string;
      time_ms: number;
      bytes_written: number;
    };
    read?: {
      status: string;
      time_ms: number;
      bytes_read: number;
      content_matches: boolean;
    };
    stat?: {
      status: string;
      fileExists: boolean;
      fileSizeBytes: number;
    };
    delete?: {
      status: string;
      time_ms: number;
      fileDeleted: boolean;
    };
  };
  overall_status: string;
  performance_summary?: {
    total_time_ms: number;
    average_operation_ms: number;
    performance_rating: 'fast' | 'slow' | 'very_slow';
  };
  error?: string;
  timestamp: string;
}

// Extended interfaces for enhanced testing
export interface FileTestOptions {
  filename?: string;
  verbose?: boolean;
}

export interface FileTestResult {
  filename: string;
  filePath: string;
  operations: {
    [key: string]: {
      status: string;
      time_ms?: number;
      bytes_written?: number;
      bytes_read?: number;
      content_matches?: boolean;
      fileExists?: boolean;
      fileSizeBytes?: number;
      fileDeleted?: boolean;
    };
  };
  messages: string[];
  overall_status: string;
  verbose: boolean;
  timestamp: string;
  performance_summary?: {
    total_time_ms: number;
    average_operation_ms: number;
    performance_rating: string;
  };
  error?: string;
}

export interface CrudTestOptions {
  modules?: string;
  cleanup?: boolean;
  verbose?: boolean;
}

export interface CrudTestResult {
  modules_tested: string[];
  selected_modules: string[];
  cleanup_enabled: boolean;
  verbose: boolean;
  overall_status: string;
  test_summary: {
    [key: string]: {
      module: string;
      status: string;
      operations: {
        [key: string]: {
          status: string;
          data?: any;
          error?: string;
          timestamp: string;
        };
      };
      test_note_id?: number;
      test_doc_id?: number;
      test_todo_id?: number;
      test_folder_id?: number;
      test_item_id?: number;
    };
  };
  global_messages: string[];
  test_counts: {
    total_tests: number;
    passed: number;
    failed: number;
    success_rate: number;
  };
  cleanup_performed: boolean;
  cleanup_summary: {
    status: string;
    cleaned_count?: number;
    items_left?: number;
    note?: string;
  };
  timestamp: string;
  error?: string;
}

export interface TableAnalysisResult {
  table_categories: {
    application_data: {
      count: number;
      tables: Array<{
        name: string;
        type: string;
        purpose: string;
      }>;
    };
    fts_search: {
      count: number;
      tables: Array<{
        name: string;
        type: string;
        purpose: string;
      }>;
    };
    sqlite_system: {
      count: number;
      tables: Array<{
        name: string;
        type: string;
        purpose: string;
      }>;
    };
  };
  total_tables: number;
  analysis_summary: {
    main_purpose: string;
    complexity_rating: string;
    recommendations: string[];
  };
  timestamp: string;
}



class TestingService {
  
  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Check authentication status and debug info
   */
  checkAuthentication(): AuthenticationCheck {
    const token = localStorage.getItem('pkms_token');
    
    if (!token) {
      return {
        hasToken: false,
        isExpired: false,
        error: 'No token found in localStorage'
      };
    }

    try {
      // Parse JWT token payload
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresAt = new Date(payload.exp * 1000);
      const now = new Date();
      const isExpired = now > expiresAt;
      const remainingTimeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));

      // Debug info
      console.log('[AUTH DEBUG] Token check:', {
        hasToken: true,
        isExpired,
        expiresAt: expiresAt.toISOString(),
        remainingTimeSeconds,
        tokenLength: token.length,
        userId: payload.sub || payload.user_id,
        username: payload.username
      });

      return {
        hasToken: true,
        isExpired,
        tokenPayload: payload,
        expiresAt,
        remainingTimeSeconds,
        error: isExpired ? 'Token has expired' : undefined
      };
    } catch (error) {
      console.error('[AUTH DEBUG] Token parsing error:', error);
      return {
        hasToken: true,
        isExpired: true,
        error: `Token parsing failed: ${error}`
      };
    }
  }

  /**
   * Test API connectivity and backend health
   */
  async testAPIConnectivity(): Promise<APIConnectivityTest> {
    const result: APIConnectivityTest = {
      backend_health: { success: false },
      cors_test: { success: false },
      auth_test: { success: false },
      timestamp: new Date().toISOString()
    };

    try {
      // Test backend health
      const startTime = Date.now();
      const healthResponse = await apiService.get('/testing/health');
      const responseTime = Date.now() - startTime;
      
      result.backend_health = {
        success: healthResponse.status === 200,
        status_code: healthResponse.status,
        response_time_ms: responseTime
      };
      result.cors_test.success = true; // If we get here, CORS is working
    } catch (error: any) {
      result.backend_health.error = error.message;
      if (error.message.includes('CORS')) {
        result.cors_test.error = error.message;
      }
    }

    try {
      // Test authenticated endpoint
      const authResponse = await apiService.get('/testing/database/stats');
      result.auth_test = {
        success: authResponse.status === 200,
        status_code: authResponse.status
      };
    } catch (error: any) {
      result.auth_test.error = error.message;
    }

    return result;
  }

  /**
   * Get comprehensive database statistics
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    try {
      const response = await apiService.get('/testing/database/stats');
      return response.data as DatabaseStats;
    } catch (error) {
      throw new Error(`Failed to get database stats: ${error}`);
    }
  }

  /**
   * Get sample rows from a specific table
   */
  async getSampleRows(table: string, limit: number = 5): Promise<SampleRowsResponse> {
    try {
      const response = await apiService.get(`/testing/database/sample-rows`, {
        params: { table, limit }
      });
      return response.data as SampleRowsResponse;
    } catch (error) {
      throw new Error(`Failed to get sample rows: ${error}`);
    }
  }

  /**
   * Get detailed schema information for a table
   */
  async getTableSchema(table: string): Promise<TableSchema> {
    try {
      const response = await apiService.get(`/testing/database/table-schema`, {
        params: { table }
      });
      return response.data as TableSchema;
    } catch (error) {
      throw new Error(`Failed to get table schema: ${error}`);
    }
  }

  /**
   * Test diary encryption with provided password
   */
  async testDiaryEncryption(password: string): Promise<DiaryEncryptionTest> {
    try {
      const response = await apiService.post('/testing/diary/encryption-test', {
        password
      });
      return response.data as DiaryEncryptionTest;
    } catch (error) {
      throw new Error(`Failed to test diary encryption: ${error}`);
    }
  }

  /**
   * Get detailed system health information
   */
  async getDetailedHealth(): Promise<DetailedHealth> {
    try {
      const response = await apiService.get('/testing/health/detailed');
      return response.data as DetailedHealth;
    } catch (error) {
      throw new Error(`Failed to get system health: ${error}`);
    }
  }

  /**
   * Get console commands for debugging
   */
  async getConsoleCommands(): Promise<ConsoleCommands> {
    try {
      const response = await apiService.get('/testing/console-commands');
      return response.data as ConsoleCommands;
    } catch (error) {
      throw new Error(`Failed to get console commands: ${error}`);
    }
  }

  /**
   * Get all database tables including FTS and system tables
   */
  async getAllTables(): Promise<AllTablesResponse> {
    try {
      const response = await apiService.get('/testing/database/all-tables');
      return response.data as AllTablesResponse;
    } catch (error) {
      throw new Error(`Failed to get all tables: ${error}`);
    }
  }

  /**
   * Get database performance metrics
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    try {
      const response = await apiService.get('/testing/performance/database-metrics');
      return response.data as PerformanceMetrics;
    } catch (error) {
      throw new Error(`Failed to get performance metrics: ${error}`);
    }
  }

  /**
   * Validate data integrity
   */
  async validateDataIntegrity(): Promise<DataIntegrityValidation> {
    try {
      const response = await apiService.get('/testing/validation/data-integrity');
      return response.data as DataIntegrityValidation;
    } catch (error) {
      throw new Error(`Failed to validate data integrity: ${error}`);
    }
  }

  /**
   * Get system resource usage
   */
  async getResourceUsage(): Promise<ResourceUsage> {
    try {
      const response = await apiService.get('/testing/monitoring/resource-usage');
      return response.data as ResourceUsage;
    } catch (error) {
      throw new Error(`Failed to get resource usage: ${error}`);
    }
  }

  /**
   * Test file system operations
   */
  async runFileSanityCheck(options: FileTestOptions = {}): Promise<FileTestResult> {
    try {
      const formData = new FormData();
      formData.append('filename', options.filename || 'pkms_test_file.txt');
      formData.append('verbose', options.verbose ? 'true' : 'false');
      
      const response = await apiService.post('/testing/files/sanity-check', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data as FileTestResult;
    } catch (error) {
      throw new Error(`Failed to run file sanity check: ${error}`);
    }
  }

  /**
   * Run comprehensive CRUD testing
   */
  async runCrudTest(options: CrudTestOptions = {}): Promise<CrudTestResult> {
    try {
      const formData = new FormData();
      formData.append('modules', options.modules || 'notes,documents,todos,archive');
      formData.append('cleanup', options.cleanup !== false ? 'true' : 'false');
      formData.append('verbose', options.verbose ? 'true' : 'false');
      
      const response = await apiService.post('/testing/crud/full-test', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data as CrudTestResult;
    } catch (error) {
      throw new Error(`Failed to run CRUD test: ${error}`);
    }
  }

  /**
   * Clear all browser storage
   */
  clearAllStorage(): void {
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear all cookies
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
  }

  /**
   * Download test results as JSON
   */
  downloadTestResults(data: any, filename: string = 'pkms-test-results.json'): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Individual CRUD operations for granular testing
   */
  async createTestNote(title: string = 'Test Note', content: string = 'Test content'): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', content);
      
      const response = await apiService.post('/testing/crud/notes/create', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create test note: ${error}`);
    }
  }

  async createTestDocument(
    filename: string = 'test_document.txt',
    contentType: string = 'text/plain',
    fileSize: number = 1024
  ): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('filename', filename);
      formData.append('content_type', contentType);
      formData.append('fileSize', fileSize.toString());
      
      const response = await apiService.post('/testing/crud/documents/create', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create test document: ${error}`);
    }
  }

  async createTestTodo(
    title: string = 'Test Todo',
    description: string = 'Test description',
    priority: string = 'medium'
  ): Promise<any> {
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('priority', priority);
      
      const response = await apiService.post('/testing/crud/todos/create', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to create test todo: ${error}`);
    }
  }

  async cleanupTestItem(itemType: string, itemId: number): Promise<any> {
    try {
      const response = await apiService.delete(`/testing/crud/cleanup/${itemType}/${itemId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to cleanup test item: ${error}`);
    }
  }

  // FTS5 Tables Management
  async getFtsTableDetails(tableName?: string, sampleLimit: number = 5): Promise<FtsTablesData> {
    const params = new URLSearchParams();
    if (tableName) params.append('table_name', tableName);
    params.append('sample_limit', sampleLimit.toString());
    
    const response = await apiService.get(`/testing/database/fts-tables?${params}`);
    return response.data as FtsTablesData;
  }

  async loadFtsTableSample(tableName: string, limit: number = 5): Promise<any> {
    return this.getFtsTableDetails(tableName, limit);
  }

  // Session Testing
  async getSessionStatus(): Promise<any> {
    const response = await apiService.get('/testing/auth/session-status');
    return response.data;
  }

  // Diary Tables Analysis  
  async getDiaryTableDetails(): Promise<any> {
    const response = await apiService.get('/testing/database/diary-tables');
    return response.data;
  }


}

export const testingService = new TestingService(); 