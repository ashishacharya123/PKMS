import { useEffect, useState, useMemo } from 'react';
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
  Alert,
  Paper,
  ThemeIcon,
  Modal,
  Textarea,
  Rating,
  Select,
  Center,
  Pagination,
  Tooltip,
  PasswordInput,
  Loader,
  TagsInput,
  Checkbox,
  NumberInput,
  Divider,
} from '@mantine/core';
import { Calendar } from '@mantine/dates';
import {
  IconBook,
  IconPlus,
  IconEdit,
  IconTrash,
  IconDots,
  IconAlertTriangle,
  IconLock,
  IconLockOpen,
  IconSortAscending,
  IconSortDescending,
  IconEye,
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useDiaryStore } from '../stores/diaryStore';
import { useAuthStore } from '../stores/authStore';
import { diaryService } from '../services/diaryService';
import { format, parseISO } from 'date-fns';
import { notifications } from '@mantine/notifications';
import { MoodStatsWidget } from '../components/diary/MoodStatsWidget';
import { WellnessBadges } from '../components/diary/WellnessBadges';
import EncryptionStatus from '../components/diary/EncryptionStatus';

import { useForm } from '@mantine/form';
import { DiaryEntrySummary, DiaryFormValues, DiaryMetadata, SortField, SortOrder, DiaryEntryCreatePayload } from '../types/diary';
import { useDateTime } from '../hooks/useDateTime';
import { formatDate, formatDateTime, convertToNepaliDate } from '../utils/diary';

const initialMetadata: DiaryMetadata = {
  // Legacy fields
  sleep_hours: 0,
  exercise_minutes: 0,
  phone_hours: 0,
  activity_level: 0,
  
  // New wellness tracking fields
  did_exercise: false,
  did_meditation: false,
  sleep_duration: 8,
  screen_time: 0,
  water_intake: 8,
  time_outside: 0,
  social_interaction: false,
  gratitude_practice: false,
  reading_time: 0,
  energy_level: 3,
  stress_level: 3,
  
  custom_fields: {}
};

const initialFormValues: DiaryFormValues = {
  id: null,
  date: new Date(),
  title: '',
  content: '',
  mood: 3,
  metadata: initialMetadata,
  tags: []
};

