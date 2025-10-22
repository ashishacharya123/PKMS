/**
 * Search type toggle component
 * Allows switching between FTS5, Fuzzy, and Advanced Fuzzy search
 */

import { Group, Text, SegmentedControl, Alert } from '@mantine/core';
import { IconBolt, IconSearch, IconBrain } from '@tabler/icons-react';

export type SearchType = 'fts5' | 'fuzzy' | 'advanced-fuzzy';

interface SearchTypeToggleProps {
  value: SearchType;
  onChange: (type: SearchType) => void;
  disabled?: boolean;
}

const searchTypeOptions = [
  {
    value: 'fts5' as SearchType,
    label: 'FTS5',
    description: 'Fast full-text search',
    icon: IconBolt,
    color: 'blue'
  },
  {
    value: 'fuzzy' as SearchType,
    label: 'Fuzzy',
    description: 'Light fuzzy matching',
    icon: IconSearch,
    color: 'green'
  },
  {
    value: 'advanced-fuzzy' as SearchType,
    label: 'Advanced',
    description: 'Deep content search',
    icon: IconBrain,
    color: 'orange'
  }
];

export function SearchTypeToggle({ value, onChange, disabled = false }: SearchTypeToggleProps) {
  const currentOption = searchTypeOptions.find(opt => opt.value === value);

  return (
    <Group gap="md" align="flex-start">
      <div>
        <Text size="sm" fw={500} mb="xs">Search Type</Text>
        <SegmentedControl
          value={value}
          onChange={(val) => onChange(val as SearchType)}
          data={searchTypeOptions.map(opt => ({
            value: opt.value,
            label: opt.label
          }))}
          disabled={disabled}
          size="sm"
        />
      </div>

      {currentOption && (
        <Alert
          icon={<currentOption.icon size={16} />}
          color={currentOption.color}
          variant="light"
          style={{ flex: 1 }}
        >
          <Text size="sm" fw={500}>{currentOption.description}</Text>
          <Text size="xs" c="dimmed">
            {value === 'fts5' && 'Fast cross-module search using SQLite FTS5. Best for most searches.'}
            {value === 'fuzzy' && 'Light fuzzy matching on titles, descriptions, and tags. Good for typos.'}
            {value === 'advanced-fuzzy' && 'Deep content search including full text. Slower but comprehensive.'}
          </Text>
        </Alert>
      )}
    </Group>
  );
}
