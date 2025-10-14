/**
 * Unified Search Styles
 *
 * Consistent styling across all search components including:
 * - Unified Search Interface
 * - Diary Search
 * - Search Results Display
 * - Search Filters and Controls
 */

import { MantineTheme } from '@mantine/core';

export const getSearchStyles = (theme: MantineTheme) => ({
  // Search Container
  searchContainer: {
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },

  // Search Header
  searchHeader: {
    borderBottom: `2px solid ${theme.colors[theme.primaryColor]?.[4]}`,
    paddingBottom: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },

  // Search Input
  searchInput: {
    borderColor: theme.colors[theme.primaryColor]?.[4],
    '&:focus': {
      borderColor: theme.colors[theme.primaryColor]?.[6],
      boxShadow: `0 0 0 2px ${theme.colors[theme.primaryColor]?.[2]}`,
    },
  },

  // Search Button
  searchButton: {
    backgroundColor: theme.colors[theme.primaryColor]?.[6],
    '&:hover': {
      backgroundColor: theme.colors[theme.primaryColor]?.[7],
    },
  },

  // Result Cards
  resultCard: {
    border: `1px solid ${theme.colors.gray?.[3]}`,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    transition: 'all 0.2s ease',
    '&:hover': {
      boxShadow: theme.shadows.md,
      transform: 'translateY(-2px)',
    },
  },

  // Result Header
  resultHeader: {
    marginBottom: theme.spacing.xs,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Result Title
  resultTitle: {
    fontWeight: 600,
    fontSize: theme.fontSizes.lg,
    marginBottom: theme.spacing.xs,
  },

  // Result Metadata
  resultMetadata: {
    display: 'flex',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },

  // Filter Drawer
  filterDrawer: {
    padding: theme.spacing.md,
  },

  // Filter Section
  filterSection: {
    marginBottom: theme.spacing.lg,
  },

  // Filter Group
  filterGroup: {
    marginBottom: theme.spacing.md,
  },

  // Stats Container
  statsContainer: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
  },

  // Empty State
  emptyState: {
    textAlign: 'center' as const,
    padding: theme.spacing.xl,
  },

  // Loading Overlay
  loadingOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },

  // Search Suggestions
  suggestionsList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },

  suggestionItem: {
    padding: theme.spacing.sm,
    cursor: 'pointer',
    borderRadius: theme.radius.sm,
    '&:hover': {
      backgroundColor: theme.colors.gray?.[1],
    },
  },

  // Tag Pills
  tagPill: {
    borderRadius: theme.radius.xl,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    fontSize: theme.fontSizes.sm,
  },

  // Quick Filters
  quickFilters: {
    display: 'flex',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    marginBottom: theme.spacing.md,
  },

  // Module Badge
  moduleBadge: {
    fontWeight: 500,
  },

  // Priority Indicator
  priorityIndicator: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
    marginRight: theme.spacing.xs,
  },

  // Status Badge
  statusBadge: {
    textTransform: 'capitalize' as const,
  },

  // Search Stats
  searchStats: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },

  // Highlight Text
  highlightText: {
    backgroundColor: theme.colors.yellow?.[2],
    padding: '0 2px',
    borderRadius: 2,
  },
});

// Helper functions for consistent styling
export const getTypeColor = (type: string): string => {
  const colorMap: Record<string, string> = {
    note: 'blue',
    document: 'green',
    todo: 'orange',
    diary: 'pink',
    archive: 'gray',
    folder: 'violet',
  };
  return colorMap[type.toLowerCase()] || 'gray';
};

export const getPriorityColor = (priority: number): string => {
  if (priority >= 4) return 'red';
  if (priority === 3) return 'orange';
  if (priority === 2) return 'blue';
  return 'gray';
};

export const getStatusColor = (status: string): string => {
  const colorMap: Record<string, string> = {
    completed: 'green',
    'in-progress': 'blue',
    pending: 'gray',
    blocked: 'red',
    archived: 'gray',
  };
  return colorMap[status.toLowerCase()] || 'gray';
};

export const getRelevanceColor = (relevance: number): string => {
  if (relevance >= 0.8) return 'green';
  if (relevance >= 0.5) return 'blue';
  if (relevance >= 0.3) return 'orange';
  return 'gray';
};

// Icon mapping for search results
export const getSearchIcon = (_type: string) => {
  // Icons are now handled directly in components with @tabler/icons-react
  return null;
};

export default getSearchStyles;
