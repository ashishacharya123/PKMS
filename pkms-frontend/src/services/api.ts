import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { notifications } from '@mantine/notifications';
import { API_BASE_URL } from '../config';

interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

class ApiService {
  private instance: AxiosInstance;
  private tokenExpiryWarningShown: boolean = false;

  constructor() {
    this.instance = axios.create({
      baseURL: `${API_BASE_URL}/api/v1`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor to handle errors intelligently
    this.instance.interceptors.response.use(
      (response) => response,
      (error) => {
        // Check if this is a network error (backend not running)
        if (error.request && !error.response) {
          // The request was made but no response was received
          const isLoginAttempt = error.config?.url?.includes('/auth/login') || 
                                error.config?.url?.includes('/auth/setup');
          
          console.error('Network Error:', {
            url: error.config?.url,
            method: error.config?.method,
            message: error.message,
            code: error.code
          });
          
          // Create a comprehensive network error message
          const networkError = new Error(this.createNetworkErrorMessage(isLoginAttempt));
          (networkError as any).isNetworkError = true;
          (networkError as any).originalError = error;
          throw networkError;
        }

        // Check if this is a 401 response
        if (error.response?.status === 401) {
          const isLoginAttempt = error.config?.url?.includes('/auth/login') || 
                                error.config?.url?.includes('/auth/setup');
          const hasStoredToken = !!localStorage.getItem('pkms_token');

          // Only trigger session expiry handling if:
          // 1. User has a stored token (was previously authenticated)
          // 2. This is NOT a login attempt
          if (hasStoredToken && !isLoginAttempt) {
            this.handleTokenExpiry();
          }
          
          // For login attempts, just pass through the backend error message
          const message = error.response.data?.detail || 
                         error.response.data?.message || 
                         'Authentication failed';
          const authError = new Error(message);
          (authError as any).response = error.response;
          throw authError;
        }

        // Handle other HTTP errors
        if (error.response) {
          const message = error.response.data?.detail || 
                         error.response.data?.message || 
                         `HTTP ${error.response.status}: ${error.response.statusText}`;
          const httpError = new Error(message);
          (httpError as any).response = error.response;
          throw httpError;
        }

        // Handle request setup errors
        console.error('Request Setup Error:', error.message);
        throw new Error(`Request failed: ${error.message}`);
      }
    );
  }

  /**
   * Create a detailed network error message with diagnostics
   */
  private createNetworkErrorMessage(isLoginAttempt: boolean): string {
    const baseMessage = isLoginAttempt 
      ? "🔌 Cannot connect to server" 
      : "🔌 Network connection lost";
    
    const diagnostics = [
      "• Backend server may not be running",
      "• Check if Docker container is started",
      `• Verify backend is running on ${API_BASE_URL}`,
      "• Check network connectivity"
    ];

    const troubleshooting = isLoginAttempt
      ? "\n\n🔧 Quick fixes:\n• Run: docker-compose up pkms-backend\n• Or check if backend service is running"
      : "\n\n🔧 Try refreshing the page or check your connection";

    return `${baseMessage}\n\n${diagnostics.join('\n')}${troubleshooting}`;
  }

  /**
   * Check backend connectivity
   */
  async checkBackendHealth(): Promise<{ isOnline: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      const response = await axios.get(`${API_BASE_URL}/health`, { 
        timeout: 5000,
        headers: {} // Don't include auth headers for health check
      });
      
      const latency = Date.now() - startTime;
      
      return {
        isOnline: response.status === 200,
        latency,
      };
    } catch (error: any) {
      return {
        isOnline: false,
        error: error.code === 'ECONNREFUSED' 
          ? 'Backend server is not running'
          : error.message || 'Unknown connection error'
      };
    }
  }

  /**
   * Attach JWT access token to every request
   */
  setAuthToken(token: string): void {
    this.instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Remove Authorization header (e.g., on logout)
   */
  clearAuthToken(): void {
    delete this.instance.defaults.headers.common['Authorization'];
    this.tokenExpiryWarningShown = false;
  }

  /**
   * Check if JWT token is expiring soon (within 5 minutes)
   */
  isTokenExpiringSoon(): boolean {
    const token = localStorage.getItem('pkms_token');
    if (!token) return false;

    try {
      // Decode JWT token (simple parsing - in production you'd use a proper JWT library)
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiryTime = payload.exp * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

      return (expiryTime - currentTime) <= fiveMinutes && (expiryTime - currentTime) > 0;
    } catch (error) {
      console.error('Error parsing token:', error);
      return false;
    }
  }

  /**
   * Show expiry warning notification with extend button
   */
  showExpiryWarning(): void {
    if (this.tokenExpiryWarningShown) return;
    
    this.tokenExpiryWarningShown = true;

    // Close any existing expiry notifications
    notifications.hide('token-expiry-warning');

    notifications.show({
      id: 'token-expiry-warning',
      title: '⚠️ Session Expiring Soon',
      message: 'Your session will expire in 5 minutes. Click "Extend Session" below to continue.',
      color: 'orange',
      autoClose: false,
      withCloseButton: true,
      onClose: () => {
        this.tokenExpiryWarningShown = false;
      },
    });

    // Add the extend button as a separate notification with action
    setTimeout(() => {
      notifications.show({
        id: 'session-extend-button',
        title: '',
        message: '🔄 Click here to extend your session',
        color: 'blue',
        autoClose: false,
        withCloseButton: false,
        style: {
          cursor: 'pointer',
          border: '2px solid #228be6',
          backgroundColor: '#e7f5ff'
        },
        onClick: () => {
          this.extendSession();
          notifications.hide('token-expiry-warning');
          notifications.hide('session-extend-button');
          this.tokenExpiryWarningShown = false;
        },
      });
    }, 500);
  }

  /**
   * Extend the current session by making a request to refresh the token
   */
  async extendSession(): Promise<void> {
    try {
      // Use the proper refresh endpoint that handles sliding window sessions
      const response = await this.post('/auth/refresh', {});
      
      // Update the token if a new one was provided
      if (response.data && (response.data as any).access_token) {
        const newToken = (response.data as any).access_token;
        localStorage.setItem('pkms_token', newToken);
        this.setAuthToken(newToken);
      }
      
      notifications.show({
        title: '✅ Session Extended',
        message: 'Your session has been extended successfully!',
        color: 'green',
        autoClose: 3000,
      });

      this.tokenExpiryWarningShown = false;
    } catch (error) {
      console.error('Failed to extend session:', error);
      
      notifications.show({
        title: '❌ Session Extension Failed',
        message: 'Please log in again to continue.',
        color: 'red',
        autoClose: 5000,
      });

      // Trigger logout on extension failure
      this.handleTokenExpiry();
    }
  }

  /**
   * Handle token expiry by clearing auth and redirecting to login
   */
  private handleTokenExpiry(): void {
    localStorage.removeItem('pkms_token');
    this.clearAuthToken();
    
    notifications.show({
      title: 'Session Expired',
      message: 'Your session has expired. Please log in again.',
      color: 'red',
      autoClose: 5000,
    });

    // Redirect to login page
    if (window.location.pathname !== '/auth') {
      window.location.href = '/auth';
    }
  }

  async get<T>(url: string, config = {}): Promise<ApiResponse<T>> {
    const response = await this.instance.get<T>(url, config);
    // FastAPI returns data directly, so we wrap it in our ApiResponse format
    return {
      data: response.data,
      status: response.status
    };
  }

  async post<T>(url: string, data = {}, config = {}): Promise<ApiResponse<T>> {
    const response = await this.instance.post<T>(url, data, config);
    // FastAPI returns data directly, so we wrap it in our ApiResponse format
    return {
      data: response.data,
      status: response.status
    };
  }

  async put<T>(url: string, data = {}, config = {}): Promise<ApiResponse<T>> {
    const response = await this.instance.put<T>(url, data, config);
    // FastAPI returns data directly, so we wrap it in our ApiResponse format
    return {
      data: response.data,
      status: response.status
    };
  }

  async delete<T>(url: string, config = {}): Promise<ApiResponse<T>> {
    const response = await this.instance.delete<T>(url, config);
    // FastAPI returns data directly, so we wrap it in our ApiResponse format
    return {
      data: response.data,
      status: response.status
    };
  }

  async patch<T>(url: string, data = {}, config = {}): Promise<ApiResponse<T>> {
    const response: AxiosResponse<ApiResponse<T>> = await this.instance.patch(url, data, config);
    return response.data;
  }

  getAxiosInstance(): AxiosInstance {
    return this.instance;
  }
}

export const apiService = new ApiService(); 