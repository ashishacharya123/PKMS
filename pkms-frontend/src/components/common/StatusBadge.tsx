/**
 * StatusBadge - Reusable status badge component
 * Shows status with consistent colors and icons
 */

import React from 'react';
import { Badge } from '@mantine/core';
import { Icon } from '@tabler/icons-react';

interface StatusBadgeProps {
  status: string;
  variant?: 'light' | 'filled' | 'outline';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  icon?: React.ComponentType<{ size?: number; stroke?: number }>;
  showIcon?: boolean;
}

export function StatusBadge({ 
  status, 
  variant = 'light', 
  size = 'sm',
  icon: IconComponent,
  showIcon = false
}: StatusBadgeProps) {
  const getStatusColor = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    
    if (normalizedStatus.includes('completed') || normalizedStatus.includes('done') || normalizedStatus.includes('success')) {
      return 'green';
    }
    if (normalizedStatus.includes('pending') || normalizedStatus.includes('waiting') || normalizedStatus.includes('in progress')) {
      return 'blue';
    }
    if (normalizedStatus.includes('overdue') || normalizedStatus.includes('urgent') || normalizedStatus.includes('critical')) {
      return 'red';
    }
    if (normalizedStatus.includes('archived') || normalizedStatus.includes('deleted')) {
      return 'gray';
    }
    if (normalizedStatus.includes('draft') || normalizedStatus.includes('pending review')) {
      return 'yellow';
    }
    
    return 'gray';
  };

  const getStatusVariant = (status: string) => {
    const normalizedStatus = status.toLowerCase();
    
    if (normalizedStatus.includes('completed') || normalizedStatus.includes('done')) {
      return 'filled';
    }
    if (normalizedStatus.includes('overdue') || normalizedStatus.includes('urgent')) {
      return 'filled';
    }
    
    return variant;
  };

  return (
    <Badge
      color={getStatusColor(status)}
      variant={getStatusVariant(status)}
      size={size}
      leftSection={showIcon && IconComponent ? <IconComponent size={12} /> : undefined}
    >
      {status}
    </Badge>
  );
}
