import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { notifications } from '@mantine/notifications';
import authService from '../services/authService';
import apiService from '../services/api';
import {
  AuthState,
  LoginCredentials,
  UserSetup,
  PasswordChange,
  RecoverySetup,
  RecoveryReset,
  MasterRecoverySetup,
  MasterRecoveryReset,
  User
} from '../types/auth';
import { useNotesStore } from './notesStore';
import { useDocumentsStore } from './documentsStore';
import { useTodosStore } from './todosStore';
import { useDiaryStore } from './diaryStore';
import { useArchiveStore } from './archiveStore';

interface AuthActions {
  // Authentication actions
  login: (credentials: LoginCredentials) => Promise<boolean>;
  setupUser: (userData: UserSetup) => Promise<boolean>;
  logout: () => Promise<void>;
  changePassword: (passwordData: PasswordChange) => Promise<boolean>;
  setupRecovery: (recoveryData: RecoverySetup) => Promise<string | null>;
  resetPassword: (resetData: RecoveryReset) => Promise<boolean>;
  completeSetup: () => Promise<boolean>;
  
  // Master Recovery Password actions (New)
  setupMasterRecovery: (masterData: MasterRecoverySetup) => Promise<boolean>;
  resetPasswordWithMaster: (resetData: MasterRecoveryReset) => Promise<boolean>;
  checkMasterRecoveryAvailable: () => Promise<{ has_master_recovery: boolean; has_security_questions: boolean; recommended_method: string }>;
  unlockDiaryWithMaster: (masterPassword: string) => Promise<boolean>;
  getDiaryRecoveryOptions: () => Promise<{ has_master_recovery: boolean; recovery_message: string; recommended_action: string }>;
  
  // State management
  checkAuth: () => Promise<void>;
  clearError: () => void;
  setLoading: (loading: boolean) => void;
  startSessionMonitoring: () => void;
  stopSessionMonitoring: () => void;
}

// Session monitoring interval
let sessionInterval: number | null = null;
let warningShown = false;

