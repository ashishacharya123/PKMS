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
  is_active: boolean;
  is_first_login: boolean;
  settings_json: string;
  login_password_hint?: string;
  diary_password_hint?: string;
  // Timestamps
  created_at: string;
  updated_at: string;
  last_login?: string;
  // Computed/helper properties
  settings: UserSettings;  // Parsed from settings_json
  isAuthenticated?: boolean;  // Runtime auth status
}

// Comprehensive user setup interface
export interface UserSetup {
  username: string;
  password: string;
  email?: string;
  login_password_hint?: string;
  // Recovery questions (mandatory)
  recovery_questions: string[];
  recovery_answers: string[];
  // Diary password (optional)
  diary_password?: string;
  diary_password_hint?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface PasswordChange {
  current_password: string;
  new_password: string;
}

export interface RecoverySetup {
  questions: string[];
  answers: string[];
}

export interface RecoveryReset {
  username: string;
  answers: string[];
  new_password: string;
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
  recovery_key: string;
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