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

import { useForm } from '@mantine/form';
import { shallow } from 'zustand/shallow';
import { DiaryEntrySummary, DiaryFormValues, DiaryMetadata, SortField, SortOrder, DiaryEntryCreatePayload } from '../types/diary';

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

  const [debouncedTitleSearch] = useDebouncedValue(store.titleSearch, 500);

  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Only initialize diary if user is authenticated
    if (isAuthenticated) {
      store.init();
    }
  }, [isAuthenticated, store.init]);

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
      store.loadCalendarData(store.currentYear, store.currentMonth);
    }
  }, [store.isUnlocked, store.loadCalendarData, store.currentYear, store.currentMonth]);

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
          aVal = a.mood || 0;
          bVal = b.mood || 0;
          break;
        default:
          aVal = a[sortField];
          bVal = b[sortField];
      }
      
      if (sortOrder === 'asc') return aVal < bVal ? -1 : 1;
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
    if (!encryptionPassword) return;
    
    const success = await store.setupEncryption(encryptionPassword, passwordHint);
    if (success) {
      setEncryptionModalOpen(false);
      setEncryptionPassword('');
      setPasswordHint('');
      notifications.show({
        title: 'Success',
        message: 'Diary encryption has been set up',
        color: 'green',
      });
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
    if (!store.encryptionKey) return;
    
    try {
      const decryptedContent = await diaryService.decryptContent(
        entry.encrypted_blob,
        entry.encryption_iv,
        entry.encryption_tag,
        store.encryptionKey
      );
      
      // TODO: Implement viewing functionality
      // setViewingEntry({ ...entry, content: decryptedContent } as DiaryEntry);
      
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
    form.setValues({
      id: entry.id,
      date: parseISO(entry.date),
      title: entry.title || '',
      content: '',  // Will be decrypted when viewing
      mood: entry.mood || 3,
      metadata: {
        ...initialMetadata,
        ...entry.metadata
      },
      tags: entry.tags || []
    });
    setViewMode('edit');
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    
    try {
      await store.deleteEntry(id);
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
        title: values.title,
        encrypted_blob,
        encryption_iv: iv,
        encryption_tag: tag,
        mood: values.mood,
        metadata: values.metadata,
        tags: values.tags
      };
      
      if (values.id) {
        await store.updateEntry(values.id, payload);
      } else {
        await store.createEntry(payload);
      }
      
      setModalOpen(false);
      form.reset();
      // Refresh data so that the new/updated entry instantly appears
      await store.loadEntries();
      await store.loadCalendarData(store.currentYear, store.currentMonth);
      notifications.show({
        title: 'Success',
        message: values.id ? 'Diary entry updated' : 'Diary entry created',
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
          {/* Media count not available in calendar data */}
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
    store.setSearchQuery(debouncedTitleSearch);
  }, [debouncedTitleSearch, store.setSearchQuery]);

  // Filters count calculation removed for now

  useEffect(() => {
    if (unlockModalOpen && !passwordHint) {
      loadPasswordHint();
    }
  }, [unlockModalOpen]);

  // Add encryption setup modal
  const EncryptionSetupModal = () => (
    <Modal
      opened={encryptionModalOpen}
      onClose={() => setEncryptionModalOpen(false)}
      title="Setup Diary Encryption"
      size="sm"
    >
      <Stack>
        <Text size="sm">
          Your diary entries will be encrypted for privacy. Please set a strong password.
        </Text>
        <PasswordInput
          label="Encryption Password"
          placeholder="Enter a strong password"
          value={encryptionPassword}
          onChange={(e) => setEncryptionPassword(e.target.value)}
          required
        />
        <TextInput
          label="Password Hint (Optional)"
          placeholder="Enter a hint to help remember your password"
          value={passwordHint}
          onChange={(e) => setPasswordHint(e.target.value)}
        />
        <Button
          onClick={handleSetupEncryption}
          loading={store.isLoading}
          disabled={!encryptionPassword}
        >
          Setup Encryption
        </Button>
      </Stack>
    </Modal>
  );

  // Add unlock modal
  const UnlockModal = () => (
    <Modal
      opened={unlockModalOpen}
      onClose={() => setUnlockModalOpen(false)}
      title="Unlock Diary"
      size="sm"
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
    >
      <Stack>
        <Text size="sm">
          Enter your encryption password to unlock your diary.
        </Text>
        <PasswordInput
          label="Password"
          placeholder="Enter your encryption password"
          value={encryptionPassword}
          onChange={(e) => setEncryptionPassword(e.target.value)}
          required
        />
        {showPasswordHint && (
          <Alert color="blue" title="Password Hint">
            {passwordHint}
          </Alert>
        )}
        <Group>
          <Button
            onClick={handleUnlockSession}
            loading={store.isLoading}
            disabled={!encryptionPassword}
          >
            Unlock
          </Button>
          <Button
            variant="subtle"
            onClick={() => {
              if (!passwordHint) {
                loadPasswordHint();
              }
              setShowPasswordHint(true);
            }}
          >
            Show Hint
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  // Add encryption status indicator
  const EncryptionStatus = () => (
    <Group gap="xs">
      {store.isUnlocked ? (
        <>
          <Tooltip label="Diary is unlocked">
            <ActionIcon color="green" variant="light">
              <IconLockOpen size={16} />
            </ActionIcon>
          </Tooltip>
          <Text size="sm" c="dimmed">
            Unlocked
          </Text>
          <Button
            size="xs"
            variant="light"
            color="orange"
            leftSection={<IconLock size={14} />}
            onClick={() => {
              store.lockSession();
              notifications.show({
                title: 'Diary Locked',
                message: 'Your diary has been locked for security',
                color: 'orange',
              });
            }}
          >
            Lock
          </Button>
        </>
      ) : (
        <>
          <Tooltip label="Diary is locked">
            <ActionIcon color="red" variant="light">
              <IconLock size={16} />
            </ActionIcon>
          </Tooltip>
          <Text size="sm" c="dimmed">
            Locked
          </Text>
        </>
      )}
    </Group>
  );

  // Show loading during initialization
  if (store.isLoading && !store.isEncryptionSetup && !store.isUnlocked) {
    return (
      <Container size="md">
        <Paper p="xl" radius="md" style={{ textAlign: 'center' }}>
          <Loader size="lg" mx="auto" mb="md" />
          <Text c="dimmed">Initializing diary...</Text>
        </Paper>
      </Container>
    );
  }

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
    <Container size="xl" py="md">
      <EncryptionSetupModal />
      <UnlockModal />
      
      <Stack>
        <Group justify="space-between">
          <Group>
            <ThemeIcon size="lg" variant="light" color="blue">
              <IconBook size={24} />
            </ThemeIcon>
            <Title order={2}>Diary</Title>
          </Group>
          <Group>
            <EncryptionStatus />
            {store.isUnlocked && (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => setModalOpen(true)}
              >
                New Entry
              </Button>
            )}
          </Group>
        </Group>

        {!store.isEncryptionSetup && (
          <Alert
            color="blue"
            title="Welcome to Your Diary"
            icon={<IconLock size={16} />}
          >
            <Text mb="sm">
              Your diary entries will be encrypted for privacy. Click below to set up encryption.
            </Text>
            <Button onClick={() => setEncryptionModalOpen(true)}>
              Setup Encryption
            </Button>
          </Alert>
        )}

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
                <Card withBorder>
                  <Group justify="space-between" mb="md">
                    <Title order={3}>Entries</Title>
                    <Group>
                      <Select
                        value={sortField}
                        onChange={(value) => setSortField(value as SortField)}
                        data={[
                          { value: 'date', label: 'Date' },
                          { value: 'created_at', label: 'Created' },
                          { value: 'mood', label: 'Mood' },
                        ]}
                      />
                      <ActionIcon
                        variant="light"
                        onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      >
                        {sortOrder === 'asc' ? <IconSortAscending size={16} /> : <IconSortDescending size={16} />}
                      </ActionIcon>
                    </Group>
                  </Group>

                  {/* Entry List */}
                  <Stack>
                    {paginatedEntries.map((entry) => (
                      <Card key={entry.id} withBorder>
                        <Group justify="space-between">
                          <Stack gap="xs">
                            <Group>
                              <Text fw={500}>{entry.title || formatDate(entry.date)}</Text>
                              {entry.mood && (
                                <Badge color={getMoodColor(entry.mood)}>
                                  {getMoodEmoji(entry.mood)} {getMoodLabel(entry.mood)}
                                </Badge>
                              )}
                              {entry.media_count > 0 && (
                                <Badge variant="light" color="orange">
                                  📎 {entry.media_count}
                                </Badge>
                              )}
                            </Group>
                            {entry.tags && entry.tags.length > 0 && (
                              <Group gap="xs">
                                {entry.tags.map((tag) => (
                                  <Badge key={tag} variant="outline" size="sm" color="gray">
                                    {tag}
                                  </Badge>
                                ))}
                              </Group>
                            )}
                            <WellnessBadges metadata={entry.metadata} compact={true} />
                          </Stack>
                          <Group>
                            <Menu>
                              <Menu.Target>
                                <ActionIcon variant="light">
                                  <IconDots size={16} />
                                </ActionIcon>
                              </Menu.Target>
                              <Menu.Dropdown>
                                <Menu.Item
                                  leftSection={<IconEye size={16} />}
                                  onClick={() => handleViewEntry(entry)}
                                >
                                  View
                                </Menu.Item>
                                <Menu.Item
                                  leftSection={<IconEdit size={16} />}
                                  onClick={() => handleEditEntry(entry)}
                                >
                                  Edit
                                </Menu.Item>
                                <Menu.Item
                                  leftSection={<IconTrash size={16} />}
                                  color="red"
                                  onClick={() => handleDelete(entry.id)}
                                >
                                  Delete
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          </Group>
                        </Group>
                      </Card>
                    ))}
                  </Stack>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <Group justify="center" mt="md">
                      <Pagination
                        value={currentPage}
                        onChange={setCurrentPage}
                        total={totalPages}
                      />
                    </Group>
                  )}
                </Card>
              </Grid.Col>
            </Grid>
          </>
        ) : null}
      </Stack>

      {/* Entry Modal */}
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

            <Divider label="Wellness Tracking" labelPosition="center" />
            
            {/* Daily Habits - Checkboxes */}
            <Stack gap="xs">
              <Text size="sm" fw={500}>Daily Habits</Text>
              <Grid>
                <Grid.Col span={6}>
                  <Checkbox
                    label="💪 Exercise"
                    checked={form.values.metadata.did_exercise || false}
                    onChange={(event) => 
                      form.setFieldValue('metadata.did_exercise', event.currentTarget.checked)
                    }
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <Checkbox
                    label="🧘 Meditation"
                    checked={form.values.metadata.did_meditation || false}
                    onChange={(event) => 
                      form.setFieldValue('metadata.did_meditation', event.currentTarget.checked)
                    }
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <Checkbox
                    label="👥 Social Interaction"
                    checked={form.values.metadata.social_interaction || false}
                    onChange={(event) => 
                      form.setFieldValue('metadata.social_interaction', event.currentTarget.checked)
                    }
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <Checkbox
                    label="🙏 Gratitude Practice"
                    checked={form.values.metadata.gratitude_practice || false}
                    onChange={(event) => 
                      form.setFieldValue('metadata.gratitude_practice', event.currentTarget.checked)
                    }
                  />
                </Grid.Col>
              </Grid>
            </Stack>

            {/* Time Tracking - Number Inputs */}
            <Stack gap="xs">
              <Text size="sm" fw={500}>Time & Activities</Text>
              <Grid>
                <Grid.Col span={6}>
                  <NumberInput
                    label="😴 Sleep Duration"
                    placeholder="Hours"
                    min={0}
                    max={24}
                    step={0.5}
                    value={form.values.metadata.sleep_duration || 8}
                    onChange={(value) => 
                      form.setFieldValue('metadata.sleep_duration', Number(value) || 8)
                    }
                    suffix=" hrs"
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <NumberInput
                    label="📱 Screen Time"
                    placeholder="Hours"
                    min={0}
                    max={24}
                    step={0.5}
                    value={form.values.metadata.screen_time || 0}
                    onChange={(value) => 
                      form.setFieldValue('metadata.screen_time', Number(value) || 0)
                    }
                    suffix=" hrs"
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <NumberInput
                    label="🌿 Time Outside"
                    placeholder="Minutes"
                    min={0}
                    max={1440}
                    step={15}
                    value={form.values.metadata.time_outside || 0}
                    onChange={(value) => 
                      form.setFieldValue('metadata.time_outside', Number(value) || 0)
                    }
                    suffix=" min"
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <NumberInput
                    label="📚 Reading Time"
                    placeholder="Minutes"
                    min={0}
                    max={1440}
                    step={5}
                    value={form.values.metadata.reading_time || 0}
                    onChange={(value) => 
                      form.setFieldValue('metadata.reading_time', Number(value) || 0)
                    }
                    suffix=" min"
                  />
                </Grid.Col>
              </Grid>
            </Stack>

            {/* Health Metrics */}
            <Stack gap="xs">
              <Text size="sm" fw={500}>Health & Wellness</Text>
              <Grid>
                <Grid.Col span={6}>
                  <NumberInput
                    label="💧 Water Intake"
                    placeholder="Glasses"
                    min={0}
                    max={20}
                    step={1}
                    value={form.values.metadata.water_intake || 8}
                    onChange={(value) => 
                      form.setFieldValue('metadata.water_intake', Number(value) || 8)
                    }
                    suffix=" glasses"
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <Stack gap={4}>
                    <Text size="sm">⚡ Energy Level</Text>
                    <Group>
                      <Rating
                        value={form.values.metadata.energy_level || 3}
                        onChange={(value) => 
                          form.setFieldValue('metadata.energy_level', value)
                        }
                        color="yellow"
                      />
                      <Text size="xs" c="dimmed">
                        {form.values.metadata.energy_level || 3}/5
                      </Text>
                    </Group>
                  </Stack>
                </Grid.Col>
              </Grid>
              <Grid>
                <Grid.Col span={6}>
                  <Stack gap={4}>
                    <Text size="sm">😰 Stress Level</Text>
                    <Group>
                      <Rating
                        value={form.values.metadata.stress_level || 3}
                        onChange={(value) => 
                          form.setFieldValue('metadata.stress_level', value)
                        }
                        color="red"
                      />
                      <Text size="xs" c="dimmed">
                        {form.values.metadata.stress_level || 3}/5
                      </Text>
                    </Group>
                  </Stack>
                </Grid.Col>
              </Grid>
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