import { Stack, Group, Text, ActionIcon, Checkbox, Badge, Button, Collapse, Box } from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { TodoSummary } from '../../services/todosService';
import { formatDate } from '../common/ViewModeLayouts';
import { reorderSubtasks } from '../../services/todosService';

interface SubtaskListProps {
  parentTodo: TodoSummary;
  onSubtaskComplete: (subtaskUuid: string, isCompleted: boolean) => void;
  onSubtaskEdit: (subtask: TodoSummary) => void;
  onSubtaskDelete: (subtaskUuid: string) => void;
  onAddSubtask: (parentUuid: string) => void;
}

export function SubtaskList({
  parentTodo,
  onSubtaskComplete,
  onSubtaskEdit,
  onSubtaskDelete,
  onAddSubtask
}: SubtaskListProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [orderedSubtasks, setOrderedSubtasks] = useState<TodoSummary[]>(parentTodo.subtasks || []);
  useEffect(() => {
    setOrderedSubtasks(parentTodo.subtasks || []);
  }, [parentTodo.subtasks]);
  const hasSubtasks = orderedSubtasks.length > 0;

  const completedCount = orderedSubtasks.filter(st => st.status === 'done').length;
  const totalCount = orderedSubtasks.length;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();
    const fromIndexStr = e.dataTransfer.getData('text/plain');
    if (!fromIndexStr) return;
    const fromIndex = parseInt(fromIndexStr, 10);
    if (Number.isNaN(fromIndex) || fromIndex === dropIndex) return;

    const updated = [...orderedSubtasks];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(dropIndex, 0, moved);
    setOrderedSubtasks(updated);

    const parentUuid = parentTodo.uuid;
    const subtaskUuids = updated.map(st => st.uuid);
    if (parentUuid && subtaskUuids.length === updated.length) {
      try {
        await reorderSubtasks(parentUuid, subtaskUuids);
      } catch (err) {
        // On failure, revert UI
        setOrderedSubtasks(parentTodo.subtasks || []);
      }
    }
  };

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
          onClick={() => onAddSubtask(parentTodo.uuid || '')}
        >
          Add Subtask
        </Button>
      </Group>

      <Collapse in={isExpanded && hasSubtasks}>
        <Stack gap="xs" ml="lg">
          {orderedSubtasks.map((subtask, index) => (
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
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
            >
              <Checkbox
                size="sm"
                checked={subtask.status === 'done'}
                onChange={(e) => onSubtaskComplete(subtask.uuid || '', e.currentTarget.checked)}
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

              {subtask.dueDate && (
                <Text size="xs" c="dimmed">
                  {formatDate(subtask.dueDate)}
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
                  onClick={() => onSubtaskDelete(subtask.uuid || '')}
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
