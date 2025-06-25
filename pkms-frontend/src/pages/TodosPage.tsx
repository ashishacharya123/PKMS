import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  Card,
  Title,
  Text,
  Group,
  Stack,
  Button,
  TextInput,
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
  Checkbox
} from '@mantine/core';
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
  IconFlag,
  IconAlertTriangle,
  IconX,
  IconFolder
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useTodosStore } from '../stores/todosStore';
import { todosService } from '../services/todosService';

type SortField = 'title' | 'created_at' | 'due_date' | 'priority';
type SortOrder = 'asc' | 'desc';

export function TodosPage() {
  const navigate = useNavigate();
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
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
    tags: ''
  });

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
    loadTodos,
    loadProjects,
    loadStats,
    createTodo,
    updateTodo,
    completeTodo,
    deleteTodo,
    createProject,
    setStatus,
    setPriority,
    setProjectFilter,
    setSearch,
    setShowOverdue,
    clearError
  } = useTodosStore();

  // Load data on mount
  useEffect(() => {
    loadTodos();
    loadProjects();
    loadStats();
  }, []);

  // Update search in store when debounced value changes
  useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch]);

  // Sorted and paginated todos
  const sortedTodos = useMemo(() => {
    const sorted = [...todos].sort((a, b) => {
      let aValue: string | number = a[sortField];
      let bValue: string | number = b[sortField];
      
      if (sortField.includes('date')) {
        aValue = new Date(aValue as string).getTime() || 0;
        bValue = new Date(bValue as string).getTime() || 0;
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

  const resetTodoForm = () => {
    setTodoForm({
      title: '',
      description: '',
      project_id: null,
      due_date: '',
      priority: 1,
      tags: ''
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
    const tags = todoForm.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    const success = await createTodo({
      ...todoForm,
      due_date: todoForm.due_date || undefined,
      tags
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

  const handleDeleteTodo = async (id: number, title: string) => {
    if (window.confirm(`Are you sure you want to delete "${title}"?`)) {
      await deleteTodo(id);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const getPriorityColor = (priority: number) => {
    const colors = { 1: 'green', 2: 'yellow', 3: 'red' };
    return colors[priority as keyof typeof colors] || 'gray';
  };

  const getPriorityLabel = (priority: number) => {
    const labels = { 1: 'Low', 2: 'Medium', 3: 'High' };
    return labels[priority as keyof typeof labels] || 'Unknown';
  };

  const getStatusColor = (status: string) => {
    const colors = {
      pending: 'gray',
      in_progress: 'blue',
      completed: 'green',
      cancelled: 'red'
    };
    return colors[status as keyof typeof colors] || 'gray';
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
                
                {projects.map((project) => (
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

            {/* Todos List */}
            {!isLoading && paginatedTodos.length > 0 && (
              <>
                <Stack gap="sm">
                  {paginatedTodos.map((todo) => (
                    <Card 
                      key={todo.id}
                      shadow="sm" 
                      padding="md" 
                      radius="md" 
                      withBorder
                    >
                      <Group justify="space-between" align="flex-start">
                        <Group align="flex-start" gap="md" style={{ flex: 1 }}>
                          <Checkbox
                            checked={todo.status === 'completed'}
                            onChange={() => handleCompleteTodo(todo.id)}
                            disabled={todo.status === 'completed'}
                          />
                          
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Group gap="xs" mb="xs">
                              <Text 
                                fw={600} 
                                size="sm"
                                style={{ 
                                  textDecoration: todo.status === 'completed' ? 'line-through' : 'none',
                                  opacity: todo.status === 'completed' ? 0.6 : 1
                                }}
                              >
                                {todo.title}
                              </Text>
                              
                              <Badge 
                                variant="light" 
                                color={getPriorityColor(todo.priority)} 
                                size="sm"
                              >
                                {getPriorityLabel(todo.priority)}
                              </Badge>
                              
                              <Badge 
                                variant="light" 
                                color={getStatusColor(todo.status)} 
                                size="sm"
                              >
                                {todo.status.replace('_', ' ')}
                              </Badge>
                              
                              {todo.due_date && (
                                <Badge 
                                  variant="light" 
                                  color={isOverdue(todo.due_date) ? 'red' : 'blue'} 
                                  size="sm"
                                >
                                  {isOverdue(todo.due_date) ? 'Overdue' : formatDate(todo.due_date)}
                                </Badge>
                              )}
                            </Group>
                            
                            <Group gap="xs">
                              {todo.project_name && (
                                <Badge variant="dot" color="gray" size="sm">
                                  {todo.project_name}
                                </Badge>
                              )}
                              
                              {todo.tags.map((tag: string) => (
                                <Badge key={tag} variant="outline" size="sm">
                                  {tag}
                                </Badge>
                              ))}
                            </Group>
                          </div>
                        </Group>
                        
                        <Menu withinPortal position="bottom-end">
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray">
                              <IconDots size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          
                          <Menu.Dropdown>
                            <Menu.Item 
                              leftSection={<IconEdit size={14} />}
                              onClick={() => {
                                setEditingTodo(todo);
                                setTodoForm({
                                  title: todo.title,
                                  description: '',
                                  project_id: null,
                                  due_date: todo.due_date || '',
                                  priority: todo.priority,
                                  tags: todo.tags.join(', ')
                                });
                                setTodoModalOpen(true);
                              }}
                            >
                              Edit
                            </Menu.Item>
                            {todo.status !== 'completed' && (
                              <Menu.Item 
                                leftSection={<IconCheck size={14} />}
                                onClick={() => handleCompleteTodo(todo.id)}
                              >
                                Complete
                              </Menu.Item>
                            )}
                            <Menu.Divider />
                            <Menu.Item 
                              leftSection={<IconTrash size={14} />}
                              color="red"
                              onClick={() => handleDeleteTodo(todo.id, todo.title)}
                            >
                              Delete
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    </Card>
                  ))}
                </Stack>

                {/* Pagination */}
                {totalPages > 1 && (
                  <Group justify="center">
                    <Pagination
                      value={currentPage}
                      onChange={setCurrentPage}
                      total={totalPages}
                      size="sm"
                    />
                  </Group>
                )}
              </>
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
                ...projects.map(p => ({ value: p.id.toString(), label: p.name }))
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
              value={todoForm.priority}
              onChange={(value) => setTodoForm({ ...todoForm, priority: value || 1 })}
            />
          </Group>
          
          <TextInput
            label="Due Date"
            type="date"
            value={todoForm.due_date}
            onChange={(e) => setTodoForm({ ...todoForm, due_date: e.currentTarget.value })}
          />
          
          <TextInput
            label="Tags (comma separated)"
            placeholder="work, important, urgent"
            value={todoForm.tags}
            onChange={(e) => setTodoForm({ ...todoForm, tags: e.currentTarget.value })}
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