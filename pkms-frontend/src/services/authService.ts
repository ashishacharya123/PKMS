import { apiService } from './api';
import {
  AuthResponse,
  LoginCredentials,
  UserSetup,
  PasswordChange,
  RecoverySetup,
  RecoveryReset,
  RecoveryKeyResponse,
  User,
  UserSettings
} from '../types/auth';

class AuthService {
  // User setup (first-time password creation)
  async setupUser(userData: UserSetup): Promise<AuthResponse> {
    const response = await apiService.post<AuthResponse>('/auth/setup', userData);
    return response.data;
  }

  // User login
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await apiService.post<AuthResponse>('/auth/login', {
      ...credentials,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone // Send client timezone
    });
    return response.data;
  }

  // User logout
  async logout(): Promise<{ message: string }> {
    const response = await apiService.post<{ message: string }>('/auth/logout');
    return response.data;
  }

  // Change password
  async changePassword(passwordData: PasswordChange): Promise<{ message: string }> {
    const response = await apiService.put<{ message: string }>('/auth/password', passwordData);
    return response.data;
  }

  // Setup recovery questions
  async setupRecovery(recoveryData: RecoverySetup): Promise<RecoveryKeyResponse> {
    const response = await apiService.post<RecoveryKeyResponse>('/auth/recovery/setup', recoveryData);
    return response.data;
  }

  // Reset password using recovery
  async resetPassword(resetData: RecoveryReset): Promise<{ message: string }> {
    const response = await apiService.post<{ message: string }>('/auth/recovery/reset', resetData);
    return response.data;
  }

  // Get user's security questions for recovery
  async getRecoveryQuestions(): Promise<{ questions: string[] }> {
    const response = await apiService.get<{ questions: string[] }>('/auth/recovery/questions');
    return response.data;
  }

  // Master-recovery endpoints have been removed; related methods deprecated.

  // Get current user info
  async getCurrentUser(): Promise<User> {
    const response = await apiService.get<User>('/auth/me');
    return response.data;
  }

  // Complete setup - DEPRECATED: No longer needed as /setup endpoint handles everything
  async completeSetup(): Promise<{ message: string }> {
    // This endpoint no longer exists - setup is completed in one step
    return { message: "Setup already completed" };
  }

  // Refresh token
  async refreshToken(): Promise<AuthResponse> {
    const response = await apiService.post<AuthResponse>('/auth/refresh');
    return response.data;
  }

  // SECURITY: Removed localStorage usage - using httpOnly cookies instead
  saveAuthData(_authResponse: AuthResponse): void {
    // No longer storing sensitive data in localStorage
    // Tokens are now handled via httpOnly cookies from backend
  }

  clearAuthData(): void {
    // No localStorage cleanup needed - using httpOnly cookies
  }

  getStoredToken(): string | null {
    // SECURITY: For backward compatibility, still check localStorage
    // The actual authentication is handled by httpOnly cookies
    return localStorage.getItem('pkms_token');
  }

  getStoredUser(): User | null {
    // SECURITY: No longer reading from localStorage - using httpOnly cookies
    return null;
  }

  isAuthenticated(): boolean {
    // SECURITY: Since we're using httpOnly cookies, we can't check token directly
    // Instead, we need to check if there's a token in localStorage (for backward compatibility)
    // or rely on the auth store state
    const token = localStorage.getItem('pkms_token');
    return !!token;
  }

  // Login Password Hint Methods (separate from diary encryption hints)
  async setLoginPasswordHint(hint: string): Promise<{ message: string }> {
    const response = await apiService.put<{ message: string }>('/auth/login-password-hint', { hint });
    return response.data;
  }

  async getLoginPasswordHint(username: string): Promise<string> {
    const response = await apiService.post<{ hint: string }>('/auth/login-password-hint', { username });
    return response.data.hint;
  }

  // User settings update
  async updateSettings(settings: UserSettings): Promise<{ message: string }> {
    const response = await apiService.put<{ message: string }>('/auth/settings', { settings_json: JSON.stringify(settings) });
    return response.data;
  }
}

const authService = new AuthService();
export default authService;