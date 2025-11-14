/**
 * CRUD Testing Service
 * 
 * Handles comprehensive CRUD testing across all modules
 * with safe test data and cleanup.
 */

import { apiService } from '../api';

// CRUD Testing Types
type CrudModule = 'notes' | 'documents' | 'todos' | 'archive' | 'projects';
export interface CrudTestResult {
  testId: string;
  testPassword: string;
  startTime: string;
  modulesTested: Record<string, any>;
  overallStatus: string;
  timestamp: string;
}

export type TestRunResult = CrudTestResult;

// CRUD Testing Functions
export const crudTestingService = {
  async runFullTest(): Promise<CrudTestResult> {
    const response = await apiService.post('/testing/crud/full-test');
    return response.data;
  },

  async runModuleTest(module: CrudModule): Promise<any> {
    const response = await apiService.post(`/testing/crud/test-${encodeURIComponent(module)}`);
    return response.data;
  },

  async cleanupTestData(testId: string): Promise<any> {
    const response = await apiService.delete(`/testing/crud/cleanup/${encodeURIComponent(testId)}`);
    return response.data;
  },

  async createTestDocument(fileSize: number, contentType: string, filename: string): Promise<any> {
    const formData = new FormData();
    formData.append('filename', filename);
    formData.append('content_type', contentType);
    formData.append('file_size', fileSize.toString());

    const response = await apiService.post('/testing/crud/documents/create', formData);
    return response.data;
  },

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  downloadResults(results: any, filename: string): void {
    const dataStr = JSON.stringify(results, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }
};
