import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Stack,
  Title,
  Group,
  Text,
  TextInput,
  Select,
  MultiSelect,
  Button,
  Card,
  Badge,
  ActionIcon,
  Divider,
  SimpleGrid,
  Alert,
  Pagination,
  Tabs,
  ThemeIcon,
  Tooltip,
  LoadingOverlay,
  Center,
  Switch,
  Drawer,
  Anchor,
  Highlight,
  Box,
  Chip,
} from '@mantine/core';
import {
  IconSearch,
  IconFilter,
  IconFileText,
  IconFile,
  IconChecklist,
  IconArchive,
  IconClock,
  IconTag,
  IconEye,
  IconExternalLink,
  IconAdjustments,
  IconEyeOff,
  IconRefresh,
  IconX,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { searchService, SearchResult, SearchFilters, SearchResponse, TagInfo } from '../services/searchService';
import { notifications } from '@mantine/notifications';

export function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // URL state management
  const initialQuery = searchParams.get('q') || '';
  const initialType = searchParams.get('type') || '';
  const initialPage = parseInt(searchParams.get('page') || '1');
  const initialIncludeContent = searchParams.get('include_content') === 'true';
  const searchMode = searchParams.get('mode') || 'fts5'; // default to fts5 for simple search
  
  // Search state
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filter state
  const [filters, setFilters] = useState<SearchFilters>({
    types: initialType ? [initialType as any] : undefined,
    sortBy: 'relevance',
    sortOrder: 'desc',
    includeContent: initialIncludeContent,
  });
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [resultsPerPage] = useState(20);
  
  // UI state
  const [filtersOpened, { open: openFilters, close: closeFilters }] = useDisclosure(false);
  const [activeTab, setActiveTab] = useState<string | null>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  
  // Search suggestions and tags
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [popularTags, setPopularTags] = useState<TagInfo[]>([]);
  const [availableTags, setAvailableTags] = useState<TagInfo[]>([]);

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery, filters, currentPage);
    }
    loadSearchMetadata();
  }, []);

  useEffect(() => {
    // Update URL when search params change
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (filters.types?.length === 1) params.set('type', filters.types[0]);
    if (currentPage > 1) params.set('page', currentPage.toString());
    if (filters.includeContent === true) params.set('include_content', 'true');
    setSearchParams(params);
  }, [searchQuery, filters.types, filters.includeContent, currentPage, setSearchParams]);

  const loadSearchMetadata = async () => {
    try {
      const [recent, tags] = await Promise.all([
        searchService.getRecentSearches(),
        searchService.getPopularTags(),
      ]);
      setRecentSearches(recent);
      setPopularTags(tags);
      setAvailableTags(tags);
    } catch (error) {
      console.error('Failed to load search metadata:', error);
    }
  };

  const performSearch = async (query: string, searchFilters: SearchFilters, page: number) => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * resultsPerPage;
      
      // Determine search method based on mode
      const useFuzzy = searchMode === 'fuzzy' ? true : searchMode === 'fts5' ? false : true; // default to fuzzy for 'auto'
      
      // Call existing searchService with fuzzy parameter
      const response = await searchService.globalSearch({
        q: query,
        modules: searchFilters.types && searchFilters.types.length > 0 ? searchFilters.types.join(',') : undefined,
        include_content: searchFilters.includeContent,
        use_fuzzy: useFuzzy,
        sort_by: searchFilters.sortBy,
        sort_order: searchFilters.sortOrder,
        limit: resultsPerPage,
        offset: offset
      });
      
      setSearchResponse(response);
      await searchService.saveRecentSearch(query);
      
      // Load suggestions for similar queries
      const newSuggestions = await searchService.getSearchSuggestions(query);
      setSuggestions(newSuggestions);
      
    } catch (error) {
      console.error('Search error:', error);
      setError('Failed to perform search. Please try again.');
      notifications.show({
        title: 'Search Error',
        message: 'Failed to search. Please try again.',
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    await performSearch(query, filters, 1);
  };

  const handleFilterChange = async (newFilters: Partial<SearchFilters>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    setCurrentPage(1);
    
    if (searchQuery) {
      await performSearch(searchQuery, updatedFilters, 1);
    }
  };

  const handlePageChange = async (page: number) => {
    setCurrentPage(page);
    if (searchQuery) {
      await performSearch(searchQuery, filters, page);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    navigate(result.path);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'note':
        return IconFileText;
      case 'document':
        return IconFile;
      case 'todo':
        return IconChecklist;
      case 'archive':
        return IconArchive;
      default:
        return IconFileText;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'note':
        return 'blue';
      case 'document':
        return 'green';
      case 'todo':
        return 'orange';
      case 'archive':
        return 'indigo';
      default:
        return 'gray';
    }
  };

  const getRelevanceColor = (relevance: string) => {
    switch (relevance) {
      case 'high':
        return 'green';
      case 'medium':
        return 'yellow';
      case 'low':
        return 'gray';
      default:
        return 'gray';
    }
  };

  // Group results by type for tabs
  const groupedResults = useMemo(() => {
    if (!searchResponse?.results) return {};
    return searchService.groupResultsByType(searchResponse.results);
  }, [searchResponse?.results]);

  const filteredResults = useMemo(() => {
    if (!searchResponse?.results) return [];
    if (activeTab === 'all') return searchResponse.results;
    return groupedResults[activeTab || 'all'] || [];
  }, [searchResponse?.results, activeTab, groupedResults]);

  const totalPages = Math.ceil((searchResponse?.stats.totalResults || 0) / resultsPerPage);

  const SearchResultCard = ({ result }: { result: SearchResult }) => (
    <Card
      key={result.id}
      padding="lg"
      radius="md"
      withBorder
      style={{ cursor: 'pointer' }}
      onClick={() => handleResultClick(result)}
    >
      <Group justify="space-between" mb="md">
        <Group gap="sm">
          <ThemeIcon
            variant="light"
            color={getTypeColor(result.type)}
            size="lg"
          >
            {React.createElement(getTypeIcon(result.type), { size: 20 })}
          </ThemeIcon>
          <div>
            <Text fw={600} size="lg" lineClamp={1}>
              <Highlight highlight={searchQuery}>{result.title}</Highlight>
            </Text>
            <Group gap="xs">
              <Badge variant="light" color={getTypeColor(result.type)} size="sm">
                {result.type}
              </Badge>
              <Badge variant="light" color={getRelevanceColor(result.relevance)} size="sm">
                {result.relevance} relevance
              </Badge>
              {result.metadata.area && (
                <Badge variant="outline" size="sm">
                  {result.metadata.area}
                </Badge>
              )}
            </Group>
          </div>
        </Group>
        
        <Group gap="xs">
          <Tooltip label="View details">
            <ActionIcon variant="light" color={getTypeColor(result.type)}>
              <IconEye size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Open in new tab">
            <ActionIcon
              variant="light"
              color="gray"
              onClick={(e) => {
                e.stopPropagation();
                window.open(result.path, '_blank');
              }}
            >
              <IconExternalLink size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Text size="sm" c="dimmed" mb="md" lineClamp={filters.includeContent ? 3 : 1}>
        <Highlight highlight={searchQuery}>
          {filters.includeContent 
            ? result.preview 
            : searchService.getContentExcludedPreview(result)
          }
        </Highlight>
      </Text>

      {result.tags.length > 0 && (
        <Group gap="xs" mb="md">
          <IconTag size={14} />
          {result.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="dot" size="sm">
              {tag}
            </Badge>
          ))}
          {result.tags.length > 3 && (
            <Text size="xs" c="dimmed">
              +{result.tags.length - 3} more
            </Text>
          )}
        </Group>
      )}

      <Group justify="space-between">
        <Group gap="xs">
          <IconClock size={14} />
          <Text size="xs" c="dimmed">
            Updated {new Date(result.updatedAt).toLocaleDateString()}
          </Text>
        </Group>
        {result.metadata.size && (
          <Text size="xs" c="dimmed">
            {(result.metadata.size / 1024).toFixed(1)} KB
          </Text>
        )}
      </Group>
    </Card>
  );

  const EmptyState = () => (
    <Center py="xl">
      <Stack align="center" gap="md">
        <ThemeIcon size="xl" variant="light" color="gray">
          <IconSearch size={32} />
        </ThemeIcon>
        <div style={{ textAlign: 'center' }}>
          <Text size="lg" fw={500} mb="xs">
            {searchQuery ? 'No results found' : 'Start searching'}
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            {searchQuery 
              ? `Try different keywords or adjust your filters`
              : 'Enter a search query to find content across all modules'
            }
          </Text>
          {recentSearches.length > 0 && !searchQuery && (
            <Group gap="xs" justify="center">
              <Text size="sm" c="dimmed">Recent searches:</Text>
              {recentSearches.slice(0, 3).map((search) => (
                <Button
                  key={search}
                  variant="light"
                  size="xs"
                  onClick={() => handleSearch(search)}
                >
                  {search}
                </Button>
              ))}
            </Group>
          )}
        </div>
      </Stack>
    </Center>
  );

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={1} mb="xs">
              Search Results
            </Title>
            {searchResponse && (
              <Group gap="xs">
                <Text c="dimmed">
                  {searchResponse.stats.totalResults} results found
                </Text>
                <Text c="dimmed">•</Text>
                <Text size="sm" c="dimmed">
                  Search took {searchService.formatSearchTime(searchResponse.stats.searchTime)}
                </Text>
              </Group>
            )}
          </div>
          
          <Group gap="sm">
            <Button
              variant="light"
              leftSection={<IconFilter size={16} />}
              onClick={openFilters}
            >
              Filters
            </Button>
            <Button
              variant="light"
              leftSection={<IconAdjustments size={16} />}
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            >
              {viewMode === 'grid' ? 'List' : 'Grid'} View
            </Button>
          </Group>
        </Group>

        {/* Search Bar */}
        <Card withBorder padding="md">
          <Stack gap="md">
            <Group gap="md">
              <TextInput
                placeholder="Search across all modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch(searchQuery);
                  }
                }}
                leftSection={<IconSearch size={16} />}
                size="md"
                style={{ flex: 1 }}
              />
              <Button
                onClick={() => handleSearch(searchQuery)}
                loading={isLoading}
                size="md"
              >
                Search
              </Button>
            </Group>

            {/* Search Mode Indicator removed per UI cleanup request */}

            {/* Content Toggle Switch */}
            <Group justify="space-between" align="center">
              <Group gap="xs">
                <ThemeIcon
                  variant="light"
                  color={filters.includeContent ? 'blue' : 'gray'}
                  size="sm"
                >
                  {filters.includeContent ? <IconEye size={14} /> : <IconEyeOff size={14} />}
                </ThemeIcon>
                <Switch
                  label="Include file contents in search"
                  description="Search within document text, note content, and descriptions"
                  checked={filters.includeContent !== false}
                  onChange={(event) => handleFilterChange({ includeContent: event.currentTarget.checked })}
                  size="sm"
                />
              </Group>
              
              <Text size="xs" c="dimmed">
                {filters.includeContent === false ? 'Searching titles only' : 'Searching full content'}
              </Text>
            </Group>
            
            {suggestions.length > 0 && (
              <Group gap="xs">
                <Text size="sm" c="dimmed">Suggestions:</Text>
                {suggestions.slice(0, 5).map((suggestion) => (
                  <Anchor
                    key={suggestion}
                    size="sm"
                    onClick={() => handleSearch(suggestion)}
                  >
                    {suggestion}
                  </Anchor>
                ))}
              </Group>
            )}
          </Stack>
        </Card>

        {/* Content Exclusion Alert removed per UI cleanup request */}

        {/* Error Alert */}
        {error && (
          <Alert color="red" onClose={() => setError(null)} withCloseButton>
            {error}
          </Alert>
        )}

        {/* Results Tabs */}
        {searchResponse && (
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="all">
                All ({searchResponse.stats.totalResults})
              </Tabs.Tab>
              {Object.entries(groupedResults).map(([type, results]) => (
                <Tabs.Tab key={type} value={type}>
                  {type.charAt(0).toUpperCase() + type.slice(1)} ({results.length})
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
        )}

        {/* Results */}
        <div style={{ position: 'relative', minHeight: '200px' }}>
          <LoadingOverlay visible={isLoading} />
          
          {!isLoading && !error && (
            <>
              {filteredResults.length > 0 ? (
                <Stack gap="md">
                  {viewMode === 'list' ? (
                    <Stack gap="md">
                      {filteredResults.map((result) => (
                        <SearchResultCard key={result.id} result={result} />
                      ))}
                    </Stack>
                  ) : (
                    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                      {filteredResults.map((result) => (
                        <SearchResultCard key={result.id} result={result} />
                      ))}
                    </SimpleGrid>
                  )}
                  
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <Group justify="center" mt="xl">
                      <Pagination
                        value={currentPage}
                        onChange={handlePageChange}
                        total={totalPages}
                        size="md"
                      />
                    </Group>
                  )}
                </Stack>
              ) : (
                <EmptyState />
              )}
            </>
          )}
        </div>

        {/* Filters Drawer */}
        <Drawer
          opened={filtersOpened}
          onClose={closeFilters}
          title="Search Filters"
          position="right"
          size="md"
        >
          <Stack gap="md">
            {/* Content Type Filter */}
            <div>
              <Text fw={500} mb="sm">Content Types</Text>
              <MultiSelect
                data={[
                  { value: 'note', label: 'Notes' },
                  { value: 'document', label: 'Documents' },
                  { value: 'todo', label: 'Todos' },
                  { value: 'archive', label: 'Archive' },
                ]}
                value={filters.types || []}
                onChange={(types) => handleFilterChange({ types: types as any[] })}
                placeholder="All types"
                clearable
              />
            </div>

            {/* Content Search Toggle */}
            <div>
              <Text fw={500} mb="sm">Content Search</Text>
              <Switch
                label="Include file contents in search"
                description="When enabled, searches within document text, note content, and descriptions"
                checked={filters.includeContent !== false}
                onChange={(event) => handleFilterChange({ includeContent: event.currentTarget.checked })}
              />
              {filters.includeContent === false && (
                <Text size="xs" c="dimmed" mt="xs">
                  Currently searching titles and names only
                </Text>
              )}
            </div>

            <Divider />

            {/* Tags Filter */}
            <div>
              <Text fw={500} mb="sm">Filter by Tags</Text>
              <MultiSelect
                data={availableTags.map(tag => ({ 
                  value: tag.name, 
                  label: `#${tag.name}${tag.count ? ` (${tag.count})` : ''}`
                }))}
                value={filters.tags || []}
                onChange={(tags) => handleFilterChange({ tags: tags.length > 0 ? tags : undefined })}
                placeholder="Select tags to filter results"
                searchable
                clearable
                maxDropdownHeight={200}
              />
            </div>

            {/* Popular Tags */}
            {popularTags.length > 0 && (
              <div>
                <Text fw={500} mb="sm">Popular Tags</Text>
                <Group gap="xs">
                  {popularTags.slice(0, 10).map((tag) => (
                    <Chip
                      key={tag.name}
                      size="xs"
                      checked={filters.tags?.includes(tag.name) || false}
                      onChange={(checked) => {
                        const currentTags = filters.tags || [];
                        const newTags = checked
                          ? [...currentTags, tag.name]
                          : currentTags.filter(t => t !== tag.name);
                        handleFilterChange({ tags: newTags.length > 0 ? newTags : undefined });
                      }}
                    >
                      #{tag.name} {tag.count && `(${tag.count})`}
                    </Chip>
                  ))}
                </Group>
              </div>
            )}

            {/* Sort Options */}
            <div>
              <Text fw={500} mb="sm">Sort By</Text>
              <Select
                data={[
                  { value: 'relevance', label: 'Relevance' },
                  { value: 'date', label: 'Date' },
                  { value: 'title', label: 'Title' },
                ]}
                value={filters.sortBy}
                onChange={(sortBy) => handleFilterChange({ sortBy: sortBy as any })}
              />
              
              <Group mt="sm">
                <Switch
                  label="Descending order"
                  checked={filters.sortOrder === 'desc'}
                  onChange={(e) => handleFilterChange({ 
                    sortOrder: e.target.checked ? 'desc' : 'asc' 
                  })}
                />
              </Group>
            </div>

            <Divider />

            {/* Filter Actions */}
            <Group>
              <Button
                variant="light"
                onClick={() => {
                  setFilters({ sortBy: 'relevance', sortOrder: 'desc' });
                  closeFilters();
                }}
                fullWidth
              >
                Clear Filters
              </Button>
            </Group>
          </Stack>
        </Drawer>
      </Stack>
    </Container>
  );
} 