/**
 * PKMS Frontend Components Module Index
 *
 * PURPOSE: Central export point for all UI components organized by feature/domain
 * CREATED: December 2024
 * ARCHITECTURE: Modular React components with TypeScript + Mantine UI
 *
 * This file serves as:
 * 1. Documentation for entire component structure
 * 2. Central import hub for commonly used components
 * 3. Development reference for team onboarding
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * COMPONENT ORGANIZATION (12 Feature Modules)
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * 📁 archive/ - File management system components
 *    Purpose: Hierarchical file/folder operations with advanced features
 *    Key Features: Drag-drop uploads, thumbnail previews, breadcrumb navigation
 *    Components:
 *      - FolderTree.tsx: Hierarchical folder navigation with expand/collapse
 *    Exports: FolderTree
 *    Usage: import { FolderTree } from '../components'
 *    Dependencies: archiveStore, Mantine Tree, drag-drop hooks
 *
 * 📁 auth/ - Authentication & security components
 *    Purpose: User login, registration, session management, security setup
 *    Key Features: Encrypted recovery, multi-factor ready, form validation
 *    Components:
 *      - LoginForm.tsx: Main login interface with credential validation
 *      - AuthReadyWrapper.tsx: HOC for protected routes
 *      - RecoveryModal.tsx: Password reset and account recovery
 *      - RecoverySetupModal.tsx: Security questions setup
 *      - SetupForm.tsx: Initial user configuration
 *    Exports: LoginForm, AuthReadyWrapper, RecoveryModal, RecoverySetupModal, SetupForm
 *    Usage: import { LoginForm } from '../components'
 *    Dependencies: authStore, authService, form validation
 *
 * 📁 calendar/ - Calendar and scheduling components
 *    Purpose: Date selection, event scheduling, timeline visualization
 *    Components:
 *      - UnifiedCalendar_unused.tsx: Legacy calendar (DEPRECATED)
 *    Note: This component is unused and can be removed in cleanup
 *
 * 📁 common/ - Shared reusable UI components
 *    Purpose: UI patterns used across multiple features
 *    Key Features: Consistent design, loading states, user feedback
 *    Components:
 *      - ActionMenu.tsx: Dropdown menu with actions (edit, delete, etc.)
 *      - DeleteConfirmationModal.tsx: Generic delete confirmation dialog
 *      - ItemCard.tsx: Standardized card layout for content items
 *      - LoadingSkeleton.tsx: Animated placeholder during loading
 *      - MultiProjectSelector.tsx: Multi-select dropdown for projects
 *      - ProjectBadges.tsx: Visual project association indicators
 *      - ProjectSelector.tsx: Single project selection dropdown
 *      - ViewMenu.tsx: View mode toggles (list/grid/table)
 *      - ViewModeLayouts.tsx: Layout components for different views
 *      - PopularTagsWidget.tsx: Frequently used tags display
 *    Exports: ActionMenu, DeleteConfirmationModal, ItemCard, LoadingSkeleton,
 *             MultiProjectSelector, ProjectBadges, ProjectSelector, ViewMenu,
 *             ViewModeLayouts, PopularTagsWidget
 *    Usage: import { ItemCard, ActionMenu } from '../components'
 *    Dependencies: Mantine UI components, icon libraries
 *
 * 📁 dashboard/ - Main dashboard components
 *    Purpose: Landing page with analytics and overview widgets
 *    Key Features: Storage stats, recent activity, favorites, charts
 *    Components:
 *      - FavoritesCard.tsx: Quick access to favorited items
 *      - StorageBreakdownCard.tsx: Visual storage usage by type
 *      - WeeklyHighlightsPanel.tsx: Weekly activity summary
 *    Exports: FavoritesCard, StorageBreakdownCard, WeeklyHighlightsPanel
 *    Usage: import { FavoritesCard } from '../components'
 *    Dependencies: Chart libraries, analytics services
 *
 * 📁 diary/ - Personal journal and habit tracking
 *    Purpose: Daily journaling with mood tracking, habits, encryption
 *    Key Features: Rich text editor, mood analytics, encrypted storage
 *    Components:
 *      - DiaryPage.tsx: Main diary interface with rich editor
 *      - DiarySearch.tsx: Search entries with filters
 *      - AdvancedDiarySearch.tsx: Advanced search with date/mood filters
 *      - EncryptionStatus.tsx: Visual encryption state indicator
 *      - HabitInput.tsx: Daily habit data entry
 *      - HabitAnalyticsView.tsx: Habit progress visualization
 *      - KeyboardShortcutsHelp.tsx: Diary-specific shortcuts reference
 *      - SessionTimeoutWarning.tsx: Inactivity auto-logout warning
 *      - UnifiedHabitTracker.tsx: Integrated habit tracking interface
 *    Exports: DiaryPage, DiarySearch, AdvancedDiarySearch, EncryptionStatus,
 *             HabitInput, HabitAnalyticsView, KeyboardShortcutsHelp,
 *             SessionTimeoutWarning, UnifiedHabitTracker
 *    Usage: import { DiaryPage, HabitAnalyticsView } from '../components'
 *    Dependencies: Rich text editor, diaryCryptoService, mood tracking
 *
 * 📁 documents/ - Document management components
 *    Purpose: Document upload, preview, metadata management
 *    Key Features: Multi-format support, thumbnail generation
 *    Components:
 *      - DocumentPreview.tsx: Document preview with metadata
 *    Exports: DocumentPreview
 *    Usage: import { DocumentPreview } from '../components'
 *    Dependencies: PDF.js, document viewers
 *
 * 📁 file/ - File handling and upload components
 *    Purpose: File upload, preview, management utilities
 *    Key Features: Drag-drop, progress tracking, audio recording
 *    Components:
 *      - FileUploadZone.tsx: Drag-drop upload area with progress
 *      - FileUploadModal.tsx: Multi-file upload modal
 *      - FileList.tsx: File list with sorting/filtering
 *      - FileSection.tsx: Organized file display by category
 *      - FilePreviewCard.tsx: Card component for file previews
 *    Exports: FileUploadZone, FileUploadModal, FileList, FileSection,
 *             FilePreviewCard
 *    Usage: import { FileUploadZone, FileUploadModal } from '../components'
 *    Dependencies: HTML5 File API, coreUploadService, audio recording
 *
 * 📁 notes/ - Note-taking and management components
 *    Purpose: Note creation, editing, organization
 *    Key Features: Rich text, tagging, project linking
 *    Components:
 *      - NoteEditor.tsx: Rich text note editor
 *      - NoteCard.tsx: Card component for note display
 *      - NoteList.tsx: List view with filtering
 *    Exports: NoteEditor, NoteCard, NoteList
 *    Usage: import { NoteEditor, NoteCard } from '../components'
 *    Dependencies: Rich text editor, notesService, tag system
 *
 * 📁 projects/ - Project management components
 *    Purpose: Project creation, management, dashboards
 *    Key Features: Multi-member support, progress tracking, file association
 *    Components:
 *      - ProjectCard.tsx: Card display for projects with stats
 *      - ProjectForm.tsx: Create/edit project form
 *      - ProjectDashboard.tsx: Detailed project view with analytics
 *    Exports: ProjectCard, ProjectForm, ProjectDashboard
 *    Usage: import { ProjectCard, ProjectForm } from '../components'
 *    Dependencies: projectService, projectStore, member management
 *
 * 📁 search/ - Unified search components
 *    Purpose: Cross-feature search with filtering
 *    Key Features: Type-specific search, suggestions, results display
 *    Components:
 *      - SearchTypeToggle.tsx: Search type selector
 *      - SearchSuggestions.tsx: Auto-complete suggestions
 *      - UnifiedSearchFilters.tsx: Advanced filtering options
 *      - UnifiedSearchEmbedded.tsx: Embedded search component
 *    Exports: SearchTypeToggle, SearchSuggestions, UnifiedSearchFilters,
 *             UnifiedSearchEmbedded
 *    Usage: import { SearchTypeToggle, UnifiedSearchFilters } from '../components'
 *    Dependencies: searchService, debounced search
 *
 * 📁 shared/ - Cross-feature shared components
 *    Purpose: Complex components used across multiple features
 *    Key Features: Layout, backup/restore, testing tools
 *    Components:
 *      - Layout.tsx: Main application layout with navigation
 *      - BackupRestoreModal.tsx: Backup creation and restore
 *      - TestingInterface.tsx: Development/testing tools
 *    Exports: Layout, BackupRestoreModal, TestingInterface
 *    Usage: import { Layout, BackupRestoreModal } from '../components'
 *    Dependencies: Router, notification system, backup services
 *
 * 📁 todos/ - Task management components
 *    Purpose: Todo creation, management, workflow
 *    Key Features: Task dependencies, due dates, progress tracking
 *    Components:
 *      - TodoForm.tsx: Create/edit todo form
 *      - TodoList.tsx: List view with filtering
 *      - TodoStats.tsx: Completion statistics
 *      - SubtaskList.tsx: Subtask management
 *      - SubtaskItem.tsx: Individual subtask component
 *    Exports: TodoForm, TodoList, TodoStats, SubtaskList, SubtaskItem
 *    Usage: import { TodoForm, TodoList, TodoStats } from '../components'
 *    Dependencies: todoService, workflowService, date pickers
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * SHARED IMPORTS (Commonly Used Together)
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * For UI Components (import these for most pages):
 * import {
 *   ItemCard, ActionMenu, DeleteConfirmationModal, LoadingSkeleton,
 *   ProjectSelector, MultiProjectSelector, ViewMenu
 * } from '../components';
 *
 * For Layout Components:
 * import { Layout, BackupRestoreModal } from '../components';
 *
 * For Feature Components:
 * import {
 *   FolderTree, FileUploadZone, DiaryPage, ProjectCard,
 *   NoteEditor, TodoForm, SearchTypeToggle
 * } from '../components';
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * DEVELOPMENT PATTERNS & BEST PRACTICES
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * 1. COMPONENT STRUCTURE:
 *    - Each component in separate .tsx file
 *    - Export default with proper TypeScript types
 *    - Use Props interface for component props
 *    - Implement proper error boundaries
 *
 * 2. STATE MANAGEMENT:
 *    - Use Zustand stores for complex state
 *    - Keep component-local state simple
 *    - Use React hooks for side effects
 *
 * 3. STYLING:
 *    - Use Mantine UI components consistently
 *    - Follow responsive design patterns
 *    - Implement proper accessibility (ARIA labels)
 *
 * 4. PERFORMANCE:
 *    - Use React.memo for expensive components
 *    - Implement proper key props for lists
 *    - Lazy load heavy components when needed
 *
 * 5. TESTING:
 *    - Each component should have corresponding .test.tsx file
 *    - Test user interactions and edge cases
 *    - Maintain >80% test coverage
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * IMPORT EXAMPLES (Usage Patterns)
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * // Example 1: Using archive components
 * import { FolderTree, FileUploadZone } from '../components';
 *
 * const ArchivePage = () => {
 *   const [selectedFolder, setSelectedFolder] = useState(null);
 *
 *   return (
 *     <div>
 *       <FolderTree
 *         onFolderSelect={setSelectedFolder}
 *         selectedFolder={selectedFolder}
 *       />
 *       <FileUploadZone targetFolder={selectedFolder} />
 *     </div>
 *   );
 * };
 *
 * // Example 2: Using common components
 * import { ItemCard, ActionMenu, DeleteConfirmationModal } from '../components';
 *
 * const FileList = ({ files }) => {
 *   const [deleteTarget, setDeleteTarget] = useState(null);
 *
 *   return (
 *     <div>
 *       {files.map(file => (
 *         <ItemCard key={file.id} item={file}>
 *           <ActionMenu>
 *             <DeleteConfirmationModal
 *               target={file}
 *               onConfirm={() => deleteFile(file.id)}
 *             />
 *           </ActionMenu>
 *         </ItemCard>
 *       ))}
 *     </div>
 *   );
 * };
 *
 * // Example 3: Using layout components
 * import { Layout } from '../components';
 *
 * const App = () => {
 *   return (
 *     <Layout>
 *       <YourAppContent />
 *     </Layout>
 *   );
 * };
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * MAINTENANCE & CLEANUP NOTES
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * TODO: Remove deprecated components:
 * - /calendar/UnifiedCalendar_unused.tsx (unused legacy calendar)
 *
 * TODO: Improve component consistency:
 * - Ensure all modals follow consistent close/confirm patterns
 * - Standardize loading states across all components
 * - Add comprehensive unit tests for complex components
 *
 * TODO: Performance optimizations:
 * - Implement code splitting for large components
 * - Add virtual scrolling for large lists
 * - Optimize re-renders with proper memoization
 *
 * This documentation serves as the definitive reference for the entire
 * components module. Keep this file updated when adding/removing
 * components or changing their purpose/dependencies.
 */

