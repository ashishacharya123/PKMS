import React, { useState, useEffect, useMemo } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container,
  Stack,
  Title,
  Group,
  Text,
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
  Paper,
  NumberInput,
  Checkbox,
  DateInput,
  Slider,
  Progress
} from '@mantine/core';
import { DateInputProps } from '@mantine/dates';
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
  IconBolt,
  IconBrain,
  IconInfoCircle,
  IconArrowLeft
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { searchService, SearchResult, SearchFilters, SearchResponse, TagInfo } from '../services/searchService';
import SearchSuggestions from './SearchSuggestions';
import EnhancedSearchFilters from './EnhancedSearchFilters';

interface UnifiedSearchProps {
  initialQuery?: string;
  initialType?: 'fts5' | 'fuzzy' | 'hybrid';
}

const UnifiedSearch: React.FC<UnifiedSearchProps> = ({
  initialQuery = '',
  initialType = 'fts5'
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchType, setSearchType] = useState<'fts5' | 'fuzzy' | 'hybrid'>(initialType);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedModules, setSelectedModules] = useState<string[]>(['notes', 'documents', 'todos']);
  const [filtersOpened, { open: openFilters, close: closeFilters }] = useDisclosure(false);

  // Advanced filters
  const [filters, setFilters] = useState<SearchFilters>({
    include_tags: [],
    exclude_tags: [],
    favorites_only: false,
    include_archived: true,
    exclude_diary: true,
    sort_by: 'relevance',
    sort_order: 'desc',
    date_from: null,
    date_to: null,
    mime_types: '',
    min_file_size: null,
    max_file_size: null,
    todo_status: '',
    todo_priority: '',
    fuzzy_threshold: 60
  });

  const [availableTags, setAvailableTags] = useState<TagInfo[]>([]);
  const [allModuleOptions] = useState([
    { value: 'notes', label: 'Notes' },
    { value: 'documents', label: 'Documents' },
    { value: 'todos', label: 'Todos' },
    { value: 'archive', label: 'Archive' },
    { value: 'folders', label: 'Folders' }
    // Note: Diary is excluded from unified search for privacy
  ]);

  const resultsPerPage = 20;

  useAuthenticatedEffect(() => {
    if (initialQuery) {
      performSearch();
    }
    loadAvailableTags();
  }, []);

  const loadAvailableTags = async () => {
    try {
      const tags = await searchService.getAvailableTags();
      setAvailableTags(tags);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  const performSearch = async (page = 1) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setCurrentPage(page);

    try {
      const searchParams = {
        query: searchQuery,
        modules: selectedModules,
        page,
        limit: resultsPerPage,
        ...filters
      };

      let response: SearchResponse;

      switch (searchType) {
        case 'fts5':
          response = await searchService.fts5Search(searchParams);
          break;
        case 'fuzzy':
          response = await searchService.fuzzySearch(searchParams);
          break;
        case 'hybrid':
          response = await searchService.hybridSearch(searchParams);
          break;
        default:
          response = await searchService.fts5Search(searchParams);
      }

      setResults(response.results);
      setTotalResults(response.total);

      // Show search type performance indicator
      notifications.show({
        title: 'Search Complete',
        message: `${response.results.length} results found in ${response.performance || 'fast'} time`,
        color: 'blue',
        icon: <IconSearch size={16} />
      });

    } catch (error) {
      console.error('Search error:', error);
      notifications.show({
        title: 'Search Error',
        message: 'Failed to perform search. Please try again.',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(1);
  };

  const handleSearchTypeChange = (type: 'fts5' | 'fuzzy' | 'hybrid') => {
    setSearchType(type);
    if (searchQuery.trim()) {
      performSearch(1);
    }
  };

  const getSearchTypeDescription = () => {
    switch (searchType) {
      case 'fts5':
        return {
          title: 'Fast Search (FTS5)',
          description: 'Exact matching with high performance',
          icon: <IconBolt size={16} />,
          color: 'blue'
        };
      case 'fuzzy':
        return {
          title: 'Smart Search (Fuzzy)',
          description: 'Typo-tolerant with high recall',
          icon: <IconBrain size={16} />,
          color: 'purple'
        };
      case 'hybrid':
        return {
          title: 'Hybrid Search',
          description: 'Best of both worlds - intelligence + performance',
          icon: <IconSearch size={16} />,
          color: 'green'
        };
      default:
        return {
          title: 'Search',
          description: 'Search your knowledge base',
          icon: <IconSearch size={16} />,
          color: 'gray'
        };
    }
  };

  const searchTypeInfo = getSearchTypeDescription();

  const renderSearchResult = (result: SearchResult) => {
    const getIcon = () => {
      switch (result.type) {
        case 'note': return <IconFileText size={16} />;
        case 'document': return <IconFile size={16} />;
        case 'todo': return <IconChecklist size={16} />;
        case 'archive': return <IconArchive size={16} />;
        default: return <IconFileText size={16} />;
      }
    };

    const getTypeColor = () => {
      switch (result.type) {
        case 'note': return 'blue';
        case 'document': return 'green';
        case 'todo': return 'orange';
        case 'archive': return 'gray';
        case 'diary': return 'pink';
        default: return 'gray';
      }
    };

    const formatDate = (dateString: string) => {
      try {
        return new Date(dateString).toLocaleDateString();
      } catch {
        return dateString;
      }
    };

    return (
      <Card key={result.id || result.uuid} shadow="sm" p="md" withBorder>
        <Group justify="space-between" mb="xs">
          <Group>
            <ThemeIcon color={getTypeColor()} size="sm">
              {getIcon()}
            </ThemeIcon>
            <div>
              <Text fw={600} size="sm">
                <Highlight highlight={searchQuery.split(' ')} color="yellow">
                  {result.title || result.name || 'Untitled'}
                </Highlight>
              </Text>
              <Badge size="xs" variant="light" color={getTypeColor()}>
                {result.type}
              </Badge>
            </div>
          </Group>
          {result.is_favorite && (
            <ThemeIcon color="yellow" size="sm">
              <IconEye size={12} />
            </ThemeIcon>
          )}
        </Group>

        {(result.content || result.description) && (
          <Text size="xs" c="dimmed" mb="xs" lineClamp={2}>
            <Highlight highlight={searchQuery.split(' ')} color="yellow">
              {result.content || result.description}
            </Highlight>
          </Text>
        )}

        <Group justify="space-between">
          <Group gap="xs">
            {result.tags && result.tags.length > 0 && (
              <Group gap={4}>
                {result.tags.slice(0, 3).map(tag => (
                  <Badge key={tag} size="xs" variant="outline">
                    {tag}
                  </Badge>
                ))}
                {result.tags.length > 3 && (
                  <Badge size="xs" variant="outline">
                    +{result.tags.length - 3}
                  </Badge>
                )}
              </Group>
            )}
          </Group>

          <Group gap="xs">
            {result.created_at && (
              <Text size="xs" c="dimmed">
                {formatDate(result.created_at)}
              </Text>
            )}
            {result.score && (
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

  const renderAdvancedFilters = () => (
    <Stack p="md">
      <Title order={4}>Advanced Filters</Title>

      <Divider />

      <Title order={6}>Content Types</Title>
      <MultiSelect
        data={allModuleOptions}
        value={selectedModules}
        onChange={setSelectedModules}
        placeholder="Select modules to search"
        searchable
        clearable
      />

      <Divider />

      <Title order={6}>Sorting</Title>
      <Group>
        <Select
          data={[
            { value: 'relevance', label: 'Relevance' },
            { value: 'date', label: 'Date' },
            { value: 'title', label: 'Title' },
            { value: 'module', label: 'Module' }
          ]}
          value={filters.sort_by}
          onChange={(value) => setFilters(prev => ({ ...prev, sort_by: value as any }))}
          style={{ flex: 1 }}
        />
        <Select
          data={[
            { value: 'asc', label: 'Ascending' },
            { value: 'desc', label: 'Descending' }
          ]}
          value={filters.sort_order}
          onChange={(value) => setFilters(prev => ({ ...prev, sort_order: value as any }))}
          style={{ flex: 1 }}
        />
      </Group>

      <Divider />

      <Title order={6}>Tags</Title>
      <MultiSelect
        data={availableTags.map(tag => ({ value: tag.name, label: tag.name }))}
        value={filters.include_tags || []}
        onChange={(value) => setFilters(prev => ({ ...prev, include_tags: value }))}
        placeholder="Include tags"
        searchable
        clearable
      />
      <MultiSelect
        data={availableTags.map(tag => ({ value: tag.name, label: tag.name }))}
        value={filters.exclude_tags || []}
        onChange={(value) => setFilters(prev => ({ ...prev, exclude_tags: value }))}
        placeholder="Exclude tags"
        searchable
        clearable
      />

      <Divider />

      <Title order={6}>Options</Title>
      <Switch
        label="Include archived items"
        checked={filters.include_archived}
        onChange={(e) => setFilters(prev => ({ ...prev, include_archived: e.target.checked }))}
      />
      <Switch
        label="Exclude diary entries"
        checked={filters.exclude_diary}
        onChange={(e) => setFilters(prev => ({ ...prev, exclude_diary: e.target.checked }))}
      />
      <Switch
        label="Favorites only"
        checked={filters.favorites_only}
        onChange={(e) => setFilters(prev => ({ ...prev, favorites_only: e.target.checked }))}
      />

      {searchType === 'fuzzy' && (
        <>
          <Divider />
          <Title order={6}>Fuzzy Settings</Title>
          <Text size="xs" c="dimmed">Matching threshold: {filters.fuzzy_threshold}%</Text>
          <Slider
            value={filters.fuzzy_threshold || 60}
            onChange={(value) => setFilters(prev => ({ ...prev, fuzzy_threshold: value }))}
            min={0}
            max={100}
            step={5}
            marks={[
              { value: 0, label: '0%' },
              { value: 50, label: '50%' },
              { value: 100, label: '100%' }
            ]}
          />
        </>
      )}

      <Divider />

      <Group>
        <Button onClick={closeFilters} fullWidth>
          Apply Filters
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setFilters({
              include_tags: [],
              exclude_tags: [],
              favorites_only: false,
              include_archived: true,
              exclude_diary: true,
              sort_by: 'relevance',
              sort_order: 'desc',
              date_from: null,
              date_to: null,
              mime_types: '',
              min_file_size: null,
              max_file_size: null,
              todo_status: '',
              todo_priority: '',
              fuzzy_threshold: 60
            });
            closeFilters();
          }}
          fullWidth
        >
          Clear All
        </Button>
      </Group>
    </Stack>
  );

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>Unified Search</Title>
            <Text c="dimmed">Search across all your knowledge modules</Text>
          </div>
          <ActionIcon
            variant="outline"
            onClick={() => navigate(-1)}
            size="lg"
          >
            <IconArrowLeft size={16} />
          </ActionIcon>
        </Group>

        {/* Search Type Selector */}
        <Tabs
          value={searchType}
          onChange={(value) => handleSearchTypeChange(value as any)}
          variant="outline"
        >
          <Tabs.List>
            <Tabs.Tab value="fts5" leftSection={<IconBolt size={16} />}>
              FTS5 Search
            </Tabs.Tab>
            <Tabs.Tab value="fuzzy" leftSection={<IconBrain size={16} />}>
              Fuzzy Search
            </Tabs.Tab>
            <Tabs.Tab value="hybrid" leftSection={<IconSearch size={16} />}>
              Hybrid Search
            </Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {/* Search Description */}
        <Alert icon={searchTypeInfo.icon} color={searchTypeInfo.color}>
          <Title order={4}>{searchTypeInfo.title}</Title>
          <Text size="sm">{searchTypeInfo.description}</Text>
        </Alert>

        {/* Privacy Notice */}
        <Alert icon={<IconEyeOff size={16} />} color="orange">
          <Title order={6}>🔒 Privacy Protected</Title>
          <Text size="sm">
            Diary entries are excluded from unified search for your privacy.
            To search diary entries, please use the dedicated Diary Search within the Diary module.
          </Text>
        </Alert>

        {/* Search Form */}
        <Paper p="md" withBorder>
          <Group>
            <SearchSuggestions
              value={searchQuery}
              onChange={setSearchQuery}
              onSearch={performSearch}
              placeholder="Search your knowledge base..."
              modules={selectedModules}
              loading={loading}
            />
            <ActionIcon
              variant="outline"
              onClick={openFilters}
              size="lg"
            >
              <IconFilter size={16} />
            </ActionIcon>
            <ActionIcon
              variant="outline"
              onClick={() => performSearch(1)}
              loading={loading}
              size="lg"
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Group>
        </Paper>

        {/* Active Filters */}
        <Group>
          {selectedModules.map(module => (
            <Chip
              key={module}
              checked
              onClose={() => setSelectedModules(prev => prev.filter(m => m !== module))}
            >
              {module}
            </Chip>
          ))}
        </Group>

        {/* Results */}
        <div style={{ position: 'relative' }}>
          <LoadingOverlay visible={loading} />

          {results.length > 0 ? (
            <Stack gap="md">
              <Group justify="space-between">
                <Text>
                  Found {totalResults} results for "{searchQuery}"
                </Text>
                {totalPages > 1 && (
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

              {totalPages > 1 && (
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
                No results found for "{searchQuery}". Try different search terms or adjust your filters.
              </Alert>
            )
          )}
        </div>

        {/* Enhanced Filters Panel */}
        <EnhancedSearchFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableTags={availableTags}
          availableModules={allModuleOptions}
          onApply={closeFilters}
          onClear={() => {
            setFilters({
              include_tags: [],
              exclude_tags: [],
              favorites_only: false,
              include_archived: true,
              exclude_diary: true,
              sort_by: 'relevance',
              sort_order: 'desc',
              date_from: null,
              date_to: null,
              mime_types: '',
              min_file_size: null,
              max_file_size: null,
              todo_status: '',
              todo_priority: '',
              fuzzy_threshold: 60
            });
          }}
          isOpen={filtersOpened}
          onClose={closeFilters}
          searchType={searchType}
        />
      </Stack>
    </Container>
  );
};

export default UnifiedSearch;