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

// Wellness & Analytics
export { WellnessAnalytics } from './WellnessAnalytics.tsx';
export { AdvancedWellnessAnalytics } from './AdvancedWellnessAnalytics.tsx';

// Habit Tracking
export { UnifiedHabitTracker } from './UnifiedHabitTracker.tsx';
export { HabitAnalytics } from './HabitAnalytics.tsx';

// Search & Analytics
export { AdvancedDiarySearch } from './AdvancedDiarySearch.tsx';
export { AdvancedSearchAnalytics } from './AdvancedSearchAnalytics.tsx';

// Security & Session Management
export { SessionTimeoutWarning } from './SessionTimeoutWarning.tsx';

// Legacy/Unused Components (for reference)
export { HabitAnalytics as HabitAnalyticsUnused } from './HabitAnalytics_unused.tsx';
export { AdvancedAnalytics as AdvancedAnalyticsUnused } from './AdvancedAnalytics_unused.tsx';
export { WellnessBadges as WellnessBadgesUnused } from './WellnessBadges_unused.tsx';
