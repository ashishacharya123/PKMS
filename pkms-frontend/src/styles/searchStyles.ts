/**
 * Unified Search Styles
 *
 * Consistent styling across all search components including:
 * - Unified Search Interface
 * - Diary Search
 * - Search Results Display
 * - Search Filters and Controls
 */

import { createStyles, MantineTheme } from '@mantine/core';

export const searchStyles = createStyles((theme: MantineTheme) => ({
  // Search Container
  searchContainer: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[0],
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },

  // Search Header
  searchHeader: {
    borderBottom: `2px solid ${theme.colors[theme.primaryColor][4]}`,
    paddingBottom: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },

  // Search Input
  searchInput: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
    borderColor: theme.colors[theme.primaryColor][4],
    '&:focus': {
      borderColor: theme.colors[theme.primaryColor][6],
      boxShadow: `0 0 0 2px ${theme.colors[theme.primaryColor][2]}`,
    },
  },

  // Search Button
  searchButton: {
    backgroundColor: theme.colors[theme.primaryColor][6],
    '&:hover': {
      backgroundColor: theme.colors[theme.primaryColor][7],
    },
  },

  // Result Cards
  resultCard: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
    border: `1px solid ${theme.colors.gray[3]}`,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    transition: 'all 0.2s ease',
    '&:hover': {
      borderColor: theme.colors[theme.primaryColor][4],
      boxShadow: theme.shadows.sm,
      transform: 'translateY(-1px)',
    },
  },

  // Result Header
  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },

  // Result Title
  resultTitle: {
    color: theme.colorScheme === 'dark' ? theme.white : theme.black,
    fontWeight: 600,
    fontSize: theme.fontSizes.sm,
    marginBottom: theme.spacing.xs,
  },

  // Result Content
  resultContent: {
    color: theme.colors.gray[6],
    fontSize: theme.fontSizes.xs,
    lineHeight: 1.4,
    marginBottom: theme.spacing.xs,
  },

  // Result Meta
  resultMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },

  // Type Badge
  typeBadge: {
    fontSize: theme.fontSizes.xs,
    fontWeight: 500,
  },

  // Score Badge
  scoreBadge: {
    fontSize: theme.fontSizes.xs,
    backgroundColor: theme.colors[theme.primaryColor][1],
    color: theme.colors[theme.primaryColor][9],
  },

  // Search Tabs
  searchTabs: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[1],
    borderRadius: theme.radius.md,
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },

  // Active Tab
  activeTab: {
    backgroundColor: theme.colors[theme.primaryColor][6],
    color: theme.white,
    '&:hover': {
      backgroundColor: theme.colors[theme.primaryColor][7],
    },
  },

  // Inactive Tab
  inactiveTab: {
    backgroundColor: 'transparent',
    color: theme.colors.gray[6],
    '&:hover': {
      backgroundColor: theme.colors.gray[2],
    },
  },

  // Filters Panel
  filtersPanel: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
    border: `1px solid ${theme.colors.gray[3]}`,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },

  // Filter Section
  filterSection: {
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    borderBottom: `1px solid ${theme.colors.gray[3]}`,
  },

  // Filter Title
  filterTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: 600,
    marginBottom: theme.spacing.xs,
    color: theme.colorScheme === 'dark' ? theme.white : theme.black,
  },

  // Pagination
  paginationContainer: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },

  // Loading Overlay
  loadingOverlay: {
    backgroundColor: theme.colorScheme === 'dark' ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.8)',
  },

  // Alert Styles
  infoAlert: {
    backgroundColor: theme.colors.blue[1],
    border: `1px solid ${theme.colors.blue[4]}`,
    color: theme.colors.blue[9],
  },

  warningAlert: {
    backgroundColor: theme.colors.orange[1],
    border: `1px solid ${theme.colors.orange[4]}`,
    color: theme.colors.orange[9],
  },

  successAlert: {
    backgroundColor: theme.colors.green[1],
    border: `1px solid ${theme.colors.green[4]}`,
    color: theme.colors.green[9],
  },

  // Privacy Notice
  privacyNotice: {
    backgroundColor: theme.colors.orange[1],
    border: `1px solid ${theme.colors.orange[4]}`,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },

  // Diary-specific Styles
  diarySearchContainer: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.pink[0],
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },

  diaryResultCard: {
    borderLeft: `4px solid ${theme.colors.pink[6]}`,
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },

  diaryTag: {
    backgroundColor: theme.colors.pink[1],
    color: theme.colors.pink[9],
    borderColor: theme.colors.pink[4],
  },

  // Mood Indicators
  moodIcon: {
    fontSize: theme.fontSizes.sm,
  },

  moodHappy: {
    color: theme.colors.yellow[6],
  },

  moodSad: {
    color: theme.colors.blue[6],
  },

  moodNeutral: {
    color: theme.colors.gray[6],
  },

  // Responsive Design
  responsiveStack: {
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      gap: theme.spacing.sm,
    },
  },

  responsiveGroup: {
    '@media (max-width: 768px)': {
      flexDirection: 'column',
      width: '100%',
    },
  },

  // Search Statistics
  searchStats: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.colors.gray[1],
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },

  statsText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.gray[6],
  },

  // Highlight Match
  highlightMatch: {
    backgroundColor: theme.colors.yellow[2],
    color: theme.colors.yellow[9],
    padding: '0 2px',
    borderRadius: '2px',
    fontWeight: 500,
  },

  // No Results
  noResultsContainer: {
    textAlign: 'center',
    padding: theme.spacing.xl,
    color: theme.colors.gray[6],
  },

  // Search Suggestions
  suggestionItem: {
    padding: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: theme.colors.gray[1],
    },
  },

  // Active Filters Display
  activeFilterChip: {
    backgroundColor: theme.colors[theme.primaryColor][1],
    color: theme.colors[theme.primaryColor][9],
    borderColor: theme.colors[theme.primaryColor][4],
  },
}));

