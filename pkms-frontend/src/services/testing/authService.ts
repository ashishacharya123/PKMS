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
