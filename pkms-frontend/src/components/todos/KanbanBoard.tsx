/**
 * Kanban Board Component
 * 
 * Interactive drag-and-drop Kanban board for todo management with status lanes.
 * Supports keyboard navigation, reordering, status updates, and subtask management.
 * Uses TodoStatus enum for lane identification and backend synchronization.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Group, Text, Paper, Stack, Badge, ActionIcon, Menu, Progress } from '@mantine/core';
import { IconDots, IconEdit, IconTrash, IconArchive } from '@tabler/icons-react';
import { Todo, TodoSummary } from '../../types/todo';
import { TodoStatus } from '../../types/enums';
import { updateTodoStatus, reorderTodo } from '../../services/todosService';
import { useDragAndDrop } from '../../hooks/useDragAndDrop';
import { SubtaskList } from './SubtaskList';

interface KanbanBoardProps {
  todos: Todo[];
  onTodoUpdate: (todo: Todo) => void;
  onTodoDelete?: (todoUuuuid: string) => void;
  onTodoArchive?: (todoUuuuid: string) => void;
  onTodoEdit?: (todo: Todo) => void;
  onSubtaskUpdate?: (subtask: Todo) => void;
  onSubtaskDelete?: (subtaskUuuuid: string) => void;
  onSubtaskEdit?: (subtask: Todo) => void;
}

interface StatusLane {
  status: TodoStatus;
  title: string;
  color: string;
  todos: Todo[];
}

const STATUS_LANES: Omit<StatusLane, 'todos'>[] = [
  { status: TodoStatus.PENDING, title: 'Pending', color: '#757575' },
  { status: TodoStatus.IN_PROGRESS, title: 'In Progress', color: '#2196F3' },
  { status: TodoStatus.BLOCKED, title: 'Blocked', color: '#FF9800' },
  { status: TodoStatus.DONE, title: 'Done', color: '#4CAF50' }
];

/**
 * Main Kanban Board component with drag-and-drop functionality.
 * Manages todo status updates, reordering, and keyboard navigation.
 */
