/**
 * CRUD Testing Service
 * 
 * Handles comprehensive CRUD testing across all modules
 * with safe test data and cleanup.
 */

import { apiService } from '../api';

// CRUD Testing Types
export interface CrudTestResult {
  test_id: string;
  test_password: string;
  start_time: string;
  modules_tested: Record<string, any>;
  overall_status: string;
  timestamp: string;
}

export interface TestRunResult {
  test_id: string;
  test_password: string;
  start_time: string;
  modules_tested: Record<string, any>;
  overall_status: string;
  timestamp: string;
}

// CRUD Testing Functions
export const crudTestingService = {
  async runFullTest(): Promise<CrudTestResult> {
    const response = await apiService.post('/testing/crud/full-test');
    return response.data;
  },

  async runModuleTest(module: string): Promise<any> {
    const response = await apiService.post(`/testing/crud/test-${module}`);
    return response.data;
  },

  async cleanupTestData(testId: string): Promise<any> {
    const response = await apiService.delete(`/testing/crud/cleanup/${testId}`);
    return response.data;
  },

  async createTestDocument(fileSize: number, contentType: string, filename: string): Promise<any> {
    const formData = new FormData();
    formData.append('filename', filename);
    formData.append('content_type', contentType);
    formData.append('file_size', fileSize.toString());
    
    const response = await apiService.post('/testing/crud/documents/create', formData);
    return response.data;
  }
};
