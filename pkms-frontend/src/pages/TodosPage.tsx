import { useEffect, useState, useMemo } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
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
  Tooltip,
  FileInput,
  Progress
} from '@mantine/core';
import ViewMenu from '../components/common/ViewMenu';
import ViewModeLayouts, { formatDate } from '../components/common/ViewModeLayouts';
import { MultiProjectSelector } from '../components/common/MultiProjectSelector';
import { ProjectBadges } from '../components/common/ProjectBadges';
import { SubtaskList } from '../components/todos/SubtaskList';
import { useViewPreferences } from '../hooks/useViewPreferences';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
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
  IconArchiveOff,
  IconUpload,
  IconList,
  IconColumns,
  IconTimeline
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { searchService } from '../services/searchService';
import { useTodosStore } from '../stores/todosStore';
import { documentsService } from '../services/documentsService';
import { KanbanBoard } from '../components/todos/KanbanBoard';
import { CalendarView } from '../components/todos/CalendarView';
import { TimelineView } from '../components/todos/TimelineView';
import { todosService, TodoSummary } from '../services/todosService';

type SortField = 'title' | 'created_at' | 'due_date' | 'priority';
type SortOrder = 'asc' | 'desc';

// Utility functions for todos
const getTodoIcon = (todo: any): string => {
  if (todo.status === 'done') return '✅';
  if (todo.status === 'blocked') return '🚫';
  if (todo.status === 'in_progress') return '🔄';
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
    return formatDate(dueDate);
  } catch (error) {
    console.warn('Invalid due date format:', dueDate, error);
    return 'Invalid date';
  }
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
  const { updatePreference } = useViewPreferences();
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'calendar' | 'timeline'>('list');
  const [todoModalOpen, setTodoModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectUploadModalOpen, setProjectUploadModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<any>(null);
  const itemsPerPage = 20;

  // Form state
  const [todoForm, setTodoForm] = useState({
    title: '',
    description: '',
    project_id: null as string | null,
    projectIds: [] as string[],
    isExclusive: false,
    start_date: '',
    due_date: '',
    priority: 1,
    tags: [] as string[]
  });

  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);

  const [projectForm, setProjectForm] = useState({
    name: '',
    description: '',
    color: '#2196F3',
    tags: [] as string[]
  });

  // Project document upload state
  const [projectUploadFile, setProjectUploadFile] = useState<File | null>(null);
  const [projectUploadTags, setProjectUploadTags] = useState<string[]>([]);
  const [projectUploadTagSuggestions, setProjectUploadTagSuggestions] = useState<string[]>([]);
  const [projectUploadProgress, setProjectUploadProgress] = useState<number>(0);
  const [isProjectUploading, setIsProjectUploading] = useState<boolean>(false);
  const [selectedProjectIdForUpload, setSelectedProjectIdForUpload] = useState<string | null>(null);

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
    updateTodoWithSubtasks,
    clearError
  } = useTodosStore();

  // Keyboard shortcuts: favorites/archive toggles, focus search, refresh
  useKeyboardShortcuts({
    shortcuts: [
      { key: '/', action: () => {
          const input = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement | null;
          input?.focus();
        }, description: 'Focus search', category: 'Navigation' },
      { key: 'r', action: () => { loadTodos(); loadProjects(); loadStats(); }, description: 'Refresh todos', category: 'General' },
      { key: '?', ctrl: true, action: () => { /* help handled by hook notification if enabled elsewhere */ }, description: 'Show shortcuts', category: 'Help' },
    ],
    enabled: true,
    showNotifications: false,
  });

  // Load data on mount - wait for authentication
  useAuthenticatedEffect(() => {
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
      projectIds: [],
      isExclusive: false,
      start_date: '',
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
      color: '#2196F3',
      tags: []
    });
  };

  const handleCreateTodo = async () => {
    const success = await createTodo({
      ...todoForm,
      due_date: todoForm.due_date || undefined,
      tags: todoForm.tags,
      // Force legacy single project_id to be omitted; use projectIds (UUIDs) only
      project_id: undefined,
      projectIds: todoForm.projectIds.length > 0 ? todoForm.projectIds : undefined,
      isExclusiveMode: todoForm.projectIds.length > 0 ? todoForm.isExclusive : undefined
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

  const handleCompleteTodo = async (uuid: string) => {
    await completeTodo(uuid);
  };

  const handleDeleteTodo = (uuid: string, title: string) => {
    modals.openConfirmModal({
      title: 'Delete Todo',
      children: (
        <Text size="sm">Are you sure you want to delete "{title}"? This action cannot be undone.</Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const success = await deleteTodo(uuid);
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
      blocked: 'orange',
      done: 'green',
      cancelled: 'red'
    };
    const strStatus = String(status);
    return colors[strStatus as keyof typeof colors] || 'gray';
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid date';
      return date.toLocaleDateString();
    } catch (error) {
      console.warn('Invalid date format:', dateString, error);
      return 'Invalid date';
    }
  };

  const isOverdue = (dueDate: string) => {
    if (!dueDate) return false;
    
    try {
      const date = new Date(dueDate);
      if (isNaN(date.getTime())) return false;
      return date < new Date();
    } catch (error) {
      console.warn('Invalid due date format:', dueDate, error);
      return false;
    }
  };

  // Add view switching buttons after the filters section
  const renderViewSwitcher = () => (
    <Group mb="md">
      <Text size="sm" fw={500}>View:</Text>
      <Button.Group>
        <Button
          variant={viewMode === 'list' ? 'filled' : 'outline'}
          size="xs"
          leftSection={<IconList size={16} />}
          onClick={() => setViewMode('list')}
        >
          List
        </Button>
        <Button
          variant={viewMode === 'kanban' ? 'filled' : 'outline'}
          size="xs"
                          leftSection={<IconColumns size={16} />}
          onClick={() => setViewMode('kanban')}
        >
          Kanban
        </Button>
        <Button
          variant={viewMode === 'calendar' ? 'filled' : 'outline'}
          size="xs"
          leftSection={<IconCalendar size={16} />}
          onClick={() => setViewMode('calendar')}
        >
          Calendar
        </Button>
        <Button
          variant={viewMode === 'timeline' ? 'filled' : 'outline'}
          size="xs"
          leftSection={<IconTimeline size={16} />}
          onClick={() => setViewMode('timeline')}
        >
          Timeline
        </Button>
      </Button.Group>
    </Group>
  );

  // Replace the main content area with view switching
  const renderMainContent = () => {
    switch (viewMode) {
      case 'kanban':
        return (
          <KanbanBoard
            todos={paginatedTodos as any}
            onTodoUpdate={(todo) => handleCompleteTodo((todo as any).uuid)}
            onTodoDelete={(todoUuid: string) => {
              const t = paginatedTodos.find(x => (x as any).uuid === todoUuid);
              if (t) handleDeleteTodo(todoUuid, t.title);
            }}
            onTodoArchive={(todoUuid: string) => {
              const t = paginatedTodos.find(x => (x as any).uuid === todoUuid);
              if (t) (t as any).is_archived ? unarchiveTodo(todoUuid) : archiveTodo(todoUuid);
            }}
            onTodoEdit={() => {
              setEditingTodo(null); // Clear editing todo for new modal
              setTodoForm({
                title: '',
                description: '',
                project_id: null,
                projectIds: [],
                isExclusive: false,
                start_date: '',
                due_date: '',
                priority: 1,
                tags: []
              });
              setTodoModalOpen(true);
            }}
          />
        );
      
      case 'calendar':
        return (
          <CalendarView
            todos={paginatedTodos as any}
            onTodoEdit={(todo) => {
              setEditingTodo(todo as any); // Cast to any since editingTodo expects Todo but we have TodoSummary
              setTodoForm({
                title: todo.title,
                description: (todo as any).description || '',
                project_id: (todo as any).project_id || null,
                projectIds: (todo as any).projects?.map((p: any) => p.uuid) || [],
                isExclusive: (todo as any).isExclusiveMode ?? (todo as any).is_exclusive_mode ?? false,
                start_date: todo.start_date || '',
                due_date: todo.due_date || '',
                priority: todo.priority,
                tags: todo.tags || []
              });
              setTodoModalOpen(true);
            }}
            onTodoDelete={(todoUuid: string, title: string) => {
              const t = paginatedTodos.find(x => x.uuid === todoUuid);
              if (t) handleDeleteTodo((t as any).uuid, title);
            }}
            onTodoArchive={(todoUuid: string) => {
              const t = paginatedTodos.find(x => x.uuid === todoUuid);
              if (t) (t as any).is_archived ? unarchiveTodo((t as any).uuid) : archiveTodo((t as any).uuid);
            }}
          />
        );

      case 'timeline':
        return (
          <TimelineView
            todos={paginatedTodos as any}
            onTodoEdit={(todo) => {
              setEditingTodo(todo as any);
              setTodoForm({
                title: todo.title,
                description: (todo as any).description || '',
                project_id: (todo as any).project_id || null,
                projectIds: (todo as any).projects?.map((p: any) => p.uuid) || [],
                isExclusive: (todo as any).isExclusiveMode ?? (todo as any).is_exclusive_mode ?? false,
                start_date: todo.start_date || '',
                due_date: todo.due_date || '',
                priority: todo.priority,
                tags: todo.tags || []
              });
              setTodoModalOpen(true);
            }}
            onTodoDelete={(todoUuid: string, title: string) => {
              const t = paginatedTodos.find(x => x.uuid === todoUuid);
              if (t) handleDeleteTodo((t as any).uuid, title);
            }}
            onTodoArchive={(todoUuid: string) => {
              const t = paginatedTodos.find(x => x.uuid === todoUuid);
              if (t) (t as any).is_archived ? unarchiveTodo((t as any).uuid) : archiveTodo((t as any).uuid);
            }}
          />
        );

      case 'list':
      default:
        return (
          <ViewModeLayouts
            items={paginatedTodos.map(todo => ({...todo, id: todo.uuid})) as any[]}
            viewMode={viewMode as any}
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
                description: todo.description || '',
                project_id: todo.project_id,
                projectIds: todo.projects?.map((p: any) => p.uuid) || [],
                isExclusive: todo.isExclusiveMode ?? todo.is_exclusive_mode ?? false,
                start_date: todo.start_date || '',
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
              <Stack gap="xs">
                <Group justify="space-between">
                  <Group gap="md">
                  <Checkbox
                    checked={todo.status === 'done'}
                    onChange={() => handleCompleteTodo((todo as any).uuid)}
                    disabled={todo.status === 'done'}
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
                          textDecoration: todo.status === 'done' ? 'line-through' : 'none',
                          opacity: todo.status === 'done' ? 0.6 : 1
                        }}
                        onClick={() => {
                          setEditingTodo(todo);
                          setTodoForm({
                            title: todo.title,
                            description: '',
                            project_id: todo.project_id,
                            projectIds: [],
                            isExclusive: false,
                            start_date: '',
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
                      <ProjectBadges projects={todo.projects || []} size="xs" maxVisible={2} />
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
                           projectIds: [],
                           isExclusive: false,
                           start_date: '',
                           due_date: todo.due_date || '',
                           priority: todo.priority,
                           tags: todo.tags || []
                         });
                        setTodoModalOpen(true);
                      }}
                    >
                      Edit
                    </Menu.Item>
                    <Menu.Item 
                      leftSection={<IconPlus size={14} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddSubtask(todo.uuid);
                      }}
                    >
                      Add Subtask
                    </Menu.Item>
                    {todo.status !== 'done' && (
                      <Menu.Item 
                        leftSection={<IconCheck size={14} />}
                    onClick={(e) => {
                          e.stopPropagation();
                        handleCompleteTodo(todo.uuid);
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
                        todo.is_archived ? unarchiveTodo(todo.uuid) : archiveTodo(todo.uuid);
                      }}
                    >
                      {todo.is_archived ? 'Unarchive' : 'Archive'}
                    </Menu.Item>
                    <Menu.Item 
                      leftSection={<IconTrash size={14} />}
                      color="red"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTodo(todo.uuid, todo.title);
                      }}
                    >
                      Delete
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
              
              {/* Subtask List */}
              <SubtaskList
                parentTodo={todo}
                onSubtaskComplete={handleSubtaskComplete}
                onSubtaskEdit={handleSubtaskEdit}
                onSubtaskDelete={handleSubtaskDelete}
                onAddSubtask={() => handleAddSubtask(todo.uuid)}
              />
            </Stack>
            )}
            renderDetailColumns={(todo: any) => [
              <Group key="title" gap="xs">
                <Checkbox
                  checked={todo.status === 'done'}
                  onChange={() => handleCompleteTodo(todo.uuid)}
                  disabled={todo.status === 'done'}
                  size="sm"
                />
                <Text size="sm">{getTodoIcon(todo)}</Text>
                <Text 
                  fw={500} 
                  size="sm" 
                  style={{ 
                    cursor: 'pointer', 
                    color: '#228be6',
                    textDecoration: todo.status === 'done' ? 'line-through' : 'none',
                    opacity: todo.status === 'done' ? 0.6 : 1
                  }}
                  onClick={() => {
                    setEditingTodo(todo);
                     setTodoForm({
                       title: todo.title,
                       description: '',
                       project_id: todo.project_id,
                       projectIds: todo.projects?.map((p: any) => p.uuid) || [],
                       isExclusive: todo.isExclusiveMode ?? todo.is_exclusive_mode ?? false,
                       start_date: '',
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
                <ProjectBadges projects={todo.projects || []} size="xs" maxVisible={3} />
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
                        projectIds: todo.projects?.map((p: any) => p.uuid) || [],
                        isExclusive: todo.isExclusiveMode ?? todo.is_exclusive_mode ?? false,
                        start_date: '',
                        due_date: todo.due_date || '',
                        priority: todo.priority,
                        tags: todo.tags || []
                      });
                      setTodoModalOpen(true);
                    }}
                  >
                    Edit
                  </Menu.Item>
                  {todo.status !== 'done' && (
                    <Menu.Item 
                      leftSection={<IconCheck size={14} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCompleteTodo((todo as any).uuid);
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
                        (todo as any).is_archived ? unarchiveTodo((todo as any).uuid) : archiveTodo((todo as any).uuid);
                    }}
                  >
                    {todo.is_archived ? 'Unarchive' : 'Archive'}
                  </Menu.Item>
                  <Menu.Item 
                    leftSection={<IconTrash size={14} />}
                    color="red"
                    onClick={(e) => {
                      e.stopPropagation();
                        handleDeleteTodo((todo as any).uuid, todo.title);
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
        );
    }
  };

  // Subtask management functions
  const handleSubtaskComplete = async (subtaskUuid: string, isCompleted: boolean) => {
    try {
      const parentTodo = todos.find(todo => todo.subtasks?.some(st => (st as any).uuid === subtaskUuid));
      if (!parentTodo) return;

      const subtask = parentTodo.subtasks?.find(st => (st as any).uuid === subtaskUuid);
      if (!subtask) return;

      const updatedSubtask = await todosService.updateTodo(subtaskUuid, {
        ...subtask,
        status: isCompleted ? 'done' : 'pending'
      });

      if (updatedSubtask) {
        updateTodoWithSubtasks(parentTodo.uuid, (todo) => {
          if (todo.subtasks) {
            const updatedSubtasks = todo.subtasks.map(st => 
              (st as any).uuid === subtaskUuid ? { ...st, status: isCompleted ? 'done' : 'pending' } : st
            );
            return { ...todo, subtasks: updatedSubtasks };
          }
          return todo;
        });
      }
    } catch (error) {
      console.error('Failed to update subtask:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to update subtask',
        color: 'red'
      });
    }
  };

  const handleSubtaskDelete = async (subtaskUuid: string) => {
    try {
      const parent = todos.find(t => t.subtasks?.some(st => (st as any).uuid === subtaskUuid));
      const st = parent?.subtasks?.find(st => (st as any).uuid === subtaskUuid) as any;
      if (!st) return;
      await todosService.deleteTodo(subtaskUuid);
      
      // Find the parent todo and update it
      const parentTodo = todos.find(todo => todo.subtasks?.some(st => (st as any).uuid === subtaskUuid));
      if (parentTodo) {
        updateTodoWithSubtasks(parentTodo.uuid, (todo) => {
          if (todo.subtasks) {
            const updatedSubtasks = todo.subtasks.filter(st => (st as any).uuid !== subtaskUuid);
            return { ...todo, subtasks: updatedSubtasks };
          }
          return todo;
        });
      }
      
      notifications.show({
        title: 'Success',
        message: 'Subtask deleted successfully',
        color: 'green'
      });
    } catch (error) {
      console.error('Failed to delete subtask:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete subtask',
        color: 'red'
      });
    }
  };

  const handleSubtaskEdit = (subtask: TodoSummary) => {
    setEditingTodo(subtask as any);
    // Hydrate form with subtask data
    setTodoForm({
      title: subtask.title,
      description: (subtask as any).description || '',
      project_id: (subtask as any).project_id,
      projectIds: (subtask as any).projects?.map((p: any) => p.uuid) || [],
      isExclusive: (subtask as any).isExclusiveMode ?? (subtask as any).is_exclusive_mode ?? false,
      start_date: (subtask as any).start_date || '',
      due_date: (subtask as any).due_date || '',
      priority: subtask.priority,
      tags: subtask.tags || []
    });
    setTodoModalOpen(true);
  };

  const handleAddSubtask = (parentId: string) => {
    setEditingTodo({
      id: 0,
      title: '',
      description: '',
      status: 'pending',
      priority: 'medium',
      parent_id: parentId, // Set parent ID for new subtask
      is_completed: false,
      is_archived: false,
      is_favorite: false,
      is_exclusive_mode: false,
      order_index: 0,
      tags: [],
      projects: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as any);
    setTodoModalOpen(true);
  };

  return (
    <Container size="xl" py="xl">
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
                  { value: 'blocked', label: 'Blocked', count: stats?.blocked || 0 },
                  { value: 'done', label: 'Done', count: stats?.done || 0 },
                  { value: 'cancelled', label: 'Cancelled', count: stats?.cancelled || 0 }
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
                    key={project.uuid}
                    variant={currentProjectId === project.uuid ? 'filled' : 'subtle'}
                    size="xs"
                    justify="space-between"
                    fullWidth
                    onClick={() => setProjectFilter(project.uuid)}
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
                    <Badge size="xs" variant="light">
                      {project.todo_count ?? 0}
                    </Badge>
                  </Button>
                ))}

                <Button
                  leftSection={<IconUpload size={14} />}
                  size="xs"
                  variant="light"
              onClick={() => { setSelectedProjectIdForUpload(currentProjectId ? String(currentProjectId) : null); setProjectUploadModalOpen(true); }}
                  disabled={!currentProjectId}
                  fullWidth
                >
                  Upload Doc to Project
                </Button>
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
                  currentView={viewMode as any}
                  onChange={(mode: any) => {
                    setViewMode(mode as any);
                    updatePreference('todos', mode as any);
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

            {/* Add view switcher after filters */}
            {renderViewSwitcher()}
            
            {/* Render main content based on view mode */}
            {renderMainContent()}

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
                ...(projects || []).map(p => ({ value: p.uuid, label: p.name }))
              ]}
              value={todoForm.project_id || ''}
              onChange={(value) => setTodoForm({ 
                ...todoForm, 
                project_id: value ? value : null 
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
          
          <MultiProjectSelector
            value={todoForm.projectIds}
            onChange={(projectIds) => setTodoForm({ ...todoForm, projectIds })}
            isExclusive={todoForm.isExclusive}
            onExclusiveChange={(isExclusive) => setTodoForm({ ...todoForm, isExclusive })}
            description="Link this task to one or more projects"
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
          
          <TagsInput
            label="Tags"
            placeholder="Type to search and add tags"
            value={projectForm.tags}
            onChange={(tags) => setProjectForm({ ...projectForm, tags })}
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

      {/* Project Document Upload Modal */}
      <Modal
        opened={projectUploadModalOpen}
        onClose={() => {
          setProjectUploadModalOpen(false);
          setProjectUploadFile(null);
          setProjectUploadTags([]);
          setProjectUploadProgress(0);
          setSelectedProjectIdForUpload(null);
        }}
        title="Upload Document to Project"
        size="md"
      >
        <Stack gap="md">
            <Select
            label="Project"
            placeholder="Select project"
              data={[...(projects || []).map(p => ({ value: p.uuid, label: p.name }))]}
              value={selectedProjectIdForUpload ? selectedProjectIdForUpload : ''}
              onChange={(value) => setSelectedProjectIdForUpload(value ? value : null)}
            required
          />
          <FileInput
            label="Select File"
            placeholder={selectedProjectIdForUpload ? 'Choose a file to upload' : 'Select a project first'}
            value={projectUploadFile}
            onChange={setProjectUploadFile}
            accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.gif,.webp"
            disabled={!selectedProjectIdForUpload}
          />
          <TagsInput
            label="Tags"
            placeholder="Type to add tags"
            value={projectUploadTags}
            onChange={setProjectUploadTags}
            data={projectUploadTagSuggestions}
            clearable
            onSearchChange={async (q) => {
              if (!q) { setProjectUploadTagSuggestions([]); return; }
              try {
                const tags = await searchService.getTagAutocomplete(q, 'document');
                setProjectUploadTagSuggestions(tags.map((t: any) => t.name));
              } catch {
                setProjectUploadTagSuggestions([]);
              }
            }}
            splitChars={[',', ' ']}
          />
          {isProjectUploading && (
            <Progress value={projectUploadProgress} />
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setProjectUploadModalOpen(false)} disabled={isProjectUploading}>
              Cancel
            </Button>
            <Button
              leftSection={<IconUpload size={16} />}
              onClick={async () => {
                if (!selectedProjectIdForUpload || !projectUploadFile) return;
                setIsProjectUploading(true);
                try {
                  await documentsService.uploadDocument(
                    projectUploadFile,
                    projectUploadTags,
                    (p) => setProjectUploadProgress(p),
                    [selectedProjectIdForUpload],
                    true
                  );
                  setProjectUploadModalOpen(false);
                  setProjectUploadFile(null);
                  setProjectUploadTags([]);
                  setProjectUploadProgress(0);
                  notifications.show({ title: 'Uploaded', message: 'Document uploaded to project', color: 'green' });
                } catch (e: any) {
                  notifications.show({ title: 'Upload failed', message: e?.message || 'Could not upload', color: 'red' });
                } finally {
                  setIsProjectUploading(false);
                }
              }}
              disabled={!selectedProjectIdForUpload || !projectUploadFile}
              loading={isProjectUploading}
            >
              Upload
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
} 