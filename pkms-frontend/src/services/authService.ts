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
  private _deprecationWarned: boolean = false;
  
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

  // Setup recovery questions (deprecated - use setupUser instead)
  async setupRecovery(_recoveryData: RecoverySetup): Promise<RecoveryKeyResponse> {
    // DEPRECATED: Recovery setup is now part of user setup
    // This method is kept for backward compatibility but should not be used
    throw new Error('setupRecovery is deprecated. Use setupUser instead, which includes recovery setup.');
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
    // SECURITY: httpOnly cookies can't be read by JavaScript
    // Return null to indicate we rely on httpOnly cookies for authentication
    return null;
  }

  getStoredUser(): User | null {
    // SECURITY: User data should come from auth store state, not localStorage
    // This method is deprecated - use auth store instead
    return null;
  }

  isAuthenticated(): boolean {
    // SECURITY: Since we're using httpOnly cookies, we can't check authentication state directly
    // This method should not be used - rely on auth store state instead
    // The auth store will handle authentication state via API calls
    // 
    // DEPRECATED: This method is kept for backward compatibility but should not be used
    // Use the auth store's isAuthenticated state instead: useAuthStore.getState().isAuthenticated
    
    // Only warn once to avoid console spam
    if (!this._deprecationWarned) {
      console.warn('authService.isAuthenticated() is deprecated. Use useAuthStore.getState().isAuthenticated instead.');
      this._deprecationWarned = true;
    }
    
    // Return false for now - this method should not be used
    // Frontend code should use the auth store directly for authentication state
    return false;
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