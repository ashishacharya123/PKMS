import React, { useState, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Stack,
  Title,
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
} from '@mantine/core';
import {
  IconSearch,
  IconFilter,
  IconFileText,
  IconFile,
  IconChecklist,
  IconArchive,
  IconEyeOff,
  // IconBolt, // Removed unused import
  IconInfoCircle,
  IconArrowLeft,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import type { SearchResult, SearchFilters, SearchResponse, TagInfo } from '../../services/searchService';
import searchService from '../../services/searchService';
import SearchSuggestions from './SearchSuggestions';
import UnifiedSearchFilters from './UnifiedSearchFilters';
import { SearchTypeToggle, SearchType } from './SearchTypeToggle';

interface UnifiedSearchProps {
  initialQuery?: string;
}

const UnifiedSearch: React.FC<UnifiedSearchProps> = ({ initialQuery = '' }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filtersOpened, { open: openFilters, close: closeFilters }] = useDisclosure(false);
  const [filters, setFilters] = useState<SearchFilters>({
    include_tags: [],
    exclude_tags: [],
    include_archived: true,
    exclude_diary: true,
    sort_by: 'relevance',
    sort_order: 'desc',
  });
  const [selectedModules, setSelectedModules] = useState<string[]>(['notes', 'documents', 'todos', 'archive', 'folders', 'projects']);
  const [availableTags, setAvailableTags] = useState<TagInfo[]>([]);
  const [searchType, setSearchType] = useState<SearchType>('fts5');

  const resultsPerPage = 20;
  const allModuleOptions = useMemo(
    () => [
      { value: 'notes', label: 'Notes' },
      { value: 'documents', label: 'Documents' },
      { value: 'todos', label: 'Todos' },
      { value: 'archive', label: 'Archive' },
      { value: 'folders', label: 'Folders' },
      { value: 'projects', label: 'Projects' },
    ],
    []
  );

  const loadTags = async () => {
    try {
      const tags = await searchService.getPopularTags();
      setAvailableTags(tags);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  React.useEffect(() => {
    loadTags();
  }, []);

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
        ...filters,
        modules: selectedModules,
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
      <Card key={result.id} shadow="sm" p="md" withBorder>
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
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>Unified Search</Title>
            <Text c="dimmed">Search across notes, documents, todos, archive, and more.</Text>
          </div>
          <ActionIcon variant="outline" onClick={() => navigate(-1)} size="lg">
            <IconArrowLeft size={16} />
          </ActionIcon>
        </Group>

        <SearchTypeToggle
          value={searchType}
          onChange={setSearchType}
          disabled={loading}
        />

        <Alert icon={<IconEyeOff size={16} />} color="orange">
          Diary entries remain excluded unless explicitly included via advanced filters.
        </Alert>

        <Paper p="md" withBorder>
          <form onSubmit={handleSearch}>
            <Stack gap="md">
              <Group>
                <SearchSuggestions
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSearch={() => performSearch(1)}
                  placeholder="Search your knowledge base..."
                  loading={loading}
                />
                <ActionIcon variant="outline" onClick={openFilters} size="lg">
                  <IconFilter size={16} />
                </ActionIcon>
                <Button 
                  variant="outline" 
                  type="submit" 
                  loading={loading}
                  disabled={selectedModules.length === 0}
                >
                  <IconSearch size={16} />
                </Button>
              </Group>
              
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
            </Stack>
          </form>
        </Paper>

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

        <UnifiedSearchFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableTags={availableTags}
          availableModules={allModuleOptions}
          onApply={closeFilters}
          onClear={() => {
            setFilters({
              include_tags: [],
              exclude_tags: [],
              include_archived: true,
              exclude_diary: true,
              sort_by: 'relevance',
              sort_order: 'desc',
            });
          }}
          isOpen={filtersOpened}
          onClose={closeFilters}
        />
      </Stack>
    </Container>
  );
};

export default memo(UnifiedSearch);