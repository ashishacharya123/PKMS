/**
 * Diary Components Index
 * Exports all diary-related components
 */

// Core Diary Components
export { default as DiarySearch } from './DiarySearch.tsx';
export { default as EncryptionStatus } from './EncryptionStatus.tsx';
export { HistoricalEntries } from './HistoricalEntries.tsx';
export { KeyboardShortcutsHelp, KeyboardShortcutsButton } from './KeyboardShortcutsHelp.tsx';
export { WeeklyHighlightsPanel } from './WeeklyHighlightsPanel.tsx';

// Habit Analytics System (New Architecture)
export { default as HabitDashboard } from './HabitDashboard.tsx';
export { HabitInput } from './HabitInput.tsx';
export { default as HabitAnalyticsView } from './HabitAnalyticsView.tsx';
export { HabitManagement } from './HabitManagement.tsx';
export { default as HabitCharts } from './HabitCharts.tsx';

// Search & Analytics
export { AdvancedDiarySearch } from './AdvancedDiarySearch.tsx';
export { AdvancedSearchAnalytics } from './AdvancedSearchAnalytics.tsx';

// Security & Session Management
export { SessionTimeoutWarning } from './SessionTimeoutWarning.tsx';
