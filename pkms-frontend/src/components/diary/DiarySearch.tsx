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
  MultiSelect,
  Select,
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
  const [selectedModules, setSelectedModules] = useState<string[]>(['diary']);
  const [searchType, setSearchType] = useState<string>('fuzzy');
  const [filters, setFilters] = useState<SearchFilters>({
    modules: ['diary'],
    exclude_diary: false,
  });
  const [availableTags, setAvailableTags] = useState<TagInfo[]>([]);
  const [filtersOpen, { open: openFilters, close: closeFilters }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);

  const moduleOptions = [
    { value: 'diary', label: 'Diary (metadata only)' },
    { value: 'notes', label: 'Notes' },
    { value: 'documents', label: 'Documents' },
    { value: 'todos', label: 'Todos' },
    { value: 'archive', label: 'Archive' },
    { value: 'folders', label: 'Folders' },
    { value: 'projects', label: 'Projects' },
  ];

  const searchTypeOptions = [
    { value: 'fts5', label: 'FTS5 (Fast, Recommended)' },
    { value: 'fuzzy', label: 'Fuzzy (Title, Description, Tags)' },
    { value: 'advanced_fuzzy', label: 'Advanced Fuzzy (Full Content - Very Slow)' },
  ];

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
    
    if (query.trim().length < 3) {
      notifications.show({
        title: 'Query too short',
        message: 'Please enter at least 3 characters to search',
        color: 'orange'
      });
      return;
    }
    
    if (selectedModules.length === 0) {
      notifications.show({
        title: 'No modules selected',
        message: 'Please select at least one module to search in',
        color: 'orange'
      });
      return;
    }

    setLoading(true);
    try {
      const effectiveFilters: SearchFilters = {
        ...filters,
        modules: selectedModules,
      };
      
      let response: SearchResponse;
      switch (searchType) {
        case 'fts5':
          response = await searchService.searchFTS(query, effectiveFilters);
          break;
        case 'advanced_fuzzy':
          // Advanced fuzzy loads ALL content into memory - SLOW but comprehensive
          response = await searchService.searchAdvancedFuzzy(query, effectiveFilters);
          break;
        case 'fuzzy':
        default:
          // Regular fuzzy - metadata only (title, description, tags)
          response = await searchService.searchFuzzy(query, effectiveFilters);
          break;
      }
      setResults(response.results);
      notifications.show({
        title: 'Search Complete',
        message: `${response.stats.totalResults} results found` + (response.stats.searchTime ? ` in ${response.stats.searchTime}ms` : ''),
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
            <Title order={3}>Cross-Module Search</Title>
            <Text c="dimmed">Search across modules. Note: Diary content is encrypted - only metadata (title, tags, date) is searchable.</Text>
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
              placeholder="Search across your knowledge base..."
              leftSection={<IconSearch size={16} />}
              disabled={!isUnlocked}
            />
            
            <Group>
              <Text size="sm" fw={500}>Search in:</Text>
              <MultiSelect
                placeholder="Select modules"
                data={moduleOptions}
                value={selectedModules}
                onChange={setSelectedModules}
                size="sm"
                style={{ minWidth: 250 }}
                disabled={!isUnlocked}
              />
            </Group>
            
            <Group>
              <Text size="sm" fw={500}>Search type:</Text>
              <Select
                placeholder="Select search type"
                data={searchTypeOptions}
                value={searchType}
                onChange={(value) => setSearchType(value || 'fuzzy')}
                size="sm"
                style={{ minWidth: 200 }}
                disabled={!isUnlocked}
              />
              <Text size="xs" c="dimmed">
                {searchType === 'fts5' && 'Fast indexed search (metadata only)'}
                {searchType === 'fuzzy' && 'Typo-tolerant (no note content)'}
                {searchType === 'advanced_fuzzy' && 'Searches everything including note content'}
              </Text>
            </Group>
            
            <Group justify="space-between">
              <Button
                leftSection={<IconFilter size={16} />}
                onClick={() => (filtersOpen ? closeFilters() : openFilters())}
                variant="outline"
              >
                Filters
              </Button>
              <Button 
                type="submit" 
                leftSection={<IconSearch size={16} />} 
                disabled={!isUnlocked || selectedModules.length === 0}
              >
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