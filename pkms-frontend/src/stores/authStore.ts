import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { notifications } from '@mantine/notifications';
import authService from '../services/authService';
import { apiService } from '../services/api';
import {
  AuthState,
  LoginCredentials,
  UserSetup,
  PasswordChange,
  RecoverySetup,
  RecoveryReset,
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
  resetPassword: (resetData: RecoveryReset) => Promise<boolean>;
  resetPasswordWithRecovery: (resetData: RecoveryReset) => Promise<boolean>;
  
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
            error: error.message || 'Login failed. Please try again.'
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

      resetPasswordWithRecovery: async (resetData: RecoveryReset) => {
        set({ isLoading: true, error: null });
        
        try {
          await authService.resetPassword(resetData);
          set({ isLoading: false });

          return true;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.response?.data?.detail || 'Password reset failed'
          });
          return false;
        }
      },

      // State management
      checkAuth: async () => {
        const token = localStorage.getItem('pkms_token');
        
        console.log('[AUTH STORE] checkAuth called, token exists:', !!token);
        
        if (!token) {
          console.log('[AUTH STORE] No token found, clearing auth state');
          set({ isAuthenticated: false, user: null, token: null });
          return;
        }

        try {
          console.log('[AUTH STORE] Setting token in API service');
          apiService.setAuthToken(token);
          
          console.log('[AUTH STORE] Fetching current user');
          const user = await authService.getCurrentUser();
          
          console.log('[AUTH STORE] User fetched successfully:', user);
          set({
            user,
            token,
            isAuthenticated: true,
            error: null
          });

          // Start session monitoring
          get().startSessionMonitoring();
        } catch (error) {
          console.error('[AUTH STORE] Token validation failed:', error);
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