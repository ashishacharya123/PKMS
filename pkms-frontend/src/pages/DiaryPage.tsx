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
  Skeleton,
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
  Box,
  Indicator,
  PasswordInput,
  Popover,
  Switch,
  SimpleGrid,
  Divider,
  Loader,
  SegmentedControl,
  NumberInput,
} from '@mantine/core';
import { Calendar } from '@mantine/dates';
import {
  IconBook,
  IconPlus,
  IconCalendar,
  IconMoodSmile,
  IconEdit,
  IconTrash,
  IconDots,
  IconAlertTriangle,
  IconLock,
  IconDownload,
  IconSortAscending,
  IconSortDescending,
  IconSearch,
  IconFilter,
  IconEye,
  IconX,
  IconLockOpen,
  IconPencil,
  IconChevronLeft,
  IconChevronRight,
  IconPhoto,
  IconMicrophone,
  IconVideo,
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useDiaryStore } from '../stores/diaryStore';
import { diaryService, DiaryEntrySummary } from '../services/diaryService';
import { isSameDay, format, parse, parseISO } from 'date-fns';
import { notifications } from '@mantine/notifications';
import type { NotificationData } from '@mantine/notifications';
import type { DiaryEntry, DiaryEntryCreatePayload } from '../services/diaryService';
import axios from 'axios';
import { useForm } from '@mantine/form';
import { shallow } from 'zustand/shallow';

const showNotification = (data: NotificationData) => {
  notifications.show(data);
};

type SortField = 'date' | 'created_at' | 'mood' | 'weather';
type SortOrder = 'asc' | 'desc';