// Component-specific style classes
export const searchStyleClasses = {
  // Layout classes
  container: 'search-container',
  header: 'search-header',
  content: 'search-content',
  sidebar: 'search-sidebar',
  main: 'search-main',

  // Input classes
  input: 'search-input',
  inputWrapper: 'search-input-wrapper',
  inputIcon: 'search-input-icon',

  // Button classes
  button: 'search-button',
  buttonPrimary: 'search-button-primary',
  buttonSecondary: 'search-button-secondary',
  buttonIcon: 'search-button-icon',

  // Result classes
  result: 'search-result',
  resultCard: 'search-result-card',
  resultHeader: 'search-result-header',
  resultTitle: 'search-result-title',
  resultContent: 'search-result-content',
  resultMeta: 'search-result-meta',

  // Filter classes
  filter: 'search-filter',
  filterPanel: 'search-filter-panel',
  filterSection: 'search-filter-section',
  filterTitle: 'search-filter-title',

  // State classes
  loading: 'search-loading',
  error: 'search-error',
  empty: 'search-empty',
  disabled: 'search-disabled',

  // Responsive classes
  mobile: 'search-mobile',
  tablet: 'search-tablet',
  desktop: 'search-desktop',
};

// CSS-in-JS utility functions
export const getSearchColor = (type: string, theme: MantineTheme) => {
  const colorMap: Record<string, string> = {
    note: theme.colors.blue[6],
    document: theme.colors.green[6],
    todo: theme.colors.orange[6],
    archive: theme.colors.gray[6],
    diary: theme.colors.pink[6],
    folder: theme.colors.purple[6],
  };
  return colorMap[type] || theme.colors.gray[6];
};

export const getSearchIcon = (type: string) => {
  // This would return the appropriate icon component
  // Implementation depends on icon library used
  return null;
};

export default searchStyles;