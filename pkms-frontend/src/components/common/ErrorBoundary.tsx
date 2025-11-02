/**
 * ErrorBoundary - React error boundary component
 * Catches JavaScript errors in child components and displays fallback UI
 * Provides error recovery and optional error details display
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Stack, Text, Title } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showErrorDetails?: boolean;  // Control error details visibility for dev/prod
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Something went wrong"
          color="red"
          variant="filled"
        >
          <Stack gap="sm">
            {this.props.showErrorDetails && (
              <Text>{this.state.error?.message || 'An unexpected error occurred'}</Text>
            )}
            <Button onClick={this.handleReset} size="sm" variant="light">
              Try again
            </Button>
          </Stack>
        </Alert>
      );
    }

    return this.props.children;
  }
}