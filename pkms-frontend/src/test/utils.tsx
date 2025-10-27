import React from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

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

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };
