import apiService from './api';
import {
  AuthResponse,
  LoginCredentials,
  UserSetup,
  PasswordChange,
  RecoverySetup,
  RecoveryReset,
  RecoveryKeyResponse,
  User
} from '../types/auth';

class AuthService {
  // User setup (first-time password creation)
  async setupUser(userData: UserSetup): Promise<AuthResponse> {
    return apiService.post<AuthResponse>('/auth/setup', userData);
  }

  // User login
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    return apiService.post<AuthResponse>('/auth/login', credentials);
  }

  // User logout
  async logout(): Promise<{ message: string }> {
    return apiService.post<{ message: string }>('/auth/logout');
  }

  // Change password
  async changePassword(passwordData: PasswordChange): Promise<{ message: string }> {
    return apiService.put<{ message: string }>('/auth/password', passwordData);
  }

  // Setup recovery questions
  async setupRecovery(recoveryData: RecoverySetup): Promise<RecoveryKeyResponse> {
    return apiService.post<RecoveryKeyResponse>('/auth/recovery/setup', recoveryData);
  }

  // Reset password using recovery
  async resetPassword(resetData: RecoveryReset): Promise<{ message: string }> {
    return apiService.post<{ message: string }>('/auth/recovery/reset', resetData);
  }

  // Get current user info
  async getCurrentUser(): Promise<User> {
    return apiService.get<User>('/auth/me');
  }

  // Complete setup
  async completeSetup(): Promise<{ message: string }> {
    return apiService.post<{ message: string }>('/auth/complete-setup');
  }

  // Local storage management
  saveAuthData(authResponse: AuthResponse): void {
    localStorage.setItem('pkms_token', authResponse.access_token);
    localStorage.setItem('pkms_user', JSON.stringify({
      id: authResponse.user_id,
      username: authResponse.username,
      is_first_login: authResponse.is_first_login
    }));
  }

  clearAuthData(): void {
    localStorage.removeItem('pkms_token');
    localStorage.removeItem('pkms_user');
  }

  getStoredToken(): string | null {
    return localStorage.getItem('pkms_token');
  }

  getStoredUser(): User | null {
    const userStr = localStorage.getItem('pkms_user');
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
    return null;
  }

  isAuthenticated(): boolean {
    return !!this.getStoredToken();
  }
}

export const authService = new AuthService();
export default authService; 