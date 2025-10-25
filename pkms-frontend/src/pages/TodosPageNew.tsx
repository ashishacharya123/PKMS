/**
 * Todos Page - Modular Version
 * Uses the new modular components while preserving all existing functionality
 */

import { useEffect, useState, useMemo } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { useSearchParams } from 'react-router-dom';
import {
  Text,
  Group,
  Stack,
  Button,
  TextInput,
  TagsInput,
  Badge,
  Paper,
  Modal,
  Textarea,
  Select,
  NumberInput,
  ThemeIcon
} from '@mantine/core';
import ViewMenu, { ViewMode } from '../components/common/ViewMenu';
import { formatDate } from '../components/common/ViewModeLayouts';
import { useViewPreferences } from '../hooks/useViewPreferences';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import {
  IconFilter
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { searchService } from '../services/searchService';
import { useTodosStore } from '../stores/todosStore';
import { todosService, TodoSummary } from '../services/todosService';
import { DuplicationModal } from '../components/common/DuplicationModal';
import { duplicationService, TodoDuplicateRequest } from '../services/duplicationService';
import TodosLayout from '../components/todos/TodosLayout';
import { Todo } from '../types/todo';
import { ModuleFilters, getModuleFilterConfig } from '../components/common/ModuleFilters';

// Note: SortField/SortOrder types removed - now handled by modular ModuleFilters

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

export function TodosPageNew() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Local state
  const [searchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  // Note: sortField/sortOrder removed - now handled by modular filters
  
  // Filter state using modular component
  const [filters, setFilters] = useState({
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
    favorites: false,
    showArchived: false
  });
  const [filtersOpened, setFiltersOpened] = useState(false);
  const filterConfig = getModuleFilterConfig('todos');
  const [currentPage, setCurrentPage] = useState(1);
  const { updatePreference } = useViewPreferences();
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'calendar' | 'timeline'>('list');
  const [todoModalOpen, setTodoModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectUploadModalOpen, setProjectUploadModalOpen] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  const [activeTab, setActiveTab] = useState<'ongoing' | 'completed' | 'archived'>('ongoing');
  const itemsPerPage = 20;

  // Form state
  const [todoForm, setTodoForm] = useState({
    title: '',
    description: '',
    projectId: null as string | null,
    projectIds: [] as string[],
    isExclusive: false,
    startDate: '',
    dueDate: '',
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
    loadTodos,
    loadProjects,
    loadStats,
    createTodo,
    completeTodo,
    deleteTodo,
    createProject,
    archiveTodo,
    unarchiveTodo,
    setStatus,
    setProjectFilter,
    setSearch,
    setShowOverdue,
    setArchivedFilter,
    updateTodoWithSubtasks,
    clearError
  } = useTodosStore();

  // Sort todos based on modular filters (client-side sorting for user-initiated sorting)
  const sortedTodos = useMemo(() => {
    if (!todos || todos.length === 0) return todos;

    return [...todos].sort((a, b) => {
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
  }, [todos, filters.sortBy, filters.sortOrder]);

  // Note: handleSort removed - now handled by modular ModuleFilters component

  // Keyboard shortcuts: favorites/archive toggles, focus search, refresh
  useKeyboardShortcuts({
    shortcuts: [
      { key: '/', action: () => {
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        searchInput?.focus();
      }, description: 'Focus search' },
      { key: 'r', action: () => {
        loadTodos();
        loadStats();
      }, description: 'Refresh todos' },
      { key: 'n', action: () => setTodoModalOpen(true), description: 'Create new todo' },
      { key: 'p', action: () => setProjectModalOpen(true), description: 'Create new project' }
    ]
  });

  useAuthenticatedEffect(() => {
    loadTodos();
    loadProjects();
    loadStats();
  }, []);

  // Load tag suggestions
  useEffect(() => {
    const loadTagSuggestions = async () => {
      try {
        const suggestions = await searchService.getPopularTags('todos');
        setTagSuggestions(suggestions.map(tag => typeof tag === 'string' ? tag : tag.name || ''));
        setProjectUploadTagSuggestions(suggestions.map(tag => typeof tag === 'string' ? tag : tag.name || ''));
      } catch (error) {
        console.error('Failed to load tag suggestions:', error);
      }
    };
    loadTagSuggestions();
  }, []);

  // Handle search
  useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch]);

  const handleCreateTodo = async () => {
    if (!todoForm.title.trim()) return;

    try {
      await createTodo({
        title: todoForm.title,
        description: todoForm.description,
        projectId: todoForm.projectId,
        projectIds: todoForm.projectIds,
        isExclusive: todoForm.isExclusive,
        startDate: todoForm.startDate || undefined,
        dueDate: todoForm.dueDate || undefined,
        priority: todoForm.priority,
        tags: todoForm.tags
      });

      setTodoForm({
        title: '',
        description: '',
        projectId: null,
        projectIds: [],
        isExclusive: false,
        startDate: '',
        dueDate: '',
        priority: 1,
        tags: []
      });
      setTodoModalOpen(false);
      
      notifications.show({
        title: 'Success',
        message: 'Todo created successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to create todo',
        color: 'red'
      });
    }
  };

  const handleCompleteTodo = async (todo: Todo) => {
    try {
      await completeTodo(todo.uuid);
      notifications.show({
        title: 'Success',
        message: 'Todo completed',
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

  const handleDeleteTodo = async (todo: Todo) => {
    modals.openConfirmModal({
      title: 'Delete Todo',
      children: (
        <Text size="sm">
          Are you sure you want to delete "{todo.title}"? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await deleteTodo(todo.uuid);
          notifications.show({
            title: 'Success',
            message: 'Todo deleted successfully',
            color: 'green'
          });
        } catch (error) {
          notifications.show({
            title: 'Error',
            message: 'Failed to delete todo',
            color: 'red'
          });
        }
      }
    });
  };

  const handleToggleArchive = async (todo: Todo) => {
    try {
      if (todo.isArchived) {
        await unarchiveTodo(todo.uuid);
        notifications.show({
          title: 'Success',
          message: 'Todo unarchived',
          color: 'green'
        });
      } else {
        await archiveTodo(todo.uuid);
        notifications.show({
          title: 'Success',
          message: 'Todo archived',
          color: 'green'
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update todo',
        color: 'red'
      });
    }
  };

  const handleRefresh = async () => {
    try {
      await loadTodos();
      await loadStats();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to refresh todos',
        color: 'red'
      });
    }
  };

  const handleAddSubtask = async (todoId: string, subtaskTitle: string) => {
    try {
      // This would need to be implemented in the todos service
      console.log('Adding subtask:', { todoId, subtaskTitle });
      notifications.show({
        title: 'Success',
        message: 'Subtask added',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to add subtask',
        color: 'red'
      });
    }
  };

  const handleToggleSubtask = async (todoId: string, subtaskId: string) => {
    try {
      // This would need to be implemented in the todos service
      console.log('Toggling subtask:', { todoId, subtaskId });
      notifications.show({
        title: 'Success',
        message: 'Subtask updated',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update subtask',
        color: 'red'
      });
    }
  };

  const handleDeleteSubtask = async (todoId: string, subtaskId: string) => {
    try {
      // This would need to be implemented in the todos service
      console.log('Deleting subtask:', { todoId, subtaskId });
      notifications.show({
        title: 'Success',
        message: 'Subtask deleted',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete subtask',
        color: 'red'
      });
    }
  };

  const handleEditSubtask = async (todoId: string, subtaskId: string, newTitle: string) => {
    try {
      // This would need to be implemented in the todos service
      console.log('Editing subtask:', { todoId, subtaskId, newTitle });
      notifications.show({
        title: 'Success',
        message: 'Subtask updated',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update subtask',
        color: 'red'
      });
    }
  };

  const handleDuplicateConfirm = async (data: any) => {
    if (!selectedTodo) return;
    
    setDuplicating(true);
    try {
      const request: TodoDuplicateRequest = {
        newTitle: data.newName
      };

      const response = await duplicationService.duplicateTodo(selectedTodo.uuid, request);
      
      if (response.success) {
        notifications.show({
          title: 'Todo Duplicated',
          message: `Created "${response.newTodoTitle}"`,
          color: 'green'
        });
        
        // Reload todos to show the new one
        await loadTodos();
      }
    } catch (error) {
      console.error('Failed to duplicate todo:', error);
      notifications.show({
        title: 'Duplication Failed',
        message: 'Failed to duplicate todo. Please try again.',
        color: 'red'
      });
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <>
      {/* Modular Filter Controls */}
      <Paper p="md" mb="md" style={{ backgroundColor: 'var(--mantine-color-dark-7)' }}>
        <Group justify="space-between" align="center">
          <Text size="sm" fw={500} c="dimmed">Filters & Sorting</Text>
          <Button
            variant="light"
            size="sm"
            leftSection={<IconFilter size={16} />}
            onClick={() => setFiltersOpened(true)}
          >
            Filters
          </Button>
        </Group>
      </Paper>

      <TodosLayout
        todos={sortedTodos as Todo[]}
        isLoading={isLoading}
        activeTab={activeTab}
        onCreateTodo={() => setTodoModalOpen(true)}
        onRefresh={handleRefresh}
        onTabChange={setActiveTab}
        viewMode={viewMode}
        ViewMenu={({ currentView, onChange, disabled }: any) => (
          <ViewMenu 
            currentView={currentView}
            onChange={(mode) => {
              setViewMode(mode);
              updatePreference('todos', mode);
              onChange?.(mode);
            }}
            disabled={disabled}
          />
        )}
        onItemClick={(todo) => {
          setEditingTodo(todo);
          setTodoForm({
            title: todo.title,
            description: todo.description || '',
            projectId: todo.projectId || todo.project_id || null,
            projectIds: todo.projectIds || [],
            isExclusive: todo.isExclusive || false,
            startDate: todo.startDate || todo.start_date || '',
            dueDate: todo.dueDate || '',
            priority: Number(todo.priority) || 1,
            tags: todo.tags || []
          });
          setTodoModalOpen(true);
        }}
        onToggleFavorite={(todo) => {
          // Handle favorite toggle
          console.log('Toggle favorite for todo:', todo);
        }}
        onToggleArchive={handleToggleArchive}
        onDuplicate={(todo) => {
          setSelectedTodo(todo);
          setDuplicateModalOpen(true);
        }}
        onDelete={handleDeleteTodo}
        onEdit={(todo) => {
          setEditingTodo(todo);
          setTodoForm({
            title: todo.title,
            description: todo.description || '',
            projectId: todo.projectId || todo.project_id || null,
            projectIds: todo.projectIds || [],
            isExclusive: todo.isExclusive || false,
            startDate: todo.startDate || todo.start_date || '',
            dueDate: todo.dueDate || '',
            priority: Number(todo.priority) || 1,
            tags: todo.tags || []
          });
          setTodoModalOpen(true);
        }}
        onComplete={handleCompleteTodo}
        onAddSubtask={handleAddSubtask}
        onToggleSubtask={handleToggleSubtask}
        onDeleteSubtask={handleDeleteSubtask}
        onEditSubtask={handleEditSubtask}
        renderIcon={(todo) => (
          <ThemeIcon size="lg" variant="light" color="blue">
            {getTodoIcon(todo)}
          </ThemeIcon>
        )}
        renderContent={(todo) => (
          <Stack gap="xs">
            <Text fw={500} size="sm">{todo.title}</Text>
            <Group gap="xs">
              <Badge size="xs" variant="light" color="blue">
                {todo.status}
              </Badge>
              <Badge size="xs" variant="light" color="orange">
                Priority {todo.priority}
              </Badge>
              {todo.dueDate && (
                <Badge size="xs" variant="light" color="red">
                  {formatDueDate(todo.dueDate)}
                </Badge>
              )}
            </Group>
          </Stack>
        )}
        projects={projects}
        onProjectSelect={setProjectFilter}
        selectedProjectId={currentProjectId}
      />

      {/* Create/Edit Todo Modal */}
      <Modal 
        opened={todoModalOpen} 
        onClose={() => setTodoModalOpen(false)} 
        title={editingTodo ? 'Edit Todo' : 'Create Todo'} 
        size="lg"
      >
        <Stack gap="md">
          <TextInput
            label="Title"
            placeholder="Enter todo title"
            value={todoForm.title}
            onChange={(e) => setTodoForm(prev => ({ ...prev, title: e.target.value }))}
            required
          />
          <Textarea
            label="Description"
            placeholder="Enter todo description"
            value={todoForm.description}
            onChange={(e) => setTodoForm(prev => ({ ...prev, description: e.target.value }))}
            rows={3}
          />
          <Group gap="md">
            <Select
              label="Priority"
              placeholder="Select priority"
              value={todoForm.priority.toString()}
              onChange={(value) => setTodoForm(prev => ({ ...prev, priority: parseInt(value || '1') }))}
              data={[
                { value: '1', label: 'Low' },
                { value: '2', label: 'Medium' },
                { value: '3', label: 'High' },
                { value: '4', label: 'Urgent' }
              ]}
              style={{ flex: 1 }}
            />
            <NumberInput
              label="Priority (1-4)"
              value={todoForm.priority}
              onChange={(value) => setTodoForm(prev => ({ ...prev, priority: value || 1 }))}
              min={1}
              max={4}
              style={{ flex: 1 }}
            />
          </Group>
          <Group gap="md">
            <TextInput
              label="Start Date"
              type="date"
              value={todoForm.startDate}
              onChange={(e) => setTodoForm(prev => ({ ...prev, startDate: e.target.value }))}
              style={{ flex: 1 }}
            />
            <TextInput
              label="Due Date"
              type="date"
              value={todoForm.dueDate}
              onChange={(e) => setTodoForm(prev => ({ ...prev, dueDate: e.target.value }))}
              style={{ flex: 1 }}
            />
          </Group>
          <TagsInput
            label="Tags"
            placeholder="Add tags"
            value={todoForm.tags}
            onChange={(value) => setTodoForm(prev => ({ ...prev, tags: value }))}
            data={tagSuggestions}
          />
          <Group justify="end" gap="sm">
            <Button variant="outline" onClick={() => setTodoModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTodo} disabled={!todoForm.title.trim()}>
              {editingTodo ? 'Update Todo' : 'Create Todo'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Modular Filter Modal */}
      <Modal 
        opened={filtersOpened} 
        onClose={() => setFiltersOpened(false)} 
        title="Todo Filters & Sorting" 
        size="lg"
      >
        <ModuleFilters
          filters={filters}
          onFiltersChange={(newFilters) => setFilters(newFilters as any)}
          activeFiltersCount={Object.values(filters).filter(v => Array.isArray(v) ? v.length > 0 : v !== false && v !== 'all' && v !== 'createdAt' && v !== 'desc').length}
          showFavorites={filterConfig.showFavorites}
          showMimeTypes={false}
          showDateRange={filterConfig.showDateRange}
          showArchived={filterConfig.showArchived}
          showSorting={filterConfig.showSorting}
          customFilters={filterConfig.customFilters}
          sortOptions={filterConfig.sortOptions}
        />
      </Modal>

      {/* Duplication Modal */}
      <DuplicationModal
        opened={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        onConfirm={handleDuplicateConfirm}
        type="todo"
        originalName={selectedTodo?.title || ''}
        loading={duplicating}
      />
    </>
  );
}

export default TodosPageNew;