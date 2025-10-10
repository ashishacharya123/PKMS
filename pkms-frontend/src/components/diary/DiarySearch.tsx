import React, { useState } from 'react';
import {
  Paper,
  Stack,
  Title,
  Group,
  Text,
  TextInput,
  Button,
  Alert,
  Badge,
  SimpleGrid,
  ActionIcon,
  LoadingOverlay,
} from '@mantine/core';
import {
  IconSearch,
  IconFilter,
  IconRefresh,
  IconCalendar,
  IconTag,
  IconArchive,
  IconInfoCircle,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { searchService, SearchResult, SearchResponse, SearchFilters, TagInfo } from '../../services/searchService';
import { useDiaryStore } from '../../stores/diaryStore';
import UnifiedSearchFilters from '../search/UnifiedSearchFilters';

interface DiarySearchProps {
  onEntrySelect: (entryUuid: string) => void;
}

const DiarySearch: React.FC<DiarySearchProps> = ({ onEntrySelect }) => {
  const { isUnlocked } = useDiaryStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filters, setFilters] = useState<SearchFilters>({
    modules: ['diary'],
    exclude_diary: false,
  });
  const [availableTags, setAvailableTags] = useState<TagInfo[]>([]);
  const [filtersOpen, { open: openFilters, close: closeFilters }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    searchService
      .getPopularTags('diary')
      .then(setAvailableTags)
      .catch((error) => {
        console.error('Failed to load diary tags:', error);
      });
  }, []);

  const performSearch = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const response: SearchResponse = await searchService.searchFuzzy(query, filters);
      setResults(response.results);
      notifications.show({
        title: 'Search Complete',
        message: `${response.stats.totalResults} diary entries found` + (response.stats.searchTime ? ` in ${response.stats.searchTime}ms` : ''),
        color: 'blue',
        icon: <IconSearch size={16} />,
      });
    } catch (error) {
      console.error('Diary search error:', error);
      notifications.show({
        title: 'Search Error',
        message: 'Failed to search diary entries. Try again.',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderResult = (result: SearchResult) => (
    <Paper
      key={result.id}
      withBorder
      p="md"
      radius="md"
      style={{ cursor: 'pointer' }}
      onClick={() => onEntrySelect(result.id)}
    >
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <Title order={5}>{result.title}</Title>
            <Badge color="pink" variant="light">
              Diary
            </Badge>
          </Group>
          {result.createdAt && (
            <Group gap="xs" c="dimmed">
              <IconCalendar size={14} />
              <Text size="xs">{new Date(result.createdAt).toLocaleDateString()}</Text>
            </Group>
          )}
        </Group>

        {result.preview && (
          <Text size="sm" c="dimmed" lineClamp={3}>
            {result.preview}
          </Text>
        )}

        {result.tags?.length ? (
          <Group gap="xs">
            <IconTag size={14} />
            {result.tags.map((tag) => (
              <Badge key={tag} size="sm" variant="outline">
                {tag}
              </Badge>
            ))}
          </Group>
        ) : null}
      </Stack>
    </Paper>
  );

  return (
    <Paper p="lg" withBorder radius="md">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <div>
            <Title order={3}>Diary Search</Title>
            <Text c="dimmed">Search encrypted diary entries (requires diary unlock).</Text>
          </div>
          <ActionIcon disabled={!isUnlocked} variant="outline" onClick={performSearch}>
            <IconRefresh size={16} />
          </ActionIcon>
        </Group>

        {!isUnlocked && (
          <Alert icon={<IconArchive size={16} />} color="orange">
            Unlock your diary to search encrypted entries.
          </Alert>
        )}

        <form onSubmit={performSearch}>
          <Stack gap="sm">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search diary entries (title, tags, content)..."
              leftSection={<IconSearch size={16} />}
              disabled={!isUnlocked}
            />
            <Group justify="space-between">
              <Button
                leftSection={<IconFilter size={16} />}
                onClick={() => (filtersOpen ? closeFilters() : openFilters())}
                variant="outline"
              >
                Filters
              </Button>
              <Button type="submit" leftSection={<IconSearch size={16} />} disabled={!isUnlocked}>
                Search
              </Button>
            </Group>
          </Stack>
        </form>

        <UnifiedSearchFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableTags={availableTags}
          availableModules={[{ value: 'diary', label: 'Diary' }]}
          onApply={() => {
            closeFilters();
            performSearch();
          }}
          onClear={() => setFilters({ modules: ['diary'], exclude_diary: false })}
          isOpen={filtersOpen}
          onClose={closeFilters}
          searchType="fuzzy"
        />

        <div style={{ position: 'relative' }}>
          <LoadingOverlay visible={loading} />
          {results.length > 0 ? (
            <Stack gap="sm">
              <Text size="sm" c="dimmed">
                {results.length} entries found
              </Text>
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                {results.map(renderResult)}
              </SimpleGrid>
            </Stack>
          ) : (
            !loading && query && (
              <Alert icon={<IconInfoCircle size={16} />} color="blue">
                No diary entries matched your search.
              </Alert>
            )
          )}
        </div>
      </Stack>
    </Paper>
  );
};

export default DiarySearch;