import React, { useState } from 'react';
import { Box, Group, Text, Paper, ActionIcon, Menu, Checkbox, Badge } from '@mantine/core';
import { IconDots, IconEdit, IconTrash, IconGripVertical } from '@tabler/icons-react';
import { Todo } from '../../services/todosService';

interface SubtaskItemProps {
  subtask: Todo;
  onSubtaskUpdate: (subtask: Todo) => void;
  onSubtaskDelete: (subtaskId: number) => void;
  onSubtaskEdit: (subtask: Todo) => void;
  onDragStart: (e: React.DragEvent, subtask: Todo) => void;
  isDragging: boolean;
}

export const SubtaskItem: React.FC<SubtaskItemProps> = ({
  subtask,
  onSubtaskUpdate,
  onSubtaskDelete,
  onSubtaskEdit,
  onDragStart,
  isDragging
}) => {
  const [isCompleted, setIsCompleted] = useState(subtask.status === 'done');

  const handleStatusChange = async (checked: boolean) => {
    const newStatus = checked ? 'done' : 'pending';
    const updatedSubtask = { ...subtask, status: newStatus };
    onSubtaskUpdate(updatedSubtask);
    setIsCompleted(checked);
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return '#4CAF50'; // Low - Green
      case 2: return '#2196F3'; // Medium - Blue
      case 3: return '#FF9800'; // High - Orange
      case 4: return '#F44336'; // Urgent - Red
      default: return '#757575';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#757575';
      case 'in_progress': return '#2196F3';
      case 'blocked': return '#FF9800';
      case 'done': return '#4CAF50';
      case 'cancelled': return '#F44336';
      default: return '#757575';
    }
  };

  return (
    <Paper
      shadow="xs"
      p="xs"
      mb="xs"
      style={{
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
        backgroundColor: isCompleted ? '#f5f5f5' : 'white',
        borderLeft: `4px solid ${getPriorityColor(subtask.priority)}`
      }}
      draggable
      onDragStart={(e) => onDragStart(e, subtask)}
    >
      <Group justify="space-between" align="center">
        <Group gap="xs" align="center">
          <IconGripVertical size={16} style={{ cursor: 'grab', color: '#999' }} />
          <Checkbox
            checked={isCompleted}
            onChange={(event) => handleStatusChange(event.currentTarget.checked)}
            size="sm"
          />
          <Box>
            <Text
              size="sm"
              fw={500}
              style={{
                textDecoration: isCompleted ? 'line-through' : 'none',
                color: isCompleted ? '#666' : 'inherit'
              }}
            >
              {subtask.title}
            </Text>
            {subtask.description && (
              <Text size="xs" c="dimmed" style={{ textDecoration: isCompleted ? 'line-through' : 'none' }}>
                {subtask.description}
              </Text>
            )}
          </Box>
        </Group>
        
        <Group gap="xs">
          <Badge size="xs" color={getStatusColor(subtask.status)} variant="light">
            {subtask.status.replace('_', ' ')}
          </Badge>
          <Badge size="xs" color={getPriorityColor(subtask.priority)} variant="light">
            P{subtask.priority}
          </Badge>
          
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon size="sm" variant="subtle">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconEdit size={14} />}
                onClick={() => onSubtaskEdit(subtask)}
              >
                Edit
              </Menu.Item>
              <Menu.Item
                leftSection={<IconTrash size={14} />}
                color="red"
                onClick={() => onSubtaskDelete(subtask.id)}
              >
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Paper>
  );
};
