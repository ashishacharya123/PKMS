/**
 * ProgressIndicator - Reusable progress indicator component
 * Shows progress with customizable appearance and behavior
 */

import React from 'react';
import { Progress, Text, Group, Stack } from '@mantine/core';

interface ProgressIndicatorProps {
  value: number;
  max?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  showLabel?: boolean;
  showPercentage?: boolean;
  label?: string;
  animated?: boolean;
  striped?: boolean;
}

export function ProgressIndicator({
  value,
  max = 100,
  size = 'md',
  color,
  showLabel = true,
  showPercentage = true,
  label,
  animated = false,
  striped = false
}: ProgressIndicatorProps) {
  const percentage = Math.round((value / max) * 100);
  const displayValue = Math.min(Math.max(value, 0), max);
  
  const getColor = () => {
    if (color) return color;
    
    if (percentage >= 100) return 'green';
    if (percentage >= 75) return 'blue';
    if (percentage >= 50) return 'yellow';
    if (percentage >= 25) return 'orange';
    return 'red';
  };

  return (
    <Stack gap="xs">
      {showLabel && (
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            {label || 'Progress'}
          </Text>
          {showPercentage && (
            <Text size="sm" c="dimmed">
              {percentage}%
            </Text>
          )}
        </Group>
      )}
      
      <Progress
        value={percentage}
        size={size}
        color={getColor()}
        animated={animated}
        striped={striped}
        radius="md"
      />
      
      {showLabel && (
        <Text size="xs" c="dimmed" ta="center">
          {displayValue} of {max}
        </Text>
      )}
    </Stack>
  );
}
