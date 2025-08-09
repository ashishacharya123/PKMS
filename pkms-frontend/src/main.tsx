import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Import Mantine styles
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';

// Import custom overrides to fix deprecation warnings
import './styles/mantine-override.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider 
        defaultColorScheme="auto"
        theme={{
          primaryColor: 'blue',
          fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
          headings: {
            fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
          },
        }}
      >
        <Notifications position="top-right" />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <App />
        </BrowserRouter>
      </MantineProvider>
    </QueryClientProvider>
  </React.StrictMode>
); 