/**
 * EmptyState - Reusable empty state component
 * Shows when there are no items to display with customizable icon, title, and actions
 */

import React from 'react';
import { Paper, Stack, Text, Button, Group } from '@mantine/core';
import { Icon } from '@tabler/icons-react';

interface EmptyStateProps {
  icon: React.ComponentType<{ size?: number; stroke?: number; color?: string }>;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({ 
  icon: IconComponent, 
  title, 
  description, 
  actionLabel, 
  onAction,
  size = 'md'
}: EmptyStateProps) {
  const iconSize = size === 'sm' ? 32 : size === 'lg' ? 64 : 48;
  
  return (
    <Paper p="xl" withBorder>
      <Stack align="center" gap="md">
        <IconComponent 
          size={iconSize} 
          stroke={1.5} 
          color="var(--mantine-color-gray-5)" 
        />
        <div>
          <Text ta="center" fw={500} size={size === 'sm' ? 'sm' : 'md'}>
            {title}
          </Text>
          {description && (
            <Text ta="center" c="dimmed" size="sm" mt="xs">
              {description}
            </Text>
          )}
        </div>
        {actionLabel && onAction && (
          <Button onClick={onAction} size="sm">
            {actionLabel}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
