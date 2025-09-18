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
  RecoveryReset,
  UserSettings
} from '../types/auth';
import { logger } from '../utils/logger';

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
  updateSettings: (settings: Partial<UserSettings>) => Promise<boolean>;
}

// Deprecated local flags (kept for backward compatibility reference)

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
          
          // Store token FIRST, then make authenticated requests
          localStorage.setItem('pkms_token', response.access_token);
          apiService.setAuthToken(response.access_token);
          
          const currentUser = await authService.getCurrentUser(); // Get full user details
          
          // Parse settings from JSON
          const settings = currentUser.settings_json ? JSON.parse(currentUser.settings_json) : {};
          
          set({
            user: {
              ...currentUser,
              settings // Add parsed settings
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
          const currentUser = await authService.getCurrentUser(); // Get full user details
          
          // Store token and user data
          localStorage.setItem('pkms_token', response.access_token);
          apiService.setAuthToken(response.access_token);
          
          // Parse settings from JSON
          const settings = currentUser.settings_json ? JSON.parse(currentUser.settings_json) : {};
          
          set({
            user: {
              ...currentUser,
              settings // Add parsed settings
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
          apiService.resetTokenExpiryWarning(); // Reset the warning flag
          
          // Stop session monitoring
          get().stopSessionMonitoring();
          
          // Only clear auth-related state
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
            sessionTimer: null
          });

          // Notify user
          notifications.show({
            title: 'Logged out',
            message: 'You have been successfully logged out',
            color: 'blue',
          });

          // Broadcast logout event for other stores to react
          window.dispatchEvent(new Event('auth:logout'));
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

      updateSettings: async (newSettings: Partial<UserSettings>) => {
        set({ isLoading: true, error: null });
        
        try {
          // Get current user state
          const { user } = get();
          if (!user) throw new Error('No user logged in');
          
          // Merge new settings with existing
          const currentSettings = user.settings || {};
          const mergedSettings = {
            ...currentSettings,
            ...newSettings
          };
          
          // Send update to backend
          await authService.updateSettings(mergedSettings);
          
          // Update local state
          set({
            user: {
              ...user,
              settings_json: JSON.stringify(mergedSettings),
              settings: mergedSettings
            },
            isLoading: false
          });
          
          notifications.show({
            title: 'Success',
            message: 'Settings updated successfully',
            color: 'green'
          });
          
          return true;
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to update settings'
          });
          return false;
        }
      },

      // State management
      checkAuth: async () => {
        // Set loading state immediately to prevent race conditions
        set({ isLoading: true, error: null });
        
        const token = localStorage.getItem('pkms_token');
        
        logger.auth('checkAuth called, token exists:', !!token);
        
        if (!token) {
          logger.auth('No token found, clearing auth state');
          set({ 
            isAuthenticated: false, 
            user: null, 
            token: null, 
            isLoading: false 
          });
          return;
        }

        try {
          logger.auth('Setting token in API service');
          apiService.setAuthToken(token);
          
          logger.auth('Fetching current user');
          const currentUser = await authService.getCurrentUser();
          
          // Parse settings from JSON
          const settings = currentUser.settings_json ? JSON.parse(currentUser.settings_json) : {};
          
          logger.auth('User fetched successfully:', currentUser);
          set({
            user: {
              ...currentUser,
              settings // Add parsed settings
            },
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });

          // Start session monitoring
          get().startSessionMonitoring();
        } catch (error) {
          logger.error('Token validation failed:', error);
          // Token is invalid
          localStorage.removeItem('pkms_token');
          apiService.clearAuthToken();
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null
          });
        }
      },

      clearError: () => set({ error: null }),
      
      setLoading: (loading: boolean) => set({ isLoading: loading }),

      startSessionMonitoring: () => {
        const timer = setInterval(() => {
          if (apiService.isTokenCriticallyExpiring()) {
            apiService.showFinalExpiryPrompt();
          } else if (apiService.isTokenExpiringSoon()) {
            apiService.showExpiryWarning();
          }
        }, 15_000); // Check every 15 seconds for more responsive UX near expiry

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