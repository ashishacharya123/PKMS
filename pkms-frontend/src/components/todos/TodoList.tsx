/**
 * TodoList Component
 * Displays a list of todos with pagination and empty states
 * Optimized with React.memo for performance
 */

import React from 'react';
import { Stack, Text, Paper, Pagination, Group, Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { TodoCard } from './TodoCard';
import { Todo } from '../../types/todo';
import { Project } from '../../types/project';

interface TodoListProps {
  todos: Todo[];
  projects: Project[]; // eslint-disable-line @typescript-eslint/no-unused-vars
  loading?: boolean;
  onEdit: (todo: Todo) => void;
  onDelete: (uuid: string, title: string) => void;
  onArchive: (uuid: string) => void;
  onUnarchive: (uuid: string) => void;
  onComplete: (uuid: string) => void;
  onAddSubtask: (uuid: string) => void;
  onSubtaskUpdate?: (subtask: Todo) => void;
  onSubtaskDelete?: (subtaskUuid: string) => void;
  onSubtaskEdit?: (subtask: Todo) => void;
  onCreateNew?: () => void;
  showArchived?: boolean;
  currentPage?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
}

export const TodoList = React.memo(function TodoList({
  todos,
  projects,
  loading = false,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  onComplete,
  onAddSubtask,
  onSubtaskUpdate,
  onSubtaskDelete,
  onSubtaskEdit,
  onCreateNew,
  showArchived = false,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  emptyMessage = 'No todos found'
}: TodoListProps) {
  if (loading) {
    return (
      <Stack gap="md">
        {Array.from({ length: 3 }).map((_, index) => (
          <Paper key={index} p="md" withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <div style={{ width: '60%', height: '20px', backgroundColor: '#f0f0f0', borderRadius: '4px' }} />
                <div style={{ width: '80px', height: '20px', backgroundColor: '#f0f0f0', borderRadius: '4px' }} />
              </Group>
              <div style={{ width: '100%', height: '16px', backgroundColor: '#f0f0f0', borderRadius: '4px' }} />
              <div style={{ width: '40%', height: '16px', backgroundColor: '#f0f0f0', borderRadius: '4px' }} />
            </Stack>
          </Paper>
        ))}
      </Stack>
    );
  }

  if (todos.length === 0) {
    return (
      <Paper p="xl" withBorder>
        <Stack gap="md" align="center">
          <Text size="lg" c="dimmed" ta="center">
            {emptyMessage}
          </Text>
          {onCreateNew && (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={onCreateNew}
              variant="light"
            >
              Create Your First Todo
            </Button>
          )}
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      <Stack gap="sm">
        {todos.map((todo) => (
          <TodoCard
            key={todo.uuid}
            todo={todo}
            onEdit={onEdit}
            onDelete={onDelete}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
            onComplete={onComplete}
            onAddSubtask={onAddSubtask}
            onSubtaskUpdate={onSubtaskUpdate}
            onSubtaskDelete={onSubtaskDelete}
            onSubtaskEdit={onSubtaskEdit}
            showArchived={showArchived}
          />
        ))}
      </Stack>

      {totalPages > 1 && onPageChange && (
        <Group justify="center" mt="md">
          <Pagination
            value={currentPage}
            onChange={onPageChange}
            total={totalPages}
            size="sm"
            withEdges
          />
        </Group>
      )}
    </Stack>
  );
});
