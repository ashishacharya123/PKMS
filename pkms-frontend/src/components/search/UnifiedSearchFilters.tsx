import React, { useState, useEffect } from 'react';
import {
  Stack,
  Title,
  Group,
  Select,
  MultiSelect,
  Switch,
  Button,
  Divider,
  Accordion,
  Badge,
  ActionIcon,
  Box,
} from '@mantine/core';
import {
  IconFilter,
  IconX,
  IconTag,
  IconSettings,
  IconDeviceFloppy,
  IconRefresh,
  IconStar,
} from '@tabler/icons-react';
import type { SearchFilters, TagInfo } from '../../services/searchService';

interface UnifiedSearchFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  availableTags: TagInfo[];
  availableModules: Array<{ value: string; label: string }>;
  onApply: () => void;
  onClear: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const UnifiedSearchFilters: React.FC<UnifiedSearchFiltersProps> = ({
  filters,
  onFiltersChange,
  availableTags,
  availableModules,
  onApply,
  onClear,
  isOpen,
  onClose,
}) => {
  const [presetFilters, setPresetFilters] = useState<Array<{ name: string; filters: SearchFilters }>>([]);
  const [activeSections, setActiveSections] = useState<string[]>(['modules', 'sorting']);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pkms_filter_presets');
      if (saved) setPresetFilters(JSON.parse(saved));
    } catch (error) {
      console.error('Failed to load filter presets:', error);
    }
  }, []);

  const updateFilter = (key: keyof SearchFilters, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handlePresetApply = (preset: SearchFilters) => {
    onFiltersChange({ ...filters, ...preset });
    onApply();
  };

  const savePreset = () => {
    const name = prompt('Preset name');
    if (!name) return;
    const presets = [...presetFilters.filter((p) => p.name !== name), { name, filters }];
    setPresetFilters(presets);
    localStorage.setItem('pkms_filter_presets', JSON.stringify(presets));
  };

  const deletePreset = (name: string) => {
    const presets = presetFilters.filter((p) => p.name !== name);
    setPresetFilters(presets);
    localStorage.setItem('pkms_filter_presets', JSON.stringify(presets));
  };

  return (
    <Box
      style={{
        position: 'fixed',
        top: 0,
        right: isOpen ? 0 : '-420px',
        width: '420px',
        height: '100vh',
        backgroundColor: 'white',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
        transition: 'right 0.3s ease',
        zIndex: 1000,
        overflowY: 'auto',
      }}
    >
      <Stack p="md" gap="md">
        <Group justify="space-between" align="center">
          <Title order={3}>
            <Group gap="xs">
              <IconFilter size={20} />
              Search Filters
            </Group>
          </Title>
          <ActionIcon onClick={onClose} size="lg">
            <IconX size={18} />
          </ActionIcon>
        </Group>

        {presetFilters.length > 0 && (
          <Box>
            <Group justify="space-between" align="center" mb="xs">
              <Title order={5}>Saved Presets</Title>
              <ActionIcon onClick={savePreset} size="sm" variant="subtle">
                <IconDeviceFloppy size={16} />
              </ActionIcon>
            </Group>
            <Stack gap="xs">
              {presetFilters.map((preset) => (
                <Group key={preset.name} justify="space-between" align="center">
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => handlePresetApply(preset.filters)}
                  >
                    {preset.name}
                  </Button>
                  <ActionIcon color="red" size="xs" onClick={() => deletePreset(preset.name)}>
                    <IconX size={12} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          </Box>
        )}

        <Divider />

        <Accordion multiple value={activeSections} onChange={setActiveSections} variant="separated">
          <Accordion.Item value="modules">
            <Accordion.Control icon={<IconFilter size={16} />}>Modules</Accordion.Control>
            <Accordion.Panel>
              <MultiSelect
                data={availableModules}
                value={filters.modules ?? []}
                onChange={(value) => updateFilter('modules', value)}
                placeholder="All modules"
                searchable
                clearable
              />
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="tags">
            <Accordion.Control icon={<IconTag size={16} />}>Tags</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <MultiSelect
                  label="Include tags"
                  data={availableTags.map((tag) => ({ value: tag.name, label: `${tag.name}${tag.count ? ` (${tag.count})` : ''}` }))}
                  value={filters.include_tags ?? []}
                  onChange={(value) => updateFilter('include_tags', value)}
                  searchable
                  clearable
                />
                <MultiSelect
                  label="Exclude tags"
                  data={availableTags.map((tag) => ({ value: tag.name, label: tag.name }))}
                  value={filters.exclude_tags ?? []}
                  onChange={(value) => updateFilter('exclude_tags', value)}
                  searchable
                  clearable
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="sorting">
            <Accordion.Control icon={<IconSettings size={16} />}>Sorting</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Select
                  label="Sort by"
                  data={[
                    { value: 'relevance', label: 'Relevance' },
                    { value: 'date', label: 'Date' },
                    { value: 'title', label: 'Title' },
                    { value: 'module', label: 'Module' },
                  ]}
                  value={filters.sort_by ?? 'relevance'}
                  onChange={(value) => updateFilter('sort_by', value ?? 'relevance')}
                />
                <Select
                  label="Sort order"
                  data={[
                    { value: 'asc', label: 'Ascending' },
                    { value: 'desc', label: 'Descending' },
                  ]}
                  value={filters.sort_order ?? 'desc'}
                  onChange={(value) => updateFilter('sort_order', value ?? 'desc')}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          <Accordion.Item value="options">
            <Accordion.Control icon={<IconStar size={16} />}>Options</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Switch
                  label="Favorites only"
                  checked={filters.favorites_only ?? false}
                  onChange={(event) => updateFilter('favorites_only', event.currentTarget.checked)}
                />
                <Switch
                  label="Include archived"
                  checked={filters.include_archived ?? true}
                  onChange={(event) => updateFilter('include_archived', event.currentTarget.checked)}
                />
                <Switch
                  label="Exclude diary entries"
                  checked={filters.exclude_diary ?? true}
                  onChange={(event) => updateFilter('exclude_diary', event.currentTarget.checked)}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <Stack gap="sm">
          <Button fullWidth onClick={onApply} leftSection={<IconFilter size={16} />}>
            Apply Filters
          </Button>
          <Group grow>
            <Button variant="outline" onClick={onClear} leftSection={<IconRefresh size={16} />}>
              Clear All
            </Button>
            <Button variant="outline" onClick={savePreset} leftSection={<IconDeviceFloppy size={16} />}>
              Save Preset
            </Button>
          </Group>
        </Stack>

        <Divider label="Active filters" labelPosition="center" />
        <Group gap="xs" wrap="wrap">
          {filters.favorites_only && <Badge color="yellow">Favorites</Badge>}
          {filters.include_archived === false && <Badge color="blue">No Archived</Badge>}
          {filters.exclude_diary === false && <Badge color="pink">Include Diary</Badge>}
          {(filters.include_tags ?? []).map((tag) => (
            <Badge key={`include-${tag}`} color="green" variant="outline">
              +{tag}
            </Badge>
          ))}
          {(filters.exclude_tags ?? []).map((tag) => (
            <Badge key={`exclude-${tag}`} color="red" variant="outline">
              -{tag}
            </Badge>
          ))}
        </Group>
      </Stack>
    </Box>
  );
};

export default UnifiedSearchFilters;