/**
 * Authentication Testing Service
 * 
 * Handles authentication testing, session management,
 * and security validation.
 */

import { apiService } from '../api';

// Auth Testing Types
export interface SessionStatus {
  has_token: boolean;
  is_expired: boolean;
  expires_at: string;
  remaining_time_seconds: number;
  token_length: number;
  user_id: number;
  username: string;
}

export interface UserDatabase {
  user_count: number;
  users: Array<{
    uuid: string;
    username: string;
    created_at: string;
  }>;
}

export interface HealthCheck {
  status: string;
  database_accessible: boolean;
  timestamp: string;
  error?: string;
}

export interface DiaryEncryptionDetails {
  encrypted_blob_length: number;
  iv_length: number;
  tag_length: number;
}

// Auth Testing Functions
export const authTestingService = {
  async getSessionStatus(): Promise<SessionStatus> {
    const response = await apiService.get('/testing/auth/session-status');
    return response.data;
  },

  async checkUserDatabase(): Promise<UserDatabase> {
    const response = await apiService.get('/testing/auth/user-database');
    return response.data;
  },

  async basicHealthCheck(): Promise<HealthCheck> {
    const response = await apiService.get('/testing/auth/health');
    return response.data;
  },

  async checkDiaryEncryption(): Promise<DiaryEncryptionDetails> {
    const response = await apiService.get('/testing/auth/diary-encryption');
    return response.data;
  }
};
