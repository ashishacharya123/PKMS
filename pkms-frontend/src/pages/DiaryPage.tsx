import { useEffect, useState } from 'react';
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
  Center
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
  IconDownload
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useDiaryStore } from '../stores/diaryStore';
import { diaryService } from '../services/diaryService';
import { isSameDay, format, parse } from 'date-fns';
import { notifications } from '@mantine/notifications';
import type { NotificationData } from '@mantine/notifications';
import type { DiaryEntry } from '../services/diaryService';
import axios from 'axios';

const showNotification = (data: NotificationData) => {
  notifications.show(data);
};

export function DiaryPage() {
  const store = useDiaryStore();
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [encryptionModalOpen, setEncryptionModalOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState('');
  const [showPasswordHint, setShowPasswordHint] = useState(false);
  const [isEditingEntry, setIsEditingEntry] = useState(false);
  const [viewingEntry, setViewingEntry] = useState<{
    date: string;
    title: string;
    content: string;
    mood?: number;
    weather?: string;
  } | null>(null);
  const [entryForm, setEntryForm] = useState<{
    title: string;
    content: string;
    mood: number;
    weather: string;
  }>({
    title: '',
    content: '',
    mood: 3,
    weather: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view');

  // Initialize and handle unlock status
  useEffect(() => {
    store.init();
    // Try to get password hint from localStorage
    try {
      const hint = localStorage.getItem('pkms-diary-hint');
      setPasswordHint(hint || '');
    } catch (e) {
      console.error("Could not access localStorage", e);
      setPasswordHint('');
    }
  }, [store.init]);

  useEffect(() => {
    if (store.isEncryptionSetup && !store.isUnlocked) {
      setUnlockModalOpen(true);
    } else {
      setUnlockModalOpen(false);
      setEncryptionPassword('');
      setShowPasswordHint(false);
    }
  }, [store.isEncryptionSetup, store.isUnlocked]);

  // Load data on mount
  useEffect(() => {
    if (store.isUnlocked) {
      store.loadEntries();
      store.loadCalendarData();
      store.loadMoodStats();
    }
  }, [store.isUnlocked]);

  useEffect(() => {
    if (store.isEncryptionSetup && store.isUnlocked) {
      store.loadCalendarData();
    }
  }, [store.isEncryptionSetup, store.isUnlocked, store.currentYear, store.currentMonth]);

  const resetEntryForm = () => {
    setEntryForm({
      title: '',
      content: '',
      mood: 3,
      weather: ''
    });
    setIsEditingEntry(false);
  };

  const handleSetupEncryption = async () => {
    if (!encryptionPassword.trim()) return;
    
    try {
      console.log('Setting up encryption...');
      // Only pass hint if it's not empty
      const success = await store.setupEncryption(
        encryptionPassword, 
        passwordHint.trim() || undefined
      );
      console.log('Encryption setup result:', success);
      
      if (success) {
        showNotification({
          title: 'Success',
          message: 'Diary encryption has been set up successfully.',
          color: 'green'
        });
        setEncryptionModalOpen(false);
        setEncryptionPassword('');
        setPasswordHint('');
        // Force reload entries after setup
        await store.loadEntries();
      }
    } catch (error) {
      console.error('Error setting up encryption:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to setup encryption';
      showNotification({
        title: 'Error',
        message: errorMessage,
        color: 'red'
      });
    }
  };

  const handleUnlockSession = async () => {
    if (!encryptionPassword.trim()) return;

    try {
      console.log('Attempting to unlock session...');
      const success = await store.unlockSession(encryptionPassword);
      console.log('Unlock session result:', success);
      
      if (success) {
        showNotification({
          title: 'Success',
          message: 'Diary unlocked successfully.',
          color: 'green'
        });
        setUnlockModalOpen(false);
        setEncryptionPassword('');
        setShowPasswordHint(false);
      }
    } catch (error) {
      console.error('Error unlocking session:', error);
      showNotification({
        title: 'Error',
        message: 'Failed to unlock diary. Please check your password.',
        color: 'red'
      });
    }
  };

  const handleViewEntry = async (dateStr: string) => {
    try {
        setLoading(true);
        setError(null);
        
        // Parse the date string into a Date object
        const selectedDate = parse(dateStr, 'yyyy-MM-dd', new Date());
        console.log('[DEBUG] Viewing entry for date:', format(selectedDate, 'yyyy-MM-dd'));
        
        const entry = await diaryService.getEntryByDate(selectedDate);
        console.log('[DEBUG] Retrieved entry:', entry);
        
        if (entry) {
            // Decrypt unified entry blob (JSON with title + content)
            const decryptedJson = await store.decryptContent({
              content: entry.content_encrypted,
              iv: entry.encryption_iv,
              tag: entry.encryption_tag
            });

            if (!decryptedJson) {
              throw new Error('Failed to decrypt diary entry');
            }

            let parsed: { title?: string; content: string };
            try {
              parsed = JSON.parse(decryptedJson);
            } catch (jsonErr) {
              // Fallback for *very* old entries that stored raw content only
              parsed = { title: '', content: decryptedJson } as any;
            }

            setViewingEntry({
              ...entry,
              title: parsed.title || '',
              content: parsed.content
            });
            
            // Open the entry modal in read-only "view" mode so the user can read
            // the decrypted entry.  They can switch to "edit" inside the modal.
            setIsEditingEntry(false);
            setViewMode('view');
            setEntryModalOpen(true);
        }
    } catch (error) {
        console.error('[DEBUG] Error in handleViewEntry:', error);
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            setError('No entry found for this date. Would you like to create one?');
            resetEntryForm();
            setViewMode('edit');
        } else {
            setError('Failed to load diary entry. Please try again.');
        }
    } finally {
        setLoading(false);
    }
  };

  const handleCreateEntry = async () => {
    if (!entryForm.content.trim()) {
      showNotification({
        title: 'Error',
        message: 'Entry content cannot be empty',
        color: 'red'
      });
      return;
    }
    
    try {
      // Use local calendar date (yyyy-MM-dd) instead of UTC ISO string to avoid timezone shift
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      
      /*
       * 🔐 NEW SIMPLIFIED ENCRYPTION PIPELINE (#56)
       * -----------------------------------------------------------
       * We now encrypt the *entire* entry (title + content) in a single
       * AES-GCM operation.  The plaintext is a tiny JSON blob so even long
       * entries remain small after encryption.
       */

      const plaintext = JSON.stringify({
        title: entryForm.title.trim(),
        content: entryForm.content
      });

      const encryptedEntry = await store.encryptContent(plaintext);

      if (!encryptedEntry) {
        showNotification({
          title: 'Error',
          message: 'Failed to encrypt diary entry',
          color: 'red'
        });
        return;
      }

      const entryData = {
        date: dateStr,
        content_encrypted: encryptedEntry.content,
        mood: entryForm.mood,
        weather: entryForm.weather.trim() || undefined,
        encryption_iv: encryptedEntry.iv,
        encryption_tag: encryptedEntry.tag
      };
      
      const success = await store.createEntry(entryData);
      if (success) {
        showNotification({
          title: 'Success',
          message: 'Entry created successfully',
          color: 'green'
        });
        setEntryModalOpen(false);
        resetEntryForm();
      }
    } catch (error) {
      console.error('Error creating entry:', error);
      showNotification({
        title: 'Error',
        message: 'Failed to create entry. Please try again.',
        color: 'red'
      });
    }
  };

  const handleDeleteEntry = async (date: string, title?: string) => {
    const displayTitle = title || `Entry for ${new Date(date).toLocaleDateString()}`;
    if (window.confirm(`Are you sure you want to delete "${displayTitle}"?`)) {
      await store.deleteEntry(date);
    }
  };

  const getMoodEmoji = (mood: number) => {
    const emojis = { 1: '😢', 2: '😞', 3: '😐', 4: '😊', 5: '😄' };
    return emojis[mood as keyof typeof emojis] || '😐';
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

  // Show encryption setup if not configured
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

        {/* Encryption Setup Modal */}
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
            {/* Unlock Session Modal */}
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
                        store.clearEncryption();
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
        {/* Sidebar */}
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Stack gap="md">
            {/* New Entry Button */}
            <Button
              leftSection={<IconPlus size={16} />}
              size="md"
              onClick={() => {
                resetEntryForm();
                setEntryModalOpen(true);
              }}
              fullWidth
            >
              New Entry
            </Button>

            {/* Calendar */}
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
                    setSelectedDate(newDate);
                  }}
                  label="Select Date"
                  size="sm"
                />
                <Button
                  variant="light"
                  size="sm"
                  mt="md"
                  fullWidth
                  onClick={() => handleViewEntry(format(selectedDate, 'yyyy-MM-dd'))}
                >
                  View Entry for {format(selectedDate, 'MMM dd, yyyy')}
                </Button>
              </Paper>
            </Paper>

            {/* Mood Filter */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Mood Filter</Text>
                <IconMoodSmile size={16} />
              </Group>
              
              <Stack gap="xs">
                <Button
                  variant={!store.currentMood ? 'filled' : 'subtle'}
                  size="xs"
                  justify="space-between"
                  fullWidth
                  onClick={() => store.setMood(null)}
                >
                  <span>All Moods</span>
                  <Badge size="xs" variant="light">{store.entries.length}</Badge>
                </Button>
                
                {[1, 2, 3, 4, 5].map((mood) => (
                  <Button
                    key={mood}
                    variant={store.currentMood === mood ? 'filled' : 'subtle'}
                    size="xs"
                    justify="space-between"
                    fullWidth
                    onClick={() => store.setMood(mood)}
                  >
                    <Group gap="xs">
                      <span>{getMoodEmoji(mood)}</span>
                      <span>{mood === 1 ? 'Very Bad' : mood === 2 ? 'Bad' : mood === 3 ? 'Neutral' : mood === 4 ? 'Good' : 'Excellent'}</span>
                    </Group>
                    <Badge size="xs" variant="light">
                      {store.entries.filter(e => e.mood === mood).length}
                    </Badge>
                  </Button>
                ))}
              </Stack>
            </Paper>

            {/* Stats */}
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

        {/* Main Content */}
        <Grid.Col span={{ base: 12, md: 9 }}>
          <Stack gap="md">
            {/* Header */}
            <Group justify="space-between" align="center">
              <div>
                <Title order={2}>Diary</Title>
                <Text c="dimmed">
                  Your private encrypted journal
                </Text>
              </div>
            </Group>

            {/* Error Alert */}
            {store.error && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                title="Error"
                color="red"
                variant="light"
                withCloseButton
                onClose={store.clearError}
              >
                {store.error}
              </Alert>
            )}

            {/* Loading State */}
            {store.isLoading && (
              <Stack gap="md">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} height={150} radius="md" />
                ))}
              </Stack>
            )}

            {/* Entries List */}
            {!store.isLoading && store.entries.length > 0 && (
              <Stack gap="md">
                {store.entries.map((entry) => (
                  <Card 
                    key={entry.id}
                    shadow="sm" 
                    padding="md" 
                    radius="md" 
                    withBorder
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleViewEntry(entry.date)}
                  >
                    <Group justify="space-between" align="flex-start">
                      <div style={{ flex: 1 }}>
                        <Group gap="xs" mb="xs">
                          <Text fw={600}>{formatDate(entry.date)}</Text>
                          {entry.mood && (
                            <Badge variant="light" color={getMoodColor(entry.mood)} size="sm">
                              {getMoodEmoji(entry.mood)} {entry.mood}/5
                            </Badge>
                          )}
                          {entry.weather && (
                            <Badge variant="outline" size="sm">
                              {getWeatherEmoji(entry.weather)} {entry.weather}
                            </Badge>
                          )}
                          {entry.media_count > 0 && (
                            <Badge variant="dot" size="sm">
                              {entry.media_count} media
                            </Badge>
                          )}
                        </Group>
                        
                        <Text size="sm" c="dimmed">
                          Encrypted entry • Click to view
                        </Text>
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
                              handleViewEntry(entry.date);
                            }}
                          >
                            View/Edit
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item 
                            leftSection={<IconTrash size={14} />}
                            color="red"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEntry(entry.date);
                            }}
                          >
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}

            {/* Empty State */}
            {!store.isLoading && store.entries.length === 0 && (
              <Paper p="xl" radius="md" style={{ textAlign: 'center' }}>
                <ThemeIcon size="xl" variant="light" color="purple" mx="auto" mb="md">
                  <IconBook size={32} />
                </ThemeIcon>
                <Title order={3} mb="xs">No diary entries yet</Title>
                <Text c="dimmed" mb="lg">
                  Start writing your first encrypted diary entry
                </Text>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={() => setEntryModalOpen(true)}
                >
                  Write First Entry
                </Button>
              </Paper>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      {/* Entry Modal */}
      <Modal
        opened={entryModalOpen}
        onClose={() => {
          setEntryModalOpen(false);
          resetEntryForm();
          setViewingEntry(null);
          store.clearCurrentEntry();
        }}
        title={viewMode === 'view' ? 'View Diary Entry' : isEditingEntry ? 'Edit Diary Entry' : 'New Diary Entry'}
        size="lg"
      >
        {viewMode === 'view' && viewingEntry && (
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
                  Mood: {getMoodEmoji(viewingEntry.mood)} {viewingEntry.mood}/5
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
                  // Switch to edit mode with current entry pre-filled
                  setEntryForm({
                    title: viewingEntry.title,
                    content: viewingEntry.content,
                    mood: viewingEntry.mood ?? 3,
                    weather: viewingEntry.weather ?? ''
                  });
                  setIsEditingEntry(true);
                  setViewMode('edit');
                }}
              >
                Edit Entry
              </Button>
            </Group>
          </Stack>
        )}

        {viewMode === 'edit' && (
          <Stack gap="md">
            <Group>
              <Text fw={500}>Date: {selectedDate.toLocaleDateString()}</Text>
            </Group>
            
            <TextInput
              label="Title (optional)"
              placeholder="Entry title"
              value={entryForm.title}
              onChange={(e) => setEntryForm({ ...entryForm, title: e.currentTarget.value })}
            />
            
            <Textarea
              label="Content"
              placeholder="Write your thoughts..."
              value={entryForm.content}
              onChange={(e) => setEntryForm({ ...entryForm, content: e.currentTarget.value })}
              minRows={8}
              required
            />
            
            <Group grow>
              <div>
                <Text size="sm" mb="xs" fw={500}>Mood</Text>
                <Rating
                  value={entryForm.mood}
                  onChange={(value) => setEntryForm({ ...entryForm, mood: value })}
                  emptySymbol="😐"
                  fullSymbol={getMoodEmoji(entryForm.mood)}
                  count={5}
                />
              </div>
              
              <Select
                label="Weather"
                placeholder="Select weather"
                data={[
                  { value: 'sunny', label: '☀️ Sunny' },
                  { value: 'cloudy', label: '☁️ Cloudy' },
                  { value: 'rainy', label: '🌧️ Rainy' },
                  { value: 'snowy', label: '❄️ Snowy' },
                  { value: 'stormy', label: '⛈️ Stormy' }
                ]}
                value={entryForm.weather}
                onChange={(value) => setEntryForm({ ...entryForm, weather: value || '' })}
              />
            </Group>

            {/* Action buttons */}
            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={() => {
                  setEntryModalOpen(false);
                  resetEntryForm();
                  setViewingEntry(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateEntry}
                disabled={!entryForm.content.trim()}
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