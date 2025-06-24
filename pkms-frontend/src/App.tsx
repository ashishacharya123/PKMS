import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ColorSchemeScript } from '@mantine/core';
import { useAuthStore } from './stores/authStore';
import { Layout } from './components/shared/Layout';

// Pages
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotesPage } from './pages/NotesPage';
import { NoteEditorPage } from './pages/NoteEditorPage';

// Auth Guard Component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  return <Layout>{children}</Layout>;
}

// Public Route Component (for auth page)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <>
      <ColorSchemeScript />
      <Routes>
          {/* Public Routes */}
          <Route 
            path="/auth" 
            element={
              <PublicRoute>
                <AuthPage />
              </PublicRoute>
            } 
          />

          {/* Protected Routes */}
          <Route 
            path="/dashboard" 
            element={
              <AuthGuard>
                <DashboardPage />
              </AuthGuard>
            } 
          />
          
          <Route 
            path="/notes" 
            element={
              <AuthGuard>
                <NotesPage />
              </AuthGuard>
            } 
          />
          
          <Route 
            path="/notes/new" 
            element={
              <AuthGuard>
                <NoteEditorPage />
              </AuthGuard>
            } 
          />
          
          <Route 
            path="/notes/:id" 
            element={
              <AuthGuard>
                <NoteEditorPage />
              </AuthGuard>
            } 
          />
          
          <Route 
            path="/notes/:id/edit" 
            element={
              <AuthGuard>
                <NoteEditorPage />
              </AuthGuard>
            } 
          />

          {/* Placeholder routes for other modules */}
          <Route 
            path="/documents" 
            element={
              <AuthGuard>
                <div style={{ padding: '2rem' }}>
                  <h1>Documents Module</h1>
                  <p>Coming soon...</p>
                </div>
              </AuthGuard>
            } 
          />
          
          <Route 
            path="/todos" 
            element={
              <AuthGuard>
                <div style={{ padding: '2rem' }}>
                  <h1>Todos Module</h1>
                  <p>Coming soon...</p>
                </div>
              </AuthGuard>
            } 
          />
          
          <Route 
            path="/diary" 
            element={
              <AuthGuard>
                <div style={{ padding: '2rem' }}>
                  <h1>Diary Module</h1>
                  <p>Coming soon...</p>
                </div>
              </AuthGuard>
            } 
          />

          {/* Default redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    </>
  );
}

export default App;
