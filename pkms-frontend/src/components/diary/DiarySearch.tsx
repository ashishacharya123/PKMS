import React, { useState } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import {
  Container,
  Stack,
  Title,
  Group,
  Text,
  TextInput,
  Select,
  Button,
  Card,
  Badge,
  ActionIcon,
  Divider,
  SimpleGrid,
  Alert,
  Pagination,
  ThemeIcon,
  Tooltip,
  LoadingOverlay,
  Center,
  Switch,
  Drawer,
  Box,
  Chip,
  Paper
} from '@mantine/core';
import {
  IconSearch,
  IconFilter,
  IconBook,
  IconCalendar,
  IconTag,
  IconEye,
  IconRefresh,
  IconX,
  IconMoodHappy,
  IconMoodSad,
  IconMoodNeutral
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { searchService, SearchResult } from '../services/searchService';
import searchStyles, { searchStyleClasses } from '../styles/searchStyles';

interface DiarySearchProps {
  onSearchSelect?: (result: SearchResult) => void;
  initialQuery?: string;
}

const DiarySearch: React.FC<DiarySearchProps> = ({
  onSearchSelect,
  initialQuery = ''
}) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filtersOpened, { open: openFilters, close: closeFilters }] = useDisclosure(false);

  // Diary-specific filters
  const [filters, setFilters] = useState({
    include_tags: [] as string[],
    exclude_tags: [] as string[],
    sort_by: 'date' as 'relevance' | 'date' | 'title',
    sort_order: 'desc' as 'asc' | 'desc',
    date_from: null as string | null,
    date_to: null as string | null,
    mood_filter: 'all' as 'all' | 'happy' | 'sad' | 'neutral',
    favorites_only: false
  });

  const [availableTags, setAvailableTags] = useState<{ name: string; count: number }[]>([]);
  const resultsPerPage = 20;

  useAuthenticatedEffect(() => {
    if (initialQuery) {
      performSearch();
    }
    loadAvailableTags();
  }, []);

  const loadAvailableTags = async () => {
    try {
      const tags = await searchService.getAvailableTags('diary');
      setAvailableTags(tags.map(tag => ({ name: tag.name, count: tag.count || 0 })));
    } catch (error) {
      console.error('Failed to load diary tags:', error);
    }
  };

  const performSearch = async (page = 1) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setCurrentPage(page);

    try {
      // Add diary context header for security
      const searchParams = {
        query: searchQuery,
        modules: ['diary'],
        page,
        limit: resultsPerPage,
        include_tags: filters.include_tags,
        exclude_tags: filters.exclude_tags,
        favorites_only: filters.favorites_only,
        sort_by: filters.sort_by,
        sort_order: filters.sort_order,
        date_from: filters.date_from,
        date_to: filters.date_to
      };

      // Add custom header for diary access
      const response = await fetch('/api/v1/search/fts5', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Diary-Context': 'true',
          'Authorization': `Bearer ${localStorage.getItem('pkms_token') || ''}`
        }
      });

      const params = new URLSearchParams();
      Object.entries(searchParams).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v));
        } else if (value !== null && value !== undefined) {
          params.append(key, value.toString());
        }
      });

      const fullResponse = await fetch(`/api/v1/search/fts5?${params.toString()}`, {
        headers: {
          'X-Diary-Context': 'true',
          'Authorization': `Bearer ${localStorage.getItem('pkms_token') || ''}`
        }
      });

      if (!fullResponse.ok) {
        throw new Error(`HTTP error! status: ${fullResponse.status}`);
      }

      const data = await fullResponse.json();
      setResults(data.results || []);
      setTotalResults(data.total || 0);

      notifications.show({
        title: 'Diary Search Complete',
        message: `${data.results?.length || 0} diary entries found`,
        color: 'pink',
        icon: <IconBook size={16} />
      });

    } catch (error) {
      console.error('Diary search error:', error);
      notifications.show({
        title: 'Search Error',
        message: 'Failed to search diary entries. Please try again.',
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

  const getMoodIcon = (mood?: string) => {
    switch (mood) {
      case 'happy': return <IconMoodHappy size={16} />;
      case 'sad': return <IconMoodSad size={16} />;
      case 'neutral': return <IconMoodNeutral size={16} />;
      default: return <IconBook size={16} />;
    }
  };

  const getMoodColor = (mood?: string) => {
    switch (mood) {
      case 'happy': return 'yellow';
      case 'sad': return 'blue';
      case 'neutral': return 'gray';
      default: return 'pink';
    }
  };

  const renderSearchResult = (result: SearchResult) => {
    const formatDate = (dateString: string) => {
      try {
        return new Date(dateString).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch {
        return dateString;
      }
    };

    return (
      <Card
        key={result.id}
        shadow="sm"
        p="md"
        withBorder
        style={{
          cursor: onSearchSelect ? 'pointer' : 'default',
          borderLeft: '4px solid var(--mantine-color-pink-filled)'
        }}
        onClick={() => onSearchSelect && onSearchSelect(result)}
      >
        <Group justify="space-between" mb="xs">
          <Group>
            <ThemeIcon color="pink" size="sm">
              <IconBook size={16} />
            </ThemeIcon>
            <div>
              <Text fw={600} size="sm">
                {result.title || formatDate(result.createdAt)}
              </Text>
              <Group gap={4}>
                <Text size="xs" c="dimmed">
                  {formatDate(result.createdAt)}
                </Text>
                {result.metadata?.mood && (
                  <ThemeIcon color={getMoodColor(result.metadata.mood)} size="xs">
                    {getMoodIcon(result.metadata.mood)}
                  </ThemeIcon>
                )}
              </Group>
            </div>
          </Group>
          {result.is_favorite && (
            <ThemeIcon color="yellow" size="sm">
              <IconEye size={12} />
            </ThemeIcon>
          )}
        </Group>

        {(result.content || result.description) && (
          <Text size="xs" c="dimmed" mb="xs" lineClamp={3}>
            {result.content || result.description}
          </Text>
        )}

        {result.tags && result.tags.length > 0 && (
          <Group gap={4}>
            {result.tags.slice(0, 5).map(tag => (
              <Badge key={tag} size="xs" variant="outline" color="pink">
                {tag}
              </Badge>
            ))}
            {result.tags.length > 5 && (
              <Badge size="xs" variant="outline" color="pink">
                +{result.tags.length - 5}
              </Badge>
            )}
          </Group>
        )}
      </Card>
    );
  };

  const totalPages = Math.ceil(totalResults / resultsPerPage);

  const renderDiaryFilters = () => (
    <Stack p="md">
      <Title order={4}>Diary Search Filters</Title>

      <Divider />

      <Title order={6}>Sorting</Title>
      <Group>
        <Select
          data={[
            { value: 'relevance', label: 'Relevance' },
            { value: 'date', label: 'Date' },
            { value: 'title', label: 'Title' }
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
      <Text size="xs" c="dimmed">Filter by diary entry tags</Text>
      {availableTags.length > 0 && (
        <Text size="xs" c="dimmed">
          Available tags: {availableTags.map(tag => tag.name).join(', ')}
        </Text>
      )}

      <Divider />

      <Title order={6}>Options</Title>
      <Switch
        label="Favorites only"
        checked={filters.favorites_only}
        onChange={(e) => setFilters(prev => ({ ...prev, favorites_only: e.target.checked }))}
      />

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
              sort_by: 'date',
              sort_order: 'desc',
              date_from: null,
              date_to: null,
              mood_filter: 'all',
              favorites_only: false
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
    <Container size="md" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <div>
          <Title order={2}>Diary Search</Title>
          <Text c="dimmed">Search your personal diary entries with privacy protection</Text>
        </div>

        {/* Security Notice */}
        <Alert icon={<IconBook size={16} />} color="pink">
          <Title order={4}>🔒 Private Diary Search</Title>
          <Text size="sm">
            Diary searches are only accessible from within the diary module to ensure your privacy.
            Your diary entries remain completely private and secure.
          </Text>
        </Alert>

        {/* Search Form */}
        <Paper p="md" withBorder>
          <form onSubmit={handleSearch}>
            <Group>
              <TextInput
                placeholder="Search your diary entries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1 }}
                size="lg"
                rightSection={
                  <ActionIcon
                    type="submit"
                    loading={loading}
                    size="lg"
                  >
                    <IconSearch size={16} />
                  </ActionIcon>
                }
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
          </form>
        </Paper>

        {/* Active Filters */}
        <Group>
          {filters.sort_by !== 'date' && (
            <Chip checked onClose={() => setFilters(prev => ({ ...prev, sort_by: 'date' }))}>
              Sort: {filters.sort_by}
            </Chip>
          )}
          {filters.favorites_only && (
            <Chip checked onClose={() => setFilters(prev => ({ ...prev, favorites_only: false }))}>
              Favorites only
            </Chip>
          )}
        </Group>

        {/* Results */}
        <div style={{ position: 'relative' }}>
          <LoadingOverlay visible={loading} />

          {results.length > 0 ? (
            <Stack gap="md">
              <Group justify="space-between">
                <Text>
                  Found {totalResults} diary entries for "{searchQuery}"
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
              <Alert icon={<IconBook size={16} />} color="pink">
                No diary entries found for "{searchQuery}". Try different search terms or check your spelling.
              </Alert>
            )
          )}
        </div>

        {/* Filters Drawer */}
        <Drawer
          opened={filtersOpened}
          onClose={closeFilters}
          title="Diary Search Filters"
          size="sm"
          position="right"
        >
          {renderDiaryFilters()}
        </Drawer>
      </Stack>
    </Container>
  );
};

export default DiarySearch;