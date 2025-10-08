import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Group,
  Text,
  Paper,
  ActionIcon,
  Box,
  ScrollArea,
  LoadingOverlay,
  ThemeIcon,
  KeyboardEventHandler
} from '@mantine/core';
import {
  IconSearch,
  IconArrowRight,
  IconClock,
  IconX
} from '@tabler/icons-react';
import { searchService, SearchSuggestion } from '../../services/searchService';
import { useDebouncedValue } from '@mantine/hooks';
import searchStyles from '../../styles/searchStyles';

interface SearchSuggestionsProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  placeholder?: string;
  modules?: string[];
  disabled?: boolean;
  loading?: boolean;
  showHistory?: boolean;
  className?: string;
}

const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
  value,
  onChange,
  onSearch,
  placeholder = "Search your knowledge base...",
  modules = ['notes', 'documents', 'todos', 'diary', 'archive', 'folders'],
  disabled = false,
  loading = false,
  showHistory = true,
  className = ""
}) => {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [debouncedQuery] = useDebouncedValue(value, 300);

  // Load search history from localStorage
  useEffect(() => {
    if (showHistory) {
      try {
        const history = localStorage.getItem('pkms_search_history');
        if (history) {
          setSearchHistory(JSON.parse(history));
        }
      } catch (error) {
        console.error('Failed to load search history:', error);
      }
    }
  }, [showHistory]);

  // Fetch suggestions when query changes
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (debouncedQuery.length >= 2) {
        setSuggestionsLoading(true);
        try {
          const results = await searchService.getSearchSuggestions(debouncedQuery, {
            modules,
            limit: 8
          });
          setSuggestions(results);
          setShowSuggestions(true);
        } catch (error) {
          console.error('Failed to fetch suggestions:', error);
          setSuggestions([]);
        } finally {
          setSuggestionsLoading(false);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(showHistory && searchHistory.length > 0);
      }
    };

    fetchSuggestions();
  }, [debouncedQuery, modules, showHistory, searchHistory.length]);

  // Save to search history when search is performed
  const saveToHistory = useCallback((query: string) => {
    if (!query.trim()) return;

    const newHistory = [
      query,
      ...searchHistory.filter(item => item !== query)
    ].slice(0, 10); // Keep last 10 searches

    setSearchHistory(newHistory);
    try {
      localStorage.setItem('pkms_search_history', JSON.stringify(newHistory));
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  }, [searchHistory]);

  // Handle keyboard navigation
  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = useCallback((event) => {
    if (!showSuggestions) return;

    const items = [
      ...searchHistory.map(item => ({ type: 'history', text: item })),
      ...suggestions
    ];

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        event.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          const selectedItem = items[selectedIndex];
          if (selectedItem.type === 'history') {
            onChange(selectedItem.text);
            onSearch(selectedItem.text);
            saveToHistory(selectedItem.text);
          } else {
            const suggestion = selectedItem as SearchSuggestion;
            onChange(suggestion.text);
            onSearch(suggestion.text);
            saveToHistory(suggestion.text);
          }
          setShowSuggestions(false);
          setSelectedIndex(-1);
        } else {
          onSearch(value);
          saveToHistory(value);
          setShowSuggestions(false);
        }
        break;
      case 'Escape':
        event.preventDefault();
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
    }
  }, [showSuggestions, searchHistory, suggestions, selectedIndex, value, onChange, onSearch, saveToHistory]);

  // Handle outside clicks
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current && !inputRef.current.contains(event.target as Node) &&
        suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    onChange(suggestion.text);
    onSearch(suggestion.text);
    saveToHistory(suggestion.text);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleHistoryClick = (query: string) => {
    onChange(query);
    onSearch(query);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const clearHistory = () => {
    setSearchHistory([]);
    try {
      localStorage.removeItem('pkms_search_history');
    } catch (error) {
      console.error('Failed to clear search history:', error);
    }
  };

  const getSuggestionIcon = (module: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      notes: <ThemeIcon size="xs" color="blue">📝</ThemeIcon>,
      documents: <ThemeIcon size="xs" color="green">📄</ThemeIcon>,
      todos: <ThemeIcon size="xs" color="orange">✓</ThemeIcon>,
      diary: <ThemeIcon size="xs" color="pink">📔</ThemeIcon>,
      archive: <ThemeIcon size="xs" color="gray">📦</ThemeIcon>,
      folders: <ThemeIcon size="xs" color="purple">📁</ThemeIcon>
    };
    return iconMap[module] || <ThemeIcon size="xs" color="gray">📄</ThemeIcon>;
  };

  const allItems = [
    ...searchHistory.map(item => ({ type: 'history' as const, text: item })),
    ...suggestions
  ];

  return (
    <Box pos="relative" className={className}>
      <Group wrap="nowrap">
        <Box style={{ flex: 1, position: 'relative' }}>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setShowSuggestions(true)}
            placeholder={placeholder}
            disabled={disabled}
            className={searchStyles.classes.input}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e9ecef',
              borderRadius: '8px',
              fontSize: '16px',
              outline: 'none',
              transition: 'all 0.2s ease',
              '&:focus': {
                borderColor: '#228be6',
                boxShadow: '0 0 0 3px rgba(34, 139, 230, 0.1)'
              }
            }}
          />
          {value && (
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={() => {
                onChange('');
                setShowSuggestions(false);
              }}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 2
              }}
            >
              <IconX size={14} />
            </ActionIcon>
          )}
        </Box>

        <ActionIcon
          size="lg"
          onClick={() => {
            onSearch(value);
            saveToHistory(value);
            setShowSuggestions(false);
          }}
          loading={loading}
          disabled={disabled || !value.trim()}
          style={{
            backgroundColor: '#228be6',
            color: 'white',
            '&:hover': {
              backgroundColor: '#1c7ed6'
            }
          }}
        >
          <IconSearch size={16} />
        </ActionIcon>
      </Group>

      {/* Suggestions Dropdown */}
      {showSuggestions && allItems.length > 0 && (
        <Paper
          ref={suggestionsRef}
          shadow="lg"
          withBorder
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '8px',
            zIndex: 1000,
            maxHeight: '400px',
            borderRadius: '8px',
            overflow: 'hidden'
          }}
        >
          <LoadingOverlay visible={suggestionsLoading} />

          <ScrollArea h={400}>
            {/* Search History */}
            {searchHistory.length > 0 && value.length < 2 && (
              <Box p="xs">
                <Group justify="space-between" align="center" mb="xs">
                  <Text size="xs" fw={600} c="dimmed">Recent Searches</Text>
                  <ActionIcon
                    variant="subtle"
                    size="xs"
                    onClick={clearHistory}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                </Group>
                {searchHistory.map((query, index) => (
                  <Box
                    key={`history-${index}`}
                    p="xs"
                    style={{
                      cursor: 'pointer',
                      borderRadius: '4px',
                      '&:hover': {
                        backgroundColor: '#f8f9fa'
                      }
                    }}
                    onClick={() => handleHistoryClick(query)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onMouseLeave={() => setSelectedIndex(-1)}
                  >
                    <Group gap="xs">
                      <ThemeIcon size="xs" variant="light">
                        <IconClock size={12} />
                      </ThemeIcon>
                      <Text size="sm">{query}</Text>
                    </Group>
                  </Box>
                ))}
              </Box>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <Box p="xs">
                <Text size="xs" fw={600} c="dimmed" mb="xs">Suggestions</Text>
                {suggestions.map((suggestion, index) => {
                  const globalIndex = searchHistory.length + index;
                  return (
                    <Box
                      key={`${suggestion.module}-${index}`}
                      p="xs"
                      style={{
                        cursor: 'pointer',
                        borderRadius: '4px',
                        backgroundColor: selectedIndex === globalIndex ? '#f0f9ff' : 'transparent',
                        '&:hover': {
                          backgroundColor: '#f8f9fa'
                        }
                      }}
                      onClick={() => handleSuggestionClick(suggestion)}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                      onMouseLeave={() => setSelectedIndex(-1)}
                    >
                      <Group justify="space-between" align="center">
                        <Group gap="xs">
                          {getSuggestionIcon(suggestion.module)}
                          <Box>
                            <Text size="sm" fw={500}>{suggestion.text}</Text>
                            <Text size="xs" c="dimmed">
                              {suggestion.type} • {suggestion.module}
                            </Text>
                          </Box>
                        </Group>
                        <IconArrowRight size={14} color="#666" />
                      </Group>
                    </Box>
                  );
                })}
              </Box>
            )}
          </ScrollArea>
        </Paper>
      )}
    </Box>
  );
};

export default SearchSuggestions;