// ──────────────────────────────────────────────────────────────────────────────
// ACTUAL EXPORTS (For Real Usage)
// ──────────────────────────────────────────────────────────────────────────────
// Note: Export commonly used components for convenience
// For specific components, use direct imports from their folders

// Archive Components
export { default as FolderTree } from './archive/FolderTree';

// Auth Components
export { default as LoginForm } from './auth/LoginForm';
export { default as AuthReadyWrapper } from './auth/AuthReadyWrapper';
export { default as RecoveryModal } from './auth/RecoveryModal';

// Common Components (most frequently used)
export { default as ItemCard } from './common/ItemCard';
export { default as ActionMenu } from './common/ActionMenu';
export { default as DeleteConfirmationModal } from './common/DeleteConfirmationModal';
export { default as LoadingSkeleton } from './common/LoadingSkeleton';
export { default as ProjectSelector } from './common/ProjectSelector';
export { default as ViewMenu } from './common/ViewMenu';

// Dashboard Components
export { default as FavoritesCard } from './dashboard/FavoritesCard';
export { default as StorageBreakdownCard } from './dashboard/StorageBreakdownCard';

// Diary Components
export { default as DiaryPage } from './diary/DiaryPage';
export { default as HabitAnalyticsView } from './diary/HabitAnalyticsView';
export { default as EncryptionStatus } from './diary/EncryptionStatus';

