import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { DiaryPage } from '../../pages/DiaryPage';

// Mock the diary service
vi.mock('../../services/diaryService', () => ({
  diaryService: {
    getEntries: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
  }
}));

// Mock the auth store
vi.mock('../../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { uuid: 'test-user', username: 'testuser' },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  })
}));

describe('DiaryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders diary page with navigation', () => {
    render(<DiaryPage />);
    
    expect(screen.getByText('Diary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new entry/i })).toBeInTheDocument();
  });

  it('shows new entry form when new entry button is clicked', async () => {
    render(<DiaryPage />);
    
    const newEntryButton = screen.getByRole('button', { name: /new entry/i });
    fireEvent.click(newEntryButton);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/title/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/write your thoughts/i)).toBeInTheDocument();
    });
  });

  it('validates required fields before saving', async () => {
    render(<DiaryPage />);
    
    const newEntryButton = screen.getByRole('button', { name: /new entry/i });
    fireEvent.click(newEntryButton);
    
    await waitFor(() => {
      const saveButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveButton);
    });
    
    expect(screen.getByText(/title is required/i)).toBeInTheDocument();
  });

  it('displays mood selector with correct options', async () => {
    render(<DiaryPage />);
    
    const newEntryButton = screen.getByRole('button', { name: /new entry/i });
    fireEvent.click(newEntryButton);
    
    await waitFor(() => {
      const moodSelector = screen.getByLabelText(/mood/i);
      expect(moodSelector).toBeInTheDocument();
      
      // Check for mood options (1-10 scale)
      for (let i = 1; i <= 10; i++) {
        expect(screen.getByRole('option', { name: i.toString() })).toBeInTheDocument();
      }
    });
  });

  it('shows nepali date when available', async () => {
    render(<DiaryPage />);
    
    const newEntryButton = screen.getByRole('button', { name: /new entry/i });
    fireEvent.click(newEntryButton);
    
    await waitFor(() => {
      expect(screen.getByText(/nepali date/i)).toBeInTheDocument();
    });
  });
});
