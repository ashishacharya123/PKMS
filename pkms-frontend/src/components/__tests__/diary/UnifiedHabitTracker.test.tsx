import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../../test/utils';
import { UnifiedHabitTracker } from '../diary/UnifiedHabitTracker';

// Mock the habit service
vi.mock('../../services/habitService', () => ({
  habitService: {
    getHabits: vi.fn(),
    updateHabit: vi.fn(),
    getAnalytics: vi.fn(),
  }
}));

describe('UnifiedHabitTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders habit tracker with tabs', () => {
    render(<UnifiedHabitTracker />);
    
    expect(screen.getByText('Daily Stats')).toBeInTheDocument();
    expect(screen.getByText('My Habits')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
  });

  it('switches between tabs correctly', async () => {
    render(<UnifiedHabitTracker />);
    
    const myHabitsTab = screen.getByText('My Habits');
    fireEvent.click(myHabitsTab);
    
    await waitFor(() => {
      expect(screen.getByText(/add new habit/i)).toBeInTheDocument();
    });
  });

  it('displays default habits in daily stats', () => {
    render(<UnifiedHabitTracker />);
    
    expect(screen.getByText('Sleep')).toBeInTheDocument();
    expect(screen.getByText('Exercise')).toBeInTheDocument();
    expect(screen.getByText('Meditation')).toBeInTheDocument();
    expect(screen.getByText('Stress Level')).toBeInTheDocument();
    expect(screen.getByText('Screen Time')).toBeInTheDocument();
  });

  it('allows adding new custom habits', async () => {
    render(<UnifiedHabitTracker />);
    
    const myHabitsTab = screen.getByText('My Habits');
    fireEvent.click(myHabitsTab);
    
    await waitFor(() => {
      const addButton = screen.getByRole('button', { name: /add new habit/i });
      fireEvent.click(addButton);
      
      expect(screen.getByPlaceholderText(/habit name/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument();
    });
  });

  it('validates habit form before saving', async () => {
    render(<UnifiedHabitTracker />);
    
    const myHabitsTab = screen.getByText('My Habits');
    fireEvent.click(myHabitsTab);
    
    await waitFor(() => {
      const addButton = screen.getByRole('button', { name: /add new habit/i });
      fireEvent.click(addButton);
      
      const saveButton = screen.getByRole('button', { name: /save/i });
      fireEvent.click(saveButton);
      
      expect(screen.getByText(/habit name is required/i)).toBeInTheDocument();
    });
  });

  it('shows analytics with charts', async () => {
    render(<UnifiedHabitTracker />);
    
    const analyticsTab = screen.getByText('Analytics');
    fireEvent.click(analyticsTab);
    
    await waitFor(() => {
      expect(screen.getByText(/habit trends/i)).toBeInTheDocument();
      expect(screen.getByText(/weekly summary/i)).toBeInTheDocument();
    });
  });
});
