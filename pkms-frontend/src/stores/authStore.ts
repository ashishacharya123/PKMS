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
  User
} from '../types/auth';

interface AuthActions {
  // Authentication actions
  login: (credentials: LoginCredentials) => Promise<boolean>;
  setupUser: (userData: UserSetup) => Promise<boolean>;
  logout: () => Promise<void>;
  changePassword: (passwordData: PasswordChange) => Promise<boolean>;
  setupRecovery: (recoveryData: RecoverySetup) => Promise<string | null>;
  resetPassword: (resetData: RecoveryReset) => Promise<boolean>;
  completeSetup: () => Promise<boolean>;
  
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

      // Actions
      login: async (credentials: LoginCredentials) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await authService.login(credentials);
          authService.saveAuthData(response);
          
          set({
            user: {
              id: response.user_id,
              username: response.username,
              is_first_login: response.is_first_login,
              email: '',
              created_at: ''
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
            message: 'Login successful!',
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
          authService.saveAuthData(response);
          
          set({
            user: {
              id: response.user_id,
              username: response.username,
              is_first_login: response.is_first_login,
              email: userData.email || '',
              created_at: ''
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
        set({ isLoading: true });
        
        // Stop session monitoring
        get().stopSessionMonitoring();
        
        try {
          await authService.logout();
        } catch (error) {
          // Continue with logout even if API call fails
          console.error('Logout API call failed:', error);
        }
        
        authService.clearAuthData();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          error: null
        });

        notifications.show({
          title: 'Success',
          message: 'Logged out successfully',
          color: 'blue',
        });
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

      completeSetup: async () => {
        set({ isLoading: true, error: null });
        
        try {
          await authService.completeSetup();
          
          // Update user to mark setup as complete
          const currentUser = get().user;
          if (currentUser) {
            set({
              user: { ...currentUser, is_first_login: false },
              isLoading: false
            });
          }

          notifications.show({
            title: 'Success',
            message: 'Setup completed successfully!',
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

      checkAuth: async () => {
        const token = authService.getStoredToken();
        const storedUser = authService.getStoredUser();
        
        if (!token || !storedUser) {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false
          });
          return;
        }

        // If we already have user data and are authenticated, skip the API call
        const currentState = get();
        if (currentState.isAuthenticated && currentState.user && !currentState.isLoading) {
          // Start session monitoring for existing auth
          get().startSessionMonitoring();
          return;
        }

        set({ isLoading: true });
        
        try {
          // Verify token is still valid by fetching current user
          const user = await authService.getCurrentUser();
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          });
          
          // Start session monitoring
          get().startSessionMonitoring();
        } catch (error) {
          // Token is invalid, clear auth data
          authService.clearAuthData();
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            error: null
          });
        }
      },

      startSessionMonitoring: () => {
        // Clear any existing interval
        if (sessionInterval) {
          clearInterval(sessionInterval);
        }
        
        warningShown = false;
        
        // Check every minute for token expiry
        sessionInterval = setInterval(() => {
          const isAuthenticated = get().isAuthenticated;
          
          if (!isAuthenticated) {
            get().stopSessionMonitoring();
            return;
          }
          
          if (apiService.isTokenExpiringSoon() && !warningShown) {
            // Try to extend session automatically first
            apiService.extendSession().then(extended => {
              if (extended) {
                warningShown = false; // Reset so we can warn again if needed
              } else {
                apiService.showExpiryWarning();
                warningShown = true;
              }
            }).catch(() => {
              apiService.showExpiryWarning();
              warningShown = true;
            });
          }
        }, 60000); // Check every minute
      },

      stopSessionMonitoring: () => {
        if (sessionInterval) {
          clearInterval(sessionInterval);
          sessionInterval = null;
        }
        warningShown = false;
      },

      clearError: () => set({ error: null }),
      
      setLoading: (loading: boolean) => set({ isLoading: loading })
    }),
    {
      name: 'auth-store',
    }
  )
); 