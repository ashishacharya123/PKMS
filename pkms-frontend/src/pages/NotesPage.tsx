import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  Card,
  Title,
  Text,
  Group,
  Stack,
  Button,
  TextInput,
  Badge,
  ActionIcon,
  Menu,
  Skeleton,
  Alert,
  Pagination,
  Paper,
  ThemeIcon
} from '@mantine/core';
import {
  IconPlus,
  IconSearch,
  IconFilter,
  IconSortAscending,
  IconSortDescending,
  IconArchive,
  IconArchiveOff,
  IconEdit,
  IconTrash,
  IconDots,
  IconNotes,
  IconAlertTriangle
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useNotesStore } from '../stores/notesStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notesService } from '../services/notesService';

type SortField = 'title' | 'created_at' | 'updated_at';
type SortOrder = 'asc' | 'desc';

export function NotesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Store state (for filters/UI only)
  const {
    currentTag,
    showArchived,
    deleteNote,
    setTag,
    setShowArchived,
    clearError
  } = useNotesStore();

  // React Query for notes fetching
  const {
    data: notes,
    isLoading,
    error
  } = useQuery({
    queryKey: ['notes', { tag: currentTag, search: debouncedSearch, archived: showArchived, page: currentPage }],
    queryFn: () => notesService.listNotes({
      tag: currentTag || undefined,
      search: debouncedSearch || undefined,
      archived: showArchived,
      limit: itemsPerPage,
      offset: (currentPage - 1) * itemsPerPage,
    }),
    staleTime: 5 * 60 * 1000,
  });
  const safeNotes = Array.isArray(notes) ? notes : [];

  // Sorted and paginated notes (sorting is still local, but you can move to backend if needed)
  const sortedNotes = useMemo(() => {
    const sorted = [...safeNotes].sort((a, b) => {
      let aValue: string | number = a[sortField];
      let bValue: string | number = b[sortField];
      if (sortField.includes('_at')) {
        aValue = new Date(aValue as string).getTime();
        bValue = new Date(bValue as string).getTime();
      }
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = (bValue as string).toLowerCase();
      }
      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
    return sorted;
  }, [safeNotes, sortField, sortOrder]);

  const paginatedNotes = useMemo(() => {
    const start = 0;
    const end = itemsPerPage;
    return sortedNotes.slice(start, end);
  }, [sortedNotes, itemsPerPage]);

  const totalPages = Math.ceil(sortedNotes.length / itemsPerPage);

  const handleDeleteNote = async (id: number, title: string) => {
    if (window.confirm(`Are you sure you want to delete "${title}"?`)) {
      const success = await deleteNote(id);
      if (success) {
        // Invalidate React Query cache to refresh the notes list
        queryClient.invalidateQueries({ queryKey: ['notes'] });
      }
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <Container size="xl">
      <Grid>
        {/* Sidebar */}
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Stack gap="md">
            {/* Create Note Button */}
            <Button
              leftSection={<IconPlus size={16} />}
              size="md"
              onClick={() => navigate('/notes/new')}
              fullWidth
            >
              New Note
            </Button>

            {/* Search */}
            <TextInput
              placeholder="Search notes..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
            />

            {/* Filters */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Filters</Text>
                <IconFilter size={16} />
              </Group>
              
              <Stack gap="xs">
                <Button
                  variant={showArchived ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={<IconArchive size={14} />}
                  onClick={() => setShowArchived(!showArchived)}
                  fullWidth
                >
                  {showArchived ? 'Hide Archived' : 'Show Archived'}
                </Button>
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>

        {/* Main Content */}
        <Grid.Col span={{ base: 12, md: 9 }}>
          <Stack gap="md">
            {/* Header */}
            <Group justify="space-between" align="center">
              <div>
                <Title order={2}>Notes</Title>
                <Text c="dimmed">
                  {sortedNotes.length} {sortedNotes.length === 1 ? 'note' : 'notes'}
                </Text>
              </div>
              
              <Group gap="xs">
                <Button
                  variant={sortField === 'title' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'title' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('title')}
                >
                  Title
                </Button>
                <Button
                  variant={sortField === 'updated_at' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'updated_at' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('updated_at')}
                >
                  Updated
                </Button>
              </Group>
            </Group>

            {/* Error Alert */}
            {error && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                title="Error"
                color="red"
                variant="light"
                withCloseButton
                onClose={clearError}
              >
                {error instanceof Error ? error.message : String(error)}
              </Alert>
            )}

            {/* Loading State */}
            {isLoading && (
              <Stack gap="md">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} height={120} radius="md" />
                ))}
              </Stack>
            )}

            {/* Notes Grid */}
            {!isLoading && paginatedNotes.length > 0 && (
              <>
                <Grid>
                  {paginatedNotes.map((note) => (
                    <Grid.Col span={{ base: 12, sm: 6, lg: 4 }} key={note.id}>
                      <Card 
                        shadow="sm" 
                        padding="md" 
                        radius="md" 
                        withBorder
                        style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                        onClick={() => navigate(`/notes/${note.id}`)}
                      >
                        <Group justify="space-between" align="flex-start" mb="xs">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text fw={600} size="lg" truncate>{note.title}</Text>
                            <Group gap="xs" mt="xs">
                              {note.is_archived && (
                                <Badge variant="light" color="gray" size="sm">
                                  Archived
                                </Badge>
                              )}
                            </Group>
                          </div>
                          
                          <Menu withinPortal position="bottom-end">
                            <Menu.Target>
                              <ActionIcon 
                                variant="subtle" 
                                color="gray"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            
                            <Menu.Dropdown>
                              <Menu.Item 
                                leftSection={<IconEdit size={14} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/notes/${note.id}/edit`);
                                }}
                              >
                                Edit
                              </Menu.Item>
                              <Menu.Item 
                                leftSection={note.is_archived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // toggleArchive(note.id, !note.is_archived);
                                }}
                              >
                                {note.is_archived ? 'Unarchive' : 'Archive'}
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Item 
                                leftSection={<IconTrash size={14} />}
                                color="red"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteNote(note.id, note.title);
                                }}
                              >
                                Delete
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                        
                        <Text size="sm" c="dimmed" lineClamp={3}>
                          {note.preview}
                        </Text>
                        
                        <Group justify="space-between" mt="md">
                          <Group gap="xs">
                            {(note.tags || []).slice(0, 3).map((tag: string) => (
                              <Badge 
                                key={tag} 
                                variant="dot" 
                                size="sm"
                                style={{ cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTag(tag);
                                }}
                              >
                                {tag}
                              </Badge>
                            ))}
                            {(note.tags?.length || 0) > 3 && (
                              <Badge variant="dot" size="sm" color="gray">
                                +{(note.tags?.length || 0) - 3}
                              </Badge>
                            )}
                          </Group>
                          
                          <Text size="xs" c="dimmed">
                            {formatDate(note.updated_at)}
                          </Text>
                        </Group>
                      </Card>
                    </Grid.Col>
                  ))}
                </Grid>

                {/* Pagination */}
                {totalPages > 1 && (
                  <Group justify="center">
                    <Pagination
                      value={currentPage}
                      onChange={setCurrentPage}
                      total={totalPages}
                      size="sm"
                    />
                  </Group>
                )}
              </>
            )}

            {/* Empty State */}
            {!isLoading && paginatedNotes.length === 0 && (
              <Paper p="xl" radius="md" style={{ textAlign: 'center' }}>
                <ThemeIcon size="xl" variant="light" color="gray" mx="auto" mb="md">
                  <IconNotes size={32} />
                </ThemeIcon>
                <Title order={3} mb="xs">
                  {searchQuery || currentTag ? 'No notes found' : 'No notes yet'}
                </Title>
                <Text c="dimmed" mb="lg">
                  {searchQuery || currentTag 
                    ? 'Try adjusting your search or filters'
                    : 'Create your first note to get started'
                  }
                </Text>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => navigate('/notes/new')}
                >
                  Create Note
                </Button>
              </Paper>
            )}
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
} 