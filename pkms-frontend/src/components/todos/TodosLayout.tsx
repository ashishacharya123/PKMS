/**
 * Specialized layout component for Todos module
 * Handles the unique todo structure with different view modes (list, kanban, calendar, timeline)
 */

import React from 'react';
import { Box, Paper, Stack, Group, Text, Button, Tabs, Badge } from '@mantine/core';
import { IconList, IconColumns, IconCalendar } from '@tabler/icons-react';
import ModuleHeader from '../common/ModuleHeader';
import { TodoItem } from '../../types/common';
import { ProjectBadge } from '../../types/project';
import { KanbanBoard } from './KanbanBoard';
import { CalendarView } from './CalendarView';
import { TimelineView } from './TimelineView';
import { SubtaskList } from './SubtaskList';

interface TodosLayoutProps {
  // Current state
  todos: TodoItem[];
  isLoading: boolean;
  activeTab: 'ongoing' | 'completed' | 'archived';
  
  // Actions
  onCreateTodo: () => void;
  onRefresh: () => void;
  onTabChange: (tab: 'ongoing' | 'completed' | 'archived') => void;
  
  // View mode
  viewMode: 'list' | 'kanban' | 'calendar' | 'timeline';
  ViewMenu: React.ComponentType<any>;
  
  // Item actions
  onItemClick: (item: TodoItem) => void;
  onToggleFavorite: (item: TodoItem) => void;
  onToggleArchive: (item: TodoItem) => void;
  onDelete: (item: TodoItem) => void;
  onEdit: (item: TodoItem) => void;
  onComplete: (item: TodoItem) => void;
  
  // Subtask actions
  onAddSubtask?: (todoId: string, subtaskTitle: string) => void;
  onToggleSubtask?: (todoId: string, subtaskId: string) => void;
  onDeleteSubtask?: (todoId: string, subtaskId: string) => void;
  onEditSubtask?: (todoId: string, subtaskId: string, newTitle: string) => void;
  
  // Render functions
  renderIcon: (item: TodoItem) => React.ReactNode;
  renderContent: (item: TodoItem) => React.ReactNode;
  
  // Todo-specific props
  projects?: ProjectBadge[];
  onProjectSelect?: (projectId: string | null) => void;
  selectedProjectId?: string | null;
}

