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
          await authService.login(credentials);
          
          // SECURITY: Don't store token in localStorage - using httpOnly cookies
          // Don't set token in API service - httpOnly cookies are handled automatically
          
          const currentUser = await authService.getCurrentUser(); // Get full user details
          
          // Parse settings from JSON
          const settings = currentUser.settingsJson ? JSON.parse(currentUser.settingsJson) : {};
          
          set({
            user: {
              ...currentUser,
              settings // Add parsed settings
            },
            token: null, // No token stored in memory - using httpOnly cookies
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
          await authService.setupUser(userData);
          const currentUser = await authService.getCurrentUser(); // Get full user details
          
          // SECURITY: Don't store token in localStorage - using httpOnly cookies
          // Don't set token in API service - httpOnly cookies are handled automatically
          
          // Parse settings from JSON
          const settings = currentUser.settingsJson ? JSON.parse(currentUser.settingsJson) : {};
          
          set({
            user: {
              ...currentUser,
              settings // Add parsed settings
            },
            token: null, // No token stored in memory - using httpOnly cookies
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
          // SECURITY: Don't remove localStorage token - using httpOnly cookies
          // Clear auth data
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
              settingsJson: JSON.stringify(mergedSettings),
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
        
        logger.auth('checkAuth called - using httpOnly cookies');
        
        try {
          // SECURITY: Don't set token in API service - httpOnly cookies are handled automatically
          // Validate authentication by fetching user info (this will use httpOnly cookies)
          logger.auth('Fetching current user');
          const currentUser = await authService.getCurrentUser();
          
          // Parse settings from JSON
          const settings = currentUser.settingsJson ? JSON.parse(currentUser.settingsJson) : {};
          
          logger.auth('User fetched successfully:', currentUser);
          set({
            user: {
              ...currentUser,
              settings // Add parsed settings
            },
            token: null, // No token stored in memory - using httpOnly cookies
            isAuthenticated: true,
            isLoading: false,
            error: null
          });

          // Start session monitoring
          get().startSessionMonitoring();
        } catch (error) {
          logger.error('Authentication validation failed:', error);
          // Authentication failed - clear state
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