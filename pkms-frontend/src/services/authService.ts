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
  MasterRecoverySetup,
  MasterRecoveryReset,
  MasterRecoveryCheckResponse
} from '../types/auth';

class AuthService {
  // User setup (first-time password creation)
  async setupUser(userData: UserSetup): Promise<AuthResponse> {
    const response = await apiService.post<AuthResponse>('/auth/setup', userData);
    return response.data;
  }

  // User login
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await apiService.post<AuthResponse>('/auth/login', credentials);
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

  // Master Recovery Password Methods (New)
  
  // Setup master recovery password
  async setupMasterRecovery(masterData: MasterRecoverySetup): Promise<{ message: string; method: string }> {
    const response = await apiService.post<{ message: string; method: string }>('/auth/recovery/setup-master', masterData);
    return response.data;
  }

  // Reset password using master recovery password
  async resetPasswordWithMaster(resetData: MasterRecoveryReset): Promise<{ message: string }> {
    const response = await apiService.post<{ message: string }>('/auth/recovery/reset-master', resetData);
    return response.data;
  }

  // Check what recovery options are available
  async checkMasterRecoveryAvailable(): Promise<MasterRecoveryCheckResponse> {
    const response = await apiService.post<MasterRecoveryCheckResponse>('/auth/recovery/check-master');
    return response.data;
  }

  // Diary Recovery Methods
  
  // Unlock diary with master recovery password
  async unlockDiaryWithMaster(masterPassword: string): Promise<{ 
    message: string; 
    unlock_method: string; 
    can_access_diary: boolean; 
    hint: string 
  }> {
    const formData = new FormData();
    formData.append('master_password', masterPassword);
    const response = await apiService.post<{ 
      message: string; 
      unlock_method: string; 
      can_access_diary: boolean; 
      hint: string 
    }>('/diary/unlock-with-master', formData);
    return response.data;
  }

  // Get diary recovery options
  async getDiaryRecoveryOptions(): Promise<{
    has_master_recovery: boolean;
    has_security_questions: boolean;
    recovery_message: string;
    recommended_action: string;
  }> {
    const response = await apiService.get<{
      has_master_recovery: boolean;
      has_security_questions: boolean;
      recovery_message: string;
      recommended_action: string;
    }>('/diary/recovery-options');
    return response.data;
  }

  // Get current user info
  async getCurrentUser(): Promise<User> {
    const response = await apiService.get<User>('/auth/me');
    return response.data;
  }

  // Complete setup
  async completeSetup(): Promise<{ message: string }> {
    const response = await apiService.post<{ message: string }>('/auth/complete-setup');
    return response.data;
  }

  // Refresh token
  async refreshToken(): Promise<AuthResponse> {
    const response = await apiService.post<AuthResponse>('/auth/refresh');
    return response.data;
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

export default new AuthService(); 