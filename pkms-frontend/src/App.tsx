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
import { DocumentsPage } from './pages/DocumentsPage';
import { TodosPage } from './pages/TodosPage';
import { DiaryPage } from './pages/DiaryPage';
import { ArchivePage } from './pages/ArchivePage';
import { SearchResultsPage } from './pages/SearchResultsPage';
import AdvancedFuzzySearchPage from './pages/AdvancedFuzzySearchPage';

// Auth Guard Component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

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
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { checkAuth } = useAuthStore();

  // Single global authentication check
  useEffect(() => {
    console.log('[APP] Performing single global authentication check');
    checkAuth();
  }, [checkAuth]);

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

          {/* Other module routes */}
          <Route 
            path="/documents" 
            element={
              <AuthGuard>
                <DocumentsPage />
              </AuthGuard>
            } 
          />
          
          <Route 
            path="/todos" 
            element={
              <AuthGuard>
                <TodosPage />
              </AuthGuard>
            } 
          />
          
          <Route 
            path="/diary" 
            element={
              <AuthGuard>
                <DiaryPage />
              </AuthGuard>
            } 
          />
          
          <Route 
            path="/archive" 
            element={
              <AuthGuard>
                <ArchivePage />
              </AuthGuard>
            } 
          />
          
          <Route 
            path="/search" 
            element={
              <AuthGuard>
                <SearchResultsPage />
              </AuthGuard>
            } 
          />

          <Route 
            path="/advanced-fuzzy-search" 
            element={
              <AuthGuard>
                <AdvancedFuzzySearchPage />
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
