import React, { useState, useEffect } from 'react';
import { Box, Group, Text, Paper, Stack, Badge, ActionIcon, Menu } from '@mantine/core';
import { IconDots, IconEdit, IconTrash, IconArchive } from '@tabler/icons-react';
import { Todo, TodoSummary, updateTodoStatus, reorderTodo } from '../../services/todosService';
import { useDragAndDrop } from '../../hooks/useDragAndDrop';
import { SubtaskList } from './SubtaskList';

interface KanbanBoardProps {
  todos: Todo[];
  onTodoUpdate: (todo: Todo) => void;
  onTodoDelete?: (todoUuid: string) => void;
  onTodoArchive?: (todoUuid: string) => void;
  onTodoEdit?: (todo: Todo) => void;
  onSubtaskUpdate?: (subtask: Todo) => void;
  onSubtaskDelete?: (subtaskUuid: string) => void;
  onSubtaskEdit?: (subtask: Todo) => void;
  onSubtaskCreate?: (subtask: Todo) => void;
}

interface StatusLane {
  id: string;
  title: string;
  color: string;
  todos: Todo[];
}

const STATUS_LANES: Omit<StatusLane, 'todos'>[] = [
  { id: 'pending', title: 'Pending', color: '#757575' },
  { id: 'in_progress', title: 'In Progress', color: '#2196F3' },
  { id: 'blocked', title: 'Blocked', color: '#FF9800' },
  { id: 'done', title: 'Done', color: '#4CAF50' }
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  todos,
  onTodoUpdate,
  onTodoDelete,
  onTodoArchive,
  onTodoEdit,
  onSubtaskUpdate,
  onSubtaskDelete,
  onSubtaskEdit,
  onSubtaskCreate
}) => {
  const [lanes, setLanes] = useState<StatusLane[]>([]);
  const { draggedItem, handleDragStart, handleDragOver } = useDragAndDrop();

  // Organize todos into lanes
  useEffect(() => {
    const organizedLanes = STATUS_LANES.map(lane => ({
      ...lane,
      todos: todos
        .filter(todo => todo.status === lane.id)
        .sort((a, b) => a.order_index - b.order_index)
    }));
    setLanes(organizedLanes);
  }, [todos]);

  const handleStatusChange = async (todoUuid: string, newStatus: string, newOrderIndex: number) => {
    try {
      // Update status first
      const updatedTodo = await updateTodoStatus(todoUuid, newStatus);
      
      // Then update order if needed
      if (newOrderIndex !== updatedTodo.order_index) {
        await reorderTodo(todoUuid, newOrderIndex);
        updatedTodo.order_index = newOrderIndex;
      }
      
      onTodoUpdate(updatedTodo);
    } catch (error) {
      console.error('Failed to update todo:', error);
    }
  };

  const handleReorder = async (todoUuid: string, newOrderIndex: number, currentStatus: string) => {
    try {
      await reorderTodo(todoUuid, newOrderIndex);
      // Refresh the lanes to show new order
      const updatedLanes = lanes.map(lane => {
        if (lane.id === currentStatus) {
          return {
            ...lane,
            todos: lane.todos.map(todo => 
              todo.uuid === todoUuid 
                ? { ...todo, order_index: newOrderIndex }
                : todo
            ).sort((a, b) => a.order_index - b.order_index)
          };
        }
        return lane;
      });
      setLanes(updatedLanes);
    } catch (error) {
      console.error('Failed to reorder todo:', error);
    }
  };

  const onDragOver = (e: React.DragEvent, _laneId: string) => {
    e.preventDefault();
    handleDragOver(e);
  };

  const onDrop = (e: React.DragEvent, laneId: string) => {
    e.preventDefault();
    if (draggedItem) {
      const { todoId, sourceStatus } = draggedItem;
      const targetLane = lanes.find(lane => lane.id === laneId);
      
      if (targetLane) {
        const newOrderIndex = targetLane.todos.length;
        const newStatus = laneId;
        
        // If status changed, update status and order
        if (newStatus !== sourceStatus) {
          handleStatusChange(todoId, newStatus, newOrderIndex);
        } else {
          // If same status, just reorder
          handleReorder(todoId, newOrderIndex, newStatus);
        }
      }
    }
  };

  const getPriorityColor = (priority: number): string => {
    const colors = {
      1: '#4CAF50', // Green for low
      2: '#FF9800', // Orange for medium
      3: '#F44336', // Red for high
      4: '#9C27B0'  // Purple for urgent
    };
    return colors[priority as keyof typeof colors] || '#757575';
  };

  const getDaysUntilDue = (dueDate?: string): number | null => {
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

  return (
    <Box p="md">
      <Group gap="md" align="flex-start">
        {lanes.map((lane) => (
          <Paper
            key={lane.id}
            shadow="xs"
            p="md"
            style={{ minWidth: 300, flex: 1 }}
            onDragOver={(e) => onDragOver(e, lane.id)}
            onDrop={(e) => onDrop(e, lane.id)}
          >
            <Group justify="space-between" mb="md">
              <Text fw={600} size="lg" c={lane.color}>
                {lane.title}
              </Text>
              <Badge variant="light" size="sm">
                {lane.todos.length}
              </Badge>
            </Group>

            <Stack gap="sm">
              {lane.todos.map((todo, index) => (
                <Paper
                  key={todo.id}
                  shadow="xs"
                  p="sm"
                  style={{ 
                    cursor: 'grab',
                    borderLeft: `4px solid ${getPriorityColor(todo.priority)}`
                  }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, {
                    todoId: todo.uuid || '',
                    sourceStatus: lane.id,
                    sourceOrderIndex: index
                  })}
                >
                  <Group justify="space-between" align="flex-start">
                    <Box style={{ flex: 1 }}>
                      <Text fw={500} size="sm" mb={4}>
                        {todo.title}
                      </Text>
                      
                      {todo.description && (
                        <Text size="xs" c="dimmed" mb={4} lineClamp={2}>
                          {todo.description}
                        </Text>
                      )}

                      <Group gap="xs" mb={4}>
                        {todo.project_name && (
                          <Badge size="xs" variant="outline">
                            {todo.project_name}
                          </Badge>
                        )}
                        
                        {todo.tags.map((tag, tagIndex) => (
                          <Badge key={tagIndex} size="xs" variant="light">
                            {tag}
                          </Badge>
                        ))}
                      </Group>

                      {todo.due_date && (
                        <Group gap="xs" align="center">
                          <Text size="xs" c="dimmed">
                            Due: {new Date(todo.due_date).toLocaleDateString()}
                          </Text>
                          {(() => {
                            const daysUntilDue = getDaysUntilDue(todo.due_date);
                            if (daysUntilDue !== null) {
                              if (daysUntilDue < 0) {
                                return <Badge size="xs" color="red">Overdue</Badge>;
                              } else if (daysUntilDue === 0) {
                                return <Badge size="xs" color="orange">Due Today</Badge>;
                              } else if (daysUntilDue <= 3) {
                                return <Badge size="xs" color="yellow">Due Soon</Badge>;
                              }
                            }
                            return null;
                          })()}
                        </Group>
                      )}
                    </Box>

                    <Menu>
                      <Menu.Target>
                        <ActionIcon size="sm" variant="subtle">
                          <IconDots size={14} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconEdit size={14} />}
                          onClick={() => onTodoEdit?.(todo)}
                        >
                          Edit
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconArchive size={14} />}
                          onClick={() => todo.uuid && onTodoArchive?.(todo.uuid)}
                        >
                          Archive
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconTrash size={14} />}
                          color="red"
                          onClick={() => todo.uuid && onTodoDelete?.(todo.uuid)}
                        >
                          Delete
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                  
                  {/* Subtasks Section */}
                  {todo.subtasks && todo.subtasks.length > 0 && (
                    <Box mt="sm" pl="md" style={{ borderLeft: '2px solid #e0e0e0' }}>
                      <SubtaskList
                        parentTodo={todo}
                        onSubtaskComplete={(subtaskUuid: string, isCompleted: boolean) => {
                          // Handle subtask completion
                          if (onSubtaskUpdate) {
                            const subtask = todo.subtasks?.find(st => st.uuid === subtaskUuid);
                            if (subtask) {
                              onSubtaskUpdate({ ...subtask, status: isCompleted ? 'done' : 'pending' });
                            }
                          }
                        }}
                        onSubtaskDelete={onSubtaskDelete || (() => {})}
                        onSubtaskEdit={onSubtaskEdit ? (subtask: TodoSummary) => onSubtaskEdit(subtask as any) : () => {}}
                        onAddSubtask={(parentUuid: string) => {
                          // Handle add subtask
                          console.log('Add subtask to:', parentUuid);
                        }}
                      />
                    </Box>
                  )}
                </Paper>
              ))}
            </Stack>
          </Paper>
        ))}
      </Group>
    </Box>
  );
};
