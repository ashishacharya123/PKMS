import React from 'react';
import { useAuthStore } from '../../stores/authStore';
import { Skeleton, Stack, Container } from '@mantine/core';

interface AuthReadyWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Wrapper component that ensures children only render after authentication is fully established
 * Prevents race conditions in protected routes
 */
export function AuthReadyWrapper({ children, fallback }: AuthReadyWrapperProps) {
  const { isAuthenticated, isLoading } = useAuthStore();

  // Show loading state while authentication is being checked
  if (isLoading) {
    return fallback || (
      <Container size="xl">
        <Stack gap="xl">
          <Skeleton height={60} radius="md" />
          <Skeleton height={200} radius="md" />
          <Skeleton height={150} radius="md" />
        </Stack>
      </Container>
    );
  }

  // Only render children when authentication is confirmed
  if (!isAuthenticated) {
    return null; // AuthGuard will handle redirect
  }

  return <>{children}</>;
}