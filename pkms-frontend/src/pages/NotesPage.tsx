import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  // Card,
  Title,
  Text,
  Group,
  Stack,
  Button,
  Badge,
  Alert,
  Pagination,
  Paper,
  // ThemeIcon,
  Tooltip
} from '@mantine/core';
import ViewMenu, { ViewMode } from '../components/common/ViewMenu';
import ViewModeLayouts, { formatDate } from '../components/common/ViewModeLayouts';
import { useViewPreferences } from '../hooks/useViewPreferences';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { ProjectBadges } from '../components/common/ProjectBadges';
import {
  IconPlus,
  IconFilter,
  IconSortAscending,
  IconSortDescending,
  IconArchive,
  // IconNotes,
  IconAlertTriangle,
  IconFileText,
  IconHistory
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { useNotesStore } from '../stores/notesStore';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { UnifiedSearchEmbedded } from '../components/search/UnifiedSearchEmbedded';
import { ActionMenu } from '../components/common/ActionMenu';
import { notesService } from '../services/notesService';

type SortField = 'title' | 'created_at' | 'updated_at';
type SortOrder = 'asc' | 'desc';

// Utility functions for notes
const getNoteIcon = (note: any): string => {
  if (note.is_archived) return '📦';
  if (note.tags?.includes('important')) return '⭐';
  if (note.tags?.includes('draft')) return '📝';
  if (note.tags?.includes('idea')) return '💡';
  return '📄';
};

const getWordCount = (content: string): number => {
  if (!content) return 0;
  return content.trim().split(/\s+/).filter(word => word.length > 0).length;
};

const truncateText = (text: string, maxLength: number): string => {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength) + '...';
};

