import { User } from './auth';

export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  detail?: string;
  status?: number;
}

export interface TokenRefreshResponse {
  access_token: string;
  expires_in: number;
  user_id: number;
  username: string;
}

export interface ApiError {
  response?: {
    data?: {
      detail?: string;
      message?: string;
    };
    status: number;
    statusText: string;
  };
  isNetworkError?: boolean;
  originalError?: Error;
}
