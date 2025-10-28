import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ColorSchemeScript } from '@mantine/core';
import { useAuthStore } from './stores/authStore';
import { Layout } from './components/shared/Layout';
import { useGlobalKeyboardShortcuts } from './hooks/useGlobalKeyboardShortcuts';
import { keyboardShortcuts } from './services/keyboardShortcuts';

// Pages
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { NotesPage } from './pages/NotesPage';
import { NoteEditorPage } from './pages/NoteEditorPage';
import NoteViewPage from './pages/NoteViewPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { TodosPage } from './pages/TodosPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDashboardPage } from './pages/ProjectDashboardPage';
import { DiaryPage } from './pages/DiaryPage';
import DiaryViewPage from './pages/DiaryViewPage';
import ArchivePage from './pages/ArchivePage';
import { RecycleBinPage } from './pages/RecycleBinPage';
// Search pages
// Legacy pages removed: SearchResultsPage, AdvancedFuzzySearchPage, FTS5SearchPage
import UnifiedSearchPage from './pages/UnifiedSearchPage';
import FuzzySearchPage from './pages/FuzzySearchPage';

// Auth Guard Component
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  // Show loading while authentication is being verified
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div>Loading...</div>
        <div style={{ fontSize: '14px', color: '#666' }}>
          Verifying authentication...
        </div>
      </div>
    );
  }

  // Redirect to auth if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  // Only render layout and children when fully authenticated
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
  const { checkAuth, isLoading: authLoading } = useAuthStore();

  // Initialize global keyboard shortcuts
  useGlobalKeyboardShortcuts();

  // Initialize keyboard shortcuts service
  useEffect(() => {
    // Enable keyboard shortcuts
    keyboardShortcuts.enable();

    // Cleanup on unmount
    return () => {
      keyboardShortcuts.disable();
    };
  }, []);

  // Single global authentication check
  useEffect(() => {
    console.log('[APP] Performing single global authentication check');
    checkAuth();
  }, [checkAuth]);

  // Show loading screen while authentication is being checked
  if (authLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div>Loading...</div>
        <div style={{ fontSize: '14px', color: '#666' }}>
          Checking authentication...
        </div>
      </div>
    );
  }

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
                <NoteViewPage />
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
            path="/projects" 
            element={
              <AuthGuard>
                <ProjectsPage />
              </AuthGuard>
            } 
          />
          
          <Route 
            path="/projects/:projectId" 
            element={
              <AuthGuard>
                <ProjectDashboardPage />
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
            path="/diary/:id" 
            element={
              <AuthGuard>
                <DiaryViewPage />
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
            path="/recyclebin" 
            element={
              <AuthGuard>
                <RecycleBinPage />
              </AuthGuard>
            }
          />
          
          {/* Search routes */}
          {/* Default /search redirects to FTS5 unified search */}
          <Route path="/search" element={<Navigate to="/search/unified" replace />} />
          <Route path="/search/fts5" element={<Navigate to="/search/unified" replace />} />
          <Route path="/advanced-fuzzy-search" element={<Navigate to="/search/fuzzy" replace />} />

          {/* FTS5 Search - cross-module metadata search */}
          <Route
            path="/search/unified"
            element={
              <AuthGuard>
                <UnifiedSearchPage />
              </AuthGuard>
            }
          />

          {/* Fuzzy Search - typo-tolerant content search */}
          <Route
            path="/search/fuzzy"
            element={
              <AuthGuard>
                <FuzzySearchPage />
              </AuthGuard>
            }
          />

          {/* Default redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* Catch-all route that tries to preserve the current path */}
          <Route path="*" element={
            <AuthGuard>
              <div>
                <h2>Page Not Found</h2>
                <p>The page you're looking for doesn't exist.</p>
                <button onClick={() => window.history.back()}>Go Back</button>
                <button onClick={() => window.location.href = '/dashboard'}>Go to Dashboard</button>
              </div>
            </AuthGuard>
          } />
        </Routes>
    </>
  );
}

export default App;
