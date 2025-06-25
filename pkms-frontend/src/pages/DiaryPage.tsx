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
  Select
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
import { isSameDay } from 'date-fns';

export function DiaryPage() {
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [encryptionModalOpen, setEncryptionModalOpen] = useState(false);
  const [encryptionPassword, setEncryptionPassword] = useState('');
  const [isEditingEntry, setIsEditingEntry] = useState(false);

  // Entry form state
  const [entryForm, setEntryForm] = useState({
    title: '',
    content: '',
    mood: 3,
    weather: ''
  });

  // Store state
  const {
    entries,
    currentEntry,
    calendarData,
    moodStats,
    isLoading,
    isCreating,
    isEncryptionSetup,
    error,
    currentYear,
    currentMonth,
    currentMood,
    loadEntries,
    loadEntryByDate,
    createEntry,
    updateEntry,
    deleteEntry,
    loadCalendarData,
    loadMoodStats,
    setupEncryption,
    encryptContent,
    decryptContent,
    setYear,
    setMonth,
    setMood,
    clearError,
    clearCurrentEntry
  } = useDiaryStore();

  // Load data on mount
  useEffect(() => {
    if (isEncryptionSetup) {
      loadEntries();
      loadCalendarData(new Date().getFullYear(), new Date().getMonth() + 1);
      loadMoodStats();
    }
  }, [isEncryptionSetup]);

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
    
    const success = await setupEncryption(encryptionPassword);
    if (success) {
      setEncryptionModalOpen(false);
      setEncryptionPassword('');
    }
  };

  const handleCreateEntry = async () => {
    if (!entryForm.content.trim()) return;
    
    const dateStr = selectedDate.toISOString().split('T')[0];
    
    // Encrypt content
    const encryptedTitle = entryForm.title ? await encryptContent(entryForm.title) : null;
    const encryptedContent = await encryptContent(entryForm.content);
    
    if (!encryptedContent) return;
    
    const entryData = {
      date: dateStr,
      title_encrypted: encryptedTitle?.content,
      content_encrypted: encryptedContent.content,
      mood: entryForm.mood,
      weather: entryForm.weather || undefined,
      encryption_iv: encryptedContent.iv,
      encryption_tag: encryptedContent.tag
    };
    
    const success = await createEntry(entryData);
    if (success) {
      setEntryModalOpen(false);
      resetEntryForm();
    }
  };

  const handleDeleteEntry = async (date: string, title?: string) => {
    const displayTitle = title || `Entry for ${new Date(date).toLocaleDateString()}`;
    if (window.confirm(`Are you sure you want to delete "${displayTitle}"?`)) {
      await deleteEntry(date);
    }
  };

  const handleViewEntry = async (date: string) => {
    await loadEntryByDate(date);
    if (currentEntry) {
      // Decrypt content for viewing
      const decryptedContent = await decryptContent({
        content: currentEntry.content_encrypted,
        iv: currentEntry.encryption_iv,
        tag: currentEntry.encryption_tag
      });
      
      let decryptedTitle = '';
      if (currentEntry.title_encrypted) {
        decryptedTitle = await decryptContent({
          content: currentEntry.title_encrypted,
          iv: currentEntry.encryption_iv,
          tag: currentEntry.encryption_tag
        }) || '';
      }
      
      if (decryptedContent) {
        setEntryForm({
          title: decryptedTitle,
          content: decryptedContent,
          mood: currentEntry.mood || 3,
          weather: currentEntry.weather || ''
        });
        setIsEditingEntry(true);
        setEntryModalOpen(true);
      }
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

  // Show encryption setup if not configured
  if (!isEncryptionSetup) {
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
            
            <TextInput
              label="Encryption Password"
              type="password"
              placeholder="Enter a strong password"
              value={encryptionPassword}
              onChange={(e) => setEncryptionPassword(e.currentTarget.value)}
              required
            />
            
            <Group justify="flex-end">
              <Button
                variant="subtle"
                onClick={() => setEncryptionModalOpen(false)}
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
              
              <Calendar
                getDayProps={(date) => ({
                  selected: isSameDay(date, selectedDate),
                  onClick: () => setSelectedDate(date),
                })}
                size="sm"
                renderDay={(date) => {
                  const dateStr = date.toISOString().split('T')[0];
                  const dayData = calendarData.find(d => d.date === dateStr);
                  
                  return (
                    <div style={{ position: 'relative' }}>
                      <span>{date.getDate()}</span>
                      {dayData?.has_entry && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: dayData.mood ? getMoodColor(dayData.mood) : 'gray'
                          }}
                        />
                      )}
                    </div>
                  );
                }}
              />
            </Paper>

            {/* Mood Filter */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Mood Filter</Text>
                <IconMoodSmile size={16} />
              </Group>
              
              <Stack gap="xs">
                <Button
                  variant={!currentMood ? 'filled' : 'subtle'}
                  size="xs"
                  justify="space-between"
                  fullWidth
                  onClick={() => setMood(null)}
                >
                  <span>All Moods</span>
                  <Badge size="xs" variant="light">{entries.length}</Badge>
                </Button>
                
                {[1, 2, 3, 4, 5].map((mood) => (
                  <Button
                    key={mood}
                    variant={currentMood === mood ? 'filled' : 'subtle'}
                    size="xs"
                    justify="space-between"
                    fullWidth
                    onClick={() => setMood(mood)}
                  >
                    <Group gap="xs">
                      <span>{getMoodEmoji(mood)}</span>
                      <span>{mood === 1 ? 'Very Bad' : mood === 2 ? 'Bad' : mood === 3 ? 'Neutral' : mood === 4 ? 'Good' : 'Excellent'}</span>
                    </Group>
                    <Badge size="xs" variant="light">
                      {entries.filter(e => e.mood === mood).length}
                    </Badge>
                  </Button>
                ))}
              </Stack>
            </Paper>

            {/* Stats */}
            {moodStats && (
              <Paper p="md" withBorder>
                <Text fw={600} size="sm" mb="xs">Mood Statistics</Text>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm">Total Entries</Text>
                    <Badge variant="light">{moodStats.total_entries}</Badge>
                  </Group>
                  {moodStats.average_mood && (
                    <Group justify="space-between">
                      <Text size="sm">Average Mood</Text>
                      <Badge variant="light" color={getMoodColor(Math.round(moodStats.average_mood))}>
                        {moodStats.average_mood.toFixed(1)}
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
            {error && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                title="Error"
                color="red"
                variant="light"
                withCloseButton
                onClose={clearError}
              >
                {error}
              </Alert>
            )}

            {/* Loading State */}
            {isLoading && (
              <Stack gap="md">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} height={150} radius="md" />
                ))}
              </Stack>
            )}

            {/* Entries List */}
            {!isLoading && entries.length > 0 && (
              <Stack gap="md">
                {entries.map((entry) => (
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
            {!isLoading && entries.length === 0 && (
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
          clearCurrentEntry();
        }}
        title={isEditingEntry ? 'Edit Diary Entry' : 'New Diary Entry'}
        size="lg"
      >
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
                { value: 'stormy', label: '⛈️ Stormy' },
                { value: 'windy', label: '💨 Windy' }
              ]}
              value={entryForm.weather}
              onChange={(value) => setEntryForm({ ...entryForm, weather: value || '' })}
            />
          </Group>
          
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => {
                setEntryModalOpen(false);
                resetEntryForm();
                clearCurrentEntry();
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateEntry}
              loading={isCreating}
              disabled={!entryForm.content.trim()}
            >
              {isEditingEntry ? 'Update' : 'Save'} Entry
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
} 