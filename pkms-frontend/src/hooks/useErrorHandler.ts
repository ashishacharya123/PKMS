import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';

export interface ErrorHandlerOptions {
  showNotification?: boolean;
  logToConsole?: boolean;
  fallbackMessage?: string;
}

export function useErrorHandler(options: ErrorHandlerOptions = {}) {
  const {
    showNotification = true,
    logToConsole = true,
    fallbackMessage = 'An error occurred'
  } = options;

  const handleError = useCallback((error: unknown, context: string, customMessage?: string) => {
    const message = error instanceof Error ? error.message : fallbackMessage;

    if (logToConsole) {
      // Intentionally minimal to avoid leaking sensitive data
      console.error(`[${context}]`, message);
    }

    if (showNotification) {
      notifications.show({
        title: 'Error',
        message: customMessage || `Failed to ${context.toLowerCase()}`,
        color: 'red'
      });
    }

    return message;
  }, [showNotification, logToConsole, fallbackMessage]);

  return { handleError };
}


