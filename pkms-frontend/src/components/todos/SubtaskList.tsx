import { Stack, Group, Text, ActionIcon, Checkbox, Badge, Button, Collapse, Box } from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { TodoSummary } from '../../services/todosService';
import { formatDate } from '../common/ViewModeLayouts';

interface SubtaskListProps {
  parentTodo: TodoSummary;
  onSubtaskComplete: (subtaskId: number, isCompleted: boolean) => void;
  onSubtaskEdit: (subtask: TodoSummary) => void;
  onSubtaskDelete: (subtaskId: number) => void;
  onAddSubtask: () => void;
}

export function SubtaskList({
  parentTodo,
  onSubtaskComplete,
  onSubtaskEdit,
  onSubtaskDelete,
  onAddSubtask
}: SubtaskListProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const subtasks = parentTodo.subtasks || [];
  const hasSubtasks = subtasks.length > 0;

  const completedCount = subtasks.filter(st => st.status === 'done').length;
  const totalCount = subtasks.length;

  return (
    <Box ml="md" mt="xs">
      <Group gap="xs" mb="xs">
        <ActionIcon
          size="xs"
          variant="subtle"
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ visibility: hasSubtasks ? 'visible' : 'hidden' }}
        >
          {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </ActionIcon>
        
        <Text size="xs" c="dimmed" fw={500}>
          Subtasks {hasSubtasks && `(${completedCount}/${totalCount})`}
        </Text>
        
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconPlus size={12} />}
          onClick={onAddSubtask}
        >
          Add Subtask
        </Button>
      </Group>

      <Collapse in={isExpanded && hasSubtasks}>
        <Stack gap="xs" ml="lg">
          {subtasks.map((subtask) => (
            <Group
              key={subtask.id}
              gap="xs"
              wrap="nowrap"
              p="xs"
              style={{
                borderLeft: '2px solid var(--mantine-color-gray-3)',
                borderRadius: '4px',
                backgroundColor: subtask.status === 'done'
                  ? 'var(--mantine-color-gray-0)' 
                  : 'transparent'
              }}
            >
              <Checkbox
                size="sm"
                checked={subtask.status === 'done'}
                onChange={(e) => onSubtaskComplete(subtask.id, e.currentTarget.checked)}
              />

              <Text
                size="sm"
                style={{
                  textDecoration: subtask.status === 'done' ? 'line-through' : 'none',
                  opacity: subtask.status === 'done' ? 0.6 : 1,
                  flex: 1
                }}
              >
                {subtask.title}
              </Text>

              {subtask.priority && (
                <Badge size="xs" color={
                  subtask.priority === 3 ? 'red' :    // urgent
                  subtask.priority === 2 ? 'orange' : // high
                  subtask.priority === 1 ? 'yellow' : // medium
                  'blue'                               // low
                }>
                  {subtask.priority === 3 ? 'urgent' :
                   subtask.priority === 2 ? 'high' :
                   subtask.priority === 1 ? 'medium' : 'low'}
                </Badge>
              )}

              {subtask.due_date && (
                <Text size="xs" c="dimmed">
                  {formatDate(subtask.due_date)}
                </Text>
              )}

              <Group gap={4}>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="blue"
                  onClick={() => onSubtaskEdit(subtask)}
                >
                  <IconEdit size={14} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  onClick={() => onSubtaskDelete(subtask.id)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}
