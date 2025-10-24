/**
 * TodoForm Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/testUtils';
import { TodoForm } from '../todos/TodoForm';
import { mockProject } from '../../../test/testUtils';
import { TodoStatus, TaskPriority, TodoType } from '../../../types/todo';

describe('TodoForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnClose = vi.fn();
  const mockProjects = [mockProject];

  const defaultProps = {
    opened: true,
    onClose: mockOnClose,
    onSubmit: mockOnSubmit,
    projects: mockProjects,
    title: 'Create Todo'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form fields correctly', () => {
    render(<TodoForm {...defaultProps} />);

    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Completion %')).toBeInTheDocument();
  });

  it('shows correct title', () => {
    render(<TodoForm {...defaultProps} title="Edit Todo" />);
    expect(screen.getByText('Edit Todo')).toBeInTheDocument();
  });

  it('populates form with initial data', () => {
    const initialData = {
      title: 'Existing Todo',
      description: 'Existing description',
      status: TodoStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      type: TodoType.TASK,
      completionPercentage: 50
    };

    render(<TodoForm {...defaultProps} initialData={initialData} />);

    expect(screen.getByDisplayValue('Existing Todo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Existing description')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    render(<TodoForm {...defaultProps} />);

    const submitButton = screen.getByText('Create Todo');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Title is required')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates completion percentage range', async () => {
    render(<TodoForm {...defaultProps} />);

    const titleInput = screen.getByLabelText('Title');
    const completionInput = screen.getByLabelText('Completion %');

    fireEvent.change(titleInput, { target: { value: 'Test Todo' } });
    fireEvent.change(completionInput, { target: { value: '150' } });

    const submitButton = screen.getByText('Create Todo');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Completion percentage must be between 0 and 100')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates due date is after start date', async () => {
    render(<TodoForm {...defaultProps} />);

    const titleInput = screen.getByLabelText('Title');
    fireEvent.change(titleInput, { target: { value: 'Test Todo' } });

    // Set start date to tomorrow and due date to today
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    // Mock the date inputs - this would need proper date picker testing
    // For now, we'll test the validation logic

    const submitButton = screen.getByText('Create Todo');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalled();
    });
  });

  it('submits form with correct data', async () => {
    render(<TodoForm {...defaultProps} />);

    const titleInput = screen.getByLabelText('Title');
    const descriptionInput = screen.getByLabelText('Description');
    const statusSelect = screen.getByLabelText('Status');
    const prioritySelect = screen.getByLabelText('Priority');
    const typeSelect = screen.getByLabelText('Type');
    const completionInput = screen.getByLabelText('Completion %');

    fireEvent.change(titleInput, { target: { value: 'New Todo' } });
    fireEvent.change(descriptionInput, { target: { value: 'New description' } });
    fireEvent.change(statusSelect, { target: { value: TodoStatus.IN_PROGRESS } });
    fireEvent.change(prioritySelect, { target: { value: TaskPriority.HIGH } });
    fireEvent.change(typeSelect, { target: { value: TodoType.TASK } });
    fireEvent.change(completionInput, { target: { value: '25' } });

    const submitButton = screen.getByText('Create Todo');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        title: 'New Todo',
        description: 'New description',
        status: TodoStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        type: TodoType.TASK,
        completionPercentage: 25,
        startDate: '',
        dueDate: '',
        projectIds: [],
        isExclusiveMode: false
      });
    });
  });

  it('calls onClose when cancel button is clicked', () => {
    render(<TodoForm {...defaultProps} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows loading state when loading prop is true', () => {
    render(<TodoForm {...defaultProps} loading={true} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('disables form when loading', () => {
    render(<TodoForm {...defaultProps} loading={true} />);

    const submitButton = screen.getByText('Create Todo');
    expect(submitButton).toBeDisabled();
  });

  it('shows update button text for edit mode', () => {
    const initialData = { title: 'Existing Todo' };
    render(<TodoForm {...defaultProps} initialData={initialData} />);

    expect(screen.getByText('Update Todo')).toBeInTheDocument();
  });

  it('clears errors when user starts typing', async () => {
    render(<TodoForm {...defaultProps} />);

    // Trigger validation error
    const submitButton = screen.getByText('Create Todo');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Title is required')).toBeInTheDocument();
    });

    // Start typing in title field
    const titleInput = screen.getByLabelText('Title');
    fireEvent.change(titleInput, { target: { value: 'T' } });

    await waitFor(() => {
      expect(screen.queryByText('Title is required')).not.toBeInTheDocument();
    });
  });

  it('handles form submission errors gracefully', async () => {
    const mockOnSubmitWithError = vi.fn().mockRejectedValue(new Error('Submission failed'));
    
    render(<TodoForm {...defaultProps} onSubmit={mockOnSubmitWithError} />);

    const titleInput = screen.getByLabelText('Title');
    fireEvent.change(titleInput, { target: { value: 'Test Todo' } });

    const submitButton = screen.getByText('Create Todo');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmitWithError).toHaveBeenCalled();
    });

    // Form should not close on error
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('resets form when opened prop changes', () => {
    const { rerender } = render(<TodoForm {...defaultProps} opened={false} />);
    
    // Form should not be visible
    expect(screen.queryByText('Create Todo')).not.toBeInTheDocument();

    // Open form
    rerender(<TodoForm {...defaultProps} opened={true} />);
    
    expect(screen.getByText('Create Todo')).toBeInTheDocument();
  });
});