// File Components (frequently used)
export { default as FileUploadZone } from './file/FileUploadZone';
export { default as FileUploadModal } from './file/FileUploadModal';
export { UnifiedFileList } from './file/UnifiedFileList';

// Notes Components
export { default as NoteEditor } from './notes/NoteEditor';
export { default as NoteCard } from './notes/NoteCard';

// Project Components
export { default as ProjectCard } from './projects/ProjectCard';
export { default as ProjectForm } from './projects/ProjectForm';

// Search Components
export { default as SearchTypeToggle } from './search/SearchTypeToggle';
export { default as UnifiedSearchFilters } from './search/UnifiedSearchFilters';

// Shared Components (core layout)
export { default as Layout } from './shared/Layout';
export { default as BackupRestoreModal } from './shared/BackupRestoreModal';

// Todo Components
export { default as TodoForm } from './todos/TodoForm';
export { default as TodoList } from './todos/TodoList';
export { default as TodoStats } from './todos/TodoStats';

// Export object for programmatic access (tools, documentation generators)
export const ComponentsRegistry = {
  archive: {
    FolderTree: 'Hierarchical folder navigation component'
  },
  auth: {
    LoginForm: 'Main login interface with validation',
    AuthReadyWrapper: 'HOC for protected routes',
    RecoveryModal: 'Account recovery interface'
  },
  common: {
    ItemCard: 'Standardized card for content display',
    ActionMenu: 'Dropdown menu with actions',
    DeleteConfirmationModal: 'Generic delete confirmation dialog',
    LoadingSkeleton: 'Animated loading placeholder',
    ProjectSelector: 'Single project selection dropdown'
  },
  dashboard: {
    FavoritesCard: 'Quick access to favorited items',
    StorageBreakdownCard: 'Visual storage usage breakdown'
  },
  diary: {
    DiaryPage: 'Main diary interface with rich editor',
    HabitAnalyticsView: 'Habit progress visualization',
    EncryptionStatus: 'Visual encryption state indicator'
  },
  file: {
    FileUploadZone: 'Drag-drop file upload area',
    FileUploadModal: 'Multi-file upload modal',
    FileList: 'File list with sorting and filtering',
  },
  notes: {
    NoteEditor: 'Rich text note editor',
    NoteCard: 'Card component for note display'
  },
  projects: {
    ProjectCard: 'Card display for projects with statistics',
    ProjectForm: 'Create/edit project form'
  },
  search: {
    SearchTypeToggle: 'Toggle between search types',
    UnifiedSearchFilters: 'Advanced search filtering options'
  },
  shared: {
    Layout: 'Main application layout with navigation',
    BackupRestoreModal: 'Backup creation and restore interface'
  },
  todos: {
    TodoForm: 'Create/edit todo form',
    TodoList: 'List view with filtering',
    TodoStats: 'Task completion statistics'
  }
} as const;