export const useAuthStore = create<AuthState & AuthActions>()(
  devtools(
    (set, get) => ({
      // Initial state
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      sessionTimer: null,

      // Authentication actions
      login: async (credentials: LoginCredentials) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await authService.login(credentials);
          
          // Store token and user data
          localStorage.setItem('pkms_token', response.access_token);
          apiService.setAuthToken(response.access_token);
          
          set({
            user: {
              id: response.user_id,
              username: response.username,
              email: '', // Will be filled by getUserInfo if needed
              is_first_login: response.is_first_login,
              created_at: new Date().toISOString()
            },
            token: response.access_token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });

          // Start session monitoring
          get().startSessionMonitoring();

          notifications.show({
            title: 'Success',
            message: 'Welcome back!',
            color: 'green',
          });

          return true;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Login failed'
          });
          return false;
        }
      },

      setupUser: async (userData: UserSetup) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await authService.setupUser(userData);
          
          // Store token and user data
          localStorage.setItem('pkms_token', response.access_token);
          apiService.setAuthToken(response.access_token);
          
          set({
            user: {
              id: response.user_id,
              username: response.username,
              email: userData.email || '',
              is_first_login: response.is_first_login,
              created_at: new Date().toISOString()
            },
            token: response.access_token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });

          // Start session monitoring
          get().startSessionMonitoring();

          notifications.show({
            title: 'Success',
            message: 'Account created successfully!',
            color: 'green',
          });

          return true;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Setup failed'
          });
          return false;
        }
      },

      logout: async () => {
        try {
          await authService.logout();
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          // Clear auth data
          localStorage.removeItem('pkms_token');
          apiService.clearAuthToken();
          
          // Stop session monitoring
          get().stopSessionMonitoring();
          
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            sessionTimer: null
          });

          notifications.show({
            title: 'Logged out',
            message: 'You have been successfully logged out',
            color: 'blue',
          });
        }
      },

      changePassword: async (passwordData: PasswordChange) => {
        set({ isLoading: true, error: null });
        
        try {
          await authService.changePassword(passwordData);
          set({ isLoading: false });

          notifications.show({
            title: 'Success',
            message: 'Password changed successfully!',
            color: 'green',
          });

          return true;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Password change failed'
          });
          return false;
        }
      },

      setupRecovery: async (recoveryData: RecoverySetup) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await authService.setupRecovery(recoveryData);
          set({ isLoading: false });

          notifications.show({
            title: 'Success',
            message: 'Recovery setup completed!',
            color: 'green',
          });

          return response.recovery_key;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Recovery setup failed'
          });
          return null;
        }
      },

      resetPassword: async (resetData: RecoveryReset) => {
        set({ isLoading: true, error: null });
        
        try {
          await authService.resetPassword(resetData);
          set({ isLoading: false });

          notifications.show({
            title: 'Success',
            message: 'Password reset successfully!',
            color: 'green',
          });

          return true;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Password reset failed'
          });
          return false;
        }
      },

      // Master Recovery Password actions (New)
      setupMasterRecovery: async (masterData: MasterRecoverySetup) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await authService.setupMasterRecovery(masterData);
          set({ isLoading: false });

          notifications.show({
            title: 'Success',
            message: 'Master recovery password set successfully! This can be used to recover your account and unlock your diary.',
            color: 'green',
            autoClose: 8000,
          });

          return true;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Master recovery setup failed'
          });
          return false;
        }
      },

      resetPasswordWithMaster: async (resetData: MasterRecoveryReset) => {
        set({ isLoading: true, error: null });
        
        try {
          await authService.resetPasswordWithMaster(resetData);
          set({ isLoading: false });

          notifications.show({
            title: 'Success',
            message: 'Password reset successfully using master recovery password!',
            color: 'green',
          });

          return true;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Master password reset failed'
          });
          return false;
        }
      },

      checkMasterRecoveryAvailable: async () => {
        try {
          const response = await authService.checkMasterRecoveryAvailable();
          return response;
        } catch (error: any) {
          console.error('Failed to check master recovery availability:', error);
          return { 
            has_master_recovery: false, 
            has_security_questions: false, 
            recommended_method: 'security_questions' 
          };
        }
      },

      unlockDiaryWithMaster: async (masterPassword: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await authService.unlockDiaryWithMaster(masterPassword);
          set({ isLoading: false });

          notifications.show({
            title: 'Success',
            message: response.message,
            color: 'green',
          });

          return true;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Failed to unlock diary with master password'
          });
          return false;
        }
      },

      getDiaryRecoveryOptions: async () => {
        try {
          const response = await authService.getDiaryRecoveryOptions();
          return response;
        } catch (error: any) {
          console.error('Failed to get diary recovery options:', error);
          return {
            has_master_recovery: false,
            recovery_message: 'Unable to check recovery options',
            recommended_action: 'Try again later'
          };
        }
      },

      completeSetup: async () => {
        set({ isLoading: true, error: null });
        
        try {
          await authService.completeSetup();
          
          // Update user state
          const currentUser = get().user;
          if (currentUser) {
            set({
              user: { ...currentUser, is_first_login: false },
              isLoading: false
            });
          }

          notifications.show({
            title: 'Setup Complete',
            message: 'Welcome to PKMS!',
            color: 'green',
          });

          return true;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Setup completion failed'
          });
          return false;
        }
      },

      // State management
      checkAuth: async () => {
        const token = localStorage.getItem('pkms_token');
        
        if (!token) {
          set({ isAuthenticated: false, user: null, token: null });
          return;
        }

        try {
          apiService.setAuthToken(token);
          const user = await authService.getCurrentUser();
          
          set({
            user,
            token,
            isAuthenticated: true,
            error: null
          });

          // Start session monitoring
          get().startSessionMonitoring();
        } catch (error) {
          // Token is invalid
          localStorage.removeItem('pkms_token');
          apiService.clearAuthToken();
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            error: null
          });
        }
      },

      clearError: () => set({ error: null }),
      
      setLoading: (loading: boolean) => set({ isLoading: loading }),

      startSessionMonitoring: () => {
        const timer = setInterval(() => {
          if (apiService.isTokenExpiringSoon()) {
            apiService.showExpiryWarning();
          }
        }, 30000); // Check every 30 seconds

        set({ sessionTimer: timer });
      },

      stopSessionMonitoring: () => {
        const { sessionTimer } = get();
        if (sessionTimer) {
          clearInterval(sessionTimer);
          set({ sessionTimer: null });
        }
      }
    }),
    {
      name: 'auth-store',
    }
  )
); 