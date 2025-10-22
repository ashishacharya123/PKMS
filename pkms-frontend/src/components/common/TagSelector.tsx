/**
 * Global tag selector component
 * Works across all modules - no module filtering
 * Matches backend global tag system
 */

import { MultiSelect, Badge, Group, Text } from '@mantine/core';
import { useState, useEffect } from 'react';
import { Tag } from '../../types/tag';

interface TagSelectorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  label?: string;
  description?: string;
  error?: string;
  disabled?: boolean;
  maxValues?: number;
  // creatable?: boolean; // Removed - not supported in current Mantine version
}

export function TagSelector({
  value = [],
  onChange,
  placeholder = "Select or create tags...",
  label = "Tags",
  description,
  error,
  disabled = false,
  maxValues,
  // creatable = true // Removed
}: TagSelectorProps) {
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [, setLoading] = useState(false);

  // Load available tags
  useEffect(() => {
    const loadTags = async () => {
      setLoading(true);
      try {
        // TODO: Replace with actual API call when tagsService is implemented
        // const tags = await tagsService.getAll();
        // setAvailableTags(tags);
        
        // Mock data for now
        setAvailableTags([
          { uuid: '1', name: 'work', color: '#228be6', usageCount: 15 },
          { uuid: '2', name: 'personal', color: '#40c057', usageCount: 8 },
          { uuid: '3', name: 'urgent', color: '#fa5252', usageCount: 3 },
          { uuid: '4', name: 'project', color: '#fd7e14', usageCount: 12 },
          { uuid: '5', name: 'meeting', color: '#9775fa', usageCount: 6 },
        ]);
      } catch (error) {
        console.error('Failed to load tags:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTags();
  }, []);

  const tagOptions = availableTags.map(tag => ({
    value: tag.name,
    label: tag.name,
    color: tag.color,
    usageCount: tag.usageCount
  }));

  const renderTagOption = ({ option }: { option: any; checked?: boolean }) => (
    <Group gap="xs" justify="space-between" style={{ width: '100%' }}>
      <Group gap="xs">
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: option.color,
            flexShrink: 0
          }}
        />
        <Text size="sm">{option.label}</Text>
      </Group>
      <Badge size="xs" variant="light" color="gray">
        {option.usageCount}
      </Badge>
    </Group>
  );

  // Removed unused renderSelectedTag function

  return (
    <MultiSelect
      label={label}
      description={description}
      placeholder={placeholder}
      data={tagOptions}
      value={value}
      onChange={onChange}
      error={error}
      disabled={disabled}
      maxValues={maxValues}
      searchable
      renderOption={renderTagOption}
      clearable
      hidePickedOptions
      maxDropdownHeight={200}
    />
  );
}
