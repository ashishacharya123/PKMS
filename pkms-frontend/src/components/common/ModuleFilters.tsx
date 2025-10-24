/**
 * ModuleFilters Component
 * Generic filter component that can be used across all modules
 * Follows DRY principles - reusable and configurable
 */

import { 
  Group, 
  Select, 
  MultiSelect, 
  Button, 
  Badge, 
  Stack,
  Text,
  ActionIcon,
  Tooltip,
  Switch
} from '@mantine/core';
import { 
  IconFilter, 
  IconX, 
  IconSortAscending, 
  IconSortDescending,
  IconCalendar,
  IconFile,
  IconStar,
  IconArchive,
  IconTag,
  IconClock,
  IconCode,
  IconChecklist
} from '@tabler/icons-react';

export interface ModuleFilters {
  favorites?: boolean;
  mimeTypes?: string[];
  dateRange?: 'all' | 'today' | 'week' | 'month' | 'year';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  showArchived?: boolean;
  // Allow custom filters
  [key: string]: any;
}

interface ModuleFiltersProps {
  filters: ModuleFilters;
  onFiltersChange: (filters: ModuleFilters) => void;
  activeFiltersCount: number;
  // Configuration for what filters to show
  showFavorites?: boolean;
  showMimeTypes?: boolean;
  showDateRange?: boolean;
  showArchived?: boolean;
  showSorting?: boolean;
  // Custom filter options
  customFilters?: Array<{
    key: string;
    label: string;
    type: 'select' | 'multiselect' | 'switch';
    options?: Array<{ value: string; label: string }>;
    placeholder?: string;
  }>;
  // Available options
  availableMimeTypes?: string[];
  sortOptions?: Array<{ value: string; label: string }>;
}

const defaultMimeTypeOptions = [
  { value: 'image/', label: 'Images' },
  { value: 'video/', label: 'Videos' },
  { value: 'audio/', label: 'Audio' },
  { value: 'application/pdf', label: 'PDFs' },
  { value: 'text/', label: 'Text Files' },
  { value: 'application/', label: 'Documents' },
];

