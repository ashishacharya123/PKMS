/**
 * ProjectCard Component
 * Displays individual project items with actions and status information
 */

import { Paper, Group, Text, Badge, Stack, Progress, Box } from '@mantine/core';
import { IconCalendar, IconFileText, IconChecklist } from '@tabler/icons-react';
import { ActionMenu } from '../common/ActionMenu';
import { Project, ProjectStatus } from '../../types/project';
import { getStatusColor } from '../../theme/colors';
import { useMantineTheme } from '@mantine/core';
import { formatDate } from '../common/ViewModeLayouts';

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (uuid: string, name: string) => void;
  onArchive: (uuid: string) => void;
  onUnarchive: (uuid: string) => void;
  onDuplicate?: (project: Project) => void;
  showArchived?: boolean;
}

export function ProjectCard({
  project,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  onDuplicate,
  showArchived = false // eslint-disable-line @typescript-eslint/no-unused-vars
}: ProjectCardProps) {
  const theme = useMantineTheme();

  const getDaysUntilDue = (dueDate?: string | null): number | null => {
    if (!dueDate) return null;
    try {
      const due = new Date(dueDate);
      if (isNaN(due.getTime())) return null;
      const now = new Date();
      const diffTime = due.getTime() - now.getTime();
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  };

  const daysUntilDue = getDaysUntilDue(project.dueDate);
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue <= 7 && daysUntilDue >= 0;

  const getCompletionPercentage = (): number => {
    if (!project.todoCount || project.todoCount === 0) return 0;
    return Math.round((project.completedCount || 0) / project.todoCount * 100);
  };

  const completionPercentage = getCompletionPercentage();

  return (
    <Paper
      shadow="xs"
      p="md"
      style={{
        borderLeft: `4px solid ${getStatusColor(theme, project.status as any)}`,
        opacity: 1 // Projects don't have isArchived property
      }}
    >
      <Group justify="space-between" align="flex-start" mb="sm">
        <Stack gap="xs" style={{ flex: 1 }}>
          {/* Title and Status */}
          <Group justify="space-between" align="flex-start">
            <Text fw={500} size="sm">
              {project.name}
            </Text>
            <Group gap="xs">
              <Badge 
                size="sm" 
                color={getStatusColor(theme, project.status as any)}
                variant="light"
              >
                {project.status.replace('_', ' ')}
              </Badge>
              <ActionMenu
                onEdit={() => onEdit(project)}
                onArchive={() => onArchive(project.uuid)}
                onDelete={() => onDelete(project.uuid, project.name)}
                isArchived={false} // Projects don't have archive status
                variant="subtle"
                color="gray"
                size={16}
                customActions={onDuplicate ? [{
                  label: 'Duplicate',
                  icon: <IconFileText size={14} />,
                  onClick: () => onDuplicate(project)
                }] : []}
              />
            </Group>
          </Group>

          {/* Description */}
          {project.description && (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {project.description}
            </Text>
          )}

          {/* Due Date and Completion Date */}
          <Group gap="md" align="center">
            {project.dueDate && (
              <Group gap="xs" align="center">
                <IconCalendar size={12} />
                <Text size="xs" c="dimmed">
                  Due: {formatDate(project.dueDate || undefined)}
                </Text>
                {isOverdue && (
                  <Badge size="xs" color="red">Overdue</Badge>
                )}
                {isDueSoon && !isOverdue && (
                  <Badge size="xs" color="orange">Due Soon</Badge>
                )}
              </Group>
            )}

            {project.completionDate && (
              <Group gap="xs" align="center">
                <IconChecklist size={12} />
                <Text size="xs" c="dimmed">
                  Completed: {formatDate(project.completionDate || undefined)}
                </Text>
              </Group>
            )}
          </Group>

          {/* Stats */}
          <Group gap="md" align="center">
            {project.todoCount !== undefined && (
              <Group gap="xs" align="center">
                <IconChecklist size={12} />
                <Text size="xs" c="dimmed">
                  {project.completedCount || 0}/{project.todoCount} todos
                </Text>
              </Group>
            )}
          </Group>

          {/* Progress */}
          {completionPercentage > 0 && (
            <Box>
              <Group justify="space-between" mb={2}>
                <Text size="xs" c="dimmed">Progress</Text>
                <Text size="xs" c="dimmed">{completionPercentage}%</Text>
              </Group>
              <Progress 
                value={completionPercentage} 
                size="xs" 
                color={completionPercentage === 100 ? 'green' : 'blue'}
              />
            </Box>
          )}
        </Stack>
      </Group>
    </Paper>
  );
}
