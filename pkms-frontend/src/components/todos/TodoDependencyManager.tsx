/**
 * Todo Dependency Manager Component
 * 
 * Manages blocking relationships between todos with visual indicators
 * and dependency management controls.
 */

import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Group, 
  Text, 
  Badge, 
  Button, 
  Modal, 
  Stack, 
  Select, 
  Alert,
  ActionIcon
} from '@mantine/core';
import { 
  IconLink, 
  IconUnlink, 
  IconAlertTriangle, 
  IconCheck, 
  IconClock,
  IconUsers
} from '@tabler/icons-react';
import { Todo, BlockingTodoSummary } from '../../types/todo';
import { TodoStatus } from '../../types/enums';
import { todosService } from '../../services/todosService';

interface TodoDependencyManagerProps {
  todo: Todo;
  allTodos: Todo[]; // All available todos for dependency selection
  onDependencyChange?: () => void; // Callback when dependencies change
}

export const TodoDependencyManager: React.FC<TodoDependencyManagerProps> = ({
  todo,
  allTodos,
  onDependencyChange
}) => {
  const [blockingTodos, setBlockingTodos] = useState<BlockingTodoSummary[]>([]);
  const [blockedByTodos, setBlockedByTodos] = useState<BlockingTodoSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBlocker, setSelectedBlocker] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Load dependency data
  useEffect(() => {
    loadDependencies();
  }, [todo.uuid]);

  const loadDependencies = async () => {
    try {
      setIsLoading(true);
      const [blocking, blocked] = await Promise.all([
        todosService.getBlockingTodos(todo.uuid),
        todosService.getBlockedByTodos(todo.uuid)
      ]);
      setBlockingTodos(blocking);
      setBlockedByTodos(blocked);
    } catch (err) {
      console.error('Failed to load dependencies:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDependency = async () => {
    if (!selectedBlocker) return;

    try {
      setError(null);
      await todosService.addDependency(todo.uuid, selectedBlocker);
      await loadDependencies();
      onDependencyChange?.();
      setSelectedBlocker('');
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add dependency');
    }
  };

  const handleRemoveDependency = async (blockerUuid: string) => {
    try {
      setError(null);
      await todosService.removeDependency(todo.uuid, blockerUuid);
      await loadDependencies();
      onDependencyChange?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to remove dependency');
    }
  };

  // Get available todos for dependency selection (exclude self and existing blockers)
  const availableTodos = allTodos.filter(t => 
    t.uuid !== todo.uuid && 
    !blockedByTodos.some(blocker => blocker.uuid === t.uuid) &&
    t.status !== TodoStatus.DONE // Don't allow dependencies on completed todos
  );

  const getStatusColor = (status: TodoStatus) => {
    const colors = {
      [TodoStatus.PENDING]: '#757575',
      [TodoStatus.IN_PROGRESS]: '#2196F3',
      [TodoStatus.BLOCKED]: '#FF9800',
      [TodoStatus.DONE]: '#4CAF50',
      [TodoStatus.CANCELLED]: '#F44336'
    };
    return colors[status] || '#757575';
  };

  const getStatusIcon = (status: TodoStatus) => {
    switch (status) {
      case TodoStatus.DONE:
        return <IconCheck size={14} />;
      case TodoStatus.IN_PROGRESS:
        return <IconClock size={14} />;
      case TodoStatus.BLOCKED:
        return <IconAlertTriangle size={14} />;
      default:
        return null;
    }
  };

  return (
    <Box>
      {/* Error Alert */}
      {error && (
        <Alert color="red" mb="md" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {/* Dependency Summary */}
      <Group mb="md" gap="xs">
        <Text size="sm" fw={500}>Dependencies:</Text>
        {blockedByTodos.length > 0 && (
          <Badge 
            color="orange" 
            variant="light" 
            leftSection={<IconAlertTriangle size={12} />}
          >
            {blockedByTodos.length} blocking
          </Badge>
        )}
        {blockingTodos.length > 0 && (
          <Badge 
            color="blue" 
            variant="light" 
            leftSection={<IconUsers size={12} />}
          >
            {blockingTodos.length} blocked by this
          </Badge>
        )}
        {blockedByTodos.length === 0 && blockingTodos.length === 0 && (
          <Text size="sm" c="dimmed">No dependencies</Text>
        )}
      </Group>

      {/* Blocked By Section */}
      {blockedByTodos.length > 0 && (
        <Box mb="md">
          <Text size="sm" fw={500} mb="xs" c="orange">
            Blocked by ({blockedByTodos.length}):
          </Text>
          <Stack gap="xs">
            {blockedByTodos.map((blocker) => (
              <Group key={blocker.uuid} justify="space-between" p="xs" bg="orange.0" style={{ borderRadius: 4 }}>
                <Group gap="xs">
                  {getStatusIcon(blocker.status)}
                  <Text size="sm">{blocker.title}</Text>
                  <Badge 
                    size="xs" 
                    color={getStatusColor(blocker.status)}
                    variant="light"
                  >
                    {blocker.status}
                  </Badge>
                </Group>
                <ActionIcon
                  size="sm"
                  color="red"
                  variant="subtle"
                  onClick={() => handleRemoveDependency(blocker.uuid)}
                >
                  <IconUnlink size={14} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        </Box>
      )}

      {/* Blocking Section */}
      {blockingTodos.length > 0 && (
        <Box mb="md">
          <Text size="sm" fw={500} mb="xs" c="blue">
            Blocking ({blockingTodos.length}):
          </Text>
          <Stack gap="xs">
            {blockingTodos.map((blocked) => (
              <Group key={blocked.uuid} p="xs" bg="blue.0" style={{ borderRadius: 4 }}>
                <Group gap="xs">
                  {getStatusIcon(blocked.status)}
                  <Text size="sm">{blocked.title}</Text>
                  <Badge 
                    size="xs" 
                    color={getStatusColor(blocked.status)}
                    variant="light"
                  >
                    {blocked.status}
                  </Badge>
                </Group>
              </Group>
            ))}
          </Stack>
        </Box>
      )}

      {/* Add Dependency Button */}
      <Button
        size="sm"
        variant="light"
        leftSection={<IconLink size={14} />}
        onClick={() => setIsModalOpen(true)}
        disabled={availableTodos.length === 0}
      >
        Add Dependency
      </Button>

      {/* Add Dependency Modal */}
      <Modal
        opened={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedBlocker('');
          setError(null);
        }}
        title="Add Dependency"
        size="md"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Select a todo that must complete before "{todo.title}" can proceed.
          </Text>
          
          <Select
            label="Blocking Todo"
            placeholder="Choose a todo..."
            data={availableTodos.map(t => ({
              value: t.uuid,
              label: t.title,
              disabled: t.status === TodoStatus.DONE
            }))}
            value={selectedBlocker}
            onChange={(value) => setSelectedBlocker(value || '')}
            searchable
            clearable
          />

          {selectedBlocker && (
            <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
              <Text size="sm">
                This will block "{todo.title}" until the selected todo is completed.
              </Text>
            </Alert>
          )}

          <Group justify="flex-end" mt="md">
            <Button
              variant="outline"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddDependency}
              disabled={!selectedBlocker}
              loading={isLoading}
            >
              Add Dependency
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
};

export default TodoDependencyManager;
