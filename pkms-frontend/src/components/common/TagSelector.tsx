/**
 * Global tag selector component
 * Works across all modules - no module filtering
 * Matches backend global tag system
 */

import { MultiSelect, Badge, Group, Text } from '@mantine/core';
import { useState, useEffect } from 'react';
import { useDebouncedValue } from '@mantine/hooks';  // ADD
import { TagResponse } from '../../types/tag';  // CHANGE from Tag
import { tagsService } from '../../services/tagsService';  // ADD

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
  const [data, setData] = useState<TagResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(searchQuery, 300);  // 300ms debounce

  // Dynamic search handler
  const handleSearch = async (query: string) => {
    setSearchQuery(query);  // Update search query (will trigger debounce)
  };

  // Effect to call API when debounced query changes
  useEffect(() => {
    const fetchTags = async () => {
      if (!debouncedQuery.trim()) {
        setData([]);
        return;
      }
      
      setLoading(true);
      try {
        const tags = await tagsService.getAutocompleteTags(debouncedQuery);
        setData(tags);
      } catch (error) {
        console.error('Failed to search tags:', error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTags();
  }, [debouncedQuery]);  // Only runs when debounced query changes

  // Note: Inline tag creation disabled for now (Mantine MultiSelect doesn't support creatable)
  // const handleCreate = (query: string) => {
  //   const newTag: TagResponse = {
  //     uuid: `temp-${Date.now()}`,
  //     name: query,
  //     usageCount: 0
  //   };
  //   setData((current) => [...current, newTag]);
  //   onChange([...value, query]);
  //   return { value: query, label: query };
  // };

  const tagOptions = data.map(tag => ({
    value: tag.name,
    label: tag.name,
    usageCount: tag.usageCount
    // NO color
  }));

  const renderTagOption = ({ option }: { option: any; checked?: boolean }) => (
    <Group gap="xs" justify="space-between" style={{ width: '100%' }}>
      <Text size="sm">{option.label}</Text>
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
      onSearchChange={handleSearch}  // ADD: Dynamic search
      nothingFoundMessage={loading ? "Searching..." : "Nothing found"}  // ADD
      // creatable  // ADD: Enable inline tag creation
      // getCreateLabel={(query: string) => `+ Create "${query}"`}  // ADD
      // onCreate={handleCreate}  // ADD
      renderOption={renderTagOption}
      clearable
      hidePickedOptions
      maxDropdownHeight={200}
    />
  );
}