export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  todos,
  onTodoUpdate,
  onTodoDelete,
  onTodoArchive,
  onTodoEdit,
  onSubtaskUpdate,
  onSubtaskDelete,
  onSubtaskEdit
}) => {
  const [lanes, setLanes] = useState<StatusLane[]>([]);
  const { draggedItem, handleDragStart, handleDragOver } = useDragAndDrop();
  
  // Keyboard navigation state
  const [focusedTodo, setFocusedTodo] = useState<string | null>(null);
  const todoRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Organize todos into lanes
  useEffect(() => {
    const organizedLanes = STATUS_LANES.map(lane => ({
      ...lane,
      todos: todos
        .filter(todo => todo.status === lane.status)
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    }));
    setLanes(organizedLanes);
  }, [todos]);

  const handleStatusChange = async (todoUuid: string, newStatus: TodoStatus, newOrderIndex: number) => {
    try {
      const updatedTodo = await updateTodoStatus(todoUuid, newStatus);
      
      // Then update order if needed
      if (newOrderIndex !== (updatedTodo as Todo).orderIndex) {
        await reorderTodo(todoUuid, newOrderIndex);
        (updatedTodo as Todo).orderIndex = newOrderIndex;
      }
      
      onTodoUpdate(updatedTodo as Todo);
    } catch (error) {
      console.error('Failed to update todo:', error);
    }
  };

  const handleReorder = async (todoUuid: string, newOrderIndex: number, currentStatus: string) => {
    try {
      await reorderTodo(todoUuid, newOrderIndex);
      // Refresh the lanes to show new order (use functional update)
      setLanes(prev =>
        prev.map(lane =>
          lane.status === currentStatus
            ? {
                ...lane,
                todos: lane.todos
                  .map((t) => (t.uuid === todoUuid ? { ...t, orderIndex: newOrderIndex } : t))
                  .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)),
              }
            : lane
        )
      );
    } catch (error) {
      console.error('Failed to reorder todo:', error);
    }
  };

  const onDragOver = (e: React.DragEvent, _laneStatus: TodoStatus) => {
    e.preventDefault();
    handleDragOver(e);
  };

  const onDrop = (e: React.DragEvent, laneStatus: TodoStatus) => {
    e.preventDefault();
    if (draggedItem) {
      const { todoId, sourceStatus } = draggedItem;
      const targetLane = lanes.find(lane => lane.status === laneStatus);
      
      if (targetLane) {
        const newOrderIndex = targetLane.todos.length;
        const newStatus = laneStatus;
        
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

  const getPriorityColor = (priority: number | any): string => {
    const colors = {
      1: '#4CAF50', // Green for low
      2: '#FF9800', // Orange for medium
      3: '#F44336', // Red for high
      4: '#9C27B0'  // Purple for urgent
    };
    const key = typeof priority === 'number' ? priority : Number(priority);
    return colors[(key as keyof typeof colors)] || '#757575';
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

  // Keyboard navigation handlers
  const handleKeyDown = (e: React.KeyboardEvent, todo: Todo, laneStatus: TodoStatus) => {
    const currentLaneIndex = lanes.findIndex(lane => lane.status === laneStatus);
    const currentTodoIndex = lanes[currentLaneIndex]?.todos.findIndex(t => t.uuid === todo.uuid) ?? -1;
    
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        // Move to next lane
        if (currentLaneIndex < lanes.length - 1) {
          const nextLane = lanes[currentLaneIndex + 1];
          const targetTodoIndex = Math.min(currentTodoIndex, nextLane.todos.length - 1);
          if (targetTodoIndex >= 0) {
            const targetTodo = nextLane.todos[targetTodoIndex];
            setFocusedTodo(targetTodo.uuid);
            // optional lane focus not tracked
            // Move todo to next lane
            handleStatusChange(todo.uuid, nextLane.status, targetTodoIndex);
          }
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        // Move to previous lane
        if (currentLaneIndex > 0) {
          const prevLane = lanes[currentLaneIndex - 1];
          const targetTodoIndex = Math.min(currentTodoIndex, prevLane.todos.length - 1);
          if (targetTodoIndex >= 0) {
            const targetTodo = prevLane.todos[targetTodoIndex];
            setFocusedTodo(targetTodo.uuid);
            // optional lane focus not tracked
            // Move todo to previous lane
            handleStatusChange(todo.uuid, prevLane.status, targetTodoIndex);
          }
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        // Move down within lane
        if (currentTodoIndex < lanes[currentLaneIndex].todos.length - 1) {
          const nextTodo = lanes[currentLaneIndex].todos[currentTodoIndex + 1];
          setFocusedTodo(nextTodo.uuid);
          // Reorder within lane
          handleReorder(todo.uuid, currentTodoIndex + 1, laneStatus);
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        // Move up within lane
        if (currentTodoIndex > 0) {
          const prevTodo = lanes[currentLaneIndex].todos[currentTodoIndex - 1];
          setFocusedTodo(prevTodo.uuid);
          // Reorder within lane
          handleReorder(todo.uuid, currentTodoIndex - 1, laneStatus);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        // Edit todo
        if (onTodoEdit) {
          onTodoEdit(todo);
        }
        break;
      case 'Delete':
        e.preventDefault();
        // Delete todo
        if (onTodoDelete) {
          onTodoDelete(todo.uuid);
        }
        break;
    }
  };

  return (
    <Box p="md" role="application" aria-label="Kanban Board">
      <Group gap="md" align="flex-start">
        {lanes.map((lane) => (
          <Paper
            key={lane.status}
            shadow="xs"
            p="md"
            style={{ minWidth: 300, flex: 1 }}
            onDragOver={(e) => onDragOver(e, lane.status)}
            onDrop={(e) => onDrop(e, lane.status)}
            role="region"
            aria-label={`${lane.title} lane with ${lane.todos.length} tasks`}
            tabIndex={0}
            onFocus={() => { /* optional lane focus not tracked */ }}
          >
            <Group justify="space-between" mb="md">
              <Text fw={600} size="lg" c={lane.color}>
                {lane.title}
              </Text>
              <Badge variant="light" size="sm" aria-label={`${lane.todos.length} tasks`}>
                {lane.todos.length}
              </Badge>
            </Group>

            <Stack gap="sm" role="list" aria-label={`${lane.title} tasks`}>
              {lane.todos.map((todo, index) => (
                <Paper
                  key={todo.uuid}
                  ref={(el) => { todoRefs.current[todo.uuid] = el; }}
                  shadow="xs"
                  p="sm"
                  style={{ 
                    cursor: 'grab',
                    borderLeft: `4px solid ${getPriorityColor(todo.priority)}`,
                    outline: focusedTodo === todo.uuid ? '2px solid #2196F3' : 'none',
                    outlineOffset: '2px'
                  }}
                  draggable
                  tabIndex={0}
                  role="listitem"
                  aria-label={`Task: ${todo.title}. Priority: ${todo.priority}. Status: ${lane.title}`}
                  onDragStart={(e) => handleDragStart(e, {
                    todoId: todo.uuid || '',
                    sourceStatus: lane.status,
                    sourceOrderIndex: index
                  })}
                  onKeyDown={(e) => handleKeyDown(e, todo, lane.status)}
                  onFocus={() => setFocusedTodo(todo.uuid)}
                  onBlur={() => setFocusedTodo(null)}
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
                        {todo.projectName && (
                          <Badge size="xs" variant="outline">
                            {todo.projectName}
                          </Badge>
                        )}
                        
                        {todo.type && todo.type !== 'task' && (
                          <Badge 
                            size="xs" 
                            variant="light" 
                            color={
                              todo.type === 'checklist' ? 'blue' :
                              todo.type === 'subtask' ? 'gray' : 'default'
                            }
                          >
                            {todo.type}
                          </Badge>
                        )}
                        
                        {todo.tags?.map((tag: string, tagIndex: number) => (
                          <Badge key={tagIndex} size="xs" variant="light">
                            {tag}
                          </Badge>
                        ))}
                      </Group>

                      {todo.dueDate && (
                        <Group gap="xs" align="center">
                          <Text size="xs" c="dimmed">
                            Due: {new Date(todo.dueDate).toLocaleDateString()}
                          </Text>
                          {(() => {
                            const daysUntilDue = getDaysUntilDue(todo.dueDate || undefined);
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

                      {/* NEW: Start Date Display */}
                      {todo.startDate && (
                        <Group gap="xs" align="center">
                          <Text size="xs" c="dimmed">
                            Start: {new Date(todo.startDate).toLocaleDateString()}
                          </Text>
                        </Group>
                      )}

                      {/* NEW: Completion Progress */}
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

                      {/* Time tracking removed - backend no longer supports estimate_minutes */}

                      {/* NEW: Checklist Items */}
                      {todo.type === 'checklist' && todo.checklistItems && todo.checklistItems.length > 0 && (
                        <Box>
                          <Text size="xs" c="dimmed" mb={2}>Checklist:</Text>
                          <Stack gap={2}>
                            {todo.checklistItems.slice(0, 3).map((item, index) => (
                              <Group key={index} gap="xs" align="center">
                                <Text size="xs" style={{ 
                                  textDecoration: item.completed ? 'line-through' : 'none',
                                  opacity: item.completed ? 0.6 : 1
                                }}>
                                  {item.text}
                                </Text>
                                {item.completed && (
                                  <Text size="xs" c="green">✓</Text>
                                )}
                              </Group>
                            ))}
                            {todo.checklistItems.length > 3 && (
                              <Text size="xs" c="dimmed">
                                +{todo.checklistItems.length - 3} more items
                              </Text>
                            )}
                          </Stack>
                        </Box>
                      )}

                    </Box>

                    <Menu>
                      <Menu.Target>
                        <ActionIcon 
                          size="sm" 
                          variant="subtle"
                          aria-label={`More actions for task: ${todo.title}`}
                        >
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
                            const subtask = todo.subtasks?.find((st: TodoSummary) => st.uuid === subtaskUuid);
                            if (subtask) {
                              onSubtaskUpdate({ ...subtask, status: isCompleted ? 'done' as TodoStatus : 'pending' as TodoStatus } as any);
                            }
                          }
                        }}
                        onSubtaskDelete={onSubtaskDelete || (() => {})}
                        onSubtaskEdit={onSubtaskEdit ? (subtask: TodoSummary) => onSubtaskEdit(subtask as any) : () => {}}
                        onAddSubtask={(_parentUuid: string) => {
                          // Handle add subtask - TODO: Implement subtask creation
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
      
      {/* ARIA Live Region for announcements */}
      <div 
        aria-live="polite" 
        aria-atomic="true" 
        style={{ 
          position: 'absolute', 
          left: '-10000px', 
          width: '1px', 
          height: '1px', 
          overflow: 'hidden' 
        }}
      >
        {focusedTodo && `Focused on task: ${lanes.find(lane => lane.todos.some(t => t.uuid === focusedTodo))?.todos.find(t => t.uuid === focusedTodo)?.title}`}
      </div>
    </Box>
  );
};
