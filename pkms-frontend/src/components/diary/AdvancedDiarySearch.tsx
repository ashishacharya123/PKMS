import { useState } from 'react';
import {
  Stack,
  Group,
  TextInput,
  Select,
  Switch,
  Button,
  Collapse,
  ActionIcon,
  Paper,
  Text,
  Badge,
  TagsInput,
  NumberInput,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconSearch,
  IconFilter,
  IconX,
  IconCalendar,
  IconMoodHappy,
  IconPhoto,
  IconTags,
} from '@tabler/icons-react';
import { useDiaryStore } from '../../stores/diaryStore';

interface SearchFilters {
  searchQuery: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  mood: string | null;
  hasMedia: boolean | null;
  tags: string[];
  dayOfWeek: string | null;
  minContentLength: number | null;
}

const initialFilters: SearchFilters = {
  searchQuery: '',
  dateFrom: null,
  dateTo: null,
  mood: null,
  hasMedia: null,
  tags: [],
  dayOfWeek: null,
  minContentLength: null,
};

const moodOptions = [
  { value: '5', label: '😄 Excellent (5)' },
  { value: '4', label: '😊 Good (4)' },
  { value: '3', label: '😐 Neutral (3)' },
  { value: '2', label: '😕 Low (2)' },
  { value: '1', label: '😢 Very Low (1)' },
];

const dayOfWeekOptions = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

