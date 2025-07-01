import axios, { AxiosInstance, AxiosError } from 'axios';
import { notifications } from '@mantine/notifications';

const API_BASE_URL = 'http://localhost:8000/api/v1';

class ApiService {
  private api: AxiosInstance;
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('pkms_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Token expired or invalid - check if we should attempt refresh
          const token = localStorage.getItem('pkms_token');
          if (token) {
            // Clear auth data on 401
            localStorage.removeItem('pkms_token');
            localStorage.removeItem('pkms_user');
            
            // Show user-friendly message about session expiry
            notifications.show({
              title: 'Session Expired',
              message: 'Your session has expired. Please log in again.',
              color: 'orange',
              autoClose: 5000,
            });
            
            // Redirect to auth page after a brief delay
            setTimeout(() => {
              if (window.location.pathname !== '/auth') {
                window.location.href = '/auth';
              }
            }, 1000);
          }
        } else {
          // Show error message for other errors
          const message = this.getErrorMessage(error);
          notifications.show({
            title: 'Error',
            message,
            color: 'red',
          });
        }

        return Promise.reject(error);
      }
    );
  }

  private getErrorMessage(error: AxiosError): string {
    const status = error.response?.status;
    if (status === 401) {
      return 'Authentication failed. Please log in again.';
    } else if (status === 403) {
      return 'You do not have permission to perform this action.';
    } else if (status === 404) {
      return 'The requested resource was not found.';
    } else if (status === 422) {
      return 'Invalid data provided. Please check your input.';
    } else if (status === 429) {
      return 'Too many requests. Please wait a moment and try again.';
    } else if (status && status >= 500) {
      return 'Server error. Please try again later.';
    } else if (error.code === 'NETWORK_ERROR' || !error.response) {
      return 'Network error. Please check your connection and try again.';
    }
    const responseData = error.response?.data as { detail?: string } | undefined;
    return responseData?.detail || error.message || 'An unexpected error occurred';
  }

  // Check if token is close to expiry (within 5 minutes)
  isTokenExpiringSoon(): boolean {
    const token = localStorage.getItem('pkms_token');
    if (!token) return false;

    try {
      // Decode JWT token to check expiry
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiry = payload.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      
      return (expiry - now) < fiveMinutes;
    } catch {
      return false;
    }
  }

  // Extend session by calling refresh endpoint
  async extendSession(): Promise<boolean> {
    try {
      const response = await this.api.post('/auth/refresh', {}, { withCredentials: true });
      const { access_token } = response.data;
      
      // Store new token
      localStorage.setItem('pkms_token', access_token);
      
      // Clear any existing session warning
      notifications.hide('session-warning');
      
      return true;
    } catch (error) {
      console.error('Failed to extend session:', error);
      return false;
    }
  }

  // Show warning with extend button
  showExpiryWarning(): void {
    notifications.show({
      id: 'session-warning',
      title: 'Session Expiring Soon',
      message: 'Your session will expire in 5 minutes. Please save your work.',
      color: 'yellow',
      autoClose: false,
    });
  }

  // Generic API methods
  async get<T = any>(url: string): Promise<T> {
    // Remove any trailing :1 that might be added by the browser
    const cleanUrl = url.replace(/:1$/, '');
    const response = await this.api.get(cleanUrl);
    return response.data;
  }

  async post<T = any>(url: string, data?: any): Promise<T> {
    const response = await this.api.post(url, data);
    return response.data;
  }

  async put<T = any>(url: string, data?: any): Promise<T> {
    const response = await this.api.put(url, data);
    return response.data;
  }

  async delete<T = any>(url: string): Promise<T> {
    const response = await this.api.delete(url);
    return response.data;
  }

  // File upload
  async upload<T = any>(url: string, file: File, onProgress?: (progress: number) => void): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.api.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });

    return response.data;
  }

  // Get the axios instance for advanced usage
  getAxiosInstance(): AxiosInstance {
    return this.api;
  }
}

export const apiService = new ApiService();
export default apiService; 