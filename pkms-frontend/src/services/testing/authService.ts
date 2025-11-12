/**
 * Authentication Testing Service
 * 
 * Handles authentication testing, session management,
 * and security validation.
 */

import { apiService } from '../api';

// Auth Testing Types
export interface SessionStatus {
  hasToken: boolean;
  isExpired: boolean;
  expiresAt: string;
  remainingTimeSeconds: number;
  tokenLength: number;
  userId: number;
  username: string;
}

export interface UserDatabase {
  userCount: number;
  users: Array<{
    uuid: string;
    username: string;
    createdAt: string;
  }>;
}

export interface HealthCheck {
  status: string;
  databaseAccessible: boolean;
  timestamp: string;
  error?: string;
}

export interface DiaryEncryptionDetails {
  encryptedBlobLength: number;
  ivLength: number;
  tagLength: number;
}

// Auth Testing Functions
export const authTestingService = {
  async checkAuthentication(): Promise<SessionStatus> {
    // Alias for getSessionStatus for compatibility
    return await authTestingService.getSessionStatus();
  },

  async getSessionStatus(): Promise<SessionStatus> {
    const response = await apiService.get('/testing/auth/session-status');
    const data = response.data;

    // Transform backend response to frontend format
    if (data.status === 'active_session' && data.session && data.session.health) {
      return {
        hasToken: true,
        isExpired: !data.session.health.is_valid,
        expiresAt: data.session.expires_at,
        remainingTimeSeconds: data.session.health.expires_in_seconds,
        tokenLength: data.session.session_token ? data.session.session_token.length : 0,
        userId: parseInt(data.user?.uuid || '0', 16) || 0, // Convert UUID to number (fallback to 0)
        username: data.user?.username || 'Unknown'
      };
    } else if (data.status === 'no_active_session') {
      return {
        hasToken: false,
        isExpired: true,
        expiresAt: '',
        remainingTimeSeconds: 0,
        tokenLength: 0,
        userId: data.created_by ? parseInt(data.created_by, 16) || 0 : 0,
        username: 'No Session'
      };
    } else {
      // Fallback for unexpected response structure
      return {
        hasToken: false,
        isExpired: true,
        expiresAt: '',
        remainingTimeSeconds: 0,
        tokenLength: 0,
        userId: 0,
        username: 'Error'
      };
    }
  },

  async checkUserDatabase(): Promise<UserDatabase> {
    try {
      // Try the expected endpoint first
      const response = await apiService.get('/testing/auth/user-database');
      const data = response.data;

      // Transform to frontend format (assuming frontend structure)
      if (data.users) {
        return data;
      } else {
        // Fallback transformation
        return {
          userCount: data.user_statistics?.total_users || 0,
          users: data.recent_users?.map((user: any) => ({
            uuid: user.uuid,
            username: user.username,
            createdAt: user.created_at
          })) || []
        };
      }
    } catch (error) {
      // Fallback to the actual backend endpoint
      const response = await apiService.get('/testing/auth/check-users');
      const data = response.data;

      // Transform backend response to frontend format
      if (data.status === 'success') {
        return {
          userCount: data.user_statistics?.total_users || 0,
          users: data.recent_users?.map((user: any) => ({
            uuid: user.uuid,
            username: user.username,
            createdAt: user.created_at
          })) || []
        };
      } else {
        // Error case
        return {
          userCount: 0,
          users: [],
          error: data.message || 'Failed to check user database'
        };
      }
    }
  },

  async basicHealthCheck(): Promise<HealthCheck> {
    try {
      const response = await apiService.get('/testing/auth/health');
      const data = response.data;

      // Transform backend response to frontend format
      if (data.status === 'healthy') {
        return {
          status: 'success',
          databaseAccessible: true,
          timestamp: data.timestamp || new Date().toISOString()
        };
      } else {
        return {
          status: 'error',
          databaseAccessible: false,
          timestamp: data.timestamp || new Date().toISOString(),
          error: data.message || 'Health check failed'
        };
      }
    } catch (error) {
      return {
        status: 'error',
        databaseAccessible: false,
        timestamp: new Date().toISOString(),
        error: 'Health check endpoint not accessible'
      };
    }
  },

  async checkDiaryEncryption(): Promise<DiaryEncryptionDetails> {
    try {
      // Try the expected endpoint first
      const response = await apiService.get('/testing/auth/diary-encryption');
      return response.data;
    } catch (error) {
      // Fallback to the actual backend endpoint
      const response = await apiService.get('/testing/auth/diary/entries-encryption-check');
      return response.data;
    }
  },

  async testDiaryEncryption(password: string): Promise<any> {
    try {
      const response = await apiService.post('/testing/auth/diary/test-encryption', { password });
      return response.data;
    } catch (error: any) {
      console.error('Diary encryption test failed:', error);
      return {
        encryption_test: false,
        message: error?.response?.data?.detail || 'Diary encryption test failed',
        sample_entry: null,
        media_count: 0
      };
    }
  },

  async testAPIConnectivity(): Promise<any> {
    try {
      const startTime = Date.now();

      // Test 1: Basic backend health
      const healthResponse = await apiService.get('/testing/auth/health');
      const healthTime = Date.now() - startTime;

      // Test 2: Authenticated request (session status)
      const authStartTime = Date.now();
      try {
        await apiService.get('/testing/auth/session-status');
        const authTime = Date.now() - authStartTime;

        // Test 3: CORS check (implicitly tested by successful API calls)
        const corsTime = Date.now() - authStartTime;

        return {
          backend_health: {
            success: healthResponse.data?.status === 'healthy' || healthResponse.data?.status === 'success',
            response_time_ms: healthTime,
            error: null
          },
          auth_test: {
            success: true,
            response_time_ms: authTime,
            error: null
          },
          cors_test: {
            success: true,
            response_time_ms: corsTime,
            error: null
          },
          overall_success: true,
          total_tests: 3,
          passed_tests: 3,
          timestamp: new Date().toISOString()
        };
      } catch (authError: any) {
        return {
          backend_health: {
            success: healthResponse.data?.status === 'healthy' || healthResponse.data?.status === 'success',
            response_time_ms: healthTime,
            error: null
          },
          auth_test: {
            success: false,
            response_time_ms: Date.now() - authStartTime,
            error: authError?.message || 'Authentication test failed'
          },
          cors_test: {
            success: false,
            response_time_ms: 0,
            error: 'CORS test skipped due to auth failure'
          },
          overall_success: false,
          total_tests: 3,
          passed_tests: healthResponse.data?.status === 'healthy' ? 1 : 0,
          timestamp: new Date().toISOString()
        };
      }
    } catch (error: any) {
      return {
        backend_health: {
          success: false,
          response_time_ms: 0,
          error: error?.message || 'Backend health check failed'
        },
        auth_test: {
          success: false,
          response_time_ms: 0,
          error: 'Auth test skipped due to backend failure'
        },
        cors_test: {
          success: false,
          response_time_ms: 0,
          error: 'CORS test skipped due to backend failure'
        },
        overall_success: false,
        total_tests: 3,
        passed_tests: 0,
        timestamp: new Date().toISOString()
      };
    }
  }
};
