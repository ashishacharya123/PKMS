import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Title,
  Text,
  TextInput,
  Button,
  Stack,
  Group,
  Paper,
  Badge,
  Card,
  Checkbox,
  Select,
  NumberInput,
  Switch,
  Alert,
  LoadingOverlay,
  ThemeIcon,
  Divider,
  ActionIcon,
  Tooltip,
  Slider,
  Progress
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import {
  IconBrain,
  IconSearch,
  IconFilter,
  IconAdjustments,
  IconInfoCircle,
  IconArrowLeft,
  IconRefresh
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { apiService } from '../services/api';

// Types
interface SearchResult {
  type: string;
  module: string;
  id?: number;
  uuid?: string;
  title?: string;
  name?: string;
  content?: string;
  description?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  relevance_score: number;
  fuzzy_score: number;
  combined_score: number;
  fuzzy_details: Record<string, number>;
  url: string;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  fts_candidates: number;
  search_method: string;
  modules_searched: string[];
  query: string;
  applied_fuzzy: boolean;
  fuzzy_threshold: number;
}

const MODULE_OPTIONS = [
  { value: 'notes', label: 'Notes' },
  { value: 'documents', label: 'Documents' },
  { value: 'todos', label: 'Todos' },
  { value: 'archive', label: 'Archive' },
  { value: 'folders', label: 'Folders' }
];

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'fuzzy_score', label: 'Fuzzy Score' },
  { value: 'date', label: 'Date' },
  { value: 'title', label: 'Title' },
  { value: 'module', label: 'Module' }
];

