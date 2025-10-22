/**
 * TodosPage - Simplified version using modular components
 */

import { useEffect, useState } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Title,
  Stack,
  Group,
  Button,
  Alert,
  Tabs
} from '@mantine/core';
import { IconPlus, IconAlertTriangle } from '@tabler/icons-react';
import { useTodosStore } from '../stores/todosStore';
import { useViewPreferences } from '../hooks/useViewPreferences';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { notifications } from '@mantine/notifications';

// Import our new modular components
import { TodoList, TodoForm, TodoFilters, TodoStats } from '../components/todos';
import { UnifiedSearchEmbedded } from '../components/search/UnifiedSearchEmbedded';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { TodoFilters as TodoFiltersType } from '../components/todos/TodoFilters';
import { Todo, TodoStatus } from '../types/todo';
import { Project } from '../types/project';

export function TodosPageNew() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Store state
  const {
    todos,
    projects,
    isLoading,
    error,
    loadTodos,
    loadProjects,
    createTodo,
    updateTodo,
    deleteTodo,
    archiveTodo,
    unarchiveTodo,
    completeTodo
  } = useTodosStore();

  // Local state
  const [activeTab, setActiveTab] = useState<string>('ongoing');
  const [filters, setFilters] = useState<TodoFiltersType>({
    status: [],
    priority: [],
    type: [],
    projects: [],
    sortBy: 'createdAt',
    sortOrder: 'desc',
    showArchived: false
  });
  
  // Form state
  const [formOpened, setFormOpened] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [subtaskParentId, setSubtaskParentId] = useState<string | null>(null);

  // View preferences
  const { getPreference, updatePreference } = useViewPreferences();
  const viewMode = getPreference('todos', 'viewMode') as 'list' | 'kanban' | 'calendar';

  // Load data on mount
  useAuthenticatedEffect(() => {
    loadTodos();
    loadProjects();
  }, []);

  // Handle action query parameter
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'create') {
      setFormOpened(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'n',
      ctrl: true,
      action: () => setFormOpened(true),
      description: 'Create new todo',
      category: 'Todo Management'
    },
    {
      key: 'f',
      ctrl: true,
      action: () => {
        // Focus search - would need to implement
      },
      description: 'Focus search',
      category: 'Navigation'
    }
  ]);

  // Filter todos based on active tab and filters
  const filteredTodos = todos.filter(todo => {
    // Tab filtering
    if (activeTab === 'ongoing') {
      return !todo.isArchived && todo.status !== TodoStatus.DONE;
    } else if (activeTab === 'completed') {
      return !todo.isArchived && todo.status === TodoStatus.DONE;
    } else if (activeTab === 'archived') {
      return todo.isArchived;
    }
    return true;
  });

  // Apply additional filters
  const finalTodos = filteredTodos.filter(todo => {
    if (filters.status.length > 0 && !filters.status.includes(todo.status)) {
      return false;
    }
    if (filters.priority.length > 0 && !filters.priority.includes(todo.priority)) {
      return false;
    }
    if (filters.projects.length > 0) {
      const todoProjectIds = todo.projects?.map(p => p.uuid) || [];
      if (!filters.projects.some(pid => todoProjectIds.includes(pid))) {
        return false;
      }
    }
    return true;
  });

  // Sort todos
  const sortedTodos = [...finalTodos].sort((a, b) => {
    const aValue = a[filters.sortBy as keyof Todo];
    const bValue = b[filters.sortBy as keyof Todo];
    
    if (filters.sortOrder === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  // Event handlers
  const handleCreateTodo = async (data: Partial<Todo>) => {
    try {
      const newTodo = await createTodo(data as any);
      if (newTodo) {
        notifications.show({
          title: 'Todo Created',
          message: `Todo "${newTodo.title}" created successfully`,
          color: 'green'
        });
        setFormOpened(false);
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to create todo',
        color: 'red'
      });
    }
  };

  const handleUpdateTodo = async (data: Partial<Todo>) => {
    if (!editingTodo) return;
    
    try {
      const updatedTodo = await updateTodo(editingTodo.uuid, data as any);
      if (updatedTodo) {
        notifications.show({
          title: 'Todo Updated',
          message: `Todo "${updatedTodo.title}" updated successfully`,
          color: 'green'
        });
        setFormOpened(false);
        setEditingTodo(null);
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update todo',
        color: 'red'
      });
    }
  };

  const handleDeleteTodo = async (uuid: string, title: string) => {
    try {
      const success = await deleteTodo(uuid);
      if (success) {
        notifications.show({
          title: 'Todo Deleted',
          message: `Todo "${title}" deleted successfully`,
          color: 'green'
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete todo',
        color: 'red'
      });
    }
  };

  const handleArchiveTodo = async (uuid: string) => {
    try {
      await archiveTodo(uuid);
      notifications.show({
        title: 'Todo Archived',
        message: 'Todo archived successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to archive todo',
        color: 'red'
      });
    }
  };

  const handleUnarchiveTodo = async (uuid: string) => {
    try {
      await unarchiveTodo(uuid);
      notifications.show({
        title: 'Todo Unarchived',
        message: 'Todo unarchived successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to unarchive todo',
        color: 'red'
      });
    }
  };

  const handleCompleteTodo = async (uuid: string) => {
    try {
      await completeTodo(uuid);
      notifications.show({
        title: 'Todo Completed',
        message: 'Todo marked as completed',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to complete todo',
        color: 'red'
      });
    }
  };

  const handleAddSubtask = (parentId: string) => {
    setSubtaskParentId(parentId);
    setFormOpened(true);
  };

  const handleEditTodo = (todo: Todo) => {
    setEditingTodo(todo);
    setFormOpened(true);
  };

  const getActiveFiltersCount = () => {
    return filters.status.length + filters.priority.length + filters.projects.length;
  };

  if (error) {
    return (
      <Container size="lg" py="md">
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          title="Error"
        >
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2}>Todos</Title>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setFormOpened(true)}
          >
            Create Todo
          </Button>
        </Group>

        {/* Stats */}
        <TodoStats todos={todos} showArchived={activeTab === 'archived'} />

        {/* Filters */}
        <TodoFilters
          filters={filters}
          onFiltersChange={setFilters}
          projects={projects}
          activeFiltersCount={getActiveFiltersCount()}
        />

        {/* Search */}
        <UnifiedSearchEmbedded
          defaultModules={['todos']}
          includeDiary={false}
          showModuleSelector={false}
          resultsPerPage={10}
          showPagination={false}
        />

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'ongoing')}>
          <Tabs.List>
            <Tabs.Tab value="ongoing">Ongoing</Tabs.Tab>
            <Tabs.Tab value="completed">Completed</Tabs.Tab>
            <Tabs.Tab value="archived">Archived</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="ongoing" pt="md">
            {isLoading ? (
              <LoadingSkeleton variant="card" count={5} />
            ) : (
              <TodoList
                todos={sortedTodos}
                projects={projects}
                onEdit={handleEditTodo}
                onDelete={handleDeleteTodo}
                onArchive={handleArchiveTodo}
                onUnarchive={handleUnarchiveTodo}
                onComplete={handleCompleteTodo}
                onAddSubtask={handleAddSubtask}
                onCreateNew={() => setFormOpened(true)}
                showArchived={false}
                emptyMessage="No ongoing todos found"
              />
            )}
          </Tabs.Panel>

          <Tabs.Panel value="completed" pt="md">
            {isLoading ? (
              <LoadingSkeleton variant="card" count={5} />
            ) : (
              <TodoList
                todos={sortedTodos}
                projects={projects}
                onEdit={handleEditTodo}
                onDelete={handleDeleteTodo}
                onArchive={handleArchiveTodo}
                onUnarchive={handleUnarchiveTodo}
                onComplete={handleCompleteTodo}
                onAddSubtask={handleAddSubtask}
                onCreateNew={() => setFormOpened(true)}
                showArchived={false}
                emptyMessage="No completed todos found"
              />
            )}
          </Tabs.Panel>

          <Tabs.Panel value="archived" pt="md">
            {isLoading ? (
              <LoadingSkeleton variant="card" count={5} />
            ) : (
              <TodoList
                todos={sortedTodos}
                projects={projects}
                onEdit={handleEditTodo}
                onDelete={handleDeleteTodo}
                onArchive={handleArchiveTodo}
                onUnarchive={handleUnarchiveTodo}
                onComplete={handleCompleteTodo}
                onAddSubtask={handleAddSubtask}
                onCreateNew={() => setFormOpened(true)}
                showArchived={true}
                emptyMessage="No archived todos found"
              />
            )}
          </Tabs.Panel>
        </Tabs>

        {/* Todo Form Modal */}
        <TodoForm
          opened={formOpened}
          onClose={() => {
            setFormOpened(false);
            setEditingTodo(null);
            setSubtaskParentId(null);
          }}
          onSubmit={editingTodo ? handleUpdateTodo : handleCreateTodo}
          initialData={editingTodo || (subtaskParentId ? { parentId: subtaskParentId } : undefined)}
          projects={projects}
          title={editingTodo ? 'Edit Todo' : subtaskParentId ? 'Create Subtask' : 'Create Todo'}
        />
      </Stack>
    </Container>
  );
}
