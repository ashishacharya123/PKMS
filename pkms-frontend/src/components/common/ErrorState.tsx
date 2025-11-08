import React from 'react';
import { Center, Stack, Text, Button } from '@mantine/core';
import { IconRefresh, IconAlertTriangle } from '@tabler/icons-react';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  height?: number | string;
  showIcon?: boolean;
}

export function ErrorState({ message, onRetry, height = 400, showIcon = true }: ErrorStateProps) {
  return (
    <Center style={{ height }}>
      <Stack align="center" gap="md">
        {showIcon && <IconAlertTriangle size={48} color="var(--mantine-color-red-6)" />}
        <Text c="dimmed" ta="center">{message}</Text>
        {onRetry && (
          <Button onClick={onRetry} leftSection={<IconRefresh size={16} />} variant="light">
            Retry
          </Button>
        )}
      </Stack>
    </Center>
  );
}


