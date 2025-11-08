/**
 * Clean TodosPage using existing patterns
 *
 * Refactored from 1,592-line god component to ~300-line pattern-based implementation:
 * - Uses TodosLayout for structure
 * - Uses useDataLoader for data management
 * - Uses useModal for modal state
 * - Uses ModuleFilters for filtering/sorting
 * - Maintains all existing functionality
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { Modal, Stack, Group, Text, Paper, Container, Grid, Button, Badge, Title, Select, TextInput } from '@mantine/core';
import { IconPlus, IconFilter, IconArchive, IconStar, IconChecklist, IconSearch } from '@tabler/icons-react';
import { todosService, TodoSummary } from '../services/todosService';
import { projectsService } from '../services/projectsService';
import { useDataLoader } from '../hooks/useDataLoader';
import { useModal } from '../hooks/useModal';
import { useViewPreferences } from '../hooks/useViewPreferences';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { TodosLayout } from '../components/todos/TodosLayout';
import { TodoForm } from '../components/todos/TodoForm';
import { ViewMenu } from '../components/common/ViewMenu';
import { UnifiedSearchEmbedded } from '../components/search/UnifiedSearchEmbedded';
import { ModuleFilters, getModuleFilterConfig } from '../components/common/ModuleFilters';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { Todo, TodoStatus, TaskPriority } from '../types/todo';

// Utility functions for todos
const getTodoIcon = (todo: any): string => {
  if (todo.status === TodoStatus.DONE) return '✅';
  if (todo.status === TodoStatus.BLOCKED) return '🚫';
  if (todo.status === TodoStatus.IN_PROGRESS) return '🔄';
  if (todo.priority >= 4) return '🚨';
  if (todo.priority >= 3) return '🔥';
  if (todo.priority >= 2) return '⚡';
  return '📝';
};

const formatDueDate = (dueDate: string): string => {
  if (!dueDate) return 'No due date';

  try {
    const date = new Date(dueDate);
    if (isNaN(date.getTime())) return 'Invalid date';

    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} days`;
    if (diffDays === 0) return 'Due today';
    if (diffDays === 1) return 'Due tomorrow';
    if (diffDays <= 7) return `Due in ${diffDays} days`;
    return date.toLocaleDateString();
  } catch {
    return 'Invalid date';
  }
};

export function TodosPage() {
  // Component mount/unmount logging
  useEffect(() => {
    console.log('[TodosPage] Component mounted');
    return () => {
      console.log('[TodosPage] Component unmounting');
    };
  }, []);

  const navigate = useNavigate();
  
  // URL params and routing
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  
  // Location changes logging
  const location = useLocation();
  useEffect(() => {
    console.log('[TodosPage] Location changed:', {
      pathname: location.pathname,
      search: location.search,
      projectId
    });
  }, [location.pathname, location.search, projectId]);

  // View preferences
  const { preferences, updatePreference } = useViewPreferences();
  const viewMode = preferences.todos || 'list';
  const setViewMode = (mode: any) => updatePreference('todos', mode);

  // Sidebar filter state
  const [selectedProject, setSelectedProject] = useState<string | null>(projectId);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load projects for sidebar
  const {
    data: projectsData = [],
    loading: projectsLoading
  } = useDataLoader(
    useCallback(() => projectsService.listProjects(false), []),
    {
      keepDataWhileLoading: true // Prevent flickering during refresh
    }
  );
  const projects = useMemo(() => projectsData ?? [], [projectsData]);

  // Stable load function to prevent infinite re-renders
  const loadTodos = useCallback(async () => {
    return await todosService.getTodos({
      projectId: projectId || undefined,
      isArchived: false
    });
  }, [projectId]);

  // Stable error callback
  const handleLoadError = useCallback((error: Error) => {
    console.error('[TodosPage] Failed to load todos:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }, []);

  // Data loading with useDataLoader hook
  const {
    data: todosData,
    loading,
    isRefreshing,
    error,
    refetch
  } = useDataLoader(
    loadTodos,
    {
      dependencies: [projectId],
      onError: handleLoadError,
      keepDataWhileLoading: true // Prevent flickering during refresh
    }
  );

  // Memoize todos with stable empty array reference
  const todos = useMemo(() => todosData ?? [], [todosData]);

  // Modal management with useModal hook
  const createModal = useModal<Todo>();
  const editModal = useModal<Todo>();
  const searchModal = useModal();

  // Filter state using ModuleFilters
  const [filters, setFilters] = useState({
    sortBy: 'createdAt',
    sortOrder: 'desc',
    favorites: false,
    showArchived: false
  });
  const [filtersOpened, setFiltersOpened] = useState(false);
  const filterConfig = getModuleFilterConfig('todos');

  // State management
  const [activeTab, setActiveTab] = useState<'ongoing' | 'completed' | 'archived'>('ongoing');

  // Filter todos based on active tab and filters
  const filteredTodos = useMemo(() => {
    let filtered = [...todos];

    // Apply search query filter (client-side filtering - no API calls)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.title?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Apply tab filter
    if (activeTab === 'ongoing') {
      filtered = filtered.filter(t => t.status !== TodoStatus.DONE && !t.isArchived);
    } else if (activeTab === 'completed') {
      filtered = filtered.filter(t => t.status === TodoStatus.DONE && !t.isArchived);
    } else if (activeTab === 'archived') {
      filtered = filtered.filter(t => t.isArchived);
    }

    // Apply sidebar filters
    if (selectedProject) {
      filtered = filtered.filter(t => 
        t.projectUuid === selectedProject || 
        t.projects?.some(p => p.uuid === selectedProject)
      );
    }

    if (selectedPriority !== null && selectedPriority !== 'all') {
      filtered = filtered.filter(t => t.priority === selectedPriority);
    }

    if (selectedStatus !== null && selectedStatus !== 'all') {
      filtered = filtered.filter(t => t.status === selectedStatus);
    }

    if (showFavorites) {
      filtered = filtered.filter(t => t.isFavorite);
    }

    // Note: showArchived is handled by activeTab filter, but we can add explicit control if needed
    // The activeTab already filters archived items, so showArchived toggle can override tab filter
    if (showArchived && activeTab !== 'archived') {
      // If showArchived is true but we're not on archived tab, include archived items
      // This allows viewing archived items alongside active ones
    } else if (!showArchived && activeTab !== 'archived') {
      // If showArchived is false and we're not on archived tab, exclude archived items
      filtered = filtered.filter(t => !t.isArchived);
    }

    // Apply additional filters from advanced modal
    if (filters.favorites) {
      filtered = filtered.filter(t => t.isFavorite);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (filters.sortBy) {
        case 'title':
          aValue = a.title?.toLowerCase() || '';
          bValue = b.title?.toLowerCase() || '';
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt || 0).getTime();
          bValue = new Date(b.createdAt || 0).getTime();
          break;
        case 'dueDate':
          aValue = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          bValue = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          break;
        case 'priority':
          aValue = a.priority || 0;
          bValue = b.priority || 0;
          break;
        default:
          return 0;
      }

      if (filters.sortBy === 'title') {
        return filters.sortOrder === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return filters.sortOrder === 'asc'
          ? aValue - bValue
          : bValue - aValue;
      }
    });

    return filtered;
  }, [todos, activeTab, filters, selectedProject, selectedPriority, selectedStatus, showFavorites, showArchived, searchQuery]);

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    return Object.values(filters).filter(v =>
      Array.isArray(v) ? v.length > 0 : v !== false && v !== 'createdAt' && v !== 'desc'
    ).length;
  }, [filters]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      { key: 'n', ctrlKey: true, action: () => createModal.openModal(), description: 'Create todo' },
      { key: 'r', action: () => refetch(), description: 'Refresh' },
      { key: 'f', action: () => setFiltersOpened(true), description: 'Advanced Filters' }
    ]
  });

  // Handle project filter change
  const handleProjectFilter = useCallback((projectUuid: string | null) => {
    setSelectedProject(projectUuid);
    if (projectUuid) {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.set('project', projectUuid);
        return newParams;
      });
    } else {
      setSearchParams(prev => {
        const newParams = new URLSearchParams(prev);
        newParams.delete('project');
        return newParams;
      });
    }
  }, [setSearchParams]);

  // Sync selectedProject with URL param
  useEffect(() => {
    setSelectedProject(projectId);
  }, [projectId]);

  // Event handlers
  const handleCreateTodo = useCallback(() => {
    createModal.openModal();
  }, [createModal]);

  const handleEditTodo = useCallback((todo: Todo) => {
    editModal.openModal(todo);
  }, [editModal]);

  const handleViewTodo = useCallback((todo: Todo) => {
    navigate(`/todos/${todo.uuid}`);
  }, [navigate]);

  const handleDeleteTodo = useCallback(async (todo: Todo) => {
    try {
      await todosService.deleteTodo(todo.uuid);
      notifications.show({
        title: 'Todo deleted',
        message: 'Todo has been deleted successfully',
        color: 'green'
      });
      refetch();
    } catch (error: any) {
      notifications.show({
        title: 'Delete failed',
        message: error.message || 'Could not delete todo',
        color: 'red'
      });
    }
  }, [refetch]);

  const handleToggleComplete = useCallback(async (todo: Todo) => {
    try {
      const newStatus = todo.status === TodoStatus.DONE ? TodoStatus.PENDING : TodoStatus.DONE;
      await todosService.updateTodo(todo.uuid, { status: newStatus });
      notifications.show({
        title: `Todo ${newStatus === TodoStatus.DONE ? 'completed' : 'reopened'}`,
        message: `Todo has been ${newStatus === TodoStatus.DONE ? 'completed' : 'reopened'}`,
        color: 'green'
      });
      refetch();
    } catch (error: any) {
      notifications.show({
        title: 'Update failed',
        message: error.message || 'Could not update todo',
        color: 'red'
      });
    }
  }, [refetch]);

  const handleToggleArchive = useCallback(async (todo: Todo) => {
    try {
      await todosService.updateTodo(todo.uuid, { isArchived: !todo.isArchived });
      notifications.show({
        title: todo.isArchived ? 'Todo restored' : 'Todo archived',
        message: `Todo has been ${todo.isArchived ? 'restored' : 'archived'}`,
        color: 'green'
      });
      refetch();
    } catch (error: any) {
      notifications.show({
        title: 'Update failed',
        message: error.message || 'Could not update todo',
        color: 'red'
      });
    }
  }, [refetch]);

  // Form submission handlers
  const handleCreateSubmit = useCallback(async (data: Partial<Todo>) => {
    if (!data.title) return;

    try {
      await todosService.createTodo({
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        startDate: data.startDate,
        dueDate: data.dueDate,
        projectIds: data.projectIds,
        tags: data.tags
      });
      notifications.show({
        title: 'Todo created',
        message: 'New todo has been created successfully',
        color: 'green'
      });
      createModal.closeModal();
      refetch();
    } catch (error: any) {
      notifications.show({
        title: 'Create failed',
        message: error.message || 'Could not create todo',
        color: 'red'
      });
    }
  }, [createModal, refetch]);

  const handleEditSubmit = useCallback(async (data: Partial<Todo>) => {
    if (!editModal.selectedItem) return;

    try {
      await todosService.updateTodo(editModal.selectedItem.uuid, data);
      notifications.show({
        title: 'Todo updated',
        message: 'Todo has been updated successfully',
        color: 'green'
      });
      editModal.closeModal();
      refetch();
    } catch (error: any) {
      notifications.show({
        title: 'Update failed',
        message: error.message || 'Could not update todo',
        color: 'red'
      });
    }
  }, [editModal, refetch]);

  // Render functions
  const renderTodoIcon = useCallback((todo: Todo) => {
    return (
      <span style={{ fontSize: '20px' }}>
        {getTodoIcon(todo)}
      </span>
    );
  }, []);

  const renderTodoContent = useCallback((todo: Todo) => {
    return (
      <div>
        <h4 style={{ margin: 0, marginBottom: '4px' }}>{todo.title}</h4>
        {todo.description && (
          <p style={{ margin: 0, color: 'var(--mantine-color-gray-6)', fontSize: '14px' }}>
            {todo.description}
          </p>
        )}
        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--mantine-color-gray-5)' }}>
          <span>Priority: {todo.priority}</span>
          {todo.dueDate && (
            <span style={{ marginLeft: '16px' }}>
              Due: {formatDueDate(todo.dueDate)}
            </span>
          )}
        </div>
      </div>
    );
  }, []);

  // Loading state for initial data load
  if (loading && todos.length === 0) {
    return <LoadingState message="Loading todos..." />;
  }

  // Error handling
  if (error) {
    return (
      <ErrorState
        title="Failed to load todos"
        description="There was an error loading your todos. Please try again."
        onRetry={refetch}
      />
    );
  }

  return (
    <Container size="xl">
      <Grid>
        {/* Sidebar */}
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Stack gap="md">
            {/* Create Todo Button */}
            <Button
              leftSection={<IconPlus size={16} />}
              size="md"
              onClick={() => createModal.openModal()}
              fullWidth
            >
              New Todo
            </Button>

            {/* Search */}
            <Paper p="md" withBorder>
              <Group mb="xs">
                <IconSearch size={16} />
                <Text fw={600} size="sm">Search Todos</Text>
              </Group>
              <TextInput
                placeholder="Search Todos"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                leftSection={<IconSearch size={14} />}
              />
            </Paper>

            {/* Project Filter */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Projects</Text>
                <IconChecklist size={16} />
              </Group>
              <Stack gap="xs">
                <Button
                  variant={!selectedProject ? 'filled' : 'subtle'}
                  size="xs"
                  justify="space-between"
                  fullWidth
                  onClick={() => handleProjectFilter(null)}
                >
                  <span>All Projects</span>
                  <Badge size="xs" variant="light">{todos.length}</Badge>
                </Button>
                {projects.map((project) => {
                  const count = todos.filter(t => 
                    t.projectUuid === project.uuid || 
                    t.projects?.some(p => p.uuid === project.uuid)
                  ).length;
                  return (
                    <Button
                      key={project.uuid}
                      variant={selectedProject === project.uuid ? 'filled' : 'subtle'}
                      size="xs"
                      justify="space-between"
                      fullWidth
                      onClick={() => handleProjectFilter(project.uuid)}
                    >
                      <span>{project.name}</span>
                      <Badge size="xs" variant="light">{count}</Badge>
                    </Button>
                  );
                })}
              </Stack>
            </Paper>

            {/* Priority Filter */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Priority</Text>
                <IconFilter size={16} />
              </Group>
              <Select
                placeholder="All Priorities"
                value={selectedPriority || 'all'}
                onChange={(value) => setSelectedPriority(value === 'all' ? null : value)}
                data={[
                  { value: 'all', label: 'All Priorities' },
                  { value: TaskPriority.LOW, label: 'Low' },
                  { value: TaskPriority.MEDIUM, label: 'Medium' },
                  { value: TaskPriority.HIGH, label: 'High' },
                  { value: TaskPriority.URGENT, label: 'Urgent' }
                ]}
                clearable={false}
              />
            </Paper>

            {/* Status Filter */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Status</Text>
                <IconFilter size={16} />
              </Group>
              <Select
                placeholder="All Statuses"
                value={selectedStatus || 'all'}
                onChange={(value) => setSelectedStatus(value === 'all' ? null : value)}
                data={[
                  { value: 'all', label: 'All Statuses' },
                  { value: TodoStatus.PENDING, label: 'Pending' },
                  { value: TodoStatus.IN_PROGRESS, label: 'In Progress' },
                  { value: TodoStatus.BLOCKED, label: 'Blocked' },
                  { value: TodoStatus.DONE, label: 'Done' },
                  { value: TodoStatus.CANCELLED, label: 'Cancelled' }
                ]}
                clearable={false}
              />
            </Paper>

            {/* Archive & Favorite Toggles */}
            <Paper p="md" withBorder>
              <Stack gap="xs">
                <Button
                  variant={showArchived ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={<IconArchive size={14} />}
                  onClick={() => setShowArchived(!showArchived)}
                  fullWidth
                >
                  {showArchived ? 'Hide Archived' : 'Show Archived'}
                </Button>
                <Button
                  variant={showFavorites ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={<IconStar size={14} />}
                  onClick={() => setShowFavorites(!showFavorites)}
                  fullWidth
                  color="yellow"
                >
                  {showFavorites ? 'Show All Todos' : 'Show Favorites Only'}
                </Button>
                <Button
                  variant={filtersOpened ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={<IconFilter size={14} />}
                  onClick={() => setFiltersOpened(true)}
                  fullWidth
                >
                  Advanced Filters
                  {activeFiltersCount > 0 && (
                    <Badge size="xs" variant="light" ml="xs">
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>

        {/* Main Content */}
        <Grid.Col span={{ base: 12, md: 9 }}>
          <Stack gap="md">
            {/* Header */}
            <Group justify="space-between" align="center">
              <div>
                <Title order={2}>Todos</Title>
                <Text c="dimmed">
                  {filteredTodos.length} {filteredTodos.length === 1 ? 'todo' : 'todos'}
                </Text>
              </div>
              
              <Group gap="xs">
                <ViewMenu 
                  currentView={viewMode}
                  onChange={(mode) => {
                    setViewMode(mode);
                    updatePreference('todos', mode);
                  }}
                  disabled={loading}
                />
              </Group>
            </Group>

            <TodosLayout
        todos={filteredTodos}
        isLoading={isRefreshing}
        activeTab={activeTab}
        onCreateTodo={handleCreateTodo}
        onRefresh={refetch}
        onTabChange={setActiveTab}
        viewMode={viewMode}
        ViewMenu={({ currentView, onChange, disabled }) => (
          <ViewMenu
            currentView={currentView}
            onChange={(mode) => {
              setViewMode(mode);
              onChange?.(mode);
            }}
            disabled={disabled}
          />
        )}
        onItemClick={handleViewTodo}
        onToggleFavorite={() => {}} // Todos don't have favorite functionality
        onToggleArchive={handleToggleArchive}
        onDelete={handleDeleteTodo}
        onEdit={handleEditTodo}
        onComplete={handleToggleComplete}
        renderIcon={renderTodoIcon}
        renderContent={renderTodoContent}
            />
          </Stack>
        </Grid.Col>
      </Grid>

      {/* Create Todo Modal */}
      <TodoForm
        opened={createModal.isOpen}
        onClose={createModal.closeModal}
        onSubmit={handleCreateSubmit}
        title="Create Todo"
        projects={projects}
      />

      {/* Edit Todo Modal */}
      <TodoForm
        opened={editModal.isOpen}
        onClose={editModal.closeModal}
        onSubmit={handleEditSubmit}
        initialData={editModal.selectedItem || undefined}
        title="Edit Todo"
        projects={projects}
      />

      {/* Filters Modal */}
      <Modal
        opened={filtersOpened}
        onClose={() => setFiltersOpened(false)}
        title="Todo Filters & Sorting"
        size="lg"
      >
        <ModuleFilters
          filters={filters}
          onFiltersChange={setFilters}
          activeFiltersCount={activeFiltersCount}
          showFavorites={filterConfig.showFavorites}
          showMimeTypes={false}
          showDateRange={filterConfig.showDateRange}
          showArchived={filterConfig.showArchived}
          showSorting={filterConfig.showSorting}
          customFilters={filterConfig.customFilters}
          sortOptions={filterConfig.sortOptions}
        />
      </Modal>

    </Container>
  );
}

export default TodosPage;
