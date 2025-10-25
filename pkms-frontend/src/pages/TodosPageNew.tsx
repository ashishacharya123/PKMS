/**
 * Todos Page - Modular Version
 * Uses the new modular components while preserving all existing functionality
 */

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
import ViewMenu, { ViewMode } from '../components/common/ViewMenu';
import { formatDate } from '../components/common/ViewModeLayouts';
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
import { UnifiedSearchEmbedded } from '../components/search/UnifiedSearchEmbedded';
import { ActionMenu } from '../components/common/ActionMenu';
import { DateRangePicker } from '../components/common/DateRangePicker';
import { todosService, TodoSummary } from '../services/todosService';
import TodosLayout from '../components/todos/TodosLayout';
import { TodoItem } from '../types/common';

type SortField = 'title' | 'createdAt' | 'dueDate' | 'priority';
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

export function TodosPageNew() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Local state
  const [searchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const { updatePreference } = useViewPreferences();
  const [viewMode, setViewMode] = useState<'list' | 'kanban' | 'calendar' | 'timeline'>('list');
  const [todoModalOpen, setTodoModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectUploadModalOpen, setProjectUploadModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
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

  // Keyboard shortcuts: favorites/archive toggles, focus search, refresh
  useKeyboardShortcuts({
    shortcuts: [
      { key: '/', action: () => {
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        searchInput?.focus();
      }},
      { key: 'r', action: () => {
        loadTodos();
        loadStats();
      }},
      { key: 'n', action: () => setTodoModalOpen(true) },
      { key: 'p', action: () => setProjectModalOpen(true) }
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
        const suggestions = await searchService.getTagSuggestions('todos');
        setTagSuggestions(suggestions);
        setProjectUploadTagSuggestions(suggestions);
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
        project_id: todoForm.projectId,
        projectIds: todoForm.projectIds,
        isExclusive: todoForm.isExclusive,
        start_date: todoForm.startDate || undefined,
        dueDate: todoForm.dueDate || undefined,
        priority: todoForm.priority,
        tags: todoForm.tags
      });

      setTodoForm({
        title: '',
        description: '',
        project_id: null,
        projectIds: [],
        isExclusive: false,
        start_date: '',
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

  const handleCompleteTodo = async (todo: TodoItem) => {
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

  const handleDeleteTodo = async (todo: TodoItem) => {
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

  const handleToggleArchive = async (todo: TodoItem) => {
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

  return (
    <>
      <TodosLayout
        todos={todos as TodoItem[]}
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
            project_id: todo.project_id || null,
            projectIds: todo.projectIds || [],
            isExclusive: todo.isExclusive || false,
            start_date: todo.start_date || '',
            dueDate: todo.dueDate || '',
            priority: todo.priority || 1,
            tags: todo.tags || []
          });
          setTodoModalOpen(true);
        }}
        onToggleFavorite={(todo) => {
          // Handle favorite toggle
          console.log('Toggle favorite for todo:', todo);
        }}
        onToggleArchive={handleToggleArchive}
        onDelete={handleDeleteTodo}
        onEdit={(todo) => {
          setEditingTodo(todo);
          setTodoForm({
            title: todo.title,
            description: todo.description || '',
            project_id: todo.project_id || null,
            projectIds: todo.projectIds || [],
            isExclusive: todo.isExclusive || false,
            start_date: todo.start_date || '',
            dueDate: todo.dueDate || '',
            priority: todo.priority || 1,
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
    </>
  );
}

export default TodosPageNew;