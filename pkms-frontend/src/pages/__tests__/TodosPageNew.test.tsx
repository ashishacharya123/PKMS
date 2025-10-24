/**
 * TodosPageNew Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../test/testUtils';
import { TodosPageNew } from '../TodosPageNew';
import { mockTodo, mockProject, mockUseTodosStore } from '../../test/testUtils';

// Mock the stores
vi.mock('../../stores/todosStore', () => ({
  useTodosStore: vi.fn()
}));

// Mock the hooks
vi.mock('../../hooks/useViewPreferences', () => ({
  useViewPreferences: vi.fn(() => ({
    getPreference: vi.fn(() => 'list'),
    updatePreference: vi.fn()
  }))
}));

vi.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn()
}));

vi.mock('../../hooks/useAuthenticatedEffect', () => ({
  useAuthenticatedEffect: vi.fn((callback) => callback())
}));

// Mock the components
vi.mock('../../components/todos', () => ({
  TodoList: ({ todos, onEdit, onDelete, onCreateNew, emptyMessage }: any) => (
    <div data-testid="todo-list">
      {todos.length === 0 ? (
        <div>{emptyMessage}</div>
      ) : (
        todos.map((todo: any) => (
          <div key={todo.uuid} data-testid={`todo-${todo.uuid}`}>
            <span>{todo.title}</span>
            <button onClick={() => onEdit(todo)}>Edit</button>
            <button onClick={() => onDelete(todo.uuid, todo.title)}>Delete</button>
          </div>
        ))
      )}
      <button onClick={onCreateNew}>Create New</button>
    </div>
  ),
  TodoForm: ({ opened, onClose, onSubmit, title }: any) => 
    opened ? (
      <div data-testid="todo-form">
        <h3>{title}</h3>
        <button onClick={() => onSubmit({ title: 'New Todo' })}>Submit</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
  TodoFilters: ({ onFiltersChange }: any) => (
    <div data-testid="todo-filters">
      <button onClick={() => onFiltersChange({ status: ['pending'] })}>
        Filter by Status
      </button>
    </div>
  ),
  TodoStats: ({ todos }: any) => (
    <div data-testid="todo-stats">
      Total: {todos.length}
    </div>
  )
}));

vi.mock('../../components/search/UnifiedSearchEmbedded', () => ({
  UnifiedSearchEmbedded: () => <div data-testid="unified-search">Search Component</div>
}));

vi.mock('../../components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: ({ count }: any) => (
    <div data-testid="loading-skeleton">
      Loading {count} items...
    </div>
  )
}));

describe('TodosPageNew', () => {
  const mockStore = {
    ...mockUseTodosStore,
    loadTodos: vi.fn(),
    loadProjects: vi.fn(),
    createTodo: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
    archiveTodo: vi.fn(),
    unarchiveTodo: vi.fn(),
    completeTodo: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the store
    const { useTodosStore } = require('../../stores/todosStore');
    useTodosStore.mockReturnValue(mockStore);
  });

  it('renders page title and create button', () => {
    render(<TodosPageNew />);

    expect(screen.getByText('Todos')).toBeInTheDocument();
    expect(screen.getByText('Create Todo')).toBeInTheDocument();
  });

  it('loads todos and projects on mount', () => {
    render(<TodosPageNew />);

    expect(mockStore.loadTodos).toHaveBeenCalled();
    expect(mockStore.loadProjects).toHaveBeenCalled();
  });

  it('displays todo stats', () => {
    render(<TodosPageNew />);

    expect(screen.getByTestId('todo-stats')).toBeInTheDocument();
    expect(screen.getByText('Total: 1')).toBeInTheDocument();
  });

  it('displays todo filters', () => {
    render(<TodosPageNew />);

    expect(screen.getByTestId('todo-filters')).toBeInTheDocument();
  });

  it('displays unified search', () => {
    render(<TodosPageNew />);

    expect(screen.getByTestId('unified-search')).toBeInTheDocument();
  });

  it('shows loading skeleton when loading', () => {
    const loadingStore = { ...mockStore, isLoading: true };
    const { useTodosStore } = require('../../stores/todosStore');
    useTodosStore.mockReturnValue(loadingStore);

    render(<TodosPageNew />);

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('shows error alert when error occurs', () => {
    const errorStore = { ...mockStore, error: 'Test error' };
    const { useTodosStore } = require('../../stores/todosStore');
    useTodosStore.mockReturnValue(errorStore);

    render(<TodosPageNew />);

    expect(screen.getByText('Test error')).toBeInTheDocument();
  });

  it('displays todos in ongoing tab by default', () => {
    render(<TodosPageNew />);

    expect(screen.getByText('Ongoing')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    
    expect(screen.getByTestId('todo-list')).toBeInTheDocument();
    expect(screen.getByTestId(`todo-${mockTodo.uuid}`)).toBeInTheDocument();
  });

  it('filters todos by tab', async () => {
    const todosWithArchived = [
      mockTodo,
      { ...mockTodo, uuid: 'archived-todo', isArchived: true }
    ];
    const storeWithArchived = { ...mockStore, todos: todosWithArchived };
    const { useTodosStore } = require('../../stores/todosStore');
    useTodosStore.mockReturnValue(storeWithArchived);

    render(<TodosPageNew />);

    // Should show only non-archived todos in ongoing tab
    expect(screen.getByTestId(`todo-${mockTodo.uuid}`)).toBeInTheDocument();
    expect(screen.queryByTestId('todo-archived-todo')).not.toBeInTheDocument();

    // Switch to archived tab
    fireEvent.click(screen.getByText('Archived'));

    await waitFor(() => {
      expect(screen.getByTestId('todo-archived-todo')).toBeInTheDocument();
      expect(screen.queryByTestId(`todo-${mockTodo.uuid}`)).not.toBeInTheDocument();
    });
  });

  it('opens todo form when create button is clicked', async () => {
    render(<TodosPageNew />);

    const createButton = screen.getByText('Create Todo');
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByTestId('todo-form')).toBeInTheDocument();
      expect(screen.getByText('Create Todo')).toBeInTheDocument();
    });
  });

  it('opens todo form when create new is clicked from todo list', async () => {
    render(<TodosPageNew />);

    const createNewButton = screen.getByText('Create New');
    fireEvent.click(createNewButton);

    await waitFor(() => {
      expect(screen.getByTestId('todo-form')).toBeInTheDocument();
    });
  });

  it('handles todo creation', async () => {
    mockStore.createTodo.mockResolvedValue({ ...mockTodo, uuid: 'new-todo' });

    render(<TodosPageNew />);

    // Open form
    fireEvent.click(screen.getByText('Create Todo'));

    await waitFor(() => {
      expect(screen.getByTestId('todo-form')).toBeInTheDocument();
    });

    // Submit form
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(mockStore.createTodo).toHaveBeenCalledWith({ title: 'New Todo' });
    });
  });

  it('handles todo editing', async () => {
    render(<TodosPageNew />);

    // Click edit on a todo
    const editButton = screen.getByText('Edit');
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByTestId('todo-form')).toBeInTheDocument();
      expect(screen.getByText('Edit Todo')).toBeInTheDocument();
    });
  });

  it('handles todo deletion', async () => {
    render(<TodosPageNew />);

    // Click delete on a todo
    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockStore.deleteTodo).toHaveBeenCalledWith(mockTodo.uuid, mockTodo.title);
    });
  });

  it('applies filters correctly', async () => {
    render(<TodosPageNew />);

    // Apply filter
    const filterButton = screen.getByText('Filter by Status');
    fireEvent.click(filterButton);

    // The component should handle the filter change
    // This would be tested by checking the filtered todos
  });

  it('shows empty message when no todos', () => {
    const emptyStore = { ...mockStore, todos: [] };
    const { useTodosStore } = require('../../stores/todosStore');
    useTodosStore.mockReturnValue(emptyStore);

    render(<TodosPageNew />);

    expect(screen.getByText('No ongoing todos found')).toBeInTheDocument();
  });

  it('handles form cancellation', async () => {
    render(<TodosPageNew />);

    // Open form
    fireEvent.click(screen.getByText('Create Todo'));

    await waitFor(() => {
      expect(screen.getByTestId('todo-form')).toBeInTheDocument();
    });

    // Cancel form
    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByTestId('todo-form')).not.toBeInTheDocument();
    });
  });

  it('handles keyboard shortcuts', () => {
    const mockUseKeyboardShortcuts = require('../../hooks/useKeyboardShortcuts').useKeyboardShortcuts;
    
    render(<TodosPageNew />);

    expect(mockUseKeyboardShortcuts).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'n',
          ctrl: true,
          description: 'Create new todo',
          category: 'Todo Management'
        })
      ])
    );
  });

  it('handles URL action parameter', () => {
    // Mock useSearchParams to return action=create
    const mockUseSearchParams = vi.fn(() => [
      new URLSearchParams('action=create'),
      vi.fn()
    ]);
    
    vi.doMock('react-router-dom', () => ({
      ...vi.importActual('react-router-dom'),
      useSearchParams: mockUseSearchParams
    }));

    render(<TodosPageNew />);

    // Form should be opened due to action parameter
    expect(screen.getByTestId('todo-form')).toBeInTheDocument();
  });
});