// Module-specific filter configurations
export const MODULE_FILTER_CONFIGS = {
  archive: {
    showFavorites: true,
    showArchived: true,
    showMimeTypes: true,
    showDateRange: true,
    showSorting: true,
    customFilters: [
      {
        key: 'fileSize',
        label: 'File Size',
        type: 'select' as const,
        options: [
          { value: 'all', label: 'All Sizes' },
          { value: 'small', label: 'Small (< 1MB)' },
          { value: 'medium', label: 'Medium (1-10MB)' },
          { value: 'large', label: 'Large (10-100MB)' },
          { value: 'xlarge', label: 'Very Large (> 100MB)' },
        ],
        placeholder: 'All sizes'
      },
      {
        key: 'tags',
        label: 'Tags',
        type: 'multiselect' as const,
        options: [], // Will be populated dynamically
        placeholder: 'All tags'
      }
    ],
    sortOptions: [
      { value: 'name', label: 'Name' },
      { value: 'created_at', label: 'Created Date' },
      { value: 'updated_at', label: 'Modified Date' },
      { value: 'file_size', label: 'File Size' },
      { value: 'mime_type', label: 'File Type' },
    ]
  },
  
  todos: {
    showFavorites: true,
    showArchived: true,
    showDateRange: true,
    showSorting: true,
    customFilters: [
      {
        key: 'status',
        label: 'Status',
        type: 'multiselect' as const,
        options: [
          { value: 'pending', label: 'Pending' },
          { value: 'in_progress', label: 'In Progress' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' },
        ],
        placeholder: 'All statuses'
      },
      {
        key: 'priority',
        label: 'Priority',
        type: 'multiselect' as const,
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'urgent', label: 'Urgent' },
        ],
        placeholder: 'All priorities'
      },
      {
        key: 'todo_type',
        label: 'Type',
        type: 'multiselect' as const,
        options: [
          { value: 'task', label: 'Task' },
          { value: 'checklist', label: 'Checklist' },
          { value: 'subtask', label: 'Subtask' },
        ],
        placeholder: 'All types'
      },
      {
        key: 'projects',
        label: 'Projects',
        type: 'multiselect' as const,
        options: [], // Will be populated dynamically
        placeholder: 'All projects'
      }
    ],
    sortOptions: [
      { value: 'created_at', label: 'Created Date' },
      { value: 'updated_at', label: 'Modified Date' },
      { value: 'due_date', label: 'Due Date' },
      { value: 'title', label: 'Title' },
      { value: 'priority', label: 'Priority' },
      { value: 'status', label: 'Status' },
    ]
  },
  
  notes: {
    showFavorites: true,
    showArchived: true,
    showDateRange: true,
    showSorting: true,
    customFilters: [
      {
        key: 'tags',
        label: 'Tags',
        type: 'multiselect' as const,
        options: [], // Will be populated dynamically
        placeholder: 'All tags'
      },
      {
        key: 'wordCount',
        label: 'Word Count',
        type: 'select' as const,
        options: [
          { value: 'all', label: 'All Sizes' },
          { value: 'short', label: 'Short (< 100 words)' },
          { value: 'medium', label: 'Medium (100-500 words)' },
          { value: 'long', label: 'Long (500-1000 words)' },
          { value: 'very_long', label: 'Very Long (> 1000 words)' },
        ],
        placeholder: 'All sizes'
      }
    ],
    sortOptions: [
      { value: 'title', label: 'Title' },
      { value: 'created_at', label: 'Created Date' },
      { value: 'updated_at', label: 'Modified Date' },
      { value: 'size_bytes', label: 'Size' },
    ]
  },
  
  documents: {
    showFavorites: true,
    showArchived: true,
    showMimeTypes: true,
    showDateRange: true,
    showSorting: true,
    customFilters: [
      {
        key: 'fileSize',
        label: 'File Size',
        type: 'select' as const,
        options: [
          { value: 'all', label: 'All Sizes' },
          { value: 'small', label: 'Small (< 1MB)' },
          { value: 'medium', label: 'Medium (1-10MB)' },
          { value: 'large', label: 'Large (10-100MB)' },
          { value: 'xlarge', label: 'Very Large (> 100MB)' },
        ],
        placeholder: 'All sizes'
      },
      {
        key: 'tags',
        label: 'Tags',
        type: 'multiselect' as const,
        options: [], // Will be populated dynamically
        placeholder: 'All tags'
      }
    ],
    sortOptions: [
      { value: 'title', label: 'Title' },
      { value: 'created_at', label: 'Created Date' },
      { value: 'updated_at', label: 'Modified Date' },
      { value: 'file_size', label: 'File Size' },
      { value: 'mime_type', label: 'File Type' },
    ]
  },
  
  projects: {
    showFavorites: true,
    showArchived: true,
    showDateRange: true,
    showSorting: true,
    customFilters: [
      {
        key: 'status',
        label: 'Status',
        type: 'multiselect' as const,
        options: [
          { value: 'planning', label: 'Planning' },
          { value: 'active', label: 'Active' },
          { value: 'on_hold', label: 'On Hold' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' },
        ],
        placeholder: 'All statuses'
      },
      {
        key: 'priority',
        label: 'Priority',
        type: 'multiselect' as const,
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'urgent', label: 'Urgent' },
        ],
        placeholder: 'All priorities'
      },
      {
        key: 'tags',
        label: 'Tags',
        type: 'multiselect' as const,
        options: [], // Will be populated dynamically
        placeholder: 'All tags'
      }
    ],
    sortOptions: [
      { value: 'name', label: 'Name' },
      { value: 'created_at', label: 'Created Date' },
      { value: 'updated_at', label: 'Modified Date' },
      { value: 'due_date', label: 'Due Date' },
      { value: 'status', label: 'Status' },
      { value: 'priority', label: 'Priority' },
    ]
  }
};

const defaultDateRangeOptions = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
];

const defaultSortOptions = [
  { value: 'name', label: 'Name' },
  { value: 'created_at', label: 'Created Date' },
  { value: 'updated_at', label: 'Modified Date' },
  { value: 'file_size', label: 'File Size' },
];

// Helper function to get module-specific configuration
export function getModuleFilterConfig(module: string) {
  return MODULE_FILTER_CONFIGS[module as keyof typeof MODULE_FILTER_CONFIGS] || {
    showFavorites: false,
    showArchived: false,
    showMimeTypes: false,
    showDateRange: false,
    showSorting: true,
    customFilters: [],
    sortOptions: defaultSortOptions
  };
}

