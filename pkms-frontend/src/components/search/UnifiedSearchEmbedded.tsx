/**
 * Embedded unified search component
 * Can be used in any page with module-specific filtering
 * Supports all 3 search types: FTS5, Fuzzy, Advanced Fuzzy
 */

import React, { useState, useMemo } from 'react';
import {
  Container,
  Stack,
  Group,
  Text,
  Button,
  Card,
  Badge,
  ActionIcon,
  SimpleGrid,
  Alert,
  Pagination,
  ThemeIcon,
  LoadingOverlay,
  Paper,
  Highlight,
  MultiSelect,
  TextInput,
} from '@mantine/core';
import {
  IconSearch,
  IconFileText,
  IconFile,
  IconChecklist,
  IconArchive,
  IconBolt,
  IconInfoCircle,
  IconEyeOff,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { SearchResult, SearchFilters, SearchResponse, TagInfo } from '../../services/searchService';
import searchService from '../../services/searchService';
import { SearchTypeToggle, SearchType } from './SearchTypeToggle';

interface UnifiedSearchEmbeddedProps {
  /** Initial search query */
  initialQuery?: string;
  /** Default modules to search in (if not provided, uses all except diary) */
  defaultModules?: string[];
  /** Whether to include diary in search (default: false) */
  includeDiary?: boolean;
  /** Whether to show module selector (default: true) */
  showModuleSelector?: boolean;
  /** Whether to show search type toggle (default: true) */
  showSearchTypeToggle?: boolean;
  /** Callback when a result is clicked */
  onResultClick?: (result: SearchResult) => void;
  /** Custom empty state message */
  emptyMessage?: string;
  /** Maximum results per page */
  resultsPerPage?: number;
  /** Whether to show pagination */
  showPagination?: boolean;
}

const allModuleOptions = [
  { value: 'notes', label: 'Notes' },
  { value: 'documents', label: 'Documents' },
  { value: 'todos', label: 'Todos' },
  { value: 'archive', label: 'Archive' },
  { value: 'folders', label: 'Folders' },
  { value: 'projects', label: 'Projects' },
  { value: 'diary', label: 'Diary' },
];

export function UnifiedSearchEmbedded({
  initialQuery = '',
  defaultModules,
  includeDiary = false,
  showModuleSelector = true,
  showSearchTypeToggle = true,
  onResultClick,
  emptyMessage = 'No results found. Try different search terms or adjust your filters.',
  resultsPerPage = 20,
  showPagination = true,
}: UnifiedSearchEmbeddedProps) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchType, setSearchType] = useState<SearchType>('fts5');
  
  // Determine default modules based on props
  const defaultModulesList = useMemo(() => {
    if (defaultModules) return defaultModules;
    if (includeDiary) return ['notes', 'documents', 'todos', 'archive', 'folders', 'projects', 'diary'];
    return ['notes', 'documents', 'todos', 'archive', 'folders', 'projects'];
  }, [defaultModules, includeDiary]);

  const [selectedModules, setSelectedModules] = useState<string[]>(defaultModulesList);
  const [availableTags, setAvailableTags] = useState<TagInfo[]>([]);

  const performSearch = async (page = 1) => {
    if (!searchQuery.trim()) return;
    
    if (selectedModules.length === 0) {
      notifications.show({
        title: 'No modules selected',
        message: 'Please select at least one module to search in',
        color: 'orange'
      });
      return;
    }

    setLoading(true);
    setCurrentPage(page);

    try {
      const effectiveFilters: SearchFilters = {
        modules: selectedModules,
        include_tags: [],
        exclude_tags: [],
        include_archived: true,
        exclude_diary: !includeDiary,
        sort_by: 'relevance',
        sort_order: 'desc',
      };

      // Use selected search type
      let response: SearchResponse;
      switch (searchType) {
        case 'fts5':
          response = await searchService.searchFTS(searchQuery, effectiveFilters, page, resultsPerPage);
          break;
        case 'fuzzy':
          response = await searchService.searchFuzzy(searchQuery, effectiveFilters, page, resultsPerPage);
          break;
        case 'advanced-fuzzy':
          response = await searchService.searchAdvancedFuzzy(searchQuery, effectiveFilters, page, resultsPerPage);
          break;
        default:
          response = await searchService.searchFTS(searchQuery, effectiveFilters, page, resultsPerPage);
      }

      setResults(response.results);
      setTotalResults(response.stats.totalResults);

      notifications.show({
        title: 'Search Complete',
        message: `${response.stats.totalResults} results found` + (response.stats.searchTime ? ` in ${response.stats.searchTime}ms` : ''),
        color: 'blue',
        icon: <IconSearch size={16} />,
      });
    } catch (error) {
      console.error('Search error:', error);
      notifications.show({
        title: 'Search Error',
        message: 'Failed to perform search. Please try again.',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    performSearch(1);
  };

  const renderSearchResult = (result: SearchResult) => {
    const icon = (() => {
      switch (result.module) {
        case 'documents':
          return <IconFile size={16} />;
        case 'todos':
          return <IconChecklist size={16} />;
        case 'archive':
        case 'archive-folder':
          return <IconArchive size={16} />;
        case 'diary':
          return <IconArchive size={16} />;
        default:
          return <IconFileText size={16} />;
      }
    })();

    return (
      <Card 
        key={result.id} 
        shadow="sm" 
        p="md" 
        withBorder
        style={{ cursor: onResultClick ? 'pointer' : 'default' }}
        onClick={() => onResultClick?.(result)}
      >
        <Group justify="space-between" mb="xs">
          <Group>
            <ThemeIcon color="blue" size="sm">
              {icon}
            </ThemeIcon>
            <div>
              <Text fw={600} size="sm">
                <Highlight highlight={searchQuery.split(' ')}>{result.title}</Highlight>
              </Text>
              <Badge size="xs" variant="light">
                {result.module}
              </Badge>
            </div>
          </Group>
        </Group>

        {result.preview && (
          <Text size="xs" c="dimmed" mb="xs" lineClamp={2}>
            <Highlight highlight={searchQuery.split(' ')}>{result.preview}</Highlight>
          </Text>
        )}

        <Group justify="space-between">
          <Group gap="xs">
            {result.tags?.slice(0, 3).map((tag) => (
              <Badge key={tag} size="xs" variant="outline">
                {tag}
              </Badge>
            ))}
            {result.tags && result.tags.length > 3 && (
              <Badge size="xs" variant="outline">
                +{result.tags.length - 3}
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            {result.createdAt && (
              <Text size="xs" c="dimmed">
                {new Date(result.createdAt).toLocaleDateString()}
              </Text>
            )}
            {result.score !== undefined && (
              <Badge size="xs" variant="light" color="blue">
                {Math.round(result.score * 100)}%
              </Badge>
            )}
          </Group>
        </Group>
      </Card>
    );
  };

  const totalPages = Math.ceil(totalResults / resultsPerPage);

  return (
    <Stack gap="md">
      {showSearchTypeToggle && (
        <SearchTypeToggle
          value={searchType}
          onChange={setSearchType}
          disabled={loading}
        />
      )}

      {!includeDiary && (
        <Alert icon={<IconEyeOff size={16} />} color="orange">
          Diary entries are excluded from search results. Use diary-specific search within the diary module.
        </Alert>
      )}

      <Paper p="md" withBorder>
        <form onSubmit={handleSearch}>
          <Stack gap="md">
            <Group>
              <TextInput
                placeholder="Search your knowledge base..."
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button 
                variant="outline" 
                type="submit" 
                loading={loading}
                disabled={selectedModules.length === 0}
              >
                <IconSearch size={16} />
              </Button>
            </Group>
            
            {showModuleSelector && (
              <Group>
                <Text size="sm" fw={500}>Search in:</Text>
                <MultiSelect
                  placeholder="Select modules to search"
                  data={allModuleOptions}
                  value={selectedModules}
                  onChange={setSelectedModules}
                  size="sm"
                  style={{ minWidth: 300 }}
                />
                {selectedModules.length === 0 && (
                  <Text size="xs" c="red">Please select at least one module to search</Text>
                )}
              </Group>
            )}
          </Stack>
        </form>
      </Paper>

      {selectedModules.length > 0 && (
        <Group>
          {selectedModules.map(module => (
            <Badge
              key={module}
              variant="filled"
              rightSection={
                <ActionIcon
                  size="xs"
                  variant="transparent"
                  onClick={() => setSelectedModules(prev => prev.filter(m => m !== module))}
                >
                  ×
                </ActionIcon>
              }
            >
              {module}
            </Badge>
          ))}
        </Group>
      )}

      <div style={{ position: 'relative' }}>
        <LoadingOverlay visible={loading} />

        {results.length > 0 ? (
          <Stack gap="md">
            <Group justify="space-between">
              <Text>
                Found {totalResults} results for "{searchQuery}"
              </Text>
              {showPagination && totalPages > 1 && (
                <Pagination
                  total={totalPages}
                  value={currentPage}
                  onChange={setCurrentPage}
                  size="sm"
                />
              )}
            </Group>

            <SimpleGrid cols={1} spacing="md">
              {results.map(renderSearchResult)}
            </SimpleGrid>

            {showPagination && totalPages > 1 && (
              <Group justify="center">
                <Pagination
                  total={totalPages}
                  value={currentPage}
                  onChange={(page) => {
                    setCurrentPage(page);
                    performSearch(page);
                  }}
                />
              </Group>
            )}
          </Stack>
        ) : (
          !loading && searchQuery && (
            <Alert icon={<IconInfoCircle size={16} />} color="blue">
              {emptyMessage}
            </Alert>
          )
        )}
      </div>
    </Stack>
  );
}
