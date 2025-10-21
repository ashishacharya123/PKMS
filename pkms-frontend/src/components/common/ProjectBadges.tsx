import React from 'react';
import { Badge, Group, Tooltip, Text } from '@mantine/core';
import { IconLock, IconLink, IconTrash } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

export interface ProjectBadge {
  uuid: string | null;
  name: string;
  color: string;
  isProjectExclusive: boolean;
  isDeleted: boolean;
}

interface ProjectBadgesProps {
  projects: ProjectBadge[];
  size?: 'xs' | 'sm' | 'md' | 'lg';
  maxVisible?: number;
  clickable?: boolean;
}

export const ProjectBadges: React.FC<ProjectBadgesProps> = ({
  projects,
  size = 'sm',
  maxVisible = 3,
  clickable = true
}) => {
  const navigate = useNavigate();

  if (!projects || projects.length === 0) {
    return null;
  }

  const handleBadgeClick = (projectUuid: string | null) => {
    if (clickable && projectUuid) {
      navigate(`/projects/${projectUuid}`);
    }
  };

  const visibleProjects = projects.slice(0, maxVisible);
  const hiddenCount = projects.length - maxVisible;

  return (
    <Group gap="xs">
      {visibleProjects.map((project, index) => {
        const isClickable = clickable && !project.isDeleted && project.uuid;
        
        return (
          <Tooltip
            key={`${project.uuid || 'deleted'}-${index}`}
            label={
              <div>
                <Text size="xs" fw={600}>{project.name}</Text>
                {project.isDeleted && (
                  <Text size="xs" c="dimmed">Deleted Project</Text>
                )}
                {project.isProjectExclusive && !project.isDeleted && (
                  <Text size="xs" c="orange">Exclusive Mode</Text>
                )}
                {!project.isProjectExclusive && !project.isDeleted && (
                  <Text size="xs" c="blue">Linked Mode</Text>
                )}
              </div>
            }
            withArrow
          >
            <Badge
              color={project.isDeleted ? 'gray' : project.color}
              variant={project.isDeleted ? 'outline' : 'light'}
              size={size}
              style={{
                cursor: isClickable ? 'pointer' : 'default',
                opacity: project.isDeleted ? 0.6 : 1
              }}
              onClick={() => handleBadgeClick(project.uuid)}
              leftSection={
                project.isDeleted ? (
                  <IconTrash size={12} />
                ) : project.isProjectExclusive ? (
                  <IconLock size={12} />
                ) : (
                  <IconLink size={12} />
                )
              }
            >
              {project.name}
            </Badge>
          </Tooltip>
        );
      })}

      {hiddenCount > 0 && (
        <Tooltip
          label={
            <div>
              <Text size="xs" fw={600}>Additional Projects</Text>
              {projects.slice(maxVisible).map((p, idx) => (
                <Text key={`${p.uuid || 'deleted'}-${idx}`} size="xs">
                  • {p.name}
                </Text>
              ))}
            </div>
          }
          withArrow
        >
          <Badge color="gray" variant="outline" size={size}>
            +{hiddenCount} more
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
};

