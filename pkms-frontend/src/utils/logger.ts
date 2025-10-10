/**
 * Centralized logging utility for PKMS Frontend
 * Controls logging levels and reduces excessive console output
 */

/// <reference types="vite/client" />

const isDevelopment = import.meta.env.MODE === 'development';
const isProduction = import.meta.env.MODE === 'production';

// Log levels: 'error', 'warn', 'info', 'debug'
const LOG_LEVEL = isProduction ? 'error' : 'warn';

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = LOG_LEVELS[LOG_LEVEL as keyof typeof LOG_LEVELS] || 0;

class Logger {
  private shouldLog(level: keyof typeof LOG_LEVELS): boolean {
    return LOG_LEVELS[level] <= currentLevel;
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(`[PKMS] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[PKMS] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(`[PKMS] ${message}`, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(`[PKMS] ${message}`, ...args);
    }
  }

  // Special method for auth-related logs (always shown in development)
  auth(message: string, ...args: any[]): void {
    if (isDevelopment || this.shouldLog('info')) {
      console.log(`[PKMS AUTH] ${message}`, ...args);
    }
  }

  // Special method for critical errors (always shown)
  critical(message: string, ...args: any[]): void {
    console.error(`[PKMS CRITICAL] ${message}`, ...args);
  }
}

export const logger = new Logger();

// Export individual methods for convenience
export const { error, warn, info, debug, auth, critical } = logger;
