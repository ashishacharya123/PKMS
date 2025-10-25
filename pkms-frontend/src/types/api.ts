// import { User } from './auth'; // Unused

export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  detail?: string;
  status?: number;
}

export interface TokenRefreshResponse {
  accessToken: string;
  expiresIn: number;
  userId: number;
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
