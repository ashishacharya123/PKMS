/**
 * Advanced Search Analytics Component
 * Shows the full power of the backend search system with analytics
 */

import { useEffect, useState } from 'react';
import {
  Container,
  Title,
  Stack,
  Group,
  Card,
  Text,
  Badge,
  Progress,
  SimpleGrid,
  Tabs,
  Alert,
  Button,
  TextInput,
  Select,
  Paper,
  Divider,
  ThemeIcon,
  Timeline,
  RingProgress,
  Table,
  ActionIcon,
  Tooltip
} from '@mantine/core';
import { LineChart, BarChart } from '@mantine/charts';
import {
  IconSearch,
  IconBolt,
  IconBrain,
  IconChartLine,
  IconTrendingUp,
  IconClock,
  IconDatabase,
  IconRefresh,
  IconFilter,
  IconSortAscending,
  IconSortDescending,
  IconEye,
  IconDownload,
  IconTarget,
  IconCheck,
  IconX
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { searchService } from '../../services/searchService';

interface SearchAnalytics {
  total_searches: number;
  searches_by_type: {
    fts5: number;
    fuzzy: number;
    advanced_fuzzy: number;
  };
  performance_metrics: {
    average_response_time: number;
    cache_hit_rate: number;
    success_rate: number;
  };
  popular_queries: Array<{
    query: string;
    count: number;
    success_rate: number;
  }>;
  search_trends: Array<{
    date: string;
    searches: number;
    fts5: number;
    fuzzy: number;
    advanced_fuzzy: number;
  }>;
  module_usage: {
    notes: number;
    todos: number;
    documents: number;
    projects: number;
    diary: number;
  };
  user_behavior: {
    average_session_searches: number;
    most_active_hour: number;
    search_depth: number;
  };
}

interface SearchResult {
  id: string;
  title: string;
  preview: string;
  module: string;
  score?: number;
  createdAt?: string;
  updatedAt?: string;
  tags: string[];
  metadata?: Record<string, any>;
}

interface CacheStats {
  cache_size: number;
  hit_rate: number;
  miss_rate: number;
  eviction_count: number;
  memory_usage: string;
  last_cleanup: string;
}

export function AdvancedSearchAnalytics() {
  const [analytics, setAnalytics] = useState<SearchAnalytics | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [recentSearches, setRecentSearches] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'fts5' | 'fuzzy' | 'advanced-fuzzy'>('fts5');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      // Load search analytics
      const analyticsResponse = await fetch('/api/v1/search/analytics');
      const analyticsData = await analyticsResponse.json();
      setAnalytics(analyticsData);

      // Load cache stats
      const cacheResponse = await fetch('/api/v1/analytics/cache-stats');
      const cacheData = await cacheResponse.json();
      setCacheStats(cacheData);

      // Load recent searches
      const recentResponse = await fetch('/api/v1/search/recent');
      const recentData = await recentResponse.json();
      const recentNormalized = Array.isArray(recentData)
        ? recentData.map((it: any) => ({
            id: it.id ?? it.uuid ?? '',
            title: it.title ?? it.name ?? 'Untitled',
            preview: it.preview ?? it.preview_text ?? '',
            module: it.module ?? it.module_type ?? it.type ?? 'notes',
            score: it.score ?? it.relevance ?? it.relevanceScore,
            createdAt: it.createdAt ?? it.created_at,
            updatedAt: it.updatedAt ?? it.updated_at,
            tags: it.tags ?? [],
            metadata: it.metadata ?? {},
          }))
        : [];
      setRecentSearches(recentNormalized);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load search analytics',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const performSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      // Use searchService methods for consistent data handling
      const searchMethod = searchType === 'fts5' 
        ? searchService.searchFTS
        : searchType === 'fuzzy'
        ? searchService.searchFuzzy
        : searchService.searchAdvancedFuzzy;

      const response = await searchMethod(searchQuery);
      setSearchResults(response.results || []);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Search failed',
        color: 'red'
      });
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const getModuleIcon = (module: string) => {
    switch (module) {
      case 'archive': return '🗄️';
      case 'archive-folder': return '🗂️';
      case 'folders': return '📂';
      case 'notes': return '📝';
      case 'todos': return '✅';
      case 'documents': return '📄';
      case 'projects': return '📁';
      case 'diary': return '📖';
      default: return '📋';
    }
  };

  const getModuleColor = (module: string) => {
    switch (module) {
      case 'archive': return 'teal';
      case 'archive-folder': return 'cyan';
      case 'folders': return 'indigo';
      case 'notes': return 'blue';
      case 'todos': return 'green';
      case 'documents': return 'orange';
      case 'projects': return 'purple';
      case 'diary': return 'pink';
      default: return 'gray';
    }
  };

  if (loading) {
    return (
      <Container size="xl" py="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={2}>🔍 Advanced Search Analytics</Title>
            <Button loading>Loading...</Button>
          </Group>
          <Alert color="blue" icon={<IconRefresh size={16} />}>
            Loading search analytics and performance metrics...
          </Alert>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2}>🔍 Advanced Search Analytics</Title>
          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={loadAnalytics}
            variant="light"
          >
            Refresh Analytics
          </Button>
        </Group>

        <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'overview')}>
          <Tabs.List>
            <Tabs.Tab value="overview" leftSection={<IconChartLine size={16} />}>
              Overview
            </Tabs.Tab>
            <Tabs.Tab value="performance" leftSection={<IconBolt size={16} />}>
              Performance
            </Tabs.Tab>
            <Tabs.Tab value="search" leftSection={<IconSearch size={16} />}>
              Search
            </Tabs.Tab>
            <Tabs.Tab value="cache" leftSection={<IconDatabase size={16} />}>
              Cache
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview" pt="md">
            <Stack gap="lg">
              {analytics && (
                <>
                  {/* Search Statistics */}
                  <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                    <Card withBorder>
                      <Group gap="xs" mb="sm">
                        <IconSearch size={20} color="blue" />
                        <Text fw={500}>Total Searches</Text>
                      </Group>
                      <Text size="xl" fw={700}>
                        {analytics.total_searches.toLocaleString()}
                      </Text>
                      <Text size="sm" c="dimmed">All time</Text>
                    </Card>

                    <Card withBorder>
                      <Group gap="xs" mb="sm">
                        <IconClock size={20} color="green" />
                        <Text fw={500}>Avg Response Time</Text>
                      </Group>
                      <Text size="xl" fw={700}>
                        {analytics.performance_metrics.average_response_time}ms
                      </Text>
                      <Text size="sm" c="dimmed">Lightning fast</Text>
                    </Card>

                    <Card withBorder>
                      <Group gap="xs" mb="sm">
                        <IconTarget size={20} color="purple" />
                        <Text fw={500}>Success Rate</Text>
                      </Group>
                      <Text size="xl" fw={700}>
                        {Math.round(analytics.performance_metrics.success_rate)}%
                      </Text>
                      <Text size="sm" c="dimmed">Reliable results</Text>
                    </Card>
                  </SimpleGrid>

                  {/* Search Type Distribution */}
                  <Card withBorder>
                    <Title order={3} mb="md">Search Type Distribution</Title>
                    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                      {Object.entries(analytics.searches_by_type).map(([type, count]) => (
                        <Paper key={type} p="md" withBorder>
                          <Group justify="space-between" mb="sm">
                            <Text fw={500} tt="uppercase">
                              {type.replace('_', ' ')}
                            </Text>
                            <Badge color="blue" variant="light">
                              {count}
                            </Badge>
                          </Group>
                          <Progress
                            value={(count / analytics.total_searches) * 100}
                            color="blue"
                            size="sm"
                          />
                          <Text size="xs" c="dimmed" mt="xs">
                            {Math.round((count / analytics.total_searches) * 100)}% of total searches
                          </Text>
                        </Paper>
                      ))}
                    </SimpleGrid>
                  </Card>

                  {/* Module Usage */}
                  <Card withBorder>
                    <Title order={3} mb="md">Search Usage by Module</Title>
                    <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                      {Object.entries(analytics.module_usage).map(([module, count]) => (
                        <Paper key={module} p="sm" withBorder>
                          <Group justify="space-between">
                            <Group gap="xs">
                              <Text size="lg">{getModuleIcon(module)}</Text>
                              <Text fw={500} tt="capitalize">{module}</Text>
                            </Group>
                            <Badge color={getModuleColor(module)} variant="light">
                              {count}
                            </Badge>
                          </Group>
                        </Paper>
                      ))}
                    </SimpleGrid>
                  </Card>

                  {/* Popular Queries */}
                  <Card withBorder>
                    <Title order={3} mb="md">Most Popular Search Queries</Title>
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Query</Table.Th>
                          <Table.Th>Searches</Table.Th>
                          <Table.Th>Success Rate</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {analytics.popular_queries.slice(0, 10).map((query, index) => (
                          <Table.Tr key={index}>
                            <Table.Td>
                              <Text fw={500}>{query.query}</Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge color="blue" variant="light">
                                {query.count}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              <Group gap="xs">
                                <Progress
                                  value={query.success_rate}
                                  color={query.success_rate >= 80 ? 'green' : query.success_rate >= 60 ? 'yellow' : 'red'}
                                  size="sm"
                                  style={{ flex: 1 }}
                                />
                                <Text size="sm">{Math.round(query.success_rate)}%</Text>
                              </Group>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Card>
                </>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="performance" pt="md">
            <Stack gap="lg">
              <Title order={3}>Search Performance Metrics</Title>
              
              {analytics && (
                <>
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <Card withBorder>
                      <Title order={4} mb="md">Response Time Analysis</Title>
                      <Stack gap="sm">
                        <Group justify="space-between">
                          <Text>Average Response Time</Text>
                          <Text fw={500}>{analytics.performance_metrics.average_response_time}ms</Text>
                        </Group>
                        <Group justify="space-between">
                          <Text>Cache Hit Rate</Text>
                          <Text fw={500}>{Math.round(analytics.performance_metrics.cache_hit_rate)}%</Text>
                        </Group>
                        <Group justify="space-between">
                          <Text>Success Rate</Text>
                          <Text fw={500}>{Math.round(analytics.performance_metrics.success_rate)}%</Text>
                        </Group>
                      </Stack>
                    </Card>

                    <Card withBorder>
                      <Title order={4} mb="md">User Behavior</Title>
                      <Stack gap="sm">
                        <Group justify="space-between">
                          <Text>Avg Session Searches</Text>
                          <Text fw={500}>{analytics.user_behavior.average_session_searches}</Text>
                        </Group>
                        <Group justify="space-between">
                          <Text>Most Active Hour</Text>
                          <Text fw={500}>{analytics.user_behavior.most_active_hour}:00</Text>
                        </Group>
                        <Group justify="space-between">
                          <Text>Search Depth</Text>
                          <Text fw={500}>{analytics.user_behavior.search_depth}</Text>
                        </Group>
                      </Stack>
                    </Card>
                  </SimpleGrid>

                  {analytics.search_trends.length > 0 && (
                    <Card withBorder>
                      <Title order={4} mb="md">Search Trends Over Time</Title>
                      <LineChart
                        h={300}
                        data={analytics.search_trends}
                        dataKey="date"
                        series={[
                          { name: 'searches', color: 'blue' },
                          { name: 'fts5', color: 'green' },
                          { name: 'fuzzy', color: 'orange' },
                          { name: 'advanced_fuzzy', color: 'purple' }
                        ]}
                      />
                    </Card>
                  )}
                </>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="search" pt="md">
            <Stack gap="lg">
              <Title order={3}>Live Search Testing</Title>
              
              <Card withBorder>
                <Stack gap="md">
                  <Group>
                    <TextInput
                      placeholder="Enter search query..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ flex: 1 }}
                      onKeyDown={(e) => e.key === 'Enter' && performSearch()}
                    />
                    <Select
                      value={searchType}
                      onChange={(value) =>
                        setSearchType((value as 'fts5' | 'fuzzy' | 'advanced-fuzzy') ?? 'fts5')
                      }
                      data={[
                        { value: 'fts5', label: 'FTS5 (Fast)' },
                        { value: 'fuzzy', label: 'Fuzzy (Typo-tolerant)' },
                        { value: 'advanced-fuzzy', label: 'Advanced Fuzzy (Deep)' }
                      ]}
                      style={{ width: 200 }}
                    />
                    <Button
                      onClick={performSearch}
                      loading={searching}
                      leftSection={<IconSearch size={16} />}
                    >
                      Search
                    </Button>
                  </Group>

                  {searchResults.length > 0 && (
                    <div>
                      <Text fw={500} mb="md">
                        Found {searchResults.length} results
                      </Text>
                      <Stack gap="sm">
                        {searchResults.map((result, index) => (
                          <Paper key={index} p="md" withBorder>
                            <Group justify="space-between" mb="sm">
                              <Group gap="xs">
                                <Text size="lg">{getModuleIcon(result.module)}</Text>
                                <Text fw={500}>{result.title}</Text>
                                <Badge color={getModuleColor(result.module)} variant="light">
                                  {result.module}
                                </Badge>
                              </Group>
                              <Group gap="xs">
                                <Badge color="blue" variant="light">
                                  {Math.round(((result.score ?? 0) > 1 ? (result.score ?? 0) : (result.score ?? 0) * 100))}% match
                                </Badge>
                                <ActionIcon variant="light" color="blue" size="sm">
                                  <IconEye size={14} />
                                </ActionIcon>
                              </Group>
                            </Group>
                            <Text size="sm" c="dimmed" lineClamp={2}>
                              {result.preview}
                            </Text>
                          </Paper>
                        ))}
                      </Stack>
                    </div>
                  )}
                </Stack>
              </Card>

              <Card withBorder>
                <Title order={4} mb="md">Recent Searches</Title>
                <Stack gap="sm">
                  {recentSearches.slice(0, 5).map((search, index) => (
                    <Paper key={index} p="sm" withBorder>
                      <Group justify="space-between">
                        <Group gap="xs">
                          <Text size="lg">{getModuleIcon(search.module)}</Text>
                          <div>
                            <Text fw={500}>{search.title}</Text>
                            <Text size="xs" c="dimmed">{search.module}</Text>
                          </div>
                        </Group>
                        <Badge color={getModuleColor(search.module)} variant="light">
                          {Math.round(((search.score ?? 0) > 1 ? (search.score ?? 0) : (search.score ?? 0) * 100))}%
                        </Badge>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </Card>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="cache" pt="md">
            <Stack gap="lg">
              <Title order={3}>Cache Performance</Title>
              
              {cacheStats && (
                <>
                  <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                    <Card withBorder>
                      <Title order={4} mb="md">Cache Statistics</Title>
                      <Stack gap="sm">
                        <Group justify="space-between">
                          <Text>Cache Size</Text>
                          <Text fw={500}>{cacheStats.cache_size} items</Text>
                        </Group>
                        <Group justify="space-between">
                          <Text>Hit Rate</Text>
                          <Text fw={500}>{Math.round(cacheStats.hit_rate)}%</Text>
                        </Group>
                        <Group justify="space-between">
                          <Text>Miss Rate</Text>
                          <Text fw={500}>{Math.round(cacheStats.miss_rate)}%</Text>
                        </Group>
                        <Group justify="space-between">
                          <Text>Evictions</Text>
                          <Text fw={500}>{cacheStats.eviction_count}</Text>
                        </Group>
                      </Stack>
                    </Card>

                    <Card withBorder>
                      <Title order={4} mb="md">Memory Usage</Title>
                      <Stack gap="sm">
                        <Group justify="space-between">
                          <Text>Memory Used</Text>
                          <Text fw={500}>{cacheStats.memory_usage}</Text>
                        </Group>
                        <Group justify="space-between">
                          <Text>Last Cleanup</Text>
                          <Text fw={500}>
                            {new Date(cacheStats.last_cleanup).toLocaleString()}
                          </Text>
                        </Group>
                        <RingProgress
                          size={120}
                          thickness={12}
                          sections={[
                            { value: cacheStats.hit_rate, color: 'green' },
                            { value: cacheStats.miss_rate, color: 'red' }
                          ]}
                          label={
                            <Text size="sm" fw={500} ta="center">
                              {Math.round(cacheStats.hit_rate)}%
                            </Text>
                          }
                        />
                      </Stack>
                    </Card>
                  </SimpleGrid>

                  <Alert color="blue" icon={<IconDatabase size={16} />}>
                    <Text fw={500} mb="xs">Smart Cache Management</Text>
                    <Text size="sm">
                      Our cache system automatically manages memory usage and eviction policies 
                      to ensure optimal performance. The high hit rate indicates efficient 
                      caching of frequently accessed data.
                    </Text>
                  </Alert>
                </>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