export function AdvancedDiarySearch() {
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const store = useDiaryStore();
  const { setSearchQuery, entries } = store;

  // Extract unique tags from existing entries for suggestions
  const existingTags = Array.from(
    new Set(entries.flatMap(entry => entry.tags || []))
  ).sort();

  const hasActiveFilters = () => {
    return (
      filters.searchQuery ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.mood ||
      filters.hasMedia !== null ||
      filters.tags.length > 0 ||
      filters.dayOfWeek ||
      filters.minContentLength
    );
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.searchQuery) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    if (filters.mood) count++;
    if (filters.hasMedia !== null) count++;
    if (filters.tags.length > 0) count++;
    if (filters.dayOfWeek) count++;
    if (filters.minContentLength) count++;
    return count;
  };

  const handleFilterChange = (field: keyof SearchFilters, value: any) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleSearch = () => {
    // Apply search query using existing store method
    setSearchQuery(filters.searchQuery);
    
    // Apply other filters to the store (these should integrate with existing backend)
    // The DiaryStore already supports these filters via the backend API
    if (filters.hasMedia !== null) {
      store.setHasMedia(filters.hasMedia);
    }
    if (filters.dayOfWeek) {
      store.setDayOfWeek(parseInt(filters.dayOfWeek));
    }
    
    // Apply additional filters using the setFilter method
    const additionalFilters: any = {};
    if (filters.mood) {
      additionalFilters.mood = parseInt(filters.mood);
    }
    if (filters.dateFrom || filters.dateTo) {
      if (filters.dateFrom) {
        additionalFilters.year = filters.dateFrom.getFullYear();
        additionalFilters.month = filters.dateFrom.getMonth() + 1;
      }
    }
    
    if (Object.keys(additionalFilters).length > 0) {
      store.setFilter(additionalFilters);
    }
    
    // Trigger search
    store.loadEntries();
    
    console.log('Applied filters:', filters);
  };

  const handleClearFilters = () => {
    setFilters(initialFilters);
    
    // Clear all filters in store
    store.clearFilters();
    
    // Reload entries
    store.loadEntries();
  };

  const handleQuickSearch = (query: string) => {
    setFilters(prev => ({ ...prev, searchQuery: query }));
    setSearchQuery(query);
  };

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        {/* Main Search Bar */}
        <Group>
          <TextInput
            style={{ flex: 1 }}
            placeholder="Search diary entries by title, content, or tags..."
            value={filters.searchQuery}
            onChange={(event) => handleFilterChange('searchQuery', event.currentTarget.value)}
            leftSection={<IconSearch size={16} />}
            rightSection={
              filters.searchQuery && (
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => handleFilterChange('searchQuery', '')}
                >
                  <IconX size={14} />
                </ActionIcon>
              )
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleSearch();
              }
            }}
          />
          <Button
            leftSection={<IconFilter size={16} />}
            variant={showAdvanced ? 'filled' : 'light'}
            onClick={() => setShowAdvanced(!showAdvanced)}
            rightSection={
              hasActiveFilters() && (
                <Badge size="xs" color="blue" variant="filled">
                  {getActiveFilterCount()}
                </Badge>
              )
            }
          >
            Filters
          </Button>
        </Group>

        {/* Quick Search Suggestions */}
        {!filters.searchQuery && (
          <Group gap="xs">
            <Text size="xs" c="dimmed">Quick searches:</Text>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => handleQuickSearch('mood:good')}
            >
              Good mood days
            </Button>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => handleQuickSearch('this week')}
            >
              This week
            </Button>
            <Button
              size="xs"
              variant="subtle"
              onClick={() => handleQuickSearch('exercise')}
            >
              Exercise entries
            </Button>
          </Group>
        )}

        {/* Advanced Filters */}
        <Collapse in={showAdvanced}>
          <Stack gap="md" pt="md">
            {/* Date Range */}
            <Group grow>
              <DatePickerInput
                label="From Date"
                placeholder="Select start date"
                value={filters.dateFrom}
                onChange={(date) => handleFilterChange('dateFrom', date)}
                leftSection={<IconCalendar size={16} />}
                clearable
              />
              <DatePickerInput
                label="To Date"
                placeholder="Select end date"
                value={filters.dateTo}
                onChange={(date) => handleFilterChange('dateTo', date)}
                leftSection={<IconCalendar size={16} />}
                clearable
              />
            </Group>

            {/* Mood and Media Filters */}
            <Group grow>
              <Select
                label="Mood Filter"
                placeholder="Filter by mood"
                value={filters.mood}
                onChange={(value) => handleFilterChange('mood', value)}
                data={moodOptions}
                leftSection={<IconMoodHappy size={16} />}
                clearable
              />
              <Select
                label="Day of Week"
                placeholder="Filter by day"
                value={filters.dayOfWeek}
                onChange={(value) => handleFilterChange('dayOfWeek', value)}
                data={dayOfWeekOptions}
                clearable
              />
            </Group>

            {/* Tags and Content Length */}
            <Group grow>
              <TagsInput
                label="Tags"
                placeholder="Filter by tags"
                value={filters.tags}
                onChange={(tags) => handleFilterChange('tags', tags)}
                data={existingTags}
                leftSection={<IconTags size={16} />}
                clearable
              />
              <NumberInput
                label="Min Content Length"
                placeholder="Minimum characters"
                value={filters.minContentLength || undefined}
                onChange={(value) => handleFilterChange('minContentLength', value)}
                min={0}
              />
            </Group>

            {/* Media and Advanced Options */}
            <Group>
              <Switch
                label="Has Photos/Videos"
                checked={filters.hasMedia === true}
                onChange={(event) => 
                  handleFilterChange('hasMedia', event.currentTarget.checked ? true : null)
                }
                thumbIcon={<IconPhoto size={12} />}
              />
              <Switch
                label="No Media"
                checked={filters.hasMedia === false}
                onChange={(event) => 
                  handleFilterChange('hasMedia', event.currentTarget.checked ? false : null)
                }
              />
            </Group>

            {/* Filter Actions */}
            <Group justify="space-between">
              <Group>
                <Button
                  variant="filled"
                  leftSection={<IconSearch size={16} />}
                  onClick={handleSearch}
                >
                  Apply Filters
                </Button>
                <Button
                  variant="light"
                  leftSection={<IconX size={16} />}
                  onClick={handleClearFilters}
                  disabled={!hasActiveFilters()}
                >
                  Clear All
                </Button>
              </Group>
              
              {hasActiveFilters() && (
                <Text size="xs" c="dimmed">
                  {getActiveFilterCount()} filter{getActiveFilterCount() !== 1 ? 's' : ''} active
                </Text>
              )}
            </Group>
          </Stack>
        </Collapse>

        {/* Active Filters Display */}
        {hasActiveFilters() && !showAdvanced && (
          <Group gap="xs">
            <Text size="xs" c="dimmed">Active filters:</Text>
            {filters.mood && (
              <Badge variant="light" size="sm">
                Mood: {moodOptions.find(m => m.value === filters.mood)?.label}
              </Badge>
            )}
            {filters.hasMedia !== null && (
              <Badge variant="light" size="sm">
                {filters.hasMedia ? 'Has Media' : 'No Media'}
              </Badge>
            )}
            {filters.tags.length > 0 && (
              <Badge variant="light" size="sm">
                Tags: {filters.tags.length}
              </Badge>
            )}
            {(filters.dateFrom || filters.dateTo) && (
              <Badge variant="light" size="sm">
                Date Range
              </Badge>
            )}
          </Group>
        )}
      </Stack>
    </Paper>
  );
}
