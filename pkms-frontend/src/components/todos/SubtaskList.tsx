import React, { useState } from 'react';
import { Box, Text, Button, Group, Modal, TextInput, Textarea, Select, NumberInput } from '@mantine/core';
import { IconPlus, IconGripVertical } from '@tabler/icons-react';
import { Todo, TodoCreate, createSubtask, reorderSubtasks } from '../../services/todosService';
import { SubtaskItem } from './SubtaskItem';
import { useDragAndDrop } from '../../hooks/useDragAndDrop';

interface SubtaskListProps {
  parentTodo: Todo;
  subtasks: Todo[];
  onSubtaskUpdate: (subtask: Todo) => void;
  onSubtaskDelete: (subtaskId: number) => void;
  onSubtaskEdit: (subtask: Todo) => void;
  onSubtaskCreate: (subtask: Todo) => void;
}

export const SubtaskList: React.FC<SubtaskListProps> = ({
  parentTodo,
  subtasks,
  onSubtaskUpdate,
  onSubtaskDelete,
  onSubtaskEdit,
  onSubtaskCreate
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSubtask, setNewSubtask] = useState<TodoCreate>({
    title: '',
    description: '',
    priority: 2,
    status: 'pending'
  });
  const { draggedItem, handleDragStart, handleDragOver, handleDrop } = useDragAndDrop();

  const handleCreateSubtask = async () => {
    try {
      const createdSubtask = await createSubtask(parentTodo.id, newSubtask);
      onSubtaskCreate(createdSubtask);
      setShowCreateModal(false);
      setNewSubtask({ title: '', description: '', priority: 2, status: 'pending' });
    } catch (error) {
      console.error('Failed to create subtask:', error);
    }
  };

  const handleSubtaskDragStart = (e: React.DragEvent, subtask: Todo) => {
    handleDragStart(e, { todoId: subtask.id, sourceStatus: 'subtask', sourceOrderIndex: subtask.order_index });
  };

  const handleSubtaskDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedItem && draggedItem.sourceStatus === 'subtask') {
      const newOrder = [...subtasks];
      const draggedSubtask = subtasks.find(s => s.id === draggedItem.todoId);
      if (draggedSubtask) {
        // Remove from current position
        const currentIndex = newOrder.findIndex(s => s.id === draggedItem.todoId);
        if (currentIndex !== -1) {
          newOrder.splice(currentIndex, 1);
        }
        // Insert at target position
        newOrder.splice(targetIndex, 0, draggedSubtask);
        
        // Update order indices
        const updatedSubtasks = newOrder.map((subtask, index) => ({
          ...subtask,
          order_index: index
        }));
        
        // Call API to reorder
        try {
          await reorderSubtasks(parentTodo.id, updatedSubtasks.map(s => s.id));
          // Update local state
          updatedSubtasks.forEach(subtask => onSubtaskUpdate(subtask));
        } catch (error) {
          console.error('Failed to reorder subtasks:', error);
        }
      }
    }
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

  return (
    <Box>
      <Group justify="space-between" align="center" mb="md">
        <Text size="sm" fw={500} c="dimmed">
          Subtasks ({subtasks.length})
        </Text>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => setShowCreateModal(true)}
          variant="light"
        >
          Add Subtask
        </Button>
      </Group>

      {subtasks.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          No subtasks yet. Click "Add Subtask" to get started.
        </Text>
      ) : (
        <Box>
          {subtasks.map((subtask, index) => (
            <Box
              key={subtask.id}
              onDragOver={(e) => handleDragOver(e)}
              onDrop={(e) => handleSubtaskDrop(e, index)}
            >
              <SubtaskItem
                subtask={subtask}
                onSubtaskUpdate={onSubtaskUpdate}
                onSubtaskDelete={onSubtaskDelete}
                onSubtaskEdit={onSubtaskEdit}
                onDragStart={handleSubtaskDragStart}
                isDragging={draggedItem?.todoId === subtask.id}
              />
            </Box>
          ))}
        </Box>
      )}

      {/* Create Subtask Modal */}
      <Modal
        opened={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Subtask"
        size="md"
      >
        <Box>
          <TextInput
            label="Title"
            placeholder="Enter subtask title"
            value={newSubtask.title}
            onChange={(e) => setNewSubtask({ ...newSubtask, title: e.target.value })}
            required
            mb="md"
          />
          
          <Textarea
            label="Description"
            placeholder="Enter subtask description (optional)"
            value={newSubtask.description || ''}
            onChange={(e) => setNewSubtask({ ...newSubtask, description: e.target.value })}
            mb="md"
            rows={3}
          />
          
          <Group grow>
            <Select
              label="Priority"
              value={newSubtask.priority?.toString() || '2'}
              onChange={(value) => setNewSubtask({ ...newSubtask, priority: parseInt(value || '2') })}
              data={[
                { value: '1', label: 'Low' },
                { value: '2', label: 'Medium' },
                { value: '3', label: 'High' },
                { value: '4', label: 'Urgent' }
              ]}
            />
            
            <Select
              label="Status"
              value={newSubtask.status || 'pending'}
              onChange={(value) => setNewSubtask({ ...newSubtask, status: value || 'pending' })}
              data={[
                { value: 'pending', label: 'Pending' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'blocked', label: 'Blocked' },
                { value: 'done', label: 'Done' }
              ]}
            />
          </Group>
          
          <Group justify="flex-end" mt="lg">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateSubtask}
              disabled={!newSubtask.title.trim()}
            >
              Create Subtask
            </Button>
          </Group>
        </Box>
      </Modal>
    </Box>
  );
};
