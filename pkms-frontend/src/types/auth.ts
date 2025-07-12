export interface User {
  id: number;
  username: string;
  email?: string;
  created_at: string;
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
  access_token: string;
  token_type: string;
  expires_in: number;
  user_id: number;
  username: string;
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