export function NotesPage() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { highlightNoteId?: number } };
  
  // Local state
  const [searchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const { getPreference, updatePreference } = useViewPreferences();
  const [viewMode, setViewMode] = useState<ViewMode>(getPreference('notes'));
  const itemsPerPage = 20;

  // Store state (for filters/UI only)
  const {
    currentTag,
    showArchived,
    deleteNote,
    setTag,
    setShowArchived
  } = useNotesStore();

  // State for notes data
  const [notes, setNotes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load notes function
  const loadNotes = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const notesData = await notesService.listNotes({
        tag: currentTag || undefined,
        search: debouncedSearch || undefined,
        archived: showArchived,
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
      });
      setNotes(Array.isArray(notesData) ? notesData : []);
    } catch (err) {
      setError(err as Error);
      setNotes([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Load notes using consistent auth-aware pattern
  useAuthenticatedEffect(() => {
    loadNotes();
  }, [currentTag, debouncedSearch, showArchived, currentPage, itemsPerPage]);
  // notes is already guaranteed to be an array from loadNotes function

  // Sorted and paginated notes (sorting is still local, but you can move to backend if needed)
  const sortedNotes = useMemo(() => {
    const sorted = [...notes].sort((a, b) => {
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
  }, [notes, sortField, sortOrder]);

  const paginatedNotes = useMemo(() => {
    const start = 0;
    const end = itemsPerPage;
    return sortedNotes.slice(start, end);
  }, [sortedNotes, itemsPerPage]);

  const totalPages = Math.ceil(sortedNotes.length / itemsPerPage);

  // Keyboard shortcuts: search focus, toggle archived/favorites (sidebar controls), refresh
  useKeyboardShortcuts({
    shortcuts: [
      { key: '/', action: () => {
          const input = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement | null;
          input?.focus();
        }, description: 'Focus search', category: 'Navigation' },
      { key: 'r', action: () => loadNotes(), description: 'Refresh notes', category: 'General' },
    ],
    enabled: true,
    showNotifications: false,
  });

  // Highlight newly created note when redirected from editor
  const highlightedIdRef = useRef<number | null>(location.state?.highlightNoteId ?? null);
  useEffect(() => {
    if (!highlightedIdRef.current) return;
    const target = document.querySelector(`[data-note-id="${highlightedIdRef.current}"]`) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('newly-created-highlight');
      setTimeout(() => target.classList.remove('newly-created-highlight'), 1500);
    }
    highlightedIdRef.current = null;
  }, [paginatedNotes]);

  const handleDeleteNote = (uuid: string, title: string) => {
    modals.openConfirmModal({
      title: 'Delete Note',
      children: (
        <Text size="sm">Are you sure you want to delete "{title}"? This action cannot be undone.</Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const success = await deleteNote(uuid);
        if (success) {
          loadNotes(); // Reload notes after deletion
          notifications.show({
            title: 'Note Deleted',
            message: 'The note was deleted successfully',
            color: 'green'
          });
        } else {
          notifications.show({
            title: 'Delete Failed',
            message: 'Could not delete the note. Please try again.',
            color: 'red'
          });
        }
      }
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
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

            {/* Unified Search */}
            <UnifiedSearchEmbedded
              initialQuery={searchQuery}
              defaultModules={['notes']}
              includeDiary={false}
              showModuleSelector={false}
              showSearchTypeToggle={false}
              onResultClick={(result) => {
                // Navigate to note or show in modal
                notifications.show({
                  title: 'Note Found',
                  message: `Found note: ${result.title}`,
                  color: 'blue'
                });
              }}
              emptyMessage="No notes found. Try different search terms."
              resultsPerPage={10}
              showPagination={false}
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
                <ViewMenu 
                  currentView={viewMode}
                  onChange={(mode) => {
                    setViewMode(mode);
                    updatePreference('notes', mode);
                  }}
                  disabled={isLoading}
                />
                
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
                onClose={() => setError(null)}
              >
                {error instanceof Error ? error.message : String(error)}
              </Alert>
            )}

            {/* Notes View */}
            <ViewModeLayouts
              items={paginatedNotes}
              viewMode={viewMode}
              isLoading={isLoading}
              emptyMessage={
                searchQuery || currentTag 
                  ? 'No notes found. Try adjusting your search or filters.'
                  : 'No notes yet. Create your first note to get started.'
              }
              onItemClick={(note) => {
                sessionStorage.setItem('notesScrollY', String(window.scrollY));
                navigate(`/notes/${note.uuid}`);
              }}
              renderSmallIcon={(note) => (
                <Stack gap={2} align="center">
                  <Text size="lg">{getNoteIcon(note)}</Text>
                  {note.is_archived && (
                    <Badge size="xs" color="gray" variant="dot">A</Badge>
                  )}
                </Stack>
              )}
              renderMediumIcon={(note) => (
                <Stack gap="xs" align="center" style={{ position: 'relative', width: '100%' }}>
                  <Group justify="flex-end" w="100%" gap={4} style={{ position: 'absolute', top: 0, right: 0, padding: 4 }}>
                    <ActionMenu
                      onToggleFavorite={async () => {
                        try {
                          await useNotesStore.getState().updateNote(note.uuid, { isFavorite: !note.isFavorite });
                          notifications.show({ title: note.isFavorite ? 'Removed from Favorites' : 'Added to Favorites', message: '', color: 'pink' });
                        } catch {
                          notifications.show({ title: 'Action Failed', message: 'Could not update favorite', color: 'red' });
                        }
                      }}
                      onArchive={note.is_archived ? undefined : async () => {
                        try {
                          await notesService.updateNote(note.uuid, { is_archived: true });
                          loadNotes();
                          notifications.show({ title: 'Note Archived', message: '', color: 'green' });
                        } catch {
                          notifications.show({ title: 'Action Failed', message: 'Could not archive', color: 'red' });
                        }
                      }}
                      onUnarchive={note.is_archived ? async () => {
                        try {
                          await notesService.updateNote(note.uuid, { is_archived: false });
                          loadNotes();
                          notifications.show({ title: 'Note Unarchived', message: '', color: 'green' });
                        } catch {
                          notifications.show({ title: 'Action Failed', message: 'Could not unarchive', color: 'red' });
                        }
                      } : undefined}
                      onEdit={() => {
                        sessionStorage.setItem('notesScrollY', String(window.scrollY));
                        navigate(`/notes/${note.uuid}`);
                      }}
                      onDelete={() => handleDeleteNote(note.uuid, note.title)}
                      isFavorite={note.isFavorite}
                      isArchived={note.is_archived}
                      variant="subtle"
                      color="gray"
                      size={14}
                    />
                  </Group>
                  <Text size="xl">{getNoteIcon(note)}</Text>
                  <Group gap={4}>
                    <Badge size="xs" variant="light" color="blue">
                      {getWordCount(note.preview)} words
                    </Badge>
                    {note.is_archived && (
                      <Badge size="xs" color="gray" variant="light">
                        Archived
                      </Badge>
                    )}
                  </Group>
                </Stack>
              )}
              renderListItem={(note) => (
                <Group justify="space-between">
                  <Group gap="md">
                    <Text size="lg">{getNoteIcon(note)}</Text>
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Text 
                          fw={600} 
                          size="sm" 
                          style={{ cursor: 'pointer', color: '#228be6' }}
                          onClick={() => {
                            sessionStorage.setItem('notesScrollY', String(window.scrollY));
                            navigate(`/notes/${note.uuid}`);
                          }}
                        >
                          {note.title}
                        </Text>
                        {note.is_archived && (
                          <Badge size="xs" color="gray" variant="light">
                            Archived
                          </Badge>
                        )}
                        {note.isFavorite && (
                          <Badge size="xs" color="pink" variant="light">
                            Favorite
                          </Badge>
                        )}
                      </Group>
                      <Group gap="xs">
                        <Badge size="xs" variant="light" color="blue">
                          {getWordCount(note.preview)} words
                        </Badge>
                        {note.file_count > 0 && (
                          <Badge size="xs" variant="light" color="teal">
                            {note.file_count} files
                          </Badge>
                        )}
                        <Text size="xs" c="dimmed">
                          {formatDate(note.updated_at)}
                        </Text>
                        <ProjectBadges projects={note.projects || []} size="xs" maxVisible={2} />
                        {(note.tags || []).slice(0, 2).map((tag: string) => (
                          <Badge 
                            key={tag} 
                            size="xs" 
                            variant="dot" 
                            style={{ cursor: 'pointer' }} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setTag(tag);
                            }}
                          >
                            {tag}
                          </Badge>
                        ))}
                      </Group>
                      
                      {/* NEW: Note Type and Versioning */}
                      <Group gap="xs">
                        {note.note_type && note.note_type !== 'general' && (
                          <Tooltip label={`Note type: ${note.note_type}`}>
                            <Badge size="xs" variant="outline" color="blue">
                              <IconFileText size={10} style={{ marginRight: 4 }} />
                              {note.note_type}
                            </Badge>
                          </Tooltip>
                        )}
                        {note.version && note.version > 1 && (
                          <Tooltip label={`Version ${note.version}`}>
                            <Badge size="xs" variant="outline" color="gray">
                              <IconHistory size={10} style={{ marginRight: 4 }} />
                              v{note.version}
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>

                {/* NEW: Tag Count */}
                <Group gap="xs">
                  {(note.tags?.length || 0) > 2 && (
                    <Badge size="xs" variant="outline">+{(note.tags?.length || 0) - 2}</Badge>
                  )}
                </Group>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {truncateText(note.preview, 100)}
                      </Text>
                    </Stack>
                  </Group>
                  <ActionMenu
                    onToggleFavorite={async () => {
                      try {
                        await useNotesStore.getState().updateNote(note.uuid, { isFavorite: !note.isFavorite });
                        notifications.show({ 
                          title: note.isFavorite ? 'Removed from Favorites' : 'Added to Favorites', 
                          message: '', 
                          color: 'pink' 
                        });
                      } catch (err) {
                        notifications.show({ title: 'Action Failed', message: 'Could not update favorite', color: 'red' });
                      }
                    }}
                    onArchive={note.is_archived ? undefined : async () => {
                      try {
                        await notesService.updateNote(note.uuid, { is_archived: true });
                        loadNotes();
                        notifications.show({
                          title: 'Note Archived',
                          message: `"${note.title}" has been archived`,
                          color: 'green'
                        });
                      } catch (err) {
                        notifications.show({ title: 'Action Failed', message: 'Could not archive', color: 'red' });
                      }
                    }}
                    onUnarchive={note.is_archived ? async () => {
                      try {
                        await notesService.updateNote(note.uuid, { is_archived: false });
                        loadNotes();
                        notifications.show({
                          title: 'Note Unarchived',
                          message: `"${note.title}" has been unarchived`,
                          color: 'green'
                        });
                      } catch (err) {
                        notifications.show({ title: 'Action Failed', message: 'Could not unarchive', color: 'red' });
                      }
                    } : undefined}
                    onEdit={() => navigate(`/notes/${note.uuid}`)}
                    onDelete={() => handleDeleteNote(note.uuid, note.title)}
                    isFavorite={note.isFavorite}
                    isArchived={note.is_archived}
                    variant="subtle"
                    color="gray"
                    size={16}
                  />
                </Group>
              )}
              renderDetailColumns={(note) => [
                <Group key="title" gap="xs">
                  <Text size="sm">{getNoteIcon(note)}</Text>
                  <Stack gap={2}>
                    <Text 
                      fw={500} 
                      size="sm" 
                      style={{ cursor: 'pointer', color: '#228be6' }}
                      onClick={() => {
                        sessionStorage.setItem('notesScrollY', String(window.scrollY));
                        navigate(`/notes/${note.uuid}`);
                      }}
                    >
                      {note.title}
                    </Text>
                    <Group gap={6}>
                      {note.isFavorite && (
                        <Badge size="xs" color="pink" variant="light">Favorite</Badge>
                      )}
                      {note.file_count > 0 && (
                        <Badge size="xs" variant="light" color="teal">{note.file_count} files</Badge>
                      )}
                    </Group>
                  </Stack>
                </Group>,
                <Text key="preview" size="xs" c="dimmed" lineClamp={2}>
                  {truncateText(note.preview, 150)}
                </Text>,
                <Group key="wordcount" gap="xs">
                  <Badge size="xs" variant="light" color="blue">
                    {getWordCount(note.preview)} words
                  </Badge>
                </Group>,
                <Group key="tags" gap={4}>
                  <ProjectBadges projects={note.projects || []} size="xs" maxVisible={3} />
                  {(note.tags || []).slice(0, 3).map((tag: string) => (
                    <Badge 
                      key={tag} 
                      size="xs" 
                      variant="dot" 
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
                    <Tooltip label={`${(note.tags?.length || 0) - 3} more tags`}>
                      <Badge size="xs" variant="outline">+{(note.tags?.length || 0) - 3}</Badge>
                    </Tooltip>
                  )}
                </Group>,
                <Text key="created" size="xs" c="dimmed">
                  {formatDate(note.created_at)}
                </Text>,
                <Text key="updated" size="xs" c="dimmed">
                  {formatDate(note.updated_at)}
                </Text>,
                <Group key="status" gap="xs">
                  {note.is_archived && (
                    <Badge size="xs" color="gray" variant="light">
                      Archived
                    </Badge>
                  )}
                </Group>,
                <ActionMenu
                  key="actions"
                  onToggleFavorite={async () => {
                    try {
                      await useNotesStore.getState().updateNote(note.uuid, { isFavorite: !note.isFavorite });
                      loadNotes();
                      notifications.show({ title: note.isFavorite ? 'Removed from Favorites' : 'Added to Favorites', message: '', color: 'pink' });
                    } catch {}
                  }}
                  onArchive={note.is_archived ? undefined : async () => {
                    try {
                      await notesService.updateNote(note.uuid, { is_archived: true });
                      loadNotes();
                    } catch {}
                  }}
                  onUnarchive={note.is_archived ? async () => {
                    try {
                      await notesService.updateNote(note.uuid, { is_archived: false });
                      loadNotes();
                    } catch {}
                  } : undefined}
                  onEdit={() => navigate(`/notes/${note.uuid}`)}
                  onDelete={() => handleDeleteNote(note.uuid, note.title)}
                  isFavorite={note.isFavorite}
                  isArchived={note.is_archived}
                  variant="subtle"
                  color="gray"
                  size={14}
                />
              ]}
              detailHeaders={[
                'Title', 
                'Preview', 
                'Word Count', 
                'Tags', 
                'Created', 
                'Updated', 
                'Status', 
                'Actions'
              ]}
            />

            {/* Pagination */}
            {!isLoading && paginatedNotes.length > 0 && totalPages > 1 && (
              <Group justify="center">
                <Pagination
                  value={currentPage}
                  onChange={setCurrentPage}
                  total={totalPages}
                  size="sm"
                />
              </Group>
            )}

            {/* Empty State Actions */}
            {!isLoading && paginatedNotes.length === 0 && (
              <Group justify="center" mt="md">
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => navigate('/notes/new')}
                >
                  Create Note
                </Button>
              </Group>
            )}
          </Stack>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
