/**
 * DiaryMainTab - Main diary interface with calendar, entries, and quick actions
 * 
 * PURPOSE:
 * ========
 * Provides the core diary functionality including calendar view, entry creation,
 * historical entries, and quick actions for diary management.
 * 
 * FEATURES:
 * =========
 * - Interactive calendar with mood/media indicators
 * - Quick actions (New Entry, Lock/Unlock, Encryption Status)
 * - Daily metrics panel
 * - Historical entries shortcuts
 * - Recent entries list
 * - Password lock/unlock functionality
 * - Responsive design
 * 
 * @author AI Agent: Claude Sonnet 4.5
 * @date 2025-10-29
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthenticatedEffect } from '../../hooks/useAuthenticatedEffect';
import { useDiaryStore } from '../../stores/diaryStore';
import {
  Container,
  Grid,
  Card,
  Title,
  Text,
  Group,
  Stack,
  Button,
  ActionIcon,
  Alert,
  Paper,
  Modal,
  Textarea,
  Rating,
  Center,
  Pagination,
  PasswordInput,
  Loader,
  TagsInput,
  Select,
  Checkbox,
  Divider,
  Accordion,
  SimpleGrid,
  ScrollArea,
  Tooltip,
  Badge,
  FileInput,
  Tabs,
  Drawer,
  useMantineTheme,
  useMantineColorScheme,
} from '@mantine/core';
import { Calendar } from '@mantine/dates';
import {
  IconBook,
  IconPlus,
  IconTrash,
  IconDots,
  IconAlertTriangle,
  IconLock,
  IconEye,
  IconSearch,
  IconCalendar,
  IconHistory,
  IconMoodHappy,
  IconMoodSad,
  IconPhoto,
  IconMicrophone,
  IconX,
  IconCheck,
  IconRefresh,
} from '@tabler/icons-react';
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import { format, parseISO, isToday, isYesterday, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { notifications } from '@mantine/notifications';

// Import components
import EncryptionStatus from './EncryptionStatus';
import { HistoricalEntries } from './HistoricalEntries';
import { DiaryEntryModal } from './DiaryEntryModal';

// Import services
import { diaryService } from '../../services/diaryService';
import { searchService } from '../../services/searchService';

// Import types
import {
  DiaryEntrySummary,
  DiaryFormValues,
  DiaryDailyMetrics,
  SortField,
  SortOrder,
  DiaryEntryCreatePayload,
  WEATHER_CODES,
  WeatherCode,
  DiaryDailyMetadata,
} from '../../types/diary';

// Import utilities
import { formatDateTime, convertToNepaliDate } from '../../utils/diary';

// Utility functions
const getDiaryIcon = (entry: any): string => {
  const mood = entry.mood || 3;
  if (mood >= 4.5) return '😄';
  if (mood >= 3.5) return '😊';
  if (mood >= 2.5) return '😐';
  if (mood >= 1.5) return '😔';
  return '😢';
};

const getWeatherLabel = (code?: WeatherCode | null) => {
  if (code === undefined || code === null) return undefined;
  const mapping = WEATHER_CODES.find((item) => item.value === code);
  return mapping?.label;
};

export const DiaryMainTab = React.memo(function DiaryMainTab() {
  const navigate = useNavigate();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const {
    entries,
    loading,
    error,
    encryptionKey,
    isLocked,
    lockDiary,
    unlockDiary,
    loadEntries,
    createEntry,
    deleteEntry,
    calendarData,
    setOnDiaryPage,
  } = useDiaryStore();

  // State
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [mobileDrawerOpened, setMobileDrawerOpened] = useState(false);
  const [showAllEntries, setShowAllEntries] = useState(false);

  // Track when user is on diary page
  useEffect(() => {
    setOnDiaryPage(true);
    return () => setOnDiaryPage(false);
  }, [setOnDiaryPage]);

  // Load entries on mount
  useAuthenticatedEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Filter and sort entries
  const filteredEntries = useMemo(() => {
    let filtered = entries;

    // Filter by selected date (unless showing all entries)
    if (!showAllEntries) {
      const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
      filtered = filtered.filter((entry) => {
        const entryDateStr = format(parseISO(entry.date), 'yyyy-MM-dd');
        return entryDateStr === selectedDateStr;
      });
    }

    if (debouncedSearchQuery) {
      filtered = filtered.filter((entry) =>
        entry.title?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        entry.content?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        entry.tags?.some(tag => tag.toLowerCase().includes(debouncedSearchQuery.toLowerCase()))
      );
    }

    return filtered.sort((a, b) => {
      const aValue = a[sortField] || '';
      const bValue = b[sortField] || '';
      
      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  }, [entries, selectedDate, showAllEntries, debouncedSearchQuery, sortField, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  const paginatedEntries = filteredEntries.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Calendar data for indicators
  const calendarEntries = useMemo(() => {
    const entryMap = new Map();
    entries.forEach(entry => {
      const date = format(parseISO(entry.date), 'yyyy-MM-dd');
      entryMap.set(date, entry);
    });
    return entryMap;
  }, [entries]);

  // Calendar day renderer
  const renderDay = useCallback((date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const entry = calendarEntries.get(dateStr);
    const isSelectedDate = format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
    
    if (!entry) {
      // Show selected date indicator even if no entry
      if (isSelectedDate) {
        return (
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            height: '100%',
            backgroundColor: theme.colors.blue[1],
            borderRadius: '4px'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: 2, 
              right: 2, 
              fontSize: '8px',
              color: theme.colors.blue[6]
            }}>
              📅
            </div>
          </div>
        );
      }
      return null;
    }

    const isTodayDate = isToday(date);
    const mood = entry.mood || 3;
    const hasMedia = entry.mediaCount && entry.mediaCount > 0;
    const isLocked = !encryptionKey;

    return (
      <div style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%',
        backgroundColor: isSelectedDate ? theme.colors.blue[1] : 'transparent',
        borderRadius: '4px'
      }}>
        <div style={{ 
          position: 'absolute', 
          top: 2, 
          right: 2, 
          fontSize: '10px',
          color: isTodayDate ? theme.colors.blue[6] : theme.colors.gray[6]
        }}>
          {getDiaryIcon(entry)}
        </div>
        {hasMedia && (
          <div style={{ 
            position: 'absolute', 
            bottom: 2, 
            left: 2, 
            fontSize: '8px',
            color: theme.colors.green[6]
          }}>
            📎
          </div>
        )}
        {isLocked && (
          <div style={{ 
            position: 'absolute', 
            bottom: 2, 
            right: 2, 
            fontSize: '8px',
            color: theme.colors.red[6]
          }}>
            🔒
          </div>
        )}
      </div>
    );
  }, [calendarEntries, selectedDate, encryptionKey, theme.colors]);

  // Handle password unlock
  const handleUnlock = async () => {
    if (!password.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Please enter a password',
        color: 'red'
      });
      return;
    }

    setIsUnlocking(true);
    try {
      await unlockDiary(password);
      setShowPasswordModal(false);
      setPassword('');
      notifications.show({
        title: 'Success',
        message: 'Diary unlocked successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Invalid password. Please try again.',
        color: 'red'
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  // Handle lock
  const handleLock = async () => {
    try {
      await lockDiary();
      notifications.show({
        title: 'Success',
        message: 'Diary locked successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to lock diary',
        color: 'red'
      });
    }
  };

  // Handle new entry
  const handleNewEntry = () => {
    setShowEntryModal(true);
  };

  // Handle entry creation
  const handleEntryCreated = () => {
    setShowEntryModal(false);
    loadEntries();
  };

  // Handle entry delete
  const handleDeleteEntry = async (entryId: string) => {
    try {
      await deleteEntry(entryId);
      notifications.show({
        title: 'Success',
        message: 'Entry deleted successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete entry',
        color: 'red'
      });
    }
  };

  // Historical shortcuts
  const historicalShortcuts = [
    { label: 'Today', date: new Date() },
    { label: 'Yesterday', date: subDays(new Date(), 1) },
    { label: 'This Week', date: startOfWeek(new Date()) },
    { label: 'Last Week', date: startOfWeek(subDays(new Date(), 7)) },
  ];

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setShowAllEntries(false); // Switch to date-specific view
  };

  if (loading) {
    return (
      <Container size="xl" py="md">
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl" py="md">
        <Alert color="red" title="Error" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Group gap="md">
            {isMobile && (
              <ActionIcon
                variant="light"
                size="lg"
                onClick={() => setMobileDrawerOpened(true)}
              >
                <IconCalendar size={20} />
              </ActionIcon>
            )}
            <Text size="xl" fw={700} c="blue">
              📖 My Diary
            </Text>
            <EncryptionStatus />
          </Group>
          <Group gap="sm">
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={handleNewEntry}
              disabled={isLocked}
              size={isMobile ? "sm" : "md"}
            >
              {isMobile ? "New" : "New Entry"}
            </Button>
            {isLocked ? (
              <Button
                variant="light"
                leftSection={<IconLock size={16} />}
                onClick={() => setShowPasswordModal(true)}
                size={isMobile ? "sm" : "md"}
              >
                {isMobile ? "Unlock" : "Unlock"}
              </Button>
            ) : (
              <Button
                variant="light"
                leftSection={<IconLock size={16} />}
                onClick={handleLock}
                size={isMobile ? "sm" : "md"}
              >
                {isMobile ? "Lock" : "Lock"}
              </Button>
            )}
          </Group>
        </Group>

        {/* Mobile Drawer for Sidebar */}
        <Drawer
          opened={mobileDrawerOpened}
          onClose={() => setMobileDrawerOpened(false)}
          title="Diary Tools"
          size="sm"
          position="left"
        >
          <Stack gap="md">
            {/* Calendar */}
            <Card withBorder p="md">
              <Group justify="space-between" mb="md">
                <Text fw={600} size="lg">
                  <IconCalendar size={20} style={{ marginRight: 8 }} />
                  Calendar
                </Text>
              </Group>
              <Calendar
                value={selectedDate}
                onChange={handleDateSelect}
                renderDay={renderDay}
                size="sm"
              />
            </Card>

  
            {/* Historical Shortcuts */}
            <Card withBorder p="md">
              <Text fw={600} size="lg" mb="md">
                <IconHistory size={20} style={{ marginRight: 8 }} />
                Quick Access
              </Text>
              <Stack gap="xs">
                {historicalShortcuts.map((shortcut) => (
                  <Button
                    key={shortcut.label}
                    variant="light"
                    size="sm"
                    justify="flex-start"
                    onClick={() => {
                      handleDateSelect(shortcut.date);
                      setMobileDrawerOpened(false);
                    }}
                  >
                    {shortcut.label}
                  </Button>
                ))}
              </Stack>
            </Card>
          </Stack>
        </Drawer>

        <Grid>
          {/* Left Sidebar - Calendar & Quick Actions (Desktop) */}
          {!isMobile && (
            <Grid.Col span={4}>
              <Stack gap="md">
                {/* Calendar */}
                <Card withBorder p="md">
                  <Group justify="space-between" mb="md">
                    <Text fw={600} size="lg">
                      <IconCalendar size={20} style={{ marginRight: 8 }} />
                      Calendar
                    </Text>
                  </Group>
                  <Calendar
                    value={selectedDate}
                    onChange={handleDateSelect}
                    renderDay={renderDay}
                    size="sm"
                  />
                </Card>

  
                {/* Historical Shortcuts */}
                <Card withBorder p="md">
                  <Text fw={600} size="lg" mb="md">
                    <IconHistory size={20} style={{ marginRight: 8 }} />
                    Quick Access
                  </Text>
                  <Stack gap="xs">
                    {historicalShortcuts.map((shortcut) => (
                      <Button
                        key={shortcut.label}
                        variant="light"
                        size="sm"
                        justify="flex-start"
                        onClick={() => handleDateSelect(shortcut.date)}
                      >
                        {shortcut.label}
                      </Button>
                    ))}
                  </Stack>
                </Card>
              </Stack>
            </Grid.Col>
          )}

          {/* Main Content - Entries List */}
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap="md">
              {/* Search and Filters */}
              <Card withBorder p="md">
                <Group justify="space-between" mb="md">
                  <Group gap="md">
                    <Text fw={600} size="lg">
                      <IconBook size={20} style={{ marginRight: 8 }} />
                      Entries
                    </Text>
                    <Text c="dimmed" size="sm">
                      {showAllEntries ? 'All entries' : `Entries for ${format(selectedDate, 'MMM dd, yyyy')}`}
                    </Text>
                  </Group>
                  <Group gap="sm">
                    <Button
                      variant={showAllEntries ? "filled" : "light"}
                      size="sm"
                      onClick={() => setShowAllEntries(!showAllEntries)}
                    >
                      {showAllEntries ? 'Show Today' : 'Show All'}
                    </Button>
                    <Button
                      variant="light"
                      size="sm"
                      leftSection={<IconRefresh size={16} />}
                      onClick={() => loadEntries()}
                    >
                      Refresh
                    </Button>
                  </Group>
                </Group>
                
                <Group gap="md" mb="md">
                  <TextInput
                    placeholder="Search entries..."
                    leftSection={<IconSearch size={16} />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <Select
                    placeholder="Sort by"
                    value={sortField}
                    onChange={(value) => setSortField(value as SortField)}
                    data={[
                      { value: 'createdAt', label: 'Date' },
                      { value: 'title', label: 'Title' },
                      { value: 'mood', label: 'Mood' },
                    ]}
                    style={{ width: 120 }}
                  />
                  <Select
                    placeholder="Order"
                    value={sortOrder}
                    onChange={(value) => setSortOrder(value as SortOrder)}
                    data={[
                      { value: 'asc', label: 'Ascending' },
                      { value: 'desc', label: 'Descending' },
                    ]}
                    style={{ width: 120 }}
                  />
                </Group>
              </Card>

              {/* Entries List */}
              {paginatedEntries.length === 0 ? (
                <Card withBorder p="xl">
                  <Center>
                    <Stack align="center" gap="md">
                      <IconBook size={48} color={theme.colors.gray[4]} />
                      <Text c="dimmed" size="lg">
                        {searchQuery 
                          ? 'No entries found matching your search' 
                          : showAllEntries 
                            ? 'No diary entries yet' 
                            : `No entries for ${format(selectedDate, 'MMM dd, yyyy')}`
                        }
                      </Text>
                      {!searchQuery && (
                        <Button
                          leftSection={<IconPlus size={16} />}
                          onClick={handleNewEntry}
                          disabled={isLocked}
                        >
                          {showAllEntries ? 'Create your first entry' : `Create entry for ${format(selectedDate, 'MMM dd, yyyy')}`}
                        </Button>
                      )}
                    </Stack>
                  </Center>
                </Card>
              ) : (
                <Stack gap="sm">
                  {paginatedEntries.map((entry) => (
                    <Card key={entry.uuid} withBorder p="md" style={{ cursor: 'pointer' }}>
                      <Group justify="space-between" align="flex-start">
                        <Stack gap="xs" style={{ flex: 1 }}>
                          <Group gap="sm">
                            <Text fw={600} size="lg">
                              {entry.title || 'Untitled Entry'}
                            </Text>
                            <Badge size="sm" color="blue">
                              {getDiaryIcon(entry)}
                            </Badge>
                            {entry.weatherCode && (
                              <Badge size="sm" color="cyan">
                                {getWeatherLabel(entry.weatherCode)}
                              </Badge>
                            )}
                          </Group>
                          <Text c="dimmed" size="sm">
                            {formatDateTime(entry.createdAt)}
                          </Text>
                          {entry.content && (
                            <Text size="sm" lineClamp={2}>
                              {entry.content}
                            </Text>
                          )}
                          {entry.tags && entry.tags.length > 0 && (
                            <Group gap="xs">
                              {entry.tags.map((tag, index) => (
                                <Badge key={index} size="xs" variant="light">
                                  {tag}
                                </Badge>
                              ))}
                            </Group>
                          )}
                        </Stack>
                        <ActionIcon
                          variant="light"
                          color="red"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEntry(entry.uuid);
                          }}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Card>
                  ))}
                </Stack>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <Center>
                  <Pagination
                    value={currentPage}
                    onChange={setCurrentPage}
                    total={totalPages}
                  />
                </Center>
              )}
            </Stack>
          </Grid.Col>
        </Grid>

        {/* Password Modal */}
        <Modal
          opened={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          title="Unlock Diary"
          centered
        >
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Enter your diary password to unlock and view your entries.
            </Text>
            <PasswordInput
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={() => setShowPasswordModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleUnlock} loading={isUnlocking}>
                Unlock
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Entry Creation Modal */}
        <DiaryEntryModal
          opened={showEntryModal}
          onClose={() => setShowEntryModal(false)}
          initialDate={selectedDate}
        />
      </Stack>
    </Container>
  );
});

export default DiaryMainTab;
