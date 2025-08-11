import axios, { AxiosInstance } from 'axios';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { API_BASE_URL } from '../config';

interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

interface AuthResponse {
  access_token: string;
}

class ApiService {
  private instance: AxiosInstance;
  private tokenExpiryWarningShown: boolean = false;
  private tokenRefreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.instance = axios.create({
      baseURL: `${API_BASE_URL}/api/v1`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
      // Ensure HttpOnly refresh cookie is sent/received for cross-origin requests
      withCredentials: true,
    });

    // Add response interceptor to handle errors intelligently
    this.instance.interceptors.response.use(
      (response) => response,
      async (error) => {
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
          const url: string = error.config?.url || '';
          const isLoginAttempt = url.includes('/auth/login') || url.includes('/auth/setup');
          const isRefreshAttempt = url.includes('/auth/refresh');
          const hasStoredToken = !!localStorage.getItem('pkms_token');

          // Attempt a one-time silent refresh and retry the original request
          if (hasStoredToken && !isLoginAttempt && !isRefreshAttempt) {
            const originalRequest = error.config || {};
            if (!(originalRequest as any)._retry) {
              (originalRequest as any)._retry = true;
              try {
                if (!this.tokenRefreshPromise) {
                  this.tokenRefreshPromise = this.refreshToken();
                }
                const newToken = await this.tokenRefreshPromise;
                this.tokenRefreshPromise = null;

                if (newToken) {
                  localStorage.setItem('pkms_token', newToken);
                  this.setAuthToken(newToken);
                  // Retry the original request with new token
                  return this.instance.request(originalRequest);
                }
              } catch (e) {
                // fall through to expiry handling below
              } finally {
                this.tokenRefreshPromise = null;
              }

              // If we reach here, refresh failed
              this.handleTokenExpiry();
              const message = error.response.data?.detail || error.response.data?.message || 'Authentication failed';
              const authError = new Error(message);
              (authError as any).response = error.response;
              throw authError;
            }
          }

          // For login attempts or refresh attempts, just pass through the backend error message
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
   * Reset the token expiry warning flag
   */
  resetTokenExpiryWarning(): void {
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
      const oneMinute = 1 * 60 * 1000; // 1 minute in milliseconds

      const timeRemaining = expiryTime - currentTime;

      return timeRemaining <= fiveMinutes && timeRemaining > oneMinute;
    } catch (error) {
      console.error('Error parsing token:', error);
      return false;
    }
  }

  /**
   * Check if JWT token is critically close to expiry (<= 1 minute)
   */
  isTokenCriticallyExpiring(): boolean {
    const token = localStorage.getItem('pkms_token');
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiryTime = payload.exp * 1000;
      const currentTime = Date.now();
      const oneMinute = 1 * 60 * 1000;
      const timeRemaining = expiryTime - currentTime;
      return timeRemaining > 0 && timeRemaining <= oneMinute;
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
   * Show a final 1-minute remaining confirmation modal with Yes/No
   */
  showFinalExpiryPrompt(): void {
    // Use a separate flag to avoid repeated prompts
    if ((this as any).finalExpiryPromptShown) return;
    (this as any).finalExpiryPromptShown = true;

    // Close any previous notifications to reduce noise
    notifications.hide('token-expiry-warning');
    notifications.hide('session-extend-button');

    modals.openConfirmModal({
      title: 'Session expiring in 1 minute',
      children: 'Do you want to extend your session?',
      labels: { confirm: 'Yes, extend', cancel: 'No' },
      confirmProps: { color: 'blue' },
      onConfirm: async () => {
        try {
          await this.extendSession();
        } finally {
          (this as any).finalExpiryPromptShown = false;
        }
      },
      onCancel: () => {
        // allow it to show again next cycle only if still within 1 minute
        setTimeout(() => {
          (this as any).finalExpiryPromptShown = false;
        }, 65_000);
      },
      closeOnEscape: true,
      withCloseButton: true,
      centered: true,
    });
  }

  /**
   * Extend the current session by making a request to refresh the token
   */
  async extendSession(): Promise<void> {
    // If a token refresh is already in progress, wait for it
    if (this.tokenRefreshPromise) {
      await this.tokenRefreshPromise;
      return;
    }

    try {
      this.tokenRefreshPromise = this.refreshToken();
      const newToken = await this.tokenRefreshPromise;
      
      if (newToken) {
        localStorage.setItem('pkms_token', newToken);
        this.setAuthToken(newToken);
        
        notifications.show({
          title: '✅ Session Extended',
          message: 'Your session has been extended successfully!',
          color: 'green',
          autoClose: 3000,
        });

        this.tokenExpiryWarningShown = false;
        (this as any).finalExpiryPromptShown = false;
      }
    } catch (error: any) {
      console.error('Failed to extend session:', error);
      
      // Do not force logout on transient failure; let normal 401 handling take over if needed
      const detail = error?.response?.data?.detail || error?.message || 'Session extension failed';
      notifications.show({
        title: '❌ Session Extension Failed',
        message: `${detail}. We will keep you signed in and retry automatically when needed.`,
        color: 'orange',
        autoClose: 5000,
      });

      // Intentionally avoid handleTokenExpiry() here to prevent unexpected logout
    } finally {
      this.tokenRefreshPromise = null;
    }
  }

  private async refreshToken(): Promise<string | null> {
    const response = await this.post<AuthResponse>('/auth/refresh', {});
    return response.data?.access_token || null;
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
    const response = await this.instance.patch<T>(url, data, config);
    // FastAPI returns data directly, so we wrap it in our ApiResponse format
    return {
      data: response.data,
      status: response.status
    };
  }

  getAxiosInstance(): AxiosInstance {
    return this.instance;
  }
}

export const apiService = new ApiService();