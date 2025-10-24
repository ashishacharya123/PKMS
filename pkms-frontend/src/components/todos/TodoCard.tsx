/**
 * TodoCard Component
 * Displays individual todo items with actions and status information
 * Optimized with React.memo for performance
 */

import React from 'react';
import { Paper, Group, Text, Badge, Stack, Progress, Box } from '@mantine/core';
import { IconCalendar, IconAlertTriangle, IconChecklist, IconFolder, IconCheck } from '@tabler/icons-react';
import { ActionMenu } from '../common/ActionMenu';
import { ProjectBadges } from '../common/ProjectBadges';
import { SubtaskList } from './SubtaskList';
import { Todo, TodoStatus, TaskPriority } from '../../types/todo';
import { getStatusColor } from '../../theme/colors';
import { useMantineTheme } from '@mantine/core';
import { formatDate } from '../common/ViewModeLayouts';

interface TodoCardProps {
  todo: Todo;
  onEdit: (todo: Todo) => void;
  onDelete: (uuid: string, title: string) => void;
  onArchive: (uuid: string) => void;
  onUnarchive: (uuid: string) => void;
  onComplete: (uuid: string) => void;
  onAddSubtask: (uuid: string) => void;
  onSubtaskUpdate?: (subtask: Todo) => void;
  onSubtaskDelete?: (subtaskUuid: string) => void;
  onSubtaskEdit?: (subtask: Todo) => void;
  showArchived?: boolean;
}

export const TodoCard = React.memo(function TodoCard({
  todo,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  onComplete,
  onAddSubtask,
  onSubtaskUpdate,
  onSubtaskDelete,
  onSubtaskEdit,
  showArchived = false // eslint-disable-line @typescript-eslint/no-unused-vars
}: TodoCardProps) {
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

  const getPriorityColor = (priority: TaskPriority): string => {
    const colors = {
      [TaskPriority.LOW]: '#4CAF50',
      [TaskPriority.MEDIUM]: '#FF9800', 
      [TaskPriority.HIGH]: '#F44336',
      [TaskPriority.URGENT]: '#9C27B0'
    };
    return colors[priority] || '#757575';
  };

  const daysUntilDue = getDaysUntilDue(todo.dueDate);
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue <= 3 && daysUntilDue >= 0;

  return (
    <Paper
      shadow="xs"
      p="md"
      style={{
        borderLeft: `4px solid ${getPriorityColor(todo.priority)}`,
        opacity: todo.status === TodoStatus.DONE ? 0.7 : 1
      }}
    >
      <Group justify="space-between" align="flex-start" mb="sm">
        <Stack gap="xs" style={{ flex: 1 }}>
          {/* Title and Status */}
          <Group justify="space-between" align="flex-start">
            <Text fw={500} size="sm" style={{ textDecoration: todo.status === TodoStatus.DONE ? 'line-through' : 'none' }}>
              {todo.title}
            </Text>
            <Group gap="xs">
              <Badge 
                size="sm" 
                color={getStatusColor(theme, todo.status as any)}
                variant="light"
              >
                {todo.status.replace('_', ' ')}
              </Badge>
              <ActionMenu
                onEdit={() => onEdit(todo)}
                onArchive={todo.isArchived ? undefined : () => onArchive(todo.uuid)}
                onUnarchive={todo.isArchived ? () => onUnarchive(todo.uuid) : undefined}
                onDelete={() => onDelete(todo.uuid, todo.title)}
                isArchived={todo.isArchived}
                variant="subtle"
                color="gray"
                size={16}
                customActions={[
                  {
                    label: 'Add Subtask',
                    icon: <IconChecklist size={14} />,
                    onClick: () => onAddSubtask(todo.uuid)
                  },
                  ...(todo.status !== TodoStatus.DONE ? [{
                    label: 'Complete',
                    icon: <IconCheck size={14} />,
                    onClick: () => onComplete(todo.uuid)
                  }] : [])
                ]}
              />
            </Group>
          </Group>

          {/* Description */}
          {todo.description && (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {todo.description}
            </Text>
          )}

          {/* Due Date and Priority */}
          <Group gap="md" align="center">
            {todo.dueDate && (
              <Group gap="xs" align="center">
                <IconCalendar size={12} />
                <Text size="xs" c="dimmed">
                  Due: {formatDate(todo.dueDate || undefined)}
                </Text>
                {isOverdue && (
                  <Badge size="xs" color="red">Overdue</Badge>
                )}
                {isDueSoon && !isOverdue && (
                  <Badge size="xs" color="orange">Due Soon</Badge>
                )}
              </Group>
            )}
            
            {todo.priority !== TaskPriority.MEDIUM && (
              <Group gap="xs" align="center">
                <IconAlertTriangle size={12} />
                <Text size="xs" c="dimmed">
                  Priority: {todo.priority}
                </Text>
              </Group>
            )}
          </Group>

          {/* Projects */}
          {todo.projects && todo.projects.length > 0 && (
            <Group gap="xs" align="center">
              <IconFolder size={12} />
              <ProjectBadges 
                projects={todo.projects.map(p => ({
                  ...p,
                  color: '#228be6', // Default color since our ProjectBadge doesn't have color
                  isDeleted: false // Default value
                }))} 
              />
            </Group>
          )}

          {/* Dependency Information */}
          {(todo.blockedByTodos && todo.blockedByTodos.length > 0) && (
            <Group gap="xs" align="center">
              <IconAlertTriangle size={12} color="orange" />
              <Text size="xs" c="orange">
                Blocked by {todo.blockedByTodos.length} todo{todo.blockedByTodos.length > 1 ? 's' : ''}
              </Text>
            </Group>
          )}

          {(todo.blockingTodos && todo.blockingTodos.length > 0) && (
            <Group gap="xs" align="center">
              <IconCheck size={12} color="blue" />
              <Text size="xs" c="blue">
                Blocking {todo.blockingTodos.length} todo{todo.blockingTodos.length > 1 ? 's' : ''}
              </Text>
            </Group>
          )}

          {/* Progress */}
          {todo.completionPercentage !== undefined && todo.completionPercentage > 0 && (
            <Box>
              <Group justify="space-between" mb={2}>
                <Text size="xs" c="dimmed">Progress</Text>
                <Text size="xs" c="dimmed">{todo.completionPercentage}%</Text>
              </Group>
              <Progress 
                value={todo.completionPercentage} 
                size="xs" 
                color={todo.completionPercentage === 100 ? 'green' : 'blue'}
              />
            </Box>
          )}

          {/* Subtasks */}
          {todo.subtasks && todo.subtasks.length > 0 && (
            <SubtaskList
              parentTodo={todo as any}
              onSubtaskComplete={(uuid, completed) => {
                if (onSubtaskUpdate) {
                  const subtask = todo.subtasks?.find(s => s.uuid === uuid);
                  if (subtask) {
                    onSubtaskUpdate({ ...subtask, status: completed ? TodoStatus.DONE : TodoStatus.PENDING });
                  }
                }
              }}
              onSubtaskEdit={onSubtaskEdit as any}
              onSubtaskDelete={onSubtaskDelete as any}
              onAddSubtask={onAddSubtask}
            />
          )}
        </Stack>
      </Group>
    </Paper>
  );
});
