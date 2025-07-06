import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { notifications } from '@mantine/notifications';

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
      baseURL: 'http://localhost:8000/api/v1',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor to handle errors
    this.instance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Token expired or invalid
          this.handleTokenExpiry();
        }

        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.error('API Error:', error.response.data);
          throw new Error(error.response.data.message || 'An error occurred');
        } else if (error.request) {
          // The request was made but no response was received
          console.error('Network Error:', error.request);
          throw new Error('Network error occurred');
        } else {
          // Something happened in setting up the request that triggered an Error
          console.error('Request Error:', error.message);
          throw error;
        }
      }
    );
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
      // Make a simple authenticated request to refresh the session
      const response = await this.get('/auth/me');
      
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

  getAxiosInstance(): AxiosInstance {
    return this.instance;
  }
}

export const apiService = new ApiService(); 