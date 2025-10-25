/**
 * User settings interface for type-safe settings management
 */
export interface UserSettings {
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  notifications?: {
    enabled: boolean;
    sessionWarnings?: boolean;
    backupReminders?: boolean;
  };
  display?: {
    densityLevel?: 'comfortable' | 'compact';
    fontSize?: number;
  };
}

/**
 * Core user interface matching backend model
 * Excludes sensitive fields that should only exist server-side
 */
export interface User {
  id: number;
  username: string;
  email?: string;
  isActive: boolean;
  isFirstLogin: boolean;
  settingsJson: string;
  loginPasswordHint?: string;
  diaryPasswordHint?: string;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
  // Computed/helper properties
  settings: UserSettings;  // Parsed from settings_json
  isAuthenticated?: boolean;  // Runtime auth status
}

// Comprehensive user setup interface
export interface UserSetup {
  username: string;
  password: string;
  email?: string;
  loginPasswordHint?: string;
  // Recovery questions (mandatory)
  recoveryQuestions: string[];
  recoveryAnswers: string[];
  // Diary password (optional)
  diaryPassword?: string;
  diaryPasswordHint?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
}

export interface RecoverySetup {
  recoveryQuestions: string[];
  recoveryAnswers: string[];
}

export interface RecoveryReset {
  username: string;
  answers: string[];
  newPassword: string;
}

export interface AuthResponse {
  accessToken: string;  // Backend returns camelCase due to CamelCaseModel
  tokenType: string;
  expiresIn: number;
  userId: number;
  username: string;
  isFirstLogin?: boolean;  // Optional
}

export interface RecoveryKeyResponse {
  recoveryKey: string;
  message: string;
}

export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  detail?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  sessionTimer: number | null;
}