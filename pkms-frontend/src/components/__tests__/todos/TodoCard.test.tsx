/**
 * TodoCard Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/testUtils';
import { TodoCard } from '../todos/TodoCard';
import { mockTodo, mockProject } from '../../../test/testUtils';
import { TodoStatus, TaskPriority } from '../../../types/todo';

// Mock the theme colors
vi.mock('../../../theme/colors', () => ({
  getStatusColor: vi.fn(() => 'blue')
}));

// Mock the ViewModeLayouts
vi.mock('../common/ViewModeLayouts', () => ({
  formatDate: vi.fn((date) => new Date(date).toLocaleDateString())
}));

describe('TodoCard', () => {
  const mockHandlers = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onComplete: vi.fn(),
    onAddSubtask: vi.fn(),
    onSubtaskUpdate: vi.fn(),
    onSubtaskDelete: vi.fn(),
    onSubtaskEdit: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders todo information correctly', () => {
    render(<TodoCard todo={mockTodo} {...mockHandlers} />);

    expect(screen.getByText('Test Todo')).toBeInTheDocument();
    expect(screen.getByText('Test todo description')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('displays priority badge with correct color', () => {
    const highPriorityTodo = { ...mockTodo, priority: TaskPriority.HIGH };
    render(<TodoCard todo={highPriorityTodo} {...mockHandlers} />);

    expect(screen.getByText('Priority: high')).toBeInTheDocument();
  });

  it('shows due date when present', () => {
    const todoWithDueDate = { 
      ...mockTodo, 
      dueDate: '2024-12-31' 
    };
    render(<TodoCard todo={todoWithDueDate} {...mockHandlers} />);

    expect(screen.getByText(/Due:/)).toBeInTheDocument();
  });

  it('shows overdue badge when due date is past', () => {
    const overdueTodo = { 
      ...mockTodo, 
      dueDate: '2020-01-01' 
    };
    render(<TodoCard todo={overdueTodo} {...mockHandlers} />);

    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('shows due soon badge when due date is within 3 days', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dueSoonTodo = { 
      ...mockTodo, 
      dueDate: tomorrow.toISOString().split('T')[0] 
    };
    render(<TodoCard todo={dueSoonTodo} {...mockHandlers} />);

    expect(screen.getByText('Due Soon')).toBeInTheDocument();
  });

  it('displays completion percentage when present', () => {
    const todoWithProgress = { 
      ...mockTodo, 
      completionPercentage: 75 
    };
    render(<TodoCard todo={todoWithProgress} {...mockHandlers} />);

    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('shows projects when present', () => {
    const todoWithProjects = { 
      ...mockTodo, 
      projects: [{ ...mockProject, uuid: 'project-1' }] 
    };
    render(<TodoCard todo={todoWithProjects} {...mockHandlers} />);

    expect(screen.getByText('Test Project')).toBeInTheDocument();
  });

  it('calls onEdit when edit action is clicked', async () => {
    render(<TodoCard todo={mockTodo} {...mockHandlers} />);

    const actionMenu = screen.getByLabelText('More actions');
    fireEvent.click(actionMenu);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));
    expect(mockHandlers.onEdit).toHaveBeenCalledWith(mockTodo);
  });

  it('calls onDelete when delete action is clicked', async () => {
    render(<TodoCard todo={mockTodo} {...mockHandlers} />);

    const actionMenu = screen.getByLabelText('More actions');
    fireEvent.click(actionMenu);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));
    expect(mockHandlers.onDelete).toHaveBeenCalledWith(mockTodo.uuid, mockTodo.title);
  });

  it('calls onArchive when archive action is clicked', async () => {
    render(<TodoCard todo={mockTodo} {...mockHandlers} />);

    const actionMenu = screen.getByLabelText('More actions');
    fireEvent.click(actionMenu);

    await waitFor(() => {
      expect(screen.getByText('Archive')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Archive'));
    expect(mockHandlers.onArchive).toHaveBeenCalledWith(mockTodo.uuid);
  });

  it('calls onUnarchive when unarchive action is clicked for archived todo', async () => {
    const archivedTodo = { ...mockTodo, isArchived: true };
    render(<TodoCard todo={archivedTodo} {...mockHandlers} />);

    const actionMenu = screen.getByLabelText('More actions');
    fireEvent.click(actionMenu);

    await waitFor(() => {
      expect(screen.getByText('Unarchive')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Unarchive'));
    expect(mockHandlers.onUnarchive).toHaveBeenCalledWith(archivedTodo.uuid);
  });

  it('calls onComplete when complete action is clicked for non-completed todo', async () => {
    render(<TodoCard todo={mockTodo} {...mockHandlers} />);

    const actionMenu = screen.getByLabelText('More actions');
    fireEvent.click(actionMenu);

    await waitFor(() => {
      expect(screen.getByText('Complete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Complete'));
    expect(mockHandlers.onComplete).toHaveBeenCalledWith(mockTodo.uuid);
  });

  it('calls onAddSubtask when add subtask action is clicked', async () => {
    render(<TodoCard todo={mockTodo} {...mockHandlers} />);

    const actionMenu = screen.getByLabelText('More actions');
    fireEvent.click(actionMenu);

    await waitFor(() => {
      expect(screen.getByText('Add Subtask')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Subtask'));
    expect(mockHandlers.onAddSubtask).toHaveBeenCalledWith(mockTodo.uuid);
  });

  it('does not show complete action for completed todos', async () => {
    const completedTodo = { ...mockTodo, status: TodoStatus.DONE };
    render(<TodoCard todo={completedTodo} {...mockHandlers} />);

    const actionMenu = screen.getByLabelText('More actions');
    fireEvent.click(actionMenu);

    await waitFor(() => {
      expect(screen.queryByText('Complete')).not.toBeInTheDocument();
    });
  });

  it('shows strikethrough text for completed todos', () => {
    const completedTodo = { ...mockTodo, status: TodoStatus.DONE };
    render(<TodoCard todo={completedTodo} {...mockHandlers} />);

    const titleElement = screen.getByText('Test Todo');
    expect(titleElement).toHaveStyle('text-decoration: line-through');
  });

  it('displays subtasks when present', () => {
    const todoWithSubtasks = { 
      ...mockTodo, 
      subtasks: [{ ...mockTodo, uuid: 'subtask-1', title: 'Subtask 1' }] 
    };
    render(<TodoCard todo={todoWithSubtasks} {...mockHandlers} />);

    expect(screen.getByText('Subtask 1')).toBeInTheDocument();
  });

  it('handles missing optional fields gracefully', () => {
    const minimalTodo = {
      uuid: 'minimal-todo',
      title: 'Minimal Todo',
      status: TodoStatus.PENDING,
      priority: TaskPriority.MEDIUM,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      projects: []
    };
    
    render(<TodoCard todo={minimalTodo as any} {...mockHandlers} />);

    expect(screen.getByText('Minimal Todo')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });
});
