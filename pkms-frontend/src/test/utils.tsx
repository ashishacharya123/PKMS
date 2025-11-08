import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

// Polyfill for window.matchMedia which is required by Mantine
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Create a custom render function that includes providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <Notifications />
        {children}
      </MantineProvider>
    </QueryClientProvider>
  );
};

const customRender = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

// Mock data generators
export const mockDiaryEntry = {
  uuid: 'test-entry-uuid',
  title: 'Test Entry',
  content: 'Test content',
  date: '2024-01-21',
  mood: 5,
  weather_code: 1,
  location: 'Test Location',
  nepali_date: '2080-10-07',
  is_template: false,
  created_at: '2024-01-21T10:00:00Z',
  updated_at: '2024-01-21T10:00:00Z',
  file_count: 0,
  content_length: 100,
  content_available: true,
  tags: ['test', 'sample']
};

export const mockHabitData = {
  sleep: 8,
  exercise: 1,
  meditation: 0,
  stress: 3,
  screen_time: 6
};

export const mockUser = {
  uuid: 'test-user-uuid',
  username: 'testuser',
  email: 'test@example.com'
};

// Import Jest DOM matchers
import '@testing-library/jest-dom';

// Mock utilities for API testing
export const createMockFetch = (response: any, ok = true, status = 200) => {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
    blob: () => Promise.resolve(new Blob()),
  });
};

// Mock service functions
export const mockService = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  patch: jest.fn(),
};

// Reset all mocks
export const resetAllMocks = () => {
  jest.clearAllMocks();
  mockService.get.mockClear();
  mockService.post.mockClear();
  mockService.put.mockClear();
  mockService.delete.mockClear();
  mockService.patch.mockClear();
};

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };
