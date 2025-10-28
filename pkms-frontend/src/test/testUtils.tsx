/**
 * Test utilities for PKMS frontend testing
 */

import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { vi } from 'vitest';

// Mock Mantine theme
const theme = {
  primaryColor: 'blue',
  colors: {
    blue: ['#e7f5ff', '#d0ebff', '#a5d8ff', '#74c0fc', '#339af0', '#228be6', '#1c7ed6', '#1971c2', '#1864ab', '#0c5aa6'],
    green: ['#ebfbee', '#d3f9d8', '#b2f2bb', '#8ce99a', '#69db7c', '#51cf66', '#40c057', '#37b24d', '#2f9e44', '#2b8a3e'],
    red: ['#fff5f5', '#ffe3e3', '#ffc9c9', '#ffa8a8', '#ff8787', '#ff6b6b', '#fa5252', '#f03e3e', '#e03131', '#c92a2a'],
    orange: ['#fff4e6', '#ffe8cc', '#ffd8a8', '#ffc078', '#ffa94d', '#ff922b', '#fd7e14', '#f76707', '#e8590c', '#d9480f'],
    yellow: ['#fff9db', '#fff3bf', '#ffec99', '#ffe066', '#ffd43b', '#fcc419', '#fab005', '#f59f00', '#f08c00', '#e67700'],
    gray: ['#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd', '#868e96', '#495057', '#343a40', '#212529', '#000000']
  },
  fontFamily: 'Inter, system-ui, sans-serif',
  fontFamilyMonospace: 'Monaco, Courier, monospace',
  headings: { fontFamily: 'Inter, system-ui, sans-serif' },
  radius: { xs: '2px', sm: '4px', md: '8px', lg: '16px', xl: '32px' },
  spacing: { xs: '10px', sm: '12px', md: '16px', lg: '20px', xl: '32px' },
  breakpoints: { xs: '576px', sm: '768px', md: '992px', lg: '1200px', xl: '1400px' },
  shadows: {
    xs: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.05), 0 4px 6px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px rgba(0, 0, 0, 0.05), 0 10px 15px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.05), 0 20px 25px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.05), 0 25px 50px rgba(0, 0, 0, 0.1)'
  }
};

// Mock data factories
export const mockUser = {
  uuid: 'test-user-uuid',
  username: 'testuser',
  email: 'test@example.com',
  fullName: 'Test User',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};

export const mockNote = {
  uuid: 'test-note-uuid',
  title: 'Test Note',
  content: 'Test note content',
  isFavorite: false,
  isArchived: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};

export const mockTodo = {
  uuid: 'test-todo-uuid',
  title: 'Test Todo',
  description: 'Test todo description',
  status: 'pending' as const,
  priority: 'medium' as const,
  type: 'task' as const,
  startDate: null,
  dueDate: null,
  completionPercentage: 0,
  isArchived: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  projects: []
};

export const mockProject = {
  uuid: 'test-project-uuid',
  name: 'Test Project',
  description: 'Test project description',
  status: 'is_running' as const,
  priority: 'medium' as const,
  dueDate: null,
  completionDate: null,
  progressPercentage: 0,
  todoCount: 0,
  completedCount: 0,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};

export const mockDocument = {
  uuid: 'test-document-uuid',
  title: 'Test Document',
  originalName: 'test.txt',
  mimeType: 'text/plain',
  fileSize: 1024,
  isArchived: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};

export const mockDiaryEntry = {
  uuid: 'test-diary-uuid',
  title: 'Test Diary Entry',
  date: '2024-01-21',
  mood: 5,
  contentAvailable: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};

export const mockTag = {
  uuid: 'test-tag-uuid',
  name: 'Test Tag',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
};

// Mock hooks
export const mockUseAuthStore = {
  user: mockUser,
  isAuthenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn()
};

export const mockUseTodosStore = {
  todos: [mockTodo],
  projects: [mockProject],
  isLoading: false,
  error: null,
  loadTodos: vi.fn(),
  loadProjects: vi.fn(),
  createTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
  archiveTodo: vi.fn(),
  unarchiveTodo: vi.fn(),
  completeTodo: vi.fn()
};

export const mockUseNotesStore = {
  notes: [mockNote],
  isLoading: false,
  error: null,
  loadNotes: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn()
};

// Custom render function with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) {
  const { initialEntries = ['/'], ...renderOptions } = options;
  
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <MantineProvider theme={theme}>
            <Notifications />
            {children}
          </MantineProvider>
        </QueryClientProvider>
      </BrowserRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

// Mock router
export const mockNavigate = vi.fn();
export const mockUseNavigate = () => mockNavigate;

export const mockUseSearchParams = (params: Record<string, string> = {}) => {
  const searchParams = new URLSearchParams(params);
  return [
    searchParams,
    vi.fn((updater) => {
      if (typeof updater === 'function') {
        const newParams = updater(searchParams);
        // Mock implementation
      }
    })
  ];
};

// Mock notifications
export const mockNotifications = {
  show: vi.fn(),
  hide: vi.fn(),
  clean: vi.fn(),
  update: vi.fn()
};

// Mock file operations
export const mockFile = new File(['test content'], 'test.txt', {
  type: 'text/plain',
});

export const mockAudioBlob = new Blob(['audio data'], { type: 'audio/webm' });

// Mock drag and drop
export const mockDragEvent = {
  dataTransfer: {
    setData: vi.fn(),
    getData: vi.fn(),
    files: [mockFile],
    items: [],
    types: []
  },
  preventDefault: vi.fn(),
  stopPropagation: vi.fn()
};

// Mock keyboard events
export const mockKeyboardEvent = {
  key: 'Enter',
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  preventDefault: vi.fn(),
  stopPropagation: vi.fn()
};

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-object-url');
global.URL.revokeObjectURL = vi.fn();

// Mock Audio
global.Audio = vi.fn().mockImplementation(() => ({
  play: vi.fn(),
  pause: vi.fn(),
  load: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  duration: 100,
  currentTime: 0,
  volume: 1,
  muted: false
}));

// Mock MediaRecorder
global.MediaRecorder = vi.fn().mockImplementation(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  state: 'inactive',
  mimeType: 'audio/webm'
}));

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  writable: true,
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    })
  }
});

// Import Jest DOM matchers
import '@testing-library/jest-dom';

// Export everything
export * from '@testing-library/react';
export { renderWithProviders as render };
