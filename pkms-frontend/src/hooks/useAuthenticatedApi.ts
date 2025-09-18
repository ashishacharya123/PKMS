import { useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { apiService } from '../services/api';

/**
 * Hook that provides API methods that automatically wait for authentication
 * Prevents 403 errors from race conditions
 */
export function useAuthenticatedApi() {
  const { isAuthenticated, isLoading } = useAuthStore();

  const makeAuthenticatedRequest = useCallback(
    async <T>(requestFn: () => Promise<T>): Promise<T> => {
      // Wait for authentication to be established
      if (isLoading) {
        throw new Error('Authentication still in progress');
      }

      if (!isAuthenticated) {
        throw new Error('Not authenticated');
      }

      return requestFn();
    },
    [isAuthenticated, isLoading]
  );

  const get = useCallback(
    <T>(url: string, config = {}) => 
      makeAuthenticatedRequest(() => apiService.get<T>(url, config)),
    [makeAuthenticatedRequest]
  );

  const post = useCallback(
    <T>(url: string, data = {}, config = {}) => 
      makeAuthenticatedRequest(() => apiService.post<T>(url, data, config)),
    [makeAuthenticatedRequest]
  );

  const put = useCallback(
    <T>(url: string, data = {}, config = {}) => 
      makeAuthenticatedRequest(() => apiService.put<T>(url, data, config)),
    [makeAuthenticatedRequest]
  );

  const del = useCallback(
    <T>(url: string, config = {}) => 
      makeAuthenticatedRequest(() => apiService.delete<T>(url, config)),
    [makeAuthenticatedRequest]
  );

  const patch = useCallback(
    <T>(url: string, data = {}, config = {}) => 
      makeAuthenticatedRequest(() => apiService.patch<T>(url, data, config)),
    [makeAuthenticatedRequest]
  );

  return {
    get,
    post,
    put,
    delete: del,
    patch,
    isReady: isAuthenticated && !isLoading
  };
}