export function ModuleFilters({
  filters,
  onFiltersChange,
  activeFiltersCount,
  showFavorites = false,
  showMimeTypes = false,
  showDateRange = false,
  showArchived = false,
  showSorting = true,
  customFilters = [],
  availableMimeTypes = [],
  sortOptions = defaultSortOptions
}: ModuleFiltersProps) {
  const updateFilter = <K extends keyof ModuleFilters>(
    key: K, 
    value: ModuleFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAllFilters = () => {
    const defaultFilters: ModuleFilters = {
      sortBy: 'name',
      sortOrder: 'asc',
    };
    
    // Reset to defaults based on what's enabled
    if (showFavorites) defaultFilters.favorites = false;
    if (showMimeTypes) defaultFilters.mimeTypes = [];
    if (showDateRange) defaultFilters.dateRange = 'all';
    if (showArchived) defaultFilters.showArchived = false;
    
    onFiltersChange(defaultFilters);
  };

  const mimeTypeData = availableMimeTypes.length > 0 
    ? availableMimeTypes.map(type => ({ value: type, label: type }))
    : defaultMimeTypeOptions;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="xs" align="center">
          <IconFilter size={16} />
          <Text size="sm" fw={500}>Filters</Text>
          {activeFiltersCount > 0 && (
            <Badge size="sm" color="blue" variant="light">
              {activeFiltersCount}
            </Badge>
          )}
        </Group>
        
        {activeFiltersCount > 0 && (
          <Tooltip label="Clear all filters">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={clearAllFilters}
            >
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      {/* Basic Filters */}
      <Group gap="md" wrap="wrap">
        {showFavorites && (
          <Switch
            label="Favorites Only"
            checked={filters.favorites || false}
            onChange={(event) => updateFilter('favorites', event.currentTarget.checked)}
            size="sm"
          />
        )}

        {showArchived && (
          <Switch
            label="Show Archived"
            checked={filters.showArchived || false}
            onChange={(event) => updateFilter('showArchived', event.currentTarget.checked)}
            size="sm"
          />
        )}
      </Group>

      {/* Advanced Filters */}
      <Group gap="md" wrap="wrap">
        {showMimeTypes && (
          <MultiSelect
            label="File Types"
            placeholder="All types"
            data={mimeTypeData}
            value={filters.mimeTypes || []}
            onChange={(value) => updateFilter('mimeTypes', value)}
            clearable
            size="sm"
            style={{ minWidth: 200 }}
            leftSection={<IconFile size={14} />}
          />
        )}

        {showDateRange && (
          <Select
            label="Date Range"
            placeholder="All time"
            data={defaultDateRangeOptions}
            value={filters.dateRange || 'all'}
            onChange={(value) => updateFilter('dateRange', value as ModuleFilters['dateRange'])}
            clearable
            size="sm"
            style={{ minWidth: 150 }}
            leftSection={<IconCalendar size={14} />}
          />
        )}
      </Group>

      {/* Custom Filters */}
      {customFilters.length > 0 && (
        <Group gap="md" wrap="wrap">
          {customFilters.map((filter) => {
            if (filter.type === 'select') {
              return (
                <Select
                  key={filter.key}
                  label={filter.label}
                  placeholder={filter.placeholder}
                  data={filter.options || []}
                  value={filters[filter.key] || ''}
                  onChange={(value) => updateFilter(filter.key, value)}
                  clearable
                  size="sm"
                  style={{ minWidth: 150 }}
                />
              );
            }
            
            if (filter.type === 'multiselect') {
              return (
                <MultiSelect
                  key={filter.key}
                  label={filter.label}
                  placeholder={filter.placeholder}
                  data={filter.options || []}
                  value={filters[filter.key] || []}
                  onChange={(value) => updateFilter(filter.key, value)}
                  clearable
                  size="sm"
                  style={{ minWidth: 200 }}
                />
              );
            }
            
            if (filter.type === 'switch') {
              return (
                <Switch
                  key={filter.key}
                  label={filter.label}
                  checked={filters[filter.key] || false}
                  onChange={(event) => updateFilter(filter.key, event.currentTarget.checked)}
                  size="sm"
                />
              );
            }
            
            return null;
          })}
        </Group>
      )}

      {/* Sorting */}
      {showSorting && (
        <Group gap="md" wrap="wrap">
          <Select
            label="Sort By"
            placeholder="Sort by"
            data={sortOptions}
            value={filters.sortBy || 'name'}
            onChange={(value) => updateFilter('sortBy', value || 'name')}
            size="sm"
            style={{ minWidth: 150 }}
          />

          <Button
            variant="light"
            size="sm"
            leftSection={filters.sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
            onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          </Button>
        </Group>
      )}
    </Stack>
  );
}

export default ModuleFilters;
