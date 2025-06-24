export interface User {
  id: number;
  username: string;
  email?: string;
  is_first_login: boolean;
  created_at: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface UserSetup {
  username: string;
  password: string;
  email?: string;
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
  answers: string[];
  new_password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_id: number;
  username: string;
  is_first_login: boolean;
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
} 