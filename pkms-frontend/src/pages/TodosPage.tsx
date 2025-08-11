import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Grid,
  Title,
  Text,
  Group,
  Stack,
  Button,
  TextInput,
  TagsInput,
  Badge,
  ActionIcon,
  Menu,
  Skeleton,
  Alert,
  Pagination,
  Paper,
  ThemeIcon,
  Modal,
  Textarea,
  Select,
  NumberInput,
  Checkbox,
  Tooltip
} from '@mantine/core';
import ViewMenu, { ViewMode } from '../components/common/ViewMenu';
import ViewModeLayouts, { formatDate } from '../components/common/ViewModeLayouts';
import { useViewPreferences } from '../hooks/useViewPreferences';
import {
  IconPlus,
  IconSearch,
  IconFilter,
  IconSortAscending,
  IconSortDescending,
  IconCheck,
  IconEdit,
  IconTrash,
  IconDots,
  IconChecklist,
  IconCalendar,
  IconAlertTriangle,
  IconFolder,
  IconArchive,
  IconArchiveOff
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { searchService } from '../services/searchService';
import { useTodosStore } from '../stores/todosStore';
// import { todosService } from '../services/todosService';

type SortField = 'title' | 'created_at' | 'due_date' | 'priority';
type SortOrder = 'asc' | 'desc';

// Utility functions for todos
const getTodoIcon = (todo: any): string => {
  if (todo.is_completed) return '✅';
  if (todo.priority >= 4) return '🚨';
  if (todo.priority >= 3) return '🔥';
  if (todo.priority >= 2) return '⚡';
  return '📝';
};



const formatDueDate = (dueDate: string): string => {
  if (!dueDate) return 'No due date';
  const date = new Date(dueDate);
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} days`;
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays <= 7) return `Due in ${diffDays} days`;
  return formatDate(dueDate);
};

const getProjectColorDot = (color?: string) => (
  <span style={{
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: color || '#ccc',
    border: '1px solid rgba(0,0,0,0.1)'
  }} />
);

const formatCompletedAt = (completedAt?: string) => completedAt ? formatDate(completedAt) : '';

export function TodosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const { getPreference, updatePreference } = useViewPreferences();
  const [viewMode, setViewMode] = useState<ViewMode>(getPreference('todos'));
  const [todoModalOpen, setTodoModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<any>(null);
  const itemsPerPage = 20;

  // Form state
  const [todoForm, setTodoForm] = useState({
    title: '',
    description: '',
    project_id: null as number | null,
    due_date: '',
    priority: 1,
    tags: [] as string[]
  });

  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  const [projectForm, setProjectForm] = useState({
    name: '',
    description: '',
    color: '#2196F3'
  });

  // Store state
  const {
    todos,
    projects,
    stats,
    isLoading,
    isCreating,
    error,
    currentStatus,
    currentPriority,
    currentProjectId,
    showOverdue,
    // isArchivedFilter, // unused
    loadTodos,
    loadProjects,
    loadStats,
    createTodo,
    // updateTodo, // unused
    completeTodo,
    deleteTodo,
    createProject,
    archiveTodo,
    unarchiveTodo,
    setStatus,
    // setPriority, // unused
    setProjectFilter,
    setSearch,
    setShowOverdue,
    setArchivedFilter,
    clearError
  } = useTodosStore();

  // Load data on mount
  useEffect(() => {
    loadTodos();
    loadProjects();
    loadStats();
  }, []);

  // Handle action query parameter
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'new') {
      setTodoModalOpen(true);
      // Clear the action from URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('action');
      setSearchParams(newParams, { replace: true });
    }
    // Optional: open Overdue filter directly via ?overdue=true
    const overdue = searchParams.get('overdue');
    if (overdue === 'true') {
      setShowOverdue(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('overdue');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Update search in store when debounced value changes
  useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch]);

  // Tabs for Ongoing, Completed, Archived
  const [activeTab, setActiveTab] = useState<'ongoing' | 'completed' | 'archived'>('ongoing');
  useEffect(() => {
    if (activeTab === 'ongoing') setArchivedFilter(false);
    else if (activeTab === 'archived') setArchivedFilter(true);
    else setArchivedFilter(null);
  }, [activeTab, setArchivedFilter]);

  // Sorted and paginated todos
  const sortedTodos = useMemo(() => {
    const sorted = [...todos].sort((a, b) => {
      let aValue: string | number = a[sortField] ?? (sortField.includes('date') ? '' : 0);
      let bValue: string | number = b[sortField] ?? (sortField.includes('date') ? '' : 0);
      
      if (sortField.includes('date')) {
        aValue = aValue ? new Date(aValue as string).getTime() : 0;
        bValue = bValue ? new Date(bValue as string).getTime() : 0;
      } else if (sortField === 'priority') {
        aValue = Number(aValue);
        bValue = Number(bValue);
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = (bValue as string).toLowerCase();
      }
      
      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
    
    return sorted;
  }, [todos, sortField, sortOrder]);

  const paginatedTodos = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedTodos.slice(start, end);
  }, [sortedTodos, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedTodos.length / itemsPerPage);

  const handleTagSearch = async (query: string) => {
    if (query.length < 1) {
      setTagSuggestions([]);
      return;
    }
    
    try {
      const tags = await searchService.getTagAutocomplete(query, 'todos');
      setTagSuggestions(tags.map(tag => tag.name));
    } catch (error) {
      console.error('Failed to fetch tag suggestions:', error);
      setTagSuggestions([]);
    }
  };

  const resetTodoForm = () => {
    setTodoForm({
      title: '',
      description: '',
      project_id: null,
      due_date: '',
      priority: 1,
      tags: []
    });
    setEditingTodo(null);
  };

  const resetProjectForm = () => {
    setProjectForm({
      name: '',
      description: '',
      color: '#2196F3'
    });
  };

  const handleCreateTodo = async () => {
    const success = await createTodo({
      ...todoForm,
      due_date: todoForm.due_date || undefined,
      tags: todoForm.tags,
      project_id: todoForm.project_id === null ? undefined : todoForm.project_id
    });
    
    if (success) {
      setTodoModalOpen(false);
      resetTodoForm();
    }
  };

  const handleCreateProject = async () => {
    const success = await createProject(projectForm);
    
    if (success) {
      setProjectModalOpen(false);
      resetProjectForm();
      loadProjects(); // Refresh projects list
    }
  };

  const handleCompleteTodo = async (id: number) => {
    await completeTodo(id);
  };

  const handleDeleteTodo = (id: number, title: string) => {
    modals.openConfirmModal({
      title: 'Delete Todo',
      children: (
        <Text size="sm">Are you sure you want to delete "{title}"? This action cannot be undone.</Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const success = await deleteTodo(id);
        if (success) {
          notifications.show({ title: 'Todo Deleted', message: 'The todo was deleted successfully', color: 'green' });
        } else {
          notifications.show({ title: 'Delete Failed', message: 'Could not delete the todo. Please try again.', color: 'red' });
        }
      }
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getPriorityColor = (priority: number | string) => {
    const colors = { 1: 'green', 2: 'yellow', 3: 'red' };
    const numPriority = Number(priority);
    return colors[numPriority as keyof typeof colors] || 'gray';
  };

  const getPriorityLabel = (priority: number | string) => {
    const labels = { 1: 'Low', 2: 'Medium', 3: 'High' };
    const numPriority = Number(priority);
    return labels[numPriority as keyof typeof labels] || 'Unknown';
  };

  const getStatusColor = (status: string | number) => {
    const colors = {
      pending: 'gray',
      in_progress: 'blue',
      completed: 'green',
      cancelled: 'red'
    };
    const strStatus = String(status);
    return colors[strStatus as keyof typeof colors] || 'gray';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const isOverdue = (dueDate: string) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <Container size="xl">
      <Grid>
        {/* Sidebar */}
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Stack gap="md">
            {/* Quick Actions */}
            <Stack gap="xs">
              <Button
                leftSection={<IconPlus size={16} />}
                size="md"
                onClick={() => setTodoModalOpen(true)}
                fullWidth
              >
                New Todo
              </Button>
              <Button
                leftSection={<IconFolder size={16} />}
                size="sm"
                variant="light"
                onClick={() => setProjectModalOpen(true)}
                fullWidth
              >
                New Project
              </Button>
            </Stack>

            {/* Search */}
            <TextInput
              placeholder="Search todos..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
            />

            {/* Status Filter */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Status</Text>
                <IconChecklist size={16} />
              </Group>
              
              <Stack gap="xs">
                {[
                  { value: null, label: 'All', count: todos.length },
                  { value: 'pending', label: 'Pending', count: stats?.pending || 0 },
                  { value: 'in_progress', label: 'In Progress', count: stats?.in_progress || 0 },
                  { value: 'completed', label: 'Completed', count: stats?.completed || 0 }
                ].map((status) => (
                  <Button
                    key={status.value || 'all'}
                    variant={currentStatus === status.value ? 'filled' : 'subtle'}
                    size="xs"
                    justify="space-between"
                    fullWidth
                    onClick={() => setStatus(status.value)}
                  >
                    <span>{status.label}</span>
                    <Badge size="xs" variant="light">{status.count}</Badge>
                  </Button>
                ))}
              </Stack>
            </Paper>

            {/* Projects Filter */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Projects</Text>
                <IconFolder size={16} />
              </Group>
              
              <Stack gap="xs">
                <Button
                  variant={!currentProjectId ? 'filled' : 'subtle'}
                  size="xs"
                  justify="space-between"
                  fullWidth
                  onClick={() => setProjectFilter(null)}
                >
                  <span>All Projects</span>
                  <Badge size="xs" variant="light">{todos.length}</Badge>
                </Button>
                
                {(projects || []).map((project) => (
                  <Button
                    key={project.id}
                    variant={currentProjectId === project.id ? 'filled' : 'subtle'}
                    size="xs"
                    justify="space-between"
                    fullWidth
                    onClick={() => setProjectFilter(project.id)}
                  >
                    <Group gap="xs">
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: project.color
                        }}
                      />
                      <span>{project.name}</span>
                    </Group>
                    <Badge size="xs" variant="light">{project.todo_count}</Badge>
                  </Button>
                ))}
              </Stack>
            </Paper>

            {/* Filters */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Filters</Text>
                <IconFilter size={16} />
              </Group>
              
              <Stack gap="xs">
                <Button
                  variant={showOverdue ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={<IconCalendar size={14} />}
                  onClick={() => setShowOverdue(!showOverdue)}
                  fullWidth
                >
                  {showOverdue ? 'Hide Overdue' : 'Show Overdue Only'}
                </Button>
              </Stack>
            </Paper>

            {/* Stats */}
            {stats && (
              <Paper p="md" withBorder>
                <Text fw={600} size="sm" mb="xs">Statistics</Text>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm">Total</Text>
                    <Badge variant="light">{stats.total}</Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Overdue</Text>
                    <Badge variant="light" color="red">{stats.overdue}</Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Due Today</Text>
                    <Badge variant="light" color="orange">{stats.due_today}</Badge>
                  </Group>
                </Stack>
              </Paper>
            )}
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
                  {sortedTodos.length} {sortedTodos.length === 1 ? 'todo' : 'todos'}
                </Text>
              </div>
              
              <Group gap="xs">
                <ViewMenu 
                  currentView={viewMode}
                  onChange={(mode) => {
                    setViewMode(mode);
                    updatePreference('todos', mode);
                  }}
                  disabled={isLoading}
                />
                
                <Button
                  variant={sortField === 'title' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'title' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('title')}
                >
                  Title
                </Button>
                <Button
                  variant={sortField === 'due_date' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'due_date' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('due_date')}
                >
                  Due Date
                </Button>
                <Button
                  variant={sortField === 'priority' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'priority' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('priority')}
                >
                  Priority
                </Button>
              </Group>
            </Group>

            {/* Tabs for Ongoing, Completed, Archived */}
            <Group gap="xs" mb="sm">
              <Button
                variant={activeTab === 'ongoing' ? 'filled' : 'subtle'}
                onClick={() => setActiveTab('ongoing')}
              >Ongoing</Button>
              <Button
                variant={activeTab === 'completed' ? 'filled' : 'subtle'}
                onClick={() => setActiveTab('completed')}
              >Completed</Button>
              <Button
                variant={activeTab === 'archived' ? 'filled' : 'subtle'}
                onClick={() => setActiveTab('archived')}
              >Archived</Button>
            </Group>

            {/* Error Alert */}
            {error && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                title="Error"
                color="red"
                variant="light"
                withCloseButton
                onClose={clearError}
              >
                {error}
              </Alert>
            )}

            {/* Loading State */}
            {isLoading && (
              <Stack gap="md">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} height={80} radius="md" />
                ))}
              </Stack>
            )}

            {/* Todos View */}
            <ViewModeLayouts
              items={paginatedTodos.map(todo => ({...todo, id: todo.id})) as any[]}
              viewMode={viewMode}
              isLoading={isLoading}
              emptyMessage={
                searchQuery || currentStatus || currentPriority || currentProjectId
                  ? 'No todos found. Try adjusting your filters or search.'
                  : 'No todos yet. Create your first todo to get started.'
              }
              onItemClick={(todo: any) => {
                // Handle todo click - could open edit modal
                setEditingTodo(todo);
                setTodoForm({
                  title: todo.title,
                  description: '',
                  project_id: todo.project_id,
                  due_date: todo.due_date || '',
                  priority: todo.priority,
                  tags: todo.tags || []
                });
                setTodoModalOpen(true);
              }}
              renderSmallIcon={(todo: any) => (
                <Stack gap={2} align="center">
                  <Text size="lg">{getTodoIcon(todo)}</Text>
                  <Group gap={2}>
                    <Badge size="xs" variant="light" color={getPriorityColor(todo.priority)}>
                      {getPriorityLabel(todo.priority).charAt(0)}
                    </Badge>
                    {todo.is_completed && (
                      <Badge size="xs" color="green" variant="light">✓</Badge>
                    )}
                  </Group>
                </Stack>
              )}
              renderMediumIcon={(todo: any) => (
                <Stack gap="xs" align="center">
                  <Text size="xl">{getTodoIcon(todo)}</Text>
                  <Group gap={4}>
                    <Badge size="xs" variant="light" color={getPriorityColor(todo.priority)}>
                      {getPriorityLabel(todo.priority)}
                    </Badge>
                    <Badge size="xs" variant="light" color={getStatusColor(todo.status)}>
                      {String(todo.status).replace('_', ' ')}
                    </Badge>
                    {todo.due_date && (
                      <Badge 
                        size="xs" 
                        variant="light" 
                        color={isOverdue(todo.due_date) ? 'red' : 'blue'}
                      >
                        {isOverdue(todo.due_date) ? 'Overdue' : 'Due'}
                      </Badge>
                    )}
                  </Group>
                </Stack>
              )}
              renderListItem={(todo: any) => (
                <Group justify="space-between">
                  <Group gap="md">
                    <Checkbox
                      checked={todo.status === 'completed'}
                      onChange={() => handleCompleteTodo(todo.id)}
                      disabled={todo.status === 'completed'}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Text size="lg">{getTodoIcon(todo)}</Text>
                    <Stack gap={2}>
                      <Group gap="xs">
                        {todo.project && (
                          <Tooltip label={todo.project.name}>
                            <span>{getProjectColorDot(todo.project.color)}</span>
                          </Tooltip>
                        )}
                        <Text 
                          fw={600} 
                          size="sm" 
                          style={{ 
                            cursor: 'pointer', 
                            color: '#228be6',
                            textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                            opacity: todo.status === 'completed' ? 0.6 : 1
                          }}
                          onClick={() => {
                            setEditingTodo(todo);
                            setTodoForm({
                              title: todo.title,
                              description: '',
                              project_id: todo.project_id,
                              due_date: todo.due_date || '',
                              priority: todo.priority,
                              tags: todo.tags || []
                            });
                            setTodoModalOpen(true);
                          }}
                        >
                          {todo.title}
                        </Text>
                        {todo.is_archived && (
                          <Badge size="xs" color="orange" variant="light">Archived</Badge>
                        )}
                      </Group>
                      <Group gap="xs">
                        <Badge size="xs" variant="light" color={getPriorityColor(todo.priority)}>
                          {getPriorityLabel(todo.priority)}
                        </Badge>
                        {todo.status && (
                          <Badge size="xs" variant="light" color={getStatusColor(todo.status)}>
                            {String(todo.status).replace('_', ' ')}
                          </Badge>
                        )}
                        {todo.due_date && (
                          <Badge 
                            size="xs" 
                            variant="light" 
                            color={isOverdue(todo.due_date) ? 'red' : 'blue'}
                          >
                            {isOverdue(todo.due_date) ? 'Overdue' : 'Due'}: {formatDueDate(todo.due_date)}
                          </Badge>
                        )}
                        {todo.completed_at && (
                          <Tooltip label={`Completed: ${formatCompletedAt(todo.completed_at)}`}>
                            <Badge size="xs" variant="light" color="green">Completed</Badge>
                          </Tooltip>
                        )}
                        {todo.project && (
                          <Badge size="xs" variant="light" color="gray">
                            {todo.project.name}
                          </Badge>
                        )}
                        {Array.isArray(todo.tags) && todo.tags.slice(0, 2).map((tag: string) => (
                          <Badge key={tag} size="xs" variant="dot">{tag}</Badge>
                        ))}
                        {Array.isArray(todo.tags) && todo.tags.length > 2 && (
                          <Badge size="xs" variant="outline">+{todo.tags.length - 2}</Badge>
                        )}
                      </Group>
                    </Stack>
                  </Group>
                  <Menu shadow="md" width={200}>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" onClick={(e) => e.stopPropagation()}>
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item 
                        leftSection={<IconEdit size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTodo(todo);
                          setTodoForm({
                            title: todo.title,
                            description: '',
                            project_id: todo.project_id,
                            due_date: todo.due_date || '',
                            priority: todo.priority,
                            tags: todo.tags || []
                          });
                          setTodoModalOpen(true);
                        }}
                      >
                        Edit
                      </Menu.Item>
                      {todo.status !== 'completed' && (
                        <Menu.Item 
                          leftSection={<IconCheck size={14} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCompleteTodo(todo.id);
                          }}
                        >
                          Complete
                        </Menu.Item>
                      )}
                      <Menu.Divider />
                      <Menu.Item 
                        leftSection={todo.is_archived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          todo.is_archived ? unarchiveTodo(todo.id) : archiveTodo(todo.id);
                        }}
                      >
                        {todo.is_archived ? 'Unarchive' : 'Archive'}
                      </Menu.Item>
                      <Menu.Item 
                        leftSection={<IconTrash size={14} />}
                        color="red"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTodo(todo.id, todo.title);
                        }}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              )}
              renderDetailColumns={(todo: any) => [
                <Group key="title" gap="xs">
                  <Checkbox
                    checked={todo.status === 'completed'}
                    onChange={() => handleCompleteTodo(todo.id)}
                    disabled={todo.status === 'completed'}
                    size="sm"
                  />
                  <Text size="sm">{getTodoIcon(todo)}</Text>
                  <Text 
                    fw={500} 
                    size="sm" 
                    style={{ 
                      cursor: 'pointer', 
                      color: '#228be6',
                      textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                      opacity: todo.status === 'completed' ? 0.6 : 1
                    }}
                    onClick={() => {
                      setEditingTodo(todo);
                      setTodoForm({
                        title: todo.title,
                        description: '',
                        project_id: todo.project_id,
                        due_date: todo.due_date || '',
                        priority: todo.priority,
                        tags: todo.tags || []
                      });
                      setTodoModalOpen(true);
                    }}
                  >
                    {todo.title}
                  </Text>
                </Group>,
                <Group key="priority" gap="xs">
                  <Badge size="xs" variant="light" color={getPriorityColor(todo.priority)}>
                    {getPriorityLabel(todo.priority)}
                  </Badge>
                </Group>,
                <Group key="status" gap="xs">
                  <Badge size="xs" variant="light" color={getStatusColor(todo.status)}>
                    {String(todo.status).replace('_', ' ')}
                  </Badge>
                </Group>,
                <Text key="duedate" size="xs" c="dimmed">
                  {todo.due_date ? (
                    <Badge 
                      size="xs" 
                      variant="light" 
                      color={isOverdue(todo.due_date) ? 'red' : 'blue'}
                    >
                      {formatDueDate(todo.due_date)}
                    </Badge>
                  ) : (
                    'No due date'
                  )}
                </Text>,
                <Group key="project" gap="xs">
                  {todo.project_name && (
                    <Badge size="xs" variant="dot" color="gray">
                      {todo.project_name}
                    </Badge>
                  )}
                </Group>,
                <Group key="tags" gap={4}>
                  {(todo.tags || []).slice(0, 3).map((tag: string) => (
                    <Badge key={tag} size="xs" variant="outline">
                      {tag}
                    </Badge>
                  ))}
                  {(todo.tags?.length || 0) > 3 && (
                    <Tooltip label={`${(todo.tags?.length || 0) - 3} more tags`}>
                      <Badge size="xs" variant="outline">+{(todo.tags?.length || 0) - 3}</Badge>
                    </Tooltip>
                  )}
                </Group>,
                <Text key="created" size="xs" c="dimmed">
                  {formatDate(todo.created_at)}
                </Text>,
                <Menu key="actions" shadow="md" width={200}>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" size="sm" onClick={(e) => e.stopPropagation()}>
                      <IconDots size={14} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item 
                      leftSection={<IconEdit size={14} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTodo(todo);
                        setTodoForm({
                          title: todo.title,
                          description: '',
                          project_id: todo.project_id,
                          due_date: todo.due_date || '',
                          priority: todo.priority,
                          tags: todo.tags || []
                        });
                        setTodoModalOpen(true);
                      }}
                    >
                      Edit
                    </Menu.Item>
                    {todo.status !== 'completed' && (
                      <Menu.Item 
                        leftSection={<IconCheck size={14} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCompleteTodo(todo.id);
                        }}
                      >
                        Complete
                      </Menu.Item>
                    )}
                    <Menu.Divider />
                    <Menu.Item 
                      leftSection={todo.is_archived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        todo.is_archived ? unarchiveTodo(todo.id) : archiveTodo(todo.id);
                      }}
                    >
                      {todo.is_archived ? 'Unarchive' : 'Archive'}
                    </Menu.Item>
                    <Menu.Item 
                      leftSection={<IconTrash size={14} />}
                      color="red"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTodo(todo.id, todo.title);
                      }}
                    >
                      Delete
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              ]}
              detailHeaders={[
                'Task', 
                'Priority', 
                'Status', 
                'Due Date', 
                'Project', 
                'Tags', 
                'Created', 
                'Actions'
              ]}
            />

            {/* Pagination */}
            {!isLoading && paginatedTodos.length > 0 && totalPages > 1 && (
              <Group justify="center">
                <Pagination
                  value={currentPage}
                  onChange={setCurrentPage}
                  total={totalPages}
                  size="sm"
                />
              </Group>
            )}

            {/* Empty State */}
            {!isLoading && paginatedTodos.length === 0 && (
              <Paper p="xl" radius="md" style={{ textAlign: 'center' }}>
                <ThemeIcon size="xl" variant="light" color="gray" mx="auto" mb="md">
                  <IconChecklist size={32} />
                </ThemeIcon>
                <Title order={3} mb="xs">
                  {searchQuery || currentStatus || currentProjectId ? 'No todos found' : 'No todos yet'}
                </Title>
                <Text c="dimmed" mb="lg">
                  {searchQuery || currentStatus || currentProjectId
                    ? 'Try adjusting your search or filters'
                    : 'Create your first todo to get started'
                  }
                </Text>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => setTodoModalOpen(true)}
                >
                  Create Todo
                </Button>
              </Paper>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      {/* Todo Modal */}
      <Modal
        opened={todoModalOpen}
        onClose={() => {
          setTodoModalOpen(false);
          resetTodoForm();
        }}
        title={editingTodo ? 'Edit Todo' : 'Create Todo'}
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            placeholder="Enter todo title"
            value={todoForm.title}
            onChange={(e) => setTodoForm({ ...todoForm, title: e.currentTarget.value })}
            required
          />
          
          <Textarea
            label="Description"
            placeholder="Enter description (optional)"
            value={todoForm.description}
            onChange={(e) => setTodoForm({ ...todoForm, description: e.currentTarget.value })}
            minRows={3}
          />
          
          <Group grow>
            <Select
              label="Project"
              placeholder="Select project"
              data={[
                { value: '', label: 'No Project' },
                                            ...(projects || []).map(p => ({ value: p.id.toString(), label: p.name }))
              ]}
              value={todoForm.project_id?.toString() || ''}
              onChange={(value) => setTodoForm({ 
                ...todoForm, 
                project_id: value ? parseInt(value) : null 
              })}
            />
            
            <NumberInput
              label="Priority"
              min={1}
              max={3}
              value={Number(todoForm.priority)}
              onChange={(value) => setTodoForm({ ...todoForm, priority: Number(value) || 1 })}
            />
          </Group>
          
          <TextInput
            label="Due Date"
            type="date"
            value={todoForm.due_date}
            onChange={(e) => setTodoForm({ ...todoForm, due_date: e.currentTarget.value })}
          />
          
          <TagsInput
            label="Tags"
            placeholder="Type to search and add tags"
            value={todoForm.tags}
            onChange={(tags) => setTodoForm({ ...todoForm, tags })}
            data={tagSuggestions}
            clearable
            onSearchChange={handleTagSearch}
            splitChars={[',', ' ']}
            description="Add tags separated by comma or space. Start typing to see suggestions."
          />
          
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => {
                setTodoModalOpen(false);
                resetTodoForm();
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTodo}
              loading={isCreating}
              disabled={!todoForm.title.trim()}
            >
              {editingTodo ? 'Update' : 'Create'} Todo
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Project Modal */}
      <Modal
        opened={projectModalOpen}
        onClose={() => {
          setProjectModalOpen(false);
          resetProjectForm();
        }}
        title="Create Project"
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="Enter project name"
            value={projectForm.name}
            onChange={(e) => setProjectForm({ ...projectForm, name: e.currentTarget.value })}
            required
          />
          
          <Textarea
            label="Description"
            placeholder="Enter project description (optional)"
            value={projectForm.description}
            onChange={(e) => setProjectForm({ ...projectForm, description: e.currentTarget.value })}
            minRows={3}
          />
          
          <TextInput
            label="Color"
            type="color"
            value={projectForm.color}
            onChange={(e) => setProjectForm({ ...projectForm, color: e.currentTarget.value })}
          />
          
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => {
                setProjectModalOpen(false);
                resetProjectForm();
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              loading={isCreating}
              disabled={!projectForm.name.trim()}
            >
              Create Project
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
} 