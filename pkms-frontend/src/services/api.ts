import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { notifications } from '@mantine/notifications';

const API_BASE_URL = 'http://localhost:8000/api/v1';

class ApiService {
  private axios: AxiosInstance;
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.axios = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    this.axios.interceptors.request.use(
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
    this.axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          const message = error.response.data?.detail || 'An error occurred';
          notifications.show({
            title: 'Error',
            message,
            color: 'red',
          });
        } else if (error.request) {
          notifications.show({
            title: 'Error',
            message: 'No response from server',
            color: 'red',
          });
        } else {
          notifications.show({
            title: 'Error',
            message: error.message,
            color: 'red',
          });
        }
        return Promise.reject(error);
      }
    );
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
      const response = await this.axios.post('/auth/refresh', {}, { withCredentials: true });
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

  // Get the axios instance (for special cases like file uploads)
  getAxiosInstance(): AxiosInstance {
    return this.axios;
  }

  // Generic GET request
  async get<T>(url: string, config = {}): Promise<AxiosResponse<T>> {
    return this.axios.get<T>(url, config);
  }

  // Generic POST request
  async post<T>(url: string, data = {}, config = {}): Promise<AxiosResponse<T>> {
    return this.axios.post<T>(url, data, config);
  }

  // Generic PUT request
  async put<T>(url: string, data = {}, config = {}): Promise<AxiosResponse<T>> {
    return this.axios.put<T>(url, data, config);
  }

  // Generic DELETE request
  async delete<T>(url: string, config = {}): Promise<AxiosResponse<T>> {
    return this.axios.delete<T>(url, config);
  }

  // Generic PATCH request
  async patch<T>(url: string, data = {}, config = {}): Promise<AxiosResponse<T>> {
    return this.axios.patch<T>(url, data, config);
  }

  // Set auth token
  setAuthToken(token: string) {
    this.axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  // Clear auth token
  clearAuthToken() {
    delete this.axios.defaults.headers.common['Authorization'];
  }

  // File upload
  async upload<T = any>(url: string, file: File, onProgress?: (progress: number) => void): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await this.axios.post(url, formData, {
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
}

// Create a single shared instance of the API client
const apiService = new ApiService();

// Expose only the named export to enforce a single import style
export { apiService }; 