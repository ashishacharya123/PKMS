import React, { useState, useEffect } from 'react';
import {
  Stack,
  Title,
  Group,
  Text,
  Select,
  MultiSelect,
  Switch,
  Button,
  Divider,
  Checkbox,
  DateInput,
  NumberInput,
  Slider,
  Accordion,
  Badge,
  ActionIcon,
  Tooltip,
  Box,
  TextInput,
  Chip
} from '@mantine/core';
import {
  IconFilter,
  IconX,
  IconCalendar,
  IconTag,
  IconSettings,
  IconDeviceFloppy,
  IconRefresh,
  IconStar,
  IconLock,
  IconAdjustmentsHorizontal
} from '@tabler/icons-react';
import { DateInputProps } from '@mantine/dates';
import { TagInfo, SearchFilters } from '../../services/searchService';
import searchStyles from '../../styles/searchStyles';

interface EnhancedSearchFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  availableTags: TagInfo[];
  availableModules: Array<{ value: string; label: string }>;
  onApply: () => void;
  onClear: () => void;
  isOpen: boolean;
  onClose: () => void;
  searchType: 'fts5' | 'fuzzy' | 'hybrid';
}

const EnhancedSearchFilters: React.FC<EnhancedSearchFiltersProps> = ({
  filters,
  onFiltersChange,
  availableTags,
  availableModules,
  onApply,
  onClear,
  isOpen,
  onClose,
  searchType
}) => {
  const [activeSections, setActiveSections] = useState<string[]>(['basic', 'sorting']);
  const [presetFilters, setPresetFilters] = useState<Array<{ name: string; filters: SearchFilters }>>([]);

  // Load saved filter presets
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pkms_filter_presets');
      if (saved) {
        setPresetFilters(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load filter presets:', error);
    }
  }, []);

  const handlePresetApply = (presetFilters: SearchFilters) => {
    onFiltersChange(presetFilters);
    onApply();
  };

  const savePreset = () => {
    const presetName = prompt('Enter a name for this filter preset:');
    if (presetName) {
      const newPresets = [
        ...presetFilters.filter(p => p.name !== presetName),
        { name: presetName, filters: { ...filters } }
      ];
      setPresetFilters(newPresets);
      try {
        localStorage.setItem('pkms_filter_presets', JSON.stringify(newPresets));
      } catch (error) {
        console.error('Failed to save filter presets:', error);
      }
    }
  };

  const deletePreset = (presetName: string) => {
    const newPresets = presetFilters.filter(p => p.name !== presetName);
    setPresetFilters(newPresets);
    try {
      localStorage.setItem('pkms_filter_presets', JSON.stringify(newPresets));
    } catch (error) {
      console.error('Failed to delete filter preset:', error);
    }
  };

  const updateFilter = (key: keyof SearchFilters, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const presetOptions = [
    { name: 'Recent Items', filters: { sort_by: 'date', sort_order: 'desc' as const } },
    { name: 'Favorites Only', filters: { favorites_only: true, sort_by: 'date', sort_order: 'desc' as const } },
    { name: 'High Priority Tasks', filters: { include_tags: ['urgent', 'important'], todo_priority: '1' } },
    { name: 'This Week', filters: { date_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() } },
    { name: 'Active Projects', filters: { include_tags: ['project'], todo_status: 'in_progress' } }
  ];

  return (
    <Box style={{
      position: 'fixed',
      top: 0,
      right: isOpen ? 0 : '-400px',
      width: '400px',
      height: '100vh',
      backgroundColor: 'white',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
      transition: 'right 0.3s ease',
      zIndex: 1000,
      overflow: 'auto'
    }}>
      <Stack p="md" gap="md">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Title order={3}>
            <Group gap="xs">
              <IconFilter size={20} />
              Search Filters
            </Group>
          </Title>
          <ActionIcon onClick={onClose} size="lg">
            <IconX size={20} />
          </ActionIcon>
        </Group>

        {/* Quick Presets */}
        <Box>
          <Title order={5} mb="xs">Quick Presets</Title>
          <Group gap="xs" wrap="wrap">
            {presetOptions.map((preset, index) => (
              <Chip
                key={index}
                onClick={() => handlePresetApply(preset.filters)}
                variant="outline"
                size="sm"
              >
                {preset.name}
              </Chip>
            ))}
          </Group>
        </Box>

        {/* Saved Presets */}
        {presetFilters.length > 0 && (
          <Box>
            <Group justify="space-between" align="center" mb="xs">
              <Title order={5}>Saved Presets</Title>
              <ActionIcon onClick={savePreset} size="sm" variant="subtle">
                <IconDeviceFloppy size={16} />
              </ActionIcon>
            </Group>
            <Stack gap="xs">
              {presetFilters.map((preset, index) => (
                <Group key={index} justify="space-between" align="center">
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => handlePresetApply(preset.filters)}
                    style={{ flex: 1 }}
                    justify="flex-start"
                  >
                    {preset.name}
                  </Button>
                  <ActionIcon
                    onClick={() => deletePreset(preset.name)}
                    size="xs"
                    color="red"
                  >
                    <IconX size={12} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </Box>
        )}

        <Divider />

        {/* Filter Sections */}
        <Accordion
          value={activeSections}
          onChange={setActiveSections}
          variant="separated"
          multiple
        >
          {/* Content Types */}
          <Accordion.Item value="content">
            <Accordion.Control icon={<IconAdjustmentsHorizontal size={16} />}>
              Content Types
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Text size="xs" c="dimmed">Select which modules to search</Text>
                <MultiSelect
                  data={availableModules}
                  value={filters.types || []}
                  onChange={(value) => updateFilter('types', value)}
                  placeholder="All modules"
                  searchable
                  clearable
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          {/* Date Range */}
          <Accordion.Item value="dates">
            <Accordion.Control icon={<IconCalendar size={16} />}>
              Date Range
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <DateInput
                  label="From Date"
                  placeholder="Pick start date"
                  value={filters.dateFrom ? new Date(filters.dateFrom) : null}
                  onChange={(value) => updateFilter('dateFrom', value?.toISOString())}
                  clearable
                />
                <DateInput
                  label="To Date"
                  placeholder="Pick end date"
                  value={filters.dateTo ? new Date(filters.dateTo) : null}
                  onChange={(value) => updateFilter('dateTo', value?.toISOString())}
                  clearable
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          {/* Tags */}
          <Accordion.Item value="tags">
            <Accordion.Control icon={<IconTag size={16} />}>
              Tags
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <MultiSelect
                  label="Include Tags"
                  placeholder="Select tags to include"
                  data={availableTags.map(tag => ({ value: tag.name, label: `${tag.name} (${tag.count})` }))}
                  value={filters.include_tags || []}
                  onChange={(value) => updateFilter('include_tags', value)}
                  searchable
                  clearable
                />
                <MultiSelect
                  label="Exclude Tags"
                  placeholder="Select tags to exclude"
                  data={availableTags.map(tag => ({ value: tag.name, label: tag.name }))}
                  value={filters.exclude_tags || []}
                  onChange={(value) => updateFilter('exclude_tags', value)}
                  searchable
                  clearable
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          {/* Sorting */}
          <Accordion.Item value="sorting">
            <Accordion.Control icon={<IconSettings size={16} />}>
              Sorting
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Select
                  label="Sort By"
                  data={[
                    { value: 'relevance', label: 'Relevance' },
                    { value: 'date', label: 'Date' },
                    { value: 'title', label: 'Title' },
                    { value: 'module', label: 'Module' }
                  ]}
                  value={filters.sortBy || 'relevance'}
                  onChange={(value) => updateFilter('sortBy', value as any)}
                />
                <Select
                  label="Sort Order"
                  data={[
                    { value: 'asc', label: 'Ascending' },
                    { value: 'desc', label: 'Descending' }
                  ]}
                  value={filters.sortOrder || 'desc'}
                  onChange={(value) => updateFilter('sortOrder', value as any)}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          {/* Options */}
          <Accordion.Item value="options">
            <Accordion.Control icon={<IconStar size={16} />}>
              Options
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <Switch
                  label="Favorites Only"
                  description="Only show favorited items"
                  checked={filters.favorites_only || false}
                  onChange={(e) => updateFilter('favorites_only', e.target.checked)}
                />
                <Switch
                  label="Include Archived"
                  description="Include archived items in results"
                  checked={filters.include_archived ?? true}
                  onChange={(e) => updateFilter('include_archived', e.target.checked)}
                />
                <Switch
                  label="Exclude Diary Entries"
                  description="Hide diary entries for privacy"
                  checked={filters.exclude_diary ?? true}
                  onChange={(e) => updateFilter('exclude_diary', e.target.checked)}
                  icon={<IconLock size={16} />}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          {/* Advanced Filters */}
          {searchType === 'fuzzy' && (
            <Accordion.Item value="fuzzy">
              <Accordion.Control icon={<IconAdjustmentsHorizontal size={16} />}>
                Fuzzy Search Settings
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <Text size="xs" c="dimmed">Matching threshold: {filters.fuzzy_threshold || 60}%</Text>
                  <Slider
                    value={filters.fuzzy_threshold || 60}
                    onChange={(value) => updateFilter('fuzzy_threshold', value)}
                    min={0}
                    max={100}
                    step={5}
                    marks={[
                      { value: 0, label: '0%' },
                      { value: 50, label: '50%' },
                      { value: 100, label: '100%' }
                    ]}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {/* File Filters */}
          <Accordion.Item value="files">
            <Accordion.Control icon={<IconAdjustmentsHorizontal size={16} />}>
              File Filters
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <TextInput
                  label="MIME Types"
                  placeholder="e.g., image/*, application/pdf"
                  value={filters.mime_types || ''}
                  onChange={(e) => updateFilter('mime_types', e.target.value)}
                />
                <Group grow>
                  <NumberInput
                    label="Min File Size (MB)"
                    placeholder="0"
                    value={filters.min_file_size}
                    onChange={(value) => updateFilter('min_file_size', value)}
                    min={0}
                  />
                  <NumberInput
                    label="Max File Size (MB)"
                    placeholder="50"
                    value={filters.max_file_size}
                    onChange={(value) => updateFilter('max_file_size', value)}
                    min={0}
                  />
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        {/* Action Buttons */}
        <Stack gap="sm">
          <Button onClick={onApply} fullWidth>
            Apply Filters
          </Button>
          <Group grow>
            <Button variant="outline" onClick={onClear}>
              Clear All
            </Button>
            <Button variant="outline" onClick={savePreset}>
              Save Preset
            </Button>
          </Group>
        </Stack>

        {/* Active Filters Summary */}
        <Box>
          <Title order={5} mb="xs">Active Filters</Title>
          <Group gap="xs" wrap="wrap">
            {filters.favorites_only && (
              <Badge color="yellow">Favorites Only</Badge>
            )}
            {filters.include_archived === false && (
              <Badge color="blue">Exclude Archived</Badge>
            )}
            {filters.exclude_diary === false && (
              <Badge color="pink">Include Diary</Badge>
            )}
            {(filters.include_tags || []).map(tag => (
              <Badge key={tag} color="green" variant="outline">+{tag}</Badge>
            ))}
            {(filters.exclude_tags || []).map(tag => (
              <Badge key={tag} color="red" variant="outline">-{tag}</Badge>
            ))}
            {filters.dateFrom && (
              <Badge color="blue">From {new Date(filters.dateFrom).toLocaleDateString()}</Badge>
            )}
            {filters.dateTo && (
              <Badge color="blue">To {new Date(filters.dateTo).toLocaleDateString()}</Badge>
            )}
          </Group>
        </Box>
      </Stack>
    </Box>
  );
};

export default EnhancedSearchFilters;