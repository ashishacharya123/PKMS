/**
 * QuickActions - Reusable quick actions component
 * Provides common action buttons for different contexts
 */

import React from 'react';
import { Group, Button, Tooltip } from '@mantine/core';
import { Icon } from '@tabler/icons-react';

interface QuickAction {
  icon: React.ComponentType<{ size?: number; stroke?: number }>;
  label: string;
  onClick: () => void;
  color?: string;
  variant?: 'filled' | 'light' | 'outline' | 'subtle';
  disabled?: boolean;
  loading?: boolean;
  tooltip?: string;
}

interface QuickActionsProps {
  actions: QuickAction[];
  size?: 'xs' | 'sm' | 'md' | 'lg';
  orientation?: 'horizontal' | 'vertical';
  showLabels?: boolean;
  compact?: boolean;
}

export function QuickActions({
  actions,
  size = 'sm',
  orientation = 'horizontal',
  showLabels = true,
  compact = false
}: QuickActionsProps) {
  const renderAction = (action: QuickAction, index: number) => {
    const button = (
      <Button
        key={index}
        variant={action.variant || 'light'}
        size={size}
        color={action.color}
        leftSection={!compact ? <action.icon size={16} /> : undefined}
        onClick={action.onClick}
        disabled={action.disabled}
        loading={action.loading}
        compact={compact}
      >
        {showLabels && !compact ? action.label : undefined}
      </Button>
    );

    if (action.tooltip) {
      return (
        <Tooltip key={index} label={action.tooltip} position="top">
          {button}
        </Tooltip>
      );
    }

    return button;
  };

  return (
    <Group 
      gap={compact ? 'xs' : 'sm'} 
      direction={orientation === 'vertical' ? 'column' : 'row'}
      align="center"
    >
      {actions.map(renderAction)}
    </Group>
  );
}