export function DiaryPage() {
  const store = useDiaryStore(
    (state) => ({
      entries: state.entries,
      isUnlocked: state.isUnlocked,
      isEncryptionSetup: state.isEncryptionSetup,
      isLoading: state.isLoading,
      error: state.error,
      currentYear: state.currentYear,
      currentMonth: state.currentMonth,
      calendarData: state.calendarData,
      encryptionKey: state.encryptionKey,
      titleSearch: state.searchQuery,
      dayOfWeek: state.currentDayOfWeek,
      hasMedia: state.currentHasMedia,
      init: state.init,
      setupEncryption: state.setupEncryption,
      unlockSession: state.unlockSession,
      lockSession: state.lockSession,
      loadEntries: state.loadEntries,
      loadCalendarData: state.loadCalendarData,
      createEntry: state.createEntry,
      updateEntry: state.updateEntry,
      deleteEntry: state.deleteEntry,
      setError: state.setError,
      setYear: state.setYear,
      setMonth: state.setMonth,
      setSearchQuery: state.setSearchQuery,
      setDayOfWeek: state.setDayOfWeek,
      setHasMedia: state.setHasMedia,
    }),
    shallow
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [encryptionModalOpen, setEncryptionModalOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [showPasswordHint, setShowPasswordHint] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<({
    id: number;
    date: string;
    title: string;
    content: string;
    mood?: number;
    weather?: string;
  }) | null>(null);
  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const itemsPerPage = 12;

  const [activeFiltersCount, setActiveFiltersCount] = useState(0);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const form = useForm({
    initialValues: {
      id: null as number | null,
      date: new Date(),
      title: '',
      content: '',
      mood: 3,
      metadata: {
        activity: '',
        sleep_hours: '',
      }
    },
    validate: {
      title: (value) => (value.trim().length > 0 ? null : 'Title is required'),
      content: (value) => (value.trim().length > 0 ? null : 'Content cannot be empty'),
    },
  });

  const [debouncedTitleSearch, setDebouncedTitleSearch] = useDebouncedValue(store.titleSearch, 500);

  useEffect(() => {
    store.init();
  }, [store.init]);

  useEffect(() => {
    if (store.isEncryptionSetup && !store.isUnlocked) {
      setUnlockModalOpen(true);
    } else {
      setUnlockModalOpen(false);
    }
  }, [store.isEncryptionSetup, store.isUnlocked]);

  useEffect(() => {
    if (store.isUnlocked) {
      store.loadEntries();
    }
  }, [store.isUnlocked, store.loadEntries, store.titleSearch, store.dayOfWeek, store.hasMedia, store.currentYear, store.currentMonth]);

  useEffect(() => {
    if (store.isUnlocked) {
      store.loadCalendarData();
    }
  }, [store.isUnlocked, store.loadCalendarData, store.currentYear, store.currentMonth]);

  const sortedEntries = useMemo(() => {
    return [...store.entries].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if(sortOrder === 'asc') return aVal < bVal ? -1 : 1;
      return aVal > bVal ? -1 : 1;
    });
  }, [store.entries, sortField, sortOrder]);

  const paginatedEntries = sortedEntries.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const totalPages = Math.ceil(sortedEntries.length / itemsPerPage);

  const resetEntryForm = () => {
    form.reset();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleSetupEncryption = async () => {
    const success = await store.setupEncryption(encryptionPassword, passwordHint);
    if (success) {
      showNotification({
        title: 'Success',
        message: 'Diary encryption enabled.',
        color: 'green'
      });
      setEncryptionModalOpen(false);
    }
  };

  const handleUnlockSession = async () => {
    const success = await store.unlockSession(encryptionPassword);
    if (success) {
      showNotification({
        title: 'Success',
        message: 'Diary unlocked.',
        color: 'green'
      });
      setUnlockModalOpen(false);
    }
  };

  const handleViewEntry = async (entry: DiaryEntrySummary) => {
    if (!store.encryptionKey) {
      store.setError('Cannot view entry: encryption key not available.');
      return;
    }
    try {
      const decryptedContent = await diaryService.decryptContent(entry.encrypted_blob, entry.encryption_iv, entry.encryption_tag, store.encryptionKey);
      form.setValues({
        id: entry.id,
        date: new Date(entry.date),
        title: entry.title || '',
        content: decryptedContent,
        mood: entry.mood || 3,
        metadata: entry.metadata || { activity: '', sleep_hours: '' },
      });
      setModalOpen(true);
    } catch (e) {
      store.setError('Failed to decrypt and view entry.');
    }
  };

  const handleCreateOrUpdateEntry = async () => {
    if (!form.validate().hasErrors) {
      const { id, ...values } = form.values;
      const result = id ? await store.updateEntry(id, values) : await store.createEntry(values);
      if (result) {
        setModalOpen(false);
        resetEntryForm();
      }
    }
  };

  const handleDelete = async (id: number) => {
    const success = await store.deleteEntry(id);
    if (success) {
      showNotification({
        title: 'Success',
        message: 'Entry deleted.',
        color: 'green'
      });
    }
  };

  const getMoodLabel = (mood: number) => {
    const labels: { [key: number]: string } = { 1: 'Very Bad', 2: 'Bad', 3: 'Neutral', 4: 'Good', 5: 'Excellent' };
    return labels[mood] || 'Unknown';
  };

  const getMoodEmoji = (mood: number) => {
    const emojis: { [key: number]: string } = { 1: '😢', 2: '😞', 3: '😐', 4: '😊', 5: '😄' };
    return emojis[mood] || '😐';
  };

  const getMoodColor = (mood: number) => {
    const colors = { 1: 'red', 2: 'orange', 3: 'gray', 4: 'green', 5: 'blue' };
    return colors[mood as keyof typeof colors] || 'gray';
  };

  const getWeatherEmoji = (weather: string) => {
    const emojis: Record<string, string> = {
      sunny: '☀️', cloudy: '☁️', rainy: '🌧️', snowy: '❄️', stormy: '⛈️'
    };
    return emojis[weather.toLowerCase()] || '🌤️';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateForCard = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  const handleMonthChange = (date: Date) => {
    store.setYear(date.getFullYear());
    store.setMonth(date.getMonth() + 1);
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
          {dayData.media_count > 0 && (
            <Badge size="xs" variant="light">
              {dayData.media_count} 📎
            </Badge>
          )}
        </Stack>
      </Center>
    );
  };

  useEffect(() => {
    store.setSearchQuery(debouncedTitleSearch);
  }, [debouncedTitleSearch, store.setSearchQuery]);

  useEffect(() => {
    setActiveFiltersCount(
      (store.titleSearch ? 1 : 0) +
      (store.dayOfWeek !== null ? 1 : 0) +
      (store.hasMedia !== null ? 1 : 0)
    );
  }, [store.titleSearch, store.dayOfWeek, store.hasMedia]);

  if (!store.isEncryptionSetup) {
    return (
      <Container size="md">
        <Paper p="xl" radius="md" style={{ textAlign: 'center' }}>
          <ThemeIcon size="xl" variant="light" color="purple" mx="auto" mb="md">
            <IconLock size={32} />
          </ThemeIcon>
          <Title order={2} mb="xs">Secure Diary Setup</Title>
          <Text c="dimmed" mb="lg">
            Your diary entries are encrypted for maximum privacy. Please set up your encryption password.
          </Text>
          <Button
            leftSection={<IconLock size={16} />}
            onClick={() => setEncryptionModalOpen(true)}
            size="lg"
          >
            Setup Encryption
          </Button>
        </Paper>

        <Modal
          opened={encryptionModalOpen}
          onClose={() => setEncryptionModalOpen(false)}
          title="Setup Diary Encryption"
          size="md"
        >
          <Stack gap="md">
            <Alert color="blue" variant="light">
              <Text size="sm">
                Choose a strong password for encrypting your diary entries. 
                This password cannot be recovered if lost.
              </Text>
            </Alert>
            
            {store.error && (
              <Alert color="red" variant="light" title="Error">
                {store.error}
              </Alert>
            )}
            
            <TextInput
              label="Encryption Password"
              type="password"
              placeholder="Enter a strong password"
              value={encryptionPassword}
              onChange={(e) => setEncryptionPassword(e.currentTarget.value)}
              required
            />

            <TextInput
              label="Password Hint (Optional)"
              placeholder="Enter a hint to help you remember your password"
              value={passwordHint || ''}
              onChange={(e) => setPasswordHint(e.currentTarget.value)}
            />
            
            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={() => {
                  setEncryptionModalOpen(false);
                  setEncryptionPassword('');
                  setPasswordHint('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSetupEncryption}
                disabled={!encryptionPassword.trim()}
              >
                Setup Encryption
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Container>
    );
  }

  if (!store.isUnlocked) {
    return (
        <Container size="md">
            <Modal
              opened={unlockModalOpen}
              onClose={() => { /* Disallow closing */ }}
              title="Unlock Diary"
              size="md"
              withCloseButton={false}
              centered
            >
              <Stack gap="md">
                <Alert color="blue" variant="light">
                  <Text size="sm">
                    Your diary is locked. Please enter your password to unlock it for this session.
                  </Text>
                </Alert>

                {store.error && (
                  <Alert color="red" variant="light" title="Error">
                    {store.error}
                  </Alert>
                )}
                
                {passwordHint && (
                  <Alert color="yellow" variant="light" title="Password Hint">
                    <Group justify="space-between" align="center">
                      <Text size="sm" style={{ flex: 1 }}>
                        {showPasswordHint ? passwordHint : "Click to show your password hint"}
                      </Text>
                      <Button 
                        variant="subtle" 
                        size="xs"
                        onClick={() => setShowPasswordHint(!showPasswordHint)}
                      >
                        {showPasswordHint ? "Hide" : "Show"}
                      </Button>
                    </Group>
                  </Alert>
                )}
                
                <TextInput
                  label="Encryption Password"
                  type="password"
                  placeholder="Enter your password"
                  value={encryptionPassword}
                  onChange={(e) => setEncryptionPassword(e.currentTarget.value)}
                  required
                />
                
                <Group justify="space-between">
                  <Button
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to clear encryption? This will reset your diary and you'll need to set up encryption again.")) {
                        store.init();
                      }
                    }}
                  >
                    Reset Encryption
                  </Button>
                  <Button
                    onClick={handleUnlockSession}
                    disabled={!encryptionPassword.trim()}
                  >
                    Unlock
                  </Button>
                </Group>
              </Stack>
            </Modal>
        </Container>
    );
  }

  return (
    <Container size="xl">
      <Grid>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Stack gap="md">
            <Button
              leftSection={<IconPlus size={16} />}
              size="md"
              onClick={() => {
                resetEntryForm();
                setViewMode('edit');
                setModalOpen(true);
              }}
              fullWidth
            >
              New Entry
            </Button>

            <Popover position="bottom-start">
              <Popover.Target>
                <TextInput
                  placeholder="Search diary entries..."
                  leftSection={<IconSearch size={16} />}
                  value={store.titleSearch || ''}
                  onChange={(e) => setDebouncedTitleSearch(e.currentTarget.value)}
                />
              </Popover.Target>
              <Popover.Dropdown>
                <Stack>
                  <TextInput
                    label="Search by title"
                    placeholder="My awesome day"
                    leftSection={<IconSearch size={14} />}
                    defaultValue={store.titleSearch || ''}
                    onChange={(event) => setDebouncedTitleSearch(event.currentTarget.value)}
                  />
                  <Select
                    label="Day of the week"
                    value={store.dayOfWeek !== null ? String(store.dayOfWeek) : null}
                    onChange={(value) => store.setDayOfWeek(value ? Number(value) : null)}
                    data={[
                      { value: '0', label: 'Sunday' },
                      { value: '1', label: 'Monday' },
                      { value: '2', label: 'Tuesday' },
                      { value: '3', label: 'Wednesday' },
                      { value: '4', label: 'Thursday' },
                      { value: '5', label: 'Friday' },
                      { value: '6', label: 'Saturday' },
                    ]}
                  />
                  <Switch
                    label="Has Media"
                    checked={store.hasMedia === true}
                    onChange={(event) => store.setHasMedia(event.currentTarget.checked ? true : null)}
                    onDoubleClick={() => store.setHasMedia(null)}
                    styles={{ label: { cursor: 'pointer' } }}
                  />
                </Stack>
              </Popover.Dropdown>
            </Popover>

            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Calendar</Text>
                <IconCalendar size={16} />
              </Group>
              
              <Paper shadow="sm" p="md">
                <TextInput
                  type="date"
                  value={format(selectedDate, 'yyyy-MM-dd')}
                  onChange={(e) => {
                    const newDate = new Date(e.currentTarget.value);
                    store.setYear(newDate.getFullYear());
                    store.setMonth(newDate.getMonth() + 1);
                  }}
                  label="Select Date"
                  size="sm"
                />
                <Button
                  variant="light"
                  size="sm"
                  mt="md"
                  fullWidth
                  onClick={() => {
                    const dateStr = format(selectedDate, 'yyyy-MM-dd');
                    const entryForDate = store.entries.find(e => format(parseISO(e.date), 'yyyy-MM-dd') === dateStr);
                    if (entryForDate) {
                        handleViewEntry(entryForDate);
                    } else {
                        showNotification({
                            title: 'No Entry',
                            message: `No diary entry found for this date.`,
                            color: 'blue'
                        });
                    }
                  }}
                >
                  View Entry for {format(selectedDate, 'MMM dd, yyyy')}
                </Button>
              </Paper>
            </Paper>

            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Mood Filter</Text>
                <IconMoodSmile size={16} />
              </Group>
              
              <Stack gap="xs">
                <Button
                  variant={!store.dayOfWeek ? 'filled' : 'subtle'}
                  size="xs"
                  justify="space-between"
                  fullWidth
                  onClick={() => store.setDayOfWeek(null)}
                >
                  <span>All Moods</span>
                  <Badge size="xs" variant="light">{store.entries.length}</Badge>
                </Button>
                
                {[1, 2, 3, 4, 5].map((mood) => (
                  <Button
                    key={mood}
                    variant={store.dayOfWeek === mood ? 'filled' : 'subtle'}
                    size="xs"
                    justify="space-between"
                    fullWidth
                    onClick={() => store.setDayOfWeek(mood)}
                  >
                    <Group gap="xs">
                      <span>{getMoodEmoji(mood)}</span>
                      <span>{getMoodLabel(mood)}</span>
                    </Group>
                    <Badge size="xs" variant="light">
                      {store.entries.filter(e => e.mood === mood).length}
                    </Badge>
                  </Button>
                ))}
              </Stack>
            </Paper>

            {store.moodStats && (
              <Paper p="md" withBorder>
                <Text fw={600} size="sm" mb="xs">Mood Statistics</Text>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm">Total Entries</Text>
                    <Badge variant="light">{store.moodStats.total_entries}</Badge>
                  </Group>
                  {store.moodStats.average_mood && (
                    <Group justify="space-between">
                      <Text size="sm">Average Mood</Text>
                      <Badge variant="light" color={getMoodColor(Math.round(store.moodStats.average_mood))}>
                        {store.moodStats.average_mood.toFixed(1)}
                      </Badge>
                    </Group>
                  )}
                </Stack>
              </Paper>
            )}
          </Stack>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 9 }}>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <div>
                <Title order={2}>Diary</Title>
                <Text c="dimmed">
                  {sortedEntries.length} {sortedEntries.length === 1 ? 'entry' : 'entries'} • Your private encrypted journal
                </Text>
              </div>
              
              <Group gap="xs">
                <Button
                  variant={sortField === 'date' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'date' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('date')}
                >
                  Date
                </Button>
                <Button
                  variant={sortField === 'mood' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'mood' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('mood')}
                >
                  Mood
                </Button>
                <Button
                  variant={sortField === 'created_at' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'created_at' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('created_at')}
                >
                  Created
                </Button>
                {store.isUnlocked && (
                  <Button
                    leftSection={<IconLock size={16} />}
                    onClick={store.lockSession}
                    variant="light"
                    color="orange"
                  >
                    Lock Diary
                  </Button>
                )}
              </Group>
            </Group>

            {store.error && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                title="Error"
                color="red"
                variant="light"
                withCloseButton
                onClose={() => store.setError(null)}
              >
                {store.error}
              </Alert>
            )}

            {store.isLoading && (
              <Grid>
                {Array.from({ length: 6 }).map((_, index) => (
                  <Grid.Col span={{ base: 12, sm: 6, lg: 4 }} key={index}>
                    <Skeleton height={200} radius="md" />
                  </Grid.Col>
                ))}
              </Grid>
            )}

            {!store.isLoading && paginatedEntries.length > 0 && (
              <>
                <Grid>
                  {paginatedEntries.map((entry) => (
                    <Grid.Col span={{ base: 12, sm: 6, lg: 4 }} key={entry.id}>
                      <Card 
                        shadow="sm" 
                        padding="md" 
                        radius="md" 
                        withBorder
                        style={{ 
                          cursor: 'pointer', 
                          transition: 'transform 0.2s ease',
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                        onClick={() => handleViewEntry(entry)}
                      >
                        <Group justify="space-between" align="flex-start" mb="xs">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Text fw={600} size="lg" truncate>
                              {formatDateForCard(entry.date)}
                            </Text>
                            <Group gap="xs" mt="xs">
                              {entry.mood && (
                                <Badge variant="light" color={getMoodColor(entry.mood)} size="sm">
                                  {getMoodEmoji(entry.mood)} {getMoodLabel(entry.mood)}
                                </Badge>
                              )}
                              {entry.weather && (
                                <Badge variant="outline" size="sm">
                                  {getWeatherEmoji(entry.weather)} {entry.weather}
                                </Badge>
                              )}
                              {entry.media_count > 0 && (
                                <Badge variant="dot" size="sm">
                                  {entry.media_count} 📎
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
                                leftSection={<IconEye size={14} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewEntry(entry);
                                }}
                              >
                                View Entry
                              </Menu.Item>
                              <Menu.Item 
                                leftSection={<IconEdit size={14} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewEntry(entry);
                                }}
                              >
                                Edit Entry
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Item 
                                leftSection={<IconTrash size={14} />}
                                color="red"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(entry.id);
                                }}
                              >
                                Delete
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                        
                        <Text size="sm" c="dimmed" lineClamp={3} style={{ flex: 1 }}>
                          🔐 Encrypted diary entry • Click to view and edit
                        </Text>
                        
                        <Paper 
                          p="xs" 
                          mt="xs" 
                          style={{ 
                            backgroundColor: 'var(--mantine-color-gray-0)',
                            border: '1px dashed var(--mantine-color-gray-3)'
                          }}
                        >
                          <Text size="xs" c="dimmed" ta="center">
                            {entry.mood ? `${getMoodEmoji(entry.mood)} Diary Entry` : '📝 Diary Entry'}
                          </Text>
                        </Paper>
                        
                        <Group justify="space-between" mt="md">
                          <Text size="xs" c="dimmed">
                            {formatDate(entry.created_at)}
                          </Text>
                          <Tooltip label="View entry">
                            <ActionIcon 
                              variant="light" 
                              color="blue" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewEntry(entry);
                              }}
                            >
                              <IconEye size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Card>
                    </Grid.Col>
                  ))}
                </Grid>

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

            {!store.isLoading && paginatedEntries.length === 0 && (
              <Paper p="xl" radius="md" style={{ textAlign: 'center' }}>
                <ThemeIcon size="xl" variant="light" color="purple" mx="auto" mb="md">
                  <IconBook size={32} />
                </ThemeIcon>
                <Title order={3} mb="xs">
                  {store.titleSearch || store.dayOfWeek ? 'No diary entries found' : 'No diary entries yet'}
                </Title>
                <Text c="dimmed" mb="lg">
                  {store.titleSearch || store.dayOfWeek 
                    ? 'Try adjusting your search or filters'
                    : 'Start writing your first encrypted diary entry'
                  }
                </Text>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => {
                    resetEntryForm();
                    setViewMode('edit');
                    setModalOpen(true);
                  }}
                >
                  Write First Entry
                </Button>
              </Paper>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      <Modal
        opened={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetEntryForm();
          setViewingEntry(null);
        }}
        title={viewingEntry && viewMode === 'view' ? `View Entry: ${formatDate(viewingEntry.date)}` : 'Edit Diary Entry'}
        size="lg"
      >
        {viewingEntry && viewMode === 'view' ? (
          <Stack gap="md">
            <Group>
              <Text fw={500}>Date: {formatDate(viewingEntry.date)}</Text>
            </Group>

            {viewingEntry.title && (
              <Title order={4}>{viewingEntry.title}</Title>
            )}

            <Text style={{ whiteSpace: 'pre-wrap' }}>{viewingEntry.content}</Text>

            <Group gap="xs">
              {viewingEntry.mood && (
                <Badge variant="light" color={getMoodColor(viewingEntry.mood)}>
                  Mood: {getMoodEmoji(viewingEntry.mood)} {getMoodLabel(viewingEntry.mood)}
                </Badge>
              )}
              {viewingEntry.weather && (
                <Badge variant="outline">
                  Weather: {getWeatherEmoji(viewingEntry.weather)} {viewingEntry.weather}
                </Badge>
              )}
            </Group>

            <Group justify="flex-end">
              <Button
                leftSection={<IconEdit size={16} />}
                variant="light"
                onClick={() => {
                  form.setValues({
                    id: viewingEntry.id,
                    date: new Date(viewingEntry.date),
                    title: viewingEntry.title,
                    content: viewingEntry.content,
                    mood: viewingEntry.mood ?? 3,
                    weather: viewingEntry.weather ?? ''
                  });
                  setViewMode('edit');
                }}
              >
                Edit Entry
              </Button>
            </Group>
          </Stack>
        ) : (
          <Stack gap="md">
            <Group>
              <Text fw={500}>Date: {selectedDate.toLocaleDateString()}</Text>
            </Group>
            
            <TextInput
              label="Title"
              placeholder="A descriptive title for your entry"
              {...form.getInputProps('title')}
              required
            />
            
            <Textarea
              label="Content"
              placeholder="Write your heart out..."
              {...form.getInputProps('content')}
              required
              autosize
              minRows={6}
            />
            
            <SimpleGrid cols={3}>
              <Select
                label="Mood"
                data={['1', '2', '3', '4', '5'].map(m => ({ value: m, label: getMoodLabel(Number(m)) }))}
                value={String(form.values.mood)}
                onChange={(val) => form.setFieldValue('mood', Number(val))}
              />
              <TextInput
                label="Activity"
                placeholder="e.g., Reading, Running"
                {...form.getInputProps('metadata.activity')}
              />
              <TextInput
                label="Sleep (hours)"
                placeholder="e.g., 8"
                {...form.getInputProps('metadata.sleep_hours')}
              />
            </SimpleGrid>

            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={() => {
                  setModalOpen(false);
                  resetEntryForm();
                  setViewingEntry(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateOrUpdateEntry}
                disabled={!form.isValid()}
              >
                Save Entry
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
} 