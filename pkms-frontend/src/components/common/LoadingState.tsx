import React from 'react';
import { Center, Loader, Stack, Text } from '@mantine/core';

export interface LoadingStateProps {
  height?: number | string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  message?: string;
}

export function LoadingState({ height = 400, size = 'lg', message }: LoadingStateProps) {
  return (
    <Center style={{ height }}>
      <Stack align="center" gap="sm">
        <Loader size={size} />
        {message && <Text size="sm" c="dimmed">{message}</Text>}
      </Stack>
    </Center>
  );
}

/**
 * LoadingState - Reusable loading state component
 * Shows loading skeleton or spinner with customizable content
 */

import React from 'react';
import { Paper, Stack, Skeleton, Text, Group } from '@mantine/core';
import { LoadingOverlay } from '@mantine/core';

interface LoadingStateProps {
  type?: 'skeleton' | 'overlay' | 'inline';
  count?: number;
  height?: number;
  message?: string;
  showMessage?: boolean;
}

export function LoadingState({ 
  type = 'skeleton', 
  count = 3, 
  height = 60,
  message = 'Loading...',
  showMessage = false
}: LoadingStateProps) {
  if (type === 'overlay') {
    return (
      <div style={{ position: 'relative', minHeight: 200 }}>
        <LoadingOverlay visible={true} />
      </div>
    );
  }

  if (type === 'inline') {
    return (
      <Paper p="md" withBorder>
        <Stack align="center" gap="sm">
          <Text size="sm" c="dimmed">{message}</Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {showMessage && (
        <Text size="sm" c="dimmed" ta="center">{message}</Text>
      )}
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} height={height} radius="md" />
      ))}
    </Stack>
  );
}