export function DiaryPage() {
  const store = useDiaryStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [deleteConfirmModalOpen, setDeleteConfirmModalOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [showPasswordHint, setShowPasswordHint] = useState(false);

  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const itemsPerPage = 12;

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const form = useForm<DiaryFormValues>({
    initialValues: initialFormValues,
    validate: {
      title: (value) => (value.trim().length > 0 ? null : 'Title is required'),
      content: (value) => (value.trim().length > 0 ? null : 'Content cannot be empty'),
    },
  });

  // Use debounced search directly from store
  const [debouncedTitleSearch] = useDebouncedValue(store.searchQuery, 500);

  const { isAuthenticated } = useAuthStore();

  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize store on mount
  useEffect(() => {
    if (isAuthenticated && !hasInitialized) {
      store.init().then(() => setHasInitialized(true));
    }
  }, [isAuthenticated, hasInitialized]);

  // Load entries when authenticated or search query changes
  useEffect(() => {
    if (isAuthenticated) {
      store.loadEntries();
    }
  }, [isAuthenticated, debouncedTitleSearch]);

  const [hasLoadedMoodStats, setHasLoadedMoodStats] = useState(false);

  // Load calendar data when year/month changes and diary is unlocked
  useEffect(() => {
    if (isAuthenticated && store.isUnlocked) {
      store.loadCalendarData(store.currentYear, store.currentMonth);
    }
  }, [isAuthenticated, store.currentYear, store.currentMonth, store.isUnlocked]);

  // Load mood stats when diary is unlocked and moodStats has not been loaded yet
  useEffect(() => {
    if (isAuthenticated && store.isUnlocked && !store.moodStats) {
      store.loadMoodStats();
    }
  }, [isAuthenticated, store.isUnlocked]);

  // Show unlock modal if encryption is setup but not unlocked, and after initial load
  useEffect(() => {
    if (hasInitialized && store.isEncryptionSetup && !store.isUnlocked) {
      setUnlockModalOpen(true);
    } else {
      setUnlockModalOpen(false);
    }
  }, [hasInitialized, store.isEncryptionSetup, store.isUnlocked]);

  const sortedEntries = useMemo(() => {
    return [...store.entries].sort((a, b) => {
      let aVal: any;
      let bVal: any;
      
      // Handle special cases
      switch (sortField) {
        case 'date':
          aVal = new Date(a.date).getTime();
          bVal = new Date(b.date).getTime();
          break;
        case 'created_at':
          aVal = new Date(a.created_at).getTime();
          bVal = new Date(b.created_at).getTime();
          break;
        case 'mood':
          aVal = a.mood;
          bVal = b.mood;
          break;
        default:
          return 0;
      }

      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : 1;
      }
      return aVal > bVal ? -1 : 1;
    });
  }, [store.entries, sortField, sortOrder]);

  const paginatedEntries = sortedEntries.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil(sortedEntries.length / itemsPerPage);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleUnlockSession = async () => {
    if (!encryptionPassword) return;
    
    const success = await store.unlockSession(encryptionPassword);
    if (success) {
      setUnlockModalOpen(false);
      setEncryptionPassword('');
      setShowPasswordHint(false);
      notifications.show({
        title: 'Success',
        message: 'Diary unlocked successfully',
        color: 'green',
      });
    }
  };

  const loadPasswordHint = async () => {
    try {
      const hint = await diaryService.getPasswordHint();
      setPasswordHint(hint);
    } catch (error) {
      console.error('Failed to load password hint:', error);
    }
  };

  const handleViewEntry = async (entry: DiaryEntrySummary) => {
    if (!store.encryptionKey) {
      setUnlockModalOpen(true);
      return;
    }
    
    try {
      const decryptedContent = await diaryService.decryptContent(
        entry.encrypted_blob,
        entry.encryption_iv,
        entry.encryption_tag,
        store.encryptionKey
      );
      
      form.setValues({
        id: entry.id,
        date: parseISO(entry.date),
        title: entry.title || '',
        content: decryptedContent,
        mood: entry.mood || 3,
        metadata: {
          ...initialMetadata,
          ...entry.metadata
        },
        tags: entry.tags || []
      });
      
      setViewMode('view');
      setModalOpen(true);
    } catch (error) {
      console.error('Failed to decrypt entry:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to decrypt diary entry',
        color: 'red',
      });
    }
  };

  const handleEditEntry = (entry: DiaryEntrySummary) => {
    handleViewEntry(entry);
    setViewMode('edit');
  };

  const handleDelete = (uuid: string) => {
    setEntryToDelete(uuid);
    setDeleteConfirmModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!entryToDelete) return;

    try {
      await store.deleteEntry(entryToDelete);
      notifications.show({
        title: 'Success',
        message: 'Diary entry deleted',
        color: 'green',
      });
    } catch (error) {
      console.error('Failed to delete entry:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete diary entry',
        color: 'red',
      });
    } finally {
      setDeleteConfirmModalOpen(false);
      setEntryToDelete(null);
    }
  };

  const handleCreateOrUpdateEntry = async (values: DiaryFormValues) => {
    if (!store.encryptionKey) return;
    
    try {
      const { encrypted_blob, iv, tag } = await diaryService.encryptContent(
        values.content,
        store.encryptionKey
      );
      
      const payload: DiaryEntryCreatePayload = {
        date: format(values.date, 'yyyy-MM-dd'),
        nepali_date: convertToNepaliDate(values.date),
        title: values.title,
        encrypted_blob,
        encryption_iv: iv,
        encryption_tag: tag,
        mood: values.mood,
        metadata: values.metadata,
        tags: values.tags
      };
      
      if (values.uuid) {
        await store.updateEntry(values.uuid, payload);
      } else {
        await store.createEntry(payload);
      }
      
      setModalOpen(false);
      form.reset();

      // Refresh data
      store.loadEntries();
      store.loadCalendarData(store.currentYear, store.currentMonth);
      notifications.show({
        title: 'Success',
        message: values.uuid ? 'Diary entry updated' : 'Diary entry created',
        color: 'green',
      });
    } catch (error) {
      console.error('Failed to save entry:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to save diary entry',
        color: 'red',
      });
    }
  };

  const getMoodLabel = (mood: number) => {
    const labels: { [key: number]: string } = { 1: 'Very Low', 2: 'Low', 3: 'Neutral', 4: 'Good', 5: 'Excellent' };
    return labels[mood] || 'Unknown';
  };

  const getMoodEmoji = (mood: number) => {
    const emojis: { [key: number]: string } = { 1: '😢', 2: '😕', 3: '😐', 4: '😊', 5: '😄' };
    return emojis[mood] || '-';
  };

  const getMoodColor = (mood: number) => {
    const colors: { [key: number]: string } = { 1: 'red', 2: 'orange', 3: 'yellow', 4: 'lime', 5: 'green' };
    return colors[mood] || 'gray';
  };

  const formatDateForCard = (dateString: string) => {
    try {
      const date = parseISO(dateString);
      return {
        day: format(date, 'd'),
        month: format(date, 'MMM'),
        weekday: format(date, 'EEEE'),
      };
    } catch (error) {
      return { day: '?', month: '???', weekday: 'Error' };
    }
  };

  const renderDay = (date: Date) => {
    if (!store.calendarData) return (
      <Center style={{ height: '100%' }}>
        <Text size="sm" c="dimmed">
          {format(date, 'd')}
        </Text>
      </Center>
    );

    const formattedDate = format(date, 'yyyy-MM-dd');
    const dayData = store.calendarData.find(item => item.date === formattedDate);
    
    if (!dayData) {
      return (
        <Center style={{ height: '100%' }}>
          <Text size="sm" c="dimmed">
            {format(date, 'd')}
          </Text>
        </Center>
      );
    }

    return (
      <Center style={{ height: '100%', position: 'relative' }}>
        <Stack gap={0} align="center">
          <Text size="sm" fw={dayData.has_entry ? 700 : 400}>
            {format(date, 'd')}
          </Text>
          {dayData.mood && (
            <Text size="xs">{getMoodEmoji(dayData.mood)}</Text>
          )}
        </Stack>
      </Center>
    );
  };

  const handleDateClick = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const entryForDate = store.entries.find(e => format(parseISO(e.date), 'yyyy-MM-dd') === dateStr);
    if (entryForDate) {
      handleViewEntry(entryForDate);
    } else {
      notifications.show({
        title: 'No Entry',
        message: `No diary entry found for this date.`,
        color: 'blue'
      });
    }
  };

  useEffect(() => {
    if (unlockModalOpen && !passwordHint) {
      loadPasswordHint();
    }
  }, [unlockModalOpen]);

  return (
    <Container size="xl" py="lg">
      <Stack gap="xl">
        <Group justify="space-between">
          <Group>
            <IconBook size={28} />
            <Title order={2}>Diary</Title>
          </Group>
          <Group>
            <EncryptionStatus 
              isUnlocked={store.isUnlocked}
              onLock={store.lockSession}
              onUnlock={() => setUnlockModalOpen(true)}
            />
            {store.isUnlocked && (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => {
                  form.reset();
                  setViewMode('edit');
                  setModalOpen(true);
                }}
              >
                New Entry
              </Button>
            )}
          </Group>
        </Group>

        {store.isLoading ? (
          <Center py="xl">
            <Loader size="lg" />
          </Center>
        ) : store.error ? (
          <Alert color="red" title="Error" icon={<IconAlertTriangle size={16} />}>
            {store.error}
          </Alert>
        ) : store.isUnlocked ? (
          <>
            {/* Mood Insights */}
            <MoodStatsWidget />
            
            {/* Calendar View */}
            <Grid>
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Card withBorder>
                  <Calendar
                    date={selectedDate}
                    onDateChange={(date) => setSelectedDate(date || new Date())}
                    renderDay={renderDay}
                    getDayProps={(date) => ({
                      onClick: () => handleDateClick(date),
                    })}
                  />
                </Card>
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, md: 8 }}>
                <Stack>
                  <Group justify="space-between">
                    <TextInput
                      style={{ flex: 1 }}
                      placeholder="Search by title..."
                      value={store.searchQuery}
                      onChange={(event) => store.setSearchQuery(event.currentTarget.value)}
                      rightSection={store.isLoading ? <Loader size="xs" /> : null}
                    />
                  </Group>

                  {paginatedEntries.length > 0 ? (
                    <Grid>
                      {paginatedEntries.map((entry) => (
                        <Grid.Col span={{ base: 12, sm: 6, lg: 4 }} key={entry.uuid}>
                          <Card withBorder radius="md" p={0}>
                            <Group wrap="nowrap" gap={0}>
                              <Paper bg={getMoodColor(entry.mood || 3)} p="md" radius={0}>
                                <Stack align="center" gap="xs">
                                  <Text size="xs" c="white">{formatDateForCard(entry.date).month}</Text>
                                  <Title order={3} c="white">{formatDateForCard(entry.date).day}</Title>
                                </Stack>
                              </Paper>
                              <Stack p="md" gap="xs" style={{ flex: 1 }}>
                                <Group justify="space-between">
                                  <Text fw={500} truncate>{entry.title}</Text>
                                  <Menu shadow="md" width={200}>
                                    <Menu.Target>
                                      <ActionIcon variant="subtle">
                                        <IconDots />
                                      </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                      <Menu.Item 
                                        leftSection={<IconEye size={14} />} 
                                        onClick={() => handleViewEntry(entry)}
                                      >
                                        View/Edit
                                      </Menu.Item>
                                      <Menu.Item 
                                        color="red" 
                                        leftSection={<IconTrash size={14} />} 
                                        onClick={() => handleDelete(entry.uuid)}
                                      >
                                        Delete
                                      </Menu.Item>
                                    </Menu.Dropdown>
                                  </Menu>
                                </Group>
                                <Text size="sm" c="dimmed">
                                  Mood: {getMoodEmoji(entry.mood || 3)}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  Updated: {formatDateTime(entry.updated_at)}
                                </Text>
                              </Stack>
                            </Group>
                          </Card>
                        </Grid.Col>
                      ))}
                    </Grid>
                  ) : (
                    <Center py="xl">
                      <Text>No diary entries found.</Text>
                    </Center>
                  )}
                  
                  {totalPages > 1 && (
                    <Group justify="center" mt="md">
                      <Pagination
                        total={totalPages}
                        value={currentPage}
                        onChange={setCurrentPage}
                      />
                    </Group>
                  )}
                </Stack>
              </Grid.Col>
            </Grid>
          </>
        ) : (
          <Alert color="blue" title="Diary Locked" icon={<IconLock size={16} />}>
            <Text>Your diary is encrypted and locked. Please unlock it to view your entries.</Text>
            <Button mt="md" onClick={() => setUnlockModalOpen(true)}>
              Unlock Diary
            </Button>
          </Alert>
        )}
      </Stack>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteConfirmModalOpen}
        onClose={() => setDeleteConfirmModalOpen(false)}
        title="Confirm Deletion"
        size="sm"
        centered
      >
        <Stack>
          <Text>Are you sure you want to delete this entry? This action cannot be undone.</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setDeleteConfirmModalOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={unlockModalOpen}
        onClose={() => setUnlockModalOpen(false)}
        title="Unlock Diary"
        size="sm"
      >
        <Stack>
          <Text size="sm">
            Enter your encryption password to unlock your diary.
          </Text>
          <PasswordInput
            label="Password"
            placeholder="Enter your password"
            value={encryptionPassword}
            onChange={(e) => setEncryptionPassword(e.target.value)}
            required
          />
          {passwordHint && (
            <Text size="xs" c="dimmed">
              Hint: {passwordHint}
            </Text>
          )}
          {!showPasswordHint && (
            <Button variant="subtle" size="xs" onClick={() => setShowPasswordHint(true)}>
              Show password hint
            </Button>
          )}
          <Button
            onClick={handleUnlockSession}
            loading={store.isLoading}
            disabled={!encryptionPassword}
          >
            Unlock
          </Button>
        </Stack>
      </Modal>

      {/* Entry Modal - Only for editing/creating entries */}
      <Modal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        title={viewMode === 'view' ? 'View Entry' : 'Edit Entry'}
        size="lg"
      >
        <form onSubmit={form.onSubmit(handleCreateOrUpdateEntry)}>
          <Stack>
            <TextInput
              label="Title"
              placeholder="Enter a title for your entry"
              {...form.getInputProps('title')}
            />
            <Textarea
              label="Content"
              placeholder="Write your diary entry..."
              minRows={10}
              {...form.getInputProps('content')}
            />
            
            <TagsInput
              label="Tags"
              placeholder="Type and press Enter to add tags"
              value={form.values.tags}
              onChange={(value) => form.setFieldValue('tags', value)}
              clearable
              description="Organize your entries with tags for easy searching and filtering"
            />
            
            <Stack>
              <Text size="sm" fw={500}>Mood</Text>
              <Group>
                <Rating
                  value={form.values.mood}
                  onChange={(value) => form.setFieldValue('mood', value)}
                />
                <Text size="sm" c="dimmed">
                  {getMoodLabel(form.values.mood)} {getMoodEmoji(form.values.mood)}
                </Text>
              </Group>
            </Stack>

            <Group justify="flex-end">
              <Button variant="light" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {viewMode === 'view' ? 'Save Changes' : 'Create Entry'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}