export function TodosLayout({
  todos,
  isLoading,
  activeTab,
  onCreateTodo,
  onRefresh,
  onTabChange,
  viewMode,
  ViewMenu,
  onItemClick,
  onToggleFavorite,
  onToggleArchive,
  onDelete,
  onEdit,
  onComplete,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  onEditSubtask,
  renderIcon,
  renderContent,
  projects = [],
  onProjectSelect,
  selectedProjectId,
}: TodosLayoutProps) {
  const getTabCount = (tab: string) => {
    switch (tab) {
      case 'ongoing':
        return todos.filter(t => t.status !== 'completed' && !t.is_archived).length;
      case 'completed':
        return todos.filter(t => t.status === 'completed' && !t.is_archived).length;
      case 'archived':
        return todos.filter(t => t.is_archived).length;
      default:
        return 0;
    }
  };

  const getFilteredTodos = () => {
    switch (activeTab) {
      case 'ongoing':
        return todos.filter(t => t.status !== 'completed' && !t.is_archived);
      case 'completed':
        return todos.filter(t => t.status === 'completed' && !t.is_archived);
      case 'archived':
        return todos.filter(t => t.is_archived);
      default:
        return todos;
    }
  };

  const renderViewContent = () => {
    const filteredTodos = getFilteredTodos();

    switch (viewMode) {
      case 'kanban':
        return (
          <KanbanBoard
            todos={filteredTodos as any}
            onTodoClick={onItemClick as any}
            onTodoComplete={onComplete as any}
            onTodoEdit={onEdit as any}
            onTodoDelete={onDelete as any}
            onTodoArchive={onToggleArchive as any}
            isLoading={isLoading}
          />
        );
      
      case 'calendar':
        return (
          <CalendarView
            todos={filteredTodos}
            onTodoClick={onItemClick}
            onTodoComplete={onComplete}
            onTodoEdit={onEdit}
            onTodoDelete={onDelete}
            onTodoArchive={onToggleArchive}
            isLoading={isLoading}
          />
        );
      
      case 'timeline':
        return (
          <TimelineView
            todos={filteredTodos}
            onTodoClick={onItemClick}
            onTodoComplete={onComplete}
            onTodoEdit={onEdit}
            onTodoDelete={onDelete}
            onTodoArchive={onToggleArchive}
            isLoading={isLoading}
          />
        );
      
      case 'list':
      default:
        return (
          <Box p="md">
            <Stack gap="md">
              {filteredTodos.map((todo) => (
                <Paper key={todo.uuid} p="md" withBorder>
                  <Group justify="space-between" align="flex-start">
                    <Group gap="md" align="flex-start" style={{ flexGrow: 1 }}>
                      {renderIcon(todo)}
                      <Stack gap="xs" style={{ flexGrow: 1 }}>
                        {renderContent(todo)}
                        {/* Subtasks */}
                        {todo.subtasks && todo.subtasks.length > 0 && (
                          <SubtaskList
                            subtasks={todo.subtasks}
                            onAddSubtask={onAddSubtask ? (title) => onAddSubtask(todo.uuid, title) : undefined}
                            onToggleSubtask={onToggleSubtask ? (subtaskId) => onToggleSubtask(todo.uuid, subtaskId) : undefined}
                            onDeleteSubtask={onDeleteSubtask ? (subtaskId) => onDeleteSubtask(todo.uuid, subtaskId) : undefined}
                            onEditSubtask={onEditSubtask ? (subtaskId, newTitle) => onEditSubtask(todo.uuid, subtaskId, newTitle) : undefined}
                          />
                        )}
                      </Stack>
                    </Group>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        color="green"
                        onClick={() => onComplete(todo)}
                        disabled={todo.status === 'completed'}
                      >
                        Complete
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="blue"
                        onClick={() => onEdit(todo)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        color="red"
                        onClick={() => onDelete(todo)}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Group>
                </Paper>
              ))}
              {filteredTodos.length === 0 && (
                <Text ta="center" c="dimmed" py="xl">
                  No {activeTab} todos found.
                </Text>
              )}
            </Stack>
          </Box>
        );
    }
  };

  return (
    <Box style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Paper p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', backgroundColor: 'var(--mantine-color-dark-7)' }}>
        <ModuleHeader
          title="Todos"
          itemCount={todos.length}
          onRefresh={onRefresh}
          onCreate={onCreateTodo}
          showFilters={false}
          showCreate={true}
          showRefresh={true}
          isLoading={isLoading}
          customActions={
            <ViewMenu 
              currentView={viewMode}
              onChange={(mode: any) => {
                // This will be handled by parent
              }}
              disabled={isLoading}
            />
          }
        />
      </Paper>

      {/* Tab Navigation */}
      <Paper p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', backgroundColor: 'var(--mantine-color-dark-7)' }}>
        <Tabs value={activeTab} onChange={(value) => onTabChange(value as 'ongoing' | 'completed' | 'archived')}>
          <Tabs.List>
            <Tabs.Tab value="ongoing" leftSection={<IconList size={16} />}>
              Ongoing
              <Badge size="sm" variant="light" color="blue" ml="xs">
                {getTabCount('ongoing')}
              </Badge>
            </Tabs.Tab>
            <Tabs.Tab value="completed" leftSection={<IconColumns size={16} />}>
              Completed
              <Badge size="sm" variant="light" color="green" ml="xs">
                {getTabCount('completed')}
              </Badge>
            </Tabs.Tab>
            <Tabs.Tab value="archived" leftSection={<IconCalendar size={16} />}>
              Archived
              <Badge size="sm" variant="light" color="gray" ml="xs">
                {getTabCount('archived')}
              </Badge>
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Paper>

      {/* Content Area */}
      <Box style={{ flex: 1, overflow: 'hidden' }}>
        {renderViewContent()}
      </Box>
    </Box>
  );
}

export default TodosLayout;
