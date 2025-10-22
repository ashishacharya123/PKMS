/**
 * ProjectBadge Component
 * Individual project badge for displaying project information
 */

import { Badge, Tooltip, Group } from '@mantine/core';
import { IconLock, IconLink } from '@tabler/icons-react';
import { Project, ProjectStatus } from '../../types/project';

interface ProjectBadgeProps {
  project: Project;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  clickable?: boolean;
  onClick?: () => void;
  showIcon?: boolean;
}

export function ProjectBadge({
  project,
  size = 'sm',
  clickable = false,
  onClick,
  showIcon = true
}: ProjectBadgeProps) {
  const getStatusColor = (status: ProjectStatus): string => {
    const colors = {
      [ProjectStatus.IS_RUNNING]: 'blue',
      [ProjectStatus.ON_HOLD]: 'yellow',
      [ProjectStatus.COMPLETED]: 'green',
      [ProjectStatus.CANCELLED]: 'gray'
    };
    return colors[status] || 'gray';
  };

  const getStatusIcon = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.IS_RUNNING:
        return <IconLink size={12} />;
      case ProjectStatus.ON_HOLD:
        return <IconLock size={12} />;
      case ProjectStatus.COMPLETED:
        return <IconLink size={12} />;
      case ProjectStatus.CANCELLED:
        return <IconLock size={12} />;
      default:
        return null;
    }
  };

  const badgeContent = (
    <Group gap="xs" align="center">
      {showIcon && getStatusIcon(project.status)}
      <span>{project.name}</span>
    </Group>
  );

  if (clickable && onClick) {
    return (
      <Tooltip label={`Click to view ${project.name}`}>
        <Badge
          size={size}
          color={getStatusColor(project.status)}
          variant="light"
          style={{ cursor: 'pointer' }}
          onClick={onClick}
        >
          {badgeContent}
        </Badge>
      </Tooltip>
    );
  }

  return (
    <Badge
      size={size}
      color={getStatusColor(project.status)}
      variant="light"
    >
      {badgeContent}
    </Badge>
  );
}
