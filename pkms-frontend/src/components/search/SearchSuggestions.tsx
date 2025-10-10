import React, { useState, useEffect, useRef } from 'react';
import { Stack, Group, Text, Paper, ActionIcon, Box, ScrollArea, LoadingOverlay, ThemeIcon } from '@mantine/core';
import { IconSearch, IconArrowRight, IconClock, IconX } from '@tabler/icons-react';
import { searchService } from '../../services/searchService';

type SearchSuggestionsProps = {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  placeholder?: string;
  modules?: string[];
  disabled?: boolean;
  loading?: boolean;
};

export default function SearchSuggestions(props: SearchSuggestionsProps) {
  const { value, onChange, onSearch, placeholder, modules, disabled, loading } = props;
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const fetchSuggestions = async () => {
      if (!value || value.length < 2) {
        setSuggestions([]);
        return;
      }
      setSuggestionsLoading(true);
      try {
        const results = await searchService.getSearchSuggestions(value);
        if (active) setSuggestions(results);
      } catch (error) {
        console.error('Failed to fetch search suggestions:', error);
      } finally {
        if (active) setSuggestionsLoading(false);
      }
    };

    fetchSuggestions();
    return () => {
      active = false;
    };
  }, [value, modules]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && highlightedIndex >= 0) {
      event.preventDefault();
      onChange(suggestions[highlightedIndex]);
      onSearch();
      setSuggestions([]);
    }
  };

  return (
    <Box style={{ position: 'relative', flex: 1 }}>
      <Paper withBorder p="xs" radius="md" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <ThemeIcon variant="light" color="blue">
          <IconSearch size={16} />
        </ThemeIcon>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Search'}
          style={{
            border: 'none',
            flex: 1,
            background: 'transparent',
            outline: 'none',
            fontSize: 'var(--mantine-font-size-sm)',
          }}
          disabled={disabled}
        />
        {value && (
          <ActionIcon variant="subtle" color="gray" onClick={() => onChange('')}>
            <IconX size={16} />
          </ActionIcon>
        )}
        <ActionIcon variant="filled" color="blue" onClick={onSearch} loading={loading}>
          <IconArrowRight size={16} />
        </ActionIcon>
      </Paper>

      {suggestionsLoading && <LoadingOverlay visible={suggestionsLoading} overlayProps={{ blur: 1 }} />}

      {suggestions.length > 0 && (
        <Paper withBorder radius="md" mt="xs">
          <ScrollArea.Autosize mah={200}>
            <Stack gap="xs" p="xs">
              {suggestions.map((suggestion, index) => (
                <Group
                  key={suggestion}
                  justify="space-between"
                  onMouseDown={() => {
                    onChange(suggestion);
                    onSearch();
                    setSuggestions([]);
                  }}
                  style={{
                    padding: '0.5rem',
                    borderRadius: 'var(--mantine-radius-sm)',
                    backgroundColor: index === highlightedIndex ? 'var(--mantine-color-blue-light)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <Group gap="xs">
                    <IconClock size={14} />
                    <Text size="sm">{suggestion}</Text>
                  </Group>
                </Group>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Paper>
      )}
    </Box>
  );
}