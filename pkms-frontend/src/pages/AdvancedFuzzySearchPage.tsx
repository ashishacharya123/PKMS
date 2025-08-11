import { useState, useMemo } from 'react';
import {
  Container,
  Title,
  TextInput,
  Button,
  Stack,
  Group,
  Card,
  Badge,
  Loader,
  Alert,
  Text,
  Paper,
  Divider,
  Checkbox,
  Select,
  Menu,
  ActionIcon,
} from '@mantine/core';
import { IconSearch, IconAlertTriangle, IconFilter, IconSortAscending, IconSortDescending } from '@tabler/icons-react';

interface FuzzyResult {
  type: string;
  title: string;
  tags: string[];
  description?: string | null;
  module: string;
  created_at: string;
  media_count?: number | null;
  type_info: string;
  score: number;
}

const MODULE_OPTIONS = [
  { label: 'Todos', value: 'todos' },
  { label: 'Notes', value: 'notes' },
  { label: 'Documents', value: 'documents' },
  { label: 'Archive', value: 'archive' },
  { label: 'Folders', value: 'folders' },
];

const SORT_OPTIONS = [
  { label: 'Relevance', value: 'score' },
  { label: 'Title', value: 'title' },
  { label: 'Created Date', value: 'created_at' },
];

export default function AdvancedFuzzySearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FuzzyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState<string[]>(MODULE_OPTIONS.map(m => m.value));
  const [selectAll, setSelectAll] = useState(true);
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      // Use the enhanced search endpoint with proper API service
      const { searchService } = await import('../services/searchService');
      
      const searchResults = await searchService.fuzzySearch({
        q: query.trim(),
        modules: modules,
        sort_by: sortBy === 'score' ? 'relevance' : sortBy,
        sort_order: sortOrder,
        limit: 100
      });
      
      // Transform results to match expected format
      const transformedResults = searchResults.results.map((result: any) => ({
        type: result.type,
        title: result.title,
        tags: result.tags || [],
        description: result.preview || result.description,
        module: result.module,
        created_at: result.created_at,
        media_count: result.media_count || null,
        type_info: result.module,
        score: result.relevance_score || result.combined_score || 0
      }));
      
      setResults(transformedResults);
    } catch (e: any) {
      setError(e.message || 'Search failed');
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setModules(MODULE_OPTIONS.map(m => m.value));
    } else {
      setModules([]);
    }
  };

  // UI filter for module column
  const filteredResults = useMemo(() => {
    let filtered = results;
    if (moduleFilter) {
      filtered = filtered.filter(r => r.module === moduleFilter);
    }
    // Sorting
    filtered = [...filtered].sort((a, b) => {
      let aVal: any = a[sortBy as keyof FuzzyResult];
      let bVal: any = b[sortBy as keyof FuzzyResult];
      if (sortBy === 'title') {
        aVal = (aVal || '').toLowerCase();
        bVal = (bVal || '').toLowerCase();
      }
      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });
    return filtered;
  }, [results, moduleFilter, sortBy, sortOrder]);

  return (
    <Container size="lg" py="md">
      <Title order={2} mb="md">Advanced Fuzzy Search</Title>
      <Paper p="md" mb="md" withBorder>
        <Stack>
          <Group align="flex-end">
            <TextInput
              label="Search across selected modules"
              placeholder="Type to search..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              leftSection={<IconSearch size={16} />}
              style={{ flex: 1 }}
            />
            <Button onClick={handleSearch} loading={loading} leftSection={<IconSearch size={16} />}>Search</Button>
          </Group>
          <Checkbox
            label="Select All Modules"
            checked={selectAll}
            onChange={e => handleSelectAll(e.currentTarget.checked)}
            mb={4}
          />
          <Checkbox.Group
            label="Modules to search in (affects backend only):"
            value={modules}
            onChange={vals => {
              setModules(vals);
              setSelectAll(vals.length === MODULE_OPTIONS.length);
            }}
            mb="xs"
          >
            <Group gap="md">
              {MODULE_OPTIONS.map(opt => (
                <Checkbox key={opt.value} value={opt.value} label={opt.label} />
              ))}
            </Group>
          </Checkbox.Group>
        </Stack>
      </Paper>
      {error && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />} mb="md">{error}</Alert>
      )}
      {loading && <Loader my="md" />}
      {!loading && filteredResults.length > 0 && (
        <Stack>
          <Group mb="xs" justify="space-between">
            {/* Module filter cone */}
            <Menu shadow="md" width={180}>
              <Menu.Target>
                <ActionIcon variant="light" color="gray">
                  <IconFilter size={18} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Filter by Module</Menu.Label>
                <Menu.Item onClick={() => setModuleFilter(null)}>
                  All Modules
                </Menu.Item>
                {MODULE_OPTIONS.map(opt => (
                  <Menu.Item key={opt.value} onClick={() => setModuleFilter(opt.value)}>
                    {opt.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            {/* Sort dropdown */}
            <Group>
              <Select
                data={SORT_OPTIONS}
                value={sortBy}
                onChange={val => setSortBy(val || 'score')}
                size="xs"
                style={{ minWidth: 120 }}
              />
              <ActionIcon
                variant="light"
                color="gray"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortOrder === 'asc' ? <IconSortAscending size={18} /> : <IconSortDescending size={18} />}
              </ActionIcon>
            </Group>
          </Group>
          {filteredResults.map((res, idx) => (
            <Card key={idx} withBorder mb="sm">
              <Group justify="space-between">
                <Group>
                  <Badge color="gray" variant="light">{res.module}</Badge>
                  <Text fw={500}>{res.title}</Text>
                  {res.tags && res.tags.length > 0 && (
                    <Group gap="xs">
                      {res.tags.map(tag => (
                        <Badge key={tag} color="blue" variant="outline">{tag}</Badge>
                      ))}
                    </Group>
                  )}
                </Group>
                <Text size="xs" c="dimmed">Score: {res.score}</Text>
              </Group>
              {res.description && (
                <Text size="sm" mt="xs">{res.description}</Text>
              )}
              <Divider my="xs" />
              <Group gap="md">
                <Text size="xs" c="dimmed">Type Info: {res.type_info}</Text>
                <Text size="xs" c="dimmed">Created: {new Date(res.created_at).toLocaleString()}</Text>
                {typeof res.media_count === 'number' && (
                  <Text size="xs" c="dimmed">Media: {res.media_count}</Text>
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      )}
      {!loading && filteredResults.length === 0 && query && !error && (
        <Text c="dimmed" mt="md">No results found.</Text>
      )}
    </Container>
  );
} 