export default function FuzzySearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [searchMethod, setSearchMethod] = useState('');
  
  // Fuzzy-specific settings
  const [fuzzyThreshold, setFuzzyThreshold] = useState(60);
  
  // Filters
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('relevance');
  const [sortOrder, setSortOrder] = useState('desc');
  const [includeTags, setIncludeTags] = useState('');
  const [excludeTags, setExcludeTags] = useState('');
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(true);
  
  // UI state
  const [filtersOpened, { toggle: toggleFilters }] = useDisclosure(false);
  
  useEffect(() => {
    // Auto-focus search input
    const searchInput = document.querySelector('input[placeholder*="fuzzy"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) {
      notifications.show({
        title: 'Invalid Query',
        message: 'Please enter a search term',
        color: 'orange'
      });
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const params = new URLSearchParams({
        q: query.trim(),
        fuzzy_threshold: fuzzyThreshold.toString(),
        sort_by: sortBy,
        sort_order: sortOrder,
        favorites_only: favoritesOnly.toString(),
        include_archived: includeArchived.toString(),
        limit: '50',
        offset: '0'
      });

      if (selectedModules.length > 0) {
        params.set('modules', selectedModules.join(','));
      }
      if (includeTags.trim()) {
        params.set('include_tags', includeTags.trim());
      }
      if (excludeTags.trim()) {
        params.set('exclude_tags', excludeTags.trim());
      }
      if (dateFrom) {
        params.set('date_from', dateFrom.toISOString().split('T')[0]);
      }
      if (dateTo) {
        params.set('date_to', dateTo.toISOString().split('T')[0]);
      }

      const response = await apiService.get(`/search/fuzzy?${params}`);
      const searchResponse: SearchResponse = response.data;

      setResults(searchResponse.results);
      setTotal(searchResponse.total);
      setSearchMethod(searchResponse.search_method);

      notifications.show({
        title: 'Fuzzy Search Complete',
        message: `Found ${searchResponse.total} results (${searchResponse.fts_candidates} candidates analyzed)`,
        color: 'purple'
      });

    } catch (err: any) {
      setError(err.message || 'Search failed');
      notifications.show({
        title: 'Search Failed',
        message: err.message || 'Fuzzy search encountered an error',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const getModuleColor = (module: string) => {
    const colors: Record<string, string> = {
      notes: 'blue',
      documents: 'green', 
      todos: 'orange',
      diary: 'purple',
      archive: 'indigo',
      folders: 'gray'
    };
    return colors[module] || 'gray';
  };

  const getFuzzyScoreColor = (score: number) => {
    if (score >= 90) return 'green';
    if (score >= 75) return 'blue';
    if (score >= 60) return 'yellow';
    return 'orange';
  };

  const getThresholdColor = (threshold: number) => {
    if (threshold >= 80) return 'red';
    if (threshold >= 65) return 'orange';
    if (threshold >= 50) return 'blue';
    return 'green';
  };

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="center">
          <div>
            <Group gap="sm" align="center">
              <ActionIcon 
                variant="light" 
                onClick={() => navigate(-1)}
                aria-label="Go back"
              >
                <IconArrowLeft size={18} />
              </ActionIcon>
              <ThemeIcon color="purple" size="lg">
                <IconBrain size={20} />
              </ThemeIcon>
              <div>
                <Title order={2} c="purple">
                  Fuzzy Search
                </Title>
                <Text size="sm" c="dimmed">
                  Typo-tolerant search with intelligent matching • Ctrl+Shift+F
                </Text>
              </div>
            </Group>
          </div>
          <Group gap="sm">
            <Badge variant="light" color="purple" size="lg">
              Typo Tolerant
            </Badge>
            <Tooltip label="Search Help">
              <ActionIcon 
                variant="light" 
                color="blue"
                onClick={() => notifications.show({
                  title: 'Fuzzy Search Tips',
                  message: 'Type with typos! Lower threshold = more flexible. Great for partial memories and exploration.',
                  color: 'blue',
                  autoClose: 5000
                })}
              >
                <IconInfoCircle size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Search Input */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Group align="flex-end">
              <TextInput
                label="Search Query"
                placeholder="Enter your fuzzy search query (typos OK)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
                leftSection={<IconSearch size={16} />}
                style={{ flex: 1 }}
                autoFocus
              />
              <Button 
                onClick={handleSearch} 
                loading={loading} 
                leftSection={<IconSearch size={16} />}
                color="purple"
              >
                Search
              </Button>
            </Group>

            {/* Fuzzy Settings */}
            <Group>
              <div style={{ flex: 1 }}>
                <Text size="sm" mb={5}>
                  Fuzzy Threshold: {fuzzyThreshold}% 
                  <Badge 
                    size="xs" 
                    color={getThresholdColor(fuzzyThreshold)} 
                    variant="light" 
                    ml="xs"
                  >
                    {fuzzyThreshold >= 80 ? 'Strict' : 
                     fuzzyThreshold >= 65 ? 'Balanced' : 
                     fuzzyThreshold >= 50 ? 'Flexible' : 'Very Flexible'}
                  </Badge>
                </Text>
                <Slider
                  value={fuzzyThreshold}
                  onChange={setFuzzyThreshold}
                  min={30}
                  max={95}
                  step={5}
                  marks={[
                    { value: 30, label: '30%' },
                    { value: 50, label: '50%' },
                    { value: 70, label: '70%' },
                    { value: 90, label: '90%' }
                  ]}
                  color="purple"
                />
              </div>
            </Group>

            {/* Quick Filters */}
            <Group>
              <Checkbox.Group
                label="Modules to search"
                value={selectedModules}
                onChange={setSelectedModules}
              >
                <Group mt="xs">
                  {MODULE_OPTIONS.map(option => (
                    <Checkbox 
                      key={option.value} 
                      value={option.value} 
                      label={option.label}
                      size="sm"
                    />
                  ))}
                </Group>
              </Checkbox.Group>
            </Group>

            <Group>
              <Select
                label="Sort by"
                value={sortBy}
                onChange={(value) => setSortBy(value || 'relevance')}
                data={SORT_OPTIONS}
                style={{ width: 150 }}
              />
              <Select
                label="Order"
                value={sortOrder}
                onChange={(value) => setSortOrder(value || 'desc')}
                data={[
                  { value: 'desc', label: 'Descending' },
                  { value: 'asc', label: 'Ascending' }
                ]}
                style={{ width: 130 }}
              />
              <div style={{ flex: 1 }}>
                <Button
                  variant="light"
                  leftSection={<IconFilter size={16} />}
                  onClick={toggleFilters}
                  color={filtersOpened ? 'blue' : 'gray'}
                >
                  Advanced Filters
                </Button>
              </div>
            </Group>

            {/* Advanced Filters */}
            {filtersOpened && (
              <Paper p="md" withBorder bg="gray.0">
                <Stack gap="md">
                  <Text size="sm" fw={500}>Advanced Filtering Options</Text>
                  
                  <Group>
                    <TextInput
                      label="Include tags"
                      placeholder="tag1, tag2"
                      value={includeTags}
                      onChange={(e) => setIncludeTags(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <TextInput
                      label="Exclude tags"
                      placeholder="tag1, tag2"
                      value={excludeTags}
                      onChange={(e) => setExcludeTags(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </Group>

                  <Group>
                    <DateInput
                      label="Date from"
                      value={dateFrom}
                      onChange={setDateFrom}
                      clearable
                    />
                    <DateInput
                      label="Date to"
                      value={dateTo}
                      onChange={setDateTo}
                      clearable
                    />
                  </Group>

                  <Group>
                    <Switch
                      label="Favorites only"
                      checked={favoritesOnly}
                      onChange={(e) => setFavoritesOnly(e.currentTarget.checked)}
                    />
                    <Switch
                      label="Include archived"
                      checked={includeArchived}
                      onChange={(e) => setIncludeArchived(e.currentTarget.checked)}
                    />
                  </Group>
                </Stack>
              </Paper>
            )}
          </Stack>
        </Paper>

        {/* Results */}
        {error && (
          <Alert color="red" title="Search Error">
            {error}
          </Alert>
        )}

        {loading && (
          <Paper p="xl" withBorder>
            <LoadingOverlay visible />
            <Text ta="center" c="dimmed">Applying fuzzy matching...</Text>
          </Paper>
        )}

        {!loading && results.length > 0 && (
          <>
            <Group justify="space-between" align="center">
              <Text size="sm" c="dimmed">
                Found {total} results • {searchMethod} • Threshold: {fuzzyThreshold}%
              </Text>
              <ActionIcon
                variant="light"
                onClick={handleSearch}
                disabled={loading}
                aria-label="Refresh search"
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Group>

            <Stack gap="sm">
              {results.map((result, index) => (
                <Card key={`${result.module}-${result.id || result.uuid}-${index}`} withBorder padding="md">
                  <Group justify="space-between" align="flex-start">
                    <div style={{ flex: 1 }}>
                      <Group gap="xs" mb="xs">
                        <Badge color={getModuleColor(result.module)} size="sm">
                          {result.module}
                        </Badge>
                        {result.fuzzy_score && (
                          <Badge 
                            color={getFuzzyScoreColor(result.fuzzy_score)} 
                            variant="light" 
                            size="sm"
                          >
                            Fuzzy: {result.fuzzy_score.toFixed(0)}%
                          </Badge>
                        )}
                        {result.combined_score && (
                          <Badge 
                            color="blue" 
                            variant="outline" 
                            size="sm"
                          >
                            Combined: {result.combined_score.toFixed(3)}
                          </Badge>
                        )}
                        {result.tags.length > 0 && (
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
                      
                      <Text fw={500} size="sm" mb={4}>
                        {result.title || result.name}
                      </Text>
                      
                      {(result.content || result.description) && (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {result.content || result.description}
                        </Text>
                      )}

                      {/* Fuzzy Match Details */}
                      {result.fuzzy_details && Object.keys(result.fuzzy_details).length > 0 && (
                        <Group gap="xs" mt="xs">
                          <Text size="xs" c="dimmed">Match quality:</Text>
                          {Object.entries(result.fuzzy_details).map(([field, score]) => (
                            <Badge key={field} size="xs" variant="dot" color={getFuzzyScoreColor(score)}>
                              {field}: {score.toFixed(0)}%
                            </Badge>
                          ))}
                        </Group>
                      )}
                      
                      <Text size="xs" c="dimmed" mt="xs">
                        {new Date(result.created_at).toLocaleDateString()}
                      </Text>
                    </div>
                    
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => navigate(result.url)}
                    >
                      View
                    </Button>
                  </Group>
                </Card>
              ))}
            </Stack>
          </>
        )}

        {!loading && !error && query && results.length === 0 && (
          <Paper p="xl" withBorder ta="center">
            <Text c="dimmed">No results found for "{query}"</Text>
            <Text size="xs" c="dimmed" mt="xs">
              Try lowering the fuzzy threshold or using different keywords
            </Text>
          </Paper>
        )}

        {/* Help Info */}
        <Paper p="md" withBorder bg="purple.0">
          <Group gap="xs">
            <IconInfoCircle size={16} color="var(--mantine-color-purple-6)" />
            <div>
              <Text size="sm" fw={500}>Fuzzy Search Features</Text>
              <Text size="xs" c="dimmed">
                • Typo tolerance • Partial matching • Flexible scoring • Great for exploration • Adjustable sensitivity
              </Text>
            </div>
          </Group>
        </Paper>
      </Stack>
    </Container>
  );
}
