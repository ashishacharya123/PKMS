import React from 'react';
import { Center, Loader, Stack, Text, Paper, Skeleton, LoadingOverlay } from '@mantine/core';

export interface LoadingStateProps {
  type?: 'skeleton' | 'overlay' | 'inline' | 'spinner';
  count?: number;
  height?: number | string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  message?: string;
  showMessage?: boolean;
}

export function LoadingState({
  type = 'spinner',
  count = 3,
  height = 400,
  size = 'lg',
  message,
  showMessage = false
}: LoadingStateProps) {
  // Overlay type - shows loading overlay
  if (type === 'overlay') {
    return (
      <div style={{ position: 'relative', minHeight: typeof height === 'number' ? height : 200 }}>
        <LoadingOverlay visible={true} />
      </div>
    );
  }

  // Inline type - shows message in a paper
  if (type === 'inline') {
    return (
      <Paper p="md" withBorder>
        <Stack align="center" gap="sm">
          <Text size="sm" c="dimmed">{message || 'Loading...'}</Text>
        </Stack>
      </Paper>
    );
  }

  // Skeleton type - shows skeleton loaders
  if (type === 'skeleton') {
    return (
      <Stack gap="md">
        {showMessage && message && (
          <Text size="sm" c="dimmed" ta="center">{message}</Text>
        )}
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton key={index} height={typeof height === 'number' ? height : 60} radius="md" />
        ))}
      </Stack>
    );
  }

  // Default spinner type - centered loader with message
  return (
    <Center style={{ height }}>
      <Stack align="center" gap="sm">
        <Loader size={size} />
        {message && <Text size="sm" c="dimmed">{message}</Text>}
      </Stack>
    </Center>
  );
}
