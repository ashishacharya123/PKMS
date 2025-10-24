/**
 * ActionMenu Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../../test/testUtils';
import { ActionMenu } from '../common/ActionMenu';

describe('ActionMenu', () => {
  const mockHandlers = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleFavorite: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onCopy: vi.fn(),
    onShare: vi.fn(),
    onDownload: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders action menu button', () => {
    render(<ActionMenu />);
    
    const button = screen.getByLabelText('More actions');
    expect(button).toBeInTheDocument();
  });

  it('opens menu when button is clicked', async () => {
    render(<ActionMenu onEdit={mockHandlers.onEdit} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });
  });

  it('shows edit action when onEdit is provided', async () => {
    render(<ActionMenu onEdit={mockHandlers.onEdit} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Edit'));
    expect(mockHandlers.onEdit).toHaveBeenCalled();
  });

  it('shows delete action when onDelete is provided', async () => {
    render(<ActionMenu onDelete={mockHandlers.onDelete} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Delete'));
    expect(mockHandlers.onDelete).toHaveBeenCalled();
  });

  it('shows favorite toggle when onToggleFavorite is provided', async () => {
    render(<ActionMenu onToggleFavorite={mockHandlers.onToggleFavorite} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Add to favorites')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add to favorites'));
    expect(mockHandlers.onToggleFavorite).toHaveBeenCalled();
  });

  it('shows "Remove from favorites" when isFavorite is true', async () => {
    render(<ActionMenu onToggleFavorite={mockHandlers.onToggleFavorite} isFavorite={true} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Remove from favorites')).toBeInTheDocument();
    });
  });

  it('shows archive action when onArchive is provided and not archived', async () => {
    render(<ActionMenu onArchive={mockHandlers.onArchive} isArchived={false} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Archive')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Archive'));
    expect(mockHandlers.onArchive).toHaveBeenCalled();
  });

  it('shows unarchive action when onUnarchive is provided and archived', async () => {
    render(<ActionMenu onUnarchive={mockHandlers.onUnarchive} isArchived={true} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Unarchive')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Unarchive'));
    expect(mockHandlers.onUnarchive).toHaveBeenCalled();
  });

  it('shows copy action when onCopy is provided', async () => {
    render(<ActionMenu onCopy={mockHandlers.onCopy} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Copy'));
    expect(mockHandlers.onCopy).toHaveBeenCalled();
  });

  it('shows share action when onShare is provided', async () => {
    render(<ActionMenu onShare={mockHandlers.onShare} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Share')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Share'));
    expect(mockHandlers.onShare).toHaveBeenCalled();
  });

  it('shows download action when onDownload is provided', async () => {
    render(<ActionMenu onDownload={mockHandlers.onDownload} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Download')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Download'));
    expect(mockHandlers.onDownload).toHaveBeenCalled();
  });

  it('shows custom actions when provided', async () => {
    const customActions = [
      {
        label: 'Custom Action 1',
        icon: <span>Icon1</span>,
        onClick: vi.fn()
      },
      {
        label: 'Custom Action 2',
        icon: <span>Icon2</span>,
        onClick: vi.fn()
      }
    ];

    render(<ActionMenu customActions={customActions} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Custom Action 1')).toBeInTheDocument();
      expect(screen.getByText('Custom Action 2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Custom Action 1'));
    expect(customActions[0].onClick).toHaveBeenCalled();
  });

  it('applies correct variant and color props', () => {
    render(<ActionMenu variant="filled" color="red" size={20} />);
    
    const button = screen.getByLabelText('More actions');
    expect(button).toHaveClass('mantine-ActionIcon-filled');
  });

  it('disables button when disabled prop is true', () => {
    render(<ActionMenu disabled={true} />);
    
    const button = screen.getByLabelText('More actions');
    expect(button).toBeDisabled();
  });

  it('does not show actions that are not provided', async () => {
    render(<ActionMenu onEdit={mockHandlers.onEdit} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.queryByText('Delete')).not.toBeInTheDocument();
      expect(screen.queryByText('Archive')).not.toBeInTheDocument();
    });
  });

  it('closes menu when clicking outside', async () => {
    render(
      <div>
        <ActionMenu onEdit={mockHandlers.onEdit} />
        <div data-testid="outside">Outside element</div>
      </div>
    );
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    // Click outside
    fireEvent.click(screen.getByTestId('outside'));

    await waitFor(() => {
      expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    });
  });

  it('handles keyboard navigation', async () => {
    render(<ActionMenu onEdit={mockHandlers.onEdit} onDelete={mockHandlers.onDelete} />);
    
    const button = screen.getByLabelText('More actions');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
    });

    // Press Enter on Edit
    const editItem = screen.getByText('Edit');
    fireEvent.keyDown(editItem, { key: 'Enter' });
    
    expect(mockHandlers.onEdit).toHaveBeenCalled();
  });

  it('renders with minimal props', () => {
    render(<ActionMenu />);
    
    const button = screen.getByLabelText('More actions');
    expect(button).toBeInTheDocument();
    
    fireEvent.click(button);

    // Should show empty menu
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
