import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';

// TODO: Add audio recording and uploading functionality to diary
// The diary already supports multiple media types (images, documents, etc.)
// Audio recording/uploading can be added as another media type
// This will allow users to record voice notes and attach them to diary entries
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
  ActionIcon,
  Menu,
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
  Tabs
} from '@mantine/core';
import ViewMenu, { ViewMode } from '../components/common/ViewMenu';
import ViewModeLayouts, { formatDate } from '../components/common/ViewModeLayouts';
import { useViewPreferences } from '../hooks/useViewPreferences';
import { Calendar } from '@mantine/dates';
import {
  IconBook,
  IconPlus,
  IconTrash,
  IconDots,
  IconAlertTriangle,
  IconLock,
  IconEye,
  IconSearch
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useDiaryStore } from '../stores/diaryStore';
import { useAuthStore } from '../stores/authStore';
import { diaryService } from '../services/diaryService';
import { searchService } from '../services/searchService';
import { format, parseISO } from 'date-fns';
import { notifications } from '@mantine/notifications';
import { WellnessAnalytics } from '../components/diary/WellnessAnalytics';
import { WeeklyHighlightsPanel } from '../components/diary/WeeklyHighlightsPanel';
import EncryptionStatus from '../components/diary/EncryptionStatus';
import { AdvancedDiarySearch } from '../components/diary/AdvancedDiarySearch';
import DiarySearch from '../components/diary/DiarySearch';
import { KeyboardShortcutsHelp, KeyboardShortcutsButton } from '../components/diary/KeyboardShortcutsHelp';
import { DailyMetricsPanel } from '../components/diary/DailyMetricsPanel';
import { HistoricalEntries } from '../components/diary/HistoricalEntries';
import { HabitTracker } from '../components/diary/HabitTracker';
import { HabitAnalytics } from '../components/diary/HabitAnalytics';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

import { useForm } from '@mantine/form';
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
} from '../types/diary';
import { formatDateTime, convertToNepaliDate } from '../utils/diary';
import '../styles/DiaryPage.css';

// Utility functions for diary entries
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

const formatSummarySubtitle = (entry: DiaryEntrySummary) => {
  const parts: string[] = [];
  if (entry.mood) {
    const moodLabelFor = (m: number) => ({ 1: 'Very Low', 2: 'Low', 3: 'Neutral', 4: 'Good', 5: 'Excellent' }[m] || 'Unknown');
    parts.push(moodLabelFor(entry.mood));
  }
  if (entry.nepali_date) {
    parts.push(`NP ${entry.nepali_date}`);
  }
  if (entry.location) {
    parts.push(entry.location);
  }
  if (entry.weather_code !== undefined && entry.weather_code !== null) {
    const label = entry.weather_label || getWeatherLabel(entry.weather_code);
    if (label) parts.push(label);
  }
  if (entry.media_count > 0) {
    parts.push(`${entry.media_count} media`);
  }
  if (entry.content_length) {
    parts.push(`${entry.content_length} chars`);
  }
  return parts.join(' • ');
};

const initialDailyMetrics: DiaryDailyMetrics = {
  // Physical Activity
  did_exercise: false,
  exercise_minutes: 0,
  time_outside: 0,
  
  // Sleep
  sleep_duration: 8,
  
  // Mental Wellness
  did_meditation: false,
  energy_level: 3,
  stress_level: 3,
  gratitude_practice: false,
  
  // Daily Habits
  water_intake: 8,
  screen_time: 0,
  reading_time: 0,
  social_interaction: false,
  
  custom_fields: {}
};

const initialFormValues: DiaryFormValues = {
  uuid: null,
  date: new Date(),
  title: '',
  content: '',
  mood: 3,
  daily_metrics: initialDailyMetrics,
  tags: [],
  is_template: false,
  template_uuid: null,
  weather_code: undefined,
  location: '',
  nepali_date: undefined,
  from_template_id: null,
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
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [templateEntries, setTemplateEntries] = useState<DiaryEntrySummary[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [searchMode, setSearchMode] = useState<'filter' | 'search'>('filter');

  const [viewMode, setViewMode] = useState<'view' | 'edit'>('view');
  const { getPreference, updatePreference } = useViewPreferences();
  const [layoutMode, setLayoutMode] = useState<ViewMode>(getPreference('diary'));
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField] = useState<SortField>('date');
  const [sortOrder] = useState<SortOrder>('desc');
  const itemsPerPage = 12;

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Inline media preview (photos)
  const [mediaPreview, setMediaPreview] = useState<{ url: string; name: string } | null>(null);

  // Photo upload state (in-place inside entry modal)
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string>('');
  // const [isDailyMetadataLoading, setIsDailyMetadataLoading] = useState(false); // Unused
  // const [hasMissingSnapshot, setHasMissingSnapshot] = useState(false); // Unused
  const [wellnessHasMissing, setWellnessHasMissing] = useState(true);
  const [wellnessIsLoading, setWellnessIsLoading] = useState(false);

  const form = useForm<DiaryFormValues>({
    initialValues: initialFormValues,
    validate: {
      title: (value) => {
        if (!value || value.trim().length === 0) return 'Title is required';
        // SECURITY: Basic validation to prevent script injection
        if (value.includes('<script') || value.includes('javascript:')) return 'Invalid characters in title';
        return null;
      },
      content: (value) => {
        if (!value || value.trim().length === 0) return 'Content cannot be empty';
        // SECURITY: Basic validation to prevent script injection
        if (value.includes('<script') || value.includes('javascript:')) return 'Invalid characters in content';
        return null;
      },
    },
  });

  // Use debounced search directly from store
  const [debouncedTitleSearch] = useDebouncedValue(store.searchQuery, 500);

  const { isAuthenticated } = useAuthStore();

  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize store on mount
  useAuthenticatedEffect(() => {
    if (!hasInitialized) {
      store.init().then(() => setHasInitialized(true));
    }
  }, [hasInitialized]);

  // Load entries only when authenticated and diary is unlocked
  useEffect(() => {
    if (isAuthenticated && store.isUnlocked) {
      store.loadEntries();
    }
  }, [isAuthenticated, store.isUnlocked, debouncedTitleSearch]);

  // Load templates only after unlock (kept separate from main entries list)
  useAuthenticatedEffect(() => {
    const fetchTemplates = async () => {
      try {
        const list = await diaryService.getEntries({ templates: true, limit: 100, offset: 0 });
        setTemplateEntries(list || []);
      } catch (e) {
        console.error('Failed to load templates', e);
      }
    };
    if (store.isUnlocked) fetchTemplates();
  }, [store.isUnlocked]);



  // Load calendar data when year/month changes and diary is unlocked
  useEffect(() => {
    if (isAuthenticated && store.isUnlocked) {
      store.loadCalendarData(store.currentYear, store.currentMonth);
    }
  }, [isAuthenticated, store.currentYear, store.currentMonth, store.isUnlocked]);

  // Load mood stats when diary is unlocked and moodStats has not been loaded yet
  useAuthenticatedEffect(() => {
    if (store.isUnlocked && !store.moodStats) {
      store.loadMoodStats();
    }
  }, [store.isUnlocked]);

  // Revoke media object URL on unmount/change
  useEffect(() => {
    return () => {
      if (mediaPreview?.url) {
        try { URL.revokeObjectURL(mediaPreview.url); } catch {}
      }
    };
  }, [mediaPreview]);

  // Show unlock modal if encryption is setup but not unlocked, and after initial load
  useEffect(() => {
    if (hasInitialized && store.isEncryptionSetup && !store.isUnlocked) {
      setUnlockModalOpen(true);
    } else {
      setUnlockModalOpen(false);
    }
  }, [hasInitialized, store.isEncryptionSetup, store.isUnlocked]);

  // Monitor diary error state and show notifications for session expiration
  useEffect(() => {
    if (store.error && store.error.includes('session expired')) {
      notifications.show({
        title: 'Diary Session Expired',
        message: 'Your diary session has expired. Please unlock again to continue.',
        color: 'orange',
        autoClose: 5000,
      });
    }
  }, [store.error]);

  // Cleanup diary monitoring on unmount
  useEffect(() => {
    return () => {
      store.stopUnlockStatusMonitoring();
    };
  }, [store]);

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
        store.encryptionKey
      );
      
      form.setValues({
        uuid: entry.uuid,
        date: parseISO(entry.date),
        title: entry.title || '',
        content: decryptedContent,
        mood: entry.mood || 3,
        daily_metrics: {
          ...initialDailyMetrics,
          ...entry.daily_metrics,
        },
        tags: entry.tags || [],
        is_template: entry.is_template ?? false,
        template_uuid: entry.from_template_id || null,
        weather_code: entry.weather_code,
        location: entry.location || '',
        nepali_date: entry.nepali_date,
        from_template_id: entry.from_template_id || null,
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

  const handleTagSearch = async (query: string) => {
    if (query.length < 1) {
      setTagSuggestions([]);
      return;
    }
    
    try {
      const tags = await searchService.getTagAutocomplete(query, 'diary');
      setTagSuggestions(tags.map(tag => tag.name));
    } catch (error) {
      console.error('Failed to fetch tag suggestions:', error);
      setTagSuggestions([]);
    }
  };

  // Function to load daily wellness metadata for a specific date
  // Used when creating/editing diary entries to pre-populate wellness data
  const ensureDailyMetadata = useCallback(
    async (targetDate: Date): Promise<DiaryDailyMetadata | null> => {
      const key = format(targetDate, 'yyyy-MM-dd');
      const cached = store.dailyMetadataCache[key];
      if (cached) {
        return cached;
      }
      try {
        const snapshot = await diaryService.getDailyMetadata(key);
        store.setDailyMetadata(snapshot);
        return snapshot;
      } catch (error: any) {
        if (error?.response?.status === 404) {
          return null;
        }
        console.error('Failed to load daily metadata', error);
        notifications.show({
          title: 'Metadata Error',
          message: 'Could not load daily wellness data.',
          color: 'red',
        });
        return null;
      }
    },
    [store],
  );
  
  // Export for potential future use in daily metrics panel
  useEffect(() => {
    // ensureDailyMetadata is available for use when needed
    void ensureDailyMetadata;
  }, [ensureDailyMetadata]);

  const handleCreateOrUpdateEntry = async (values: DiaryFormValues) => {
    if (!store.encryptionKey) {
      notifications.show({
        title: 'Diary Locked',
        message: 'Unlock diary to create or update entries.',
        color: 'red',
      });
      return;
    }
    
    try {
      const { encrypted_blob, iv } = await diaryService.encryptContent(values.content, store.encryptionKey);
      
      const payload: DiaryEntryCreatePayload = {
        date: format(values.date, 'yyyy-MM-dd'),
        title: values.title,
        encrypted_blob,
        encryption_iv: iv,
        mood: values.mood,
        weather_code: values.weather_code,
        location: values.location,
        daily_metrics: values.daily_metrics,
        tags: values.tags,
        is_template: values.is_template,
        nepali_date: values.nepali_date || convertToNepaliDate(values.date),
        content_length: values.content.length,
        from_template_id: values.from_template_id,
      };
      
      if (values.uuid) {
        await store.updateEntry(values.uuid, payload);
        notifications.show({
          title: 'Entry Updated',
          message: 'Diary entry updated successfully',
          color: 'green',
        });
      } else {
        await store.createEntry(payload);
        notifications.show({
          title: 'Entry Created',
          message: 'Diary entry created successfully',
          color: 'green',
        });
      }
      
      setModalOpen(false);
      form.reset();

      // Refresh data
      store.loadEntries();
      store.loadCalendarData(store.currentYear, store.currentMonth);
    } catch (error: any) {
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

  const handleUploadPhoto = async () => {
    try {
      if (!photoFile) return;
      if (!store.isUnlocked) {
        notifications.show({ title: 'Locked', message: 'Unlock diary first', color: 'red' });
        return;
      }
      if (!form.values.uuid) {
        notifications.show({ title: 'Save Required', message: 'Save the entry before attaching photos', color: 'blue' });
        return;
      }
      setIsUploadingPhoto(true);
      setPhotoStatus('Uploading...');
      const full = await diaryService.getEntry(form.values.uuid);
      await diaryService.uploadMedia(full.uuid, photoFile, 'photo', undefined, (p) => setPhotoStatus(p.status));
      setPhotoFile(null);
      setPhotoStatus('Complete');
      notifications.show({ title: 'Photo Uploaded', message: 'Image attached to entry', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Upload failed', message: 'Could not upload image', color: 'red' });
    } finally {
      setIsUploadingPhoto(false);
      setTimeout(() => setPhotoStatus(''), 1200);
    }
  };

  const handleInsertPhotoIntoContent = () => {
    // After upload, user can insert a placeholder indicating where the photo belongs.
    // For security, we reference the downloadable endpoint only after upload; here we provide a simple marker.
    if (!form.values.uuid) {
      notifications.show({ title: 'Save Required', message: 'Save the entry before inserting photo reference', color: 'blue' });
      return;
    }
    setTimeout(() => {
      setPhotoStatus('');
    }, 200);
    const marker = '\n\n![photo](attached via Media)\n';
    form.setFieldValue('content', (form.values.content || '') + marker);
    notifications.show({ title: 'Inserted', message: 'Photo reference added to content', color: 'green' });
  };

  // Helper to preview a photo media for a given entry (by entry id and media object)
  // Reserved for future: per-entry media strip with photo click -> inline modal.

  useEffect(() => {
    if (unlockModalOpen && !passwordHint) {
      loadPasswordHint();
    }
  }, [unlockModalOpen]);

  // Keyboard shortcuts
  const shortcuts = [
    {
      key: 'n',
      ctrl: true,
      action: () => {
        if (store.isUnlocked) {
          form.reset();
          setViewMode('edit');
          setModalOpen(true);
        }
      },
      description: 'Create new diary entry',
      category: 'Entry Management'
    },
    {
      key: 'f',
      ctrl: true,
      action: () => {
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      },
      description: 'Focus search bar',
      category: 'Navigation'
    },
    {
      key: 'l',
      ctrl: true,
      action: () => {
        if (store.isUnlocked) {
          store.lockSession();
          notifications.show({
            title: 'Diary Locked',
            message: 'Your diary has been locked',
            color: 'blue',
          });
        }
      },
      description: 'Lock diary',
      category: 'Security'
    },
    {
      key: 'u',
      ctrl: true,
      action: () => {
        if (!store.isUnlocked) {
          setUnlockModalOpen(true);
        }
      },
      description: 'Unlock diary',
      category: 'Security'
    },
    {
      key: 'Escape',
      action: () => {
        if (modalOpen) setModalOpen(false);
        if (unlockModalOpen) setUnlockModalOpen(false);
        if (deleteConfirmModalOpen) setDeleteConfirmModalOpen(false);
      },
      description: 'Close modals',
      category: 'General'
    },
    {
      key: '?',
      ctrl: true,
      action: () => setShowKeyboardShortcuts(true),
      description: 'Show keyboard shortcuts',
      category: 'Help'
    }
  ];

  useKeyboardShortcuts({
    shortcuts,
    enabled: isAuthenticated,
    showNotifications: false
  });

  // Auto-lock diary when leaving the page for more than 5 minutes
  useEffect(() => {
    let lockTimer: number | null = null;

    // Schedule lock timer if diary is currently unlocked
    if (store.isUnlocked) {
      console.log('[DIARY PAGE] User left diary page, will lock after 5 minutes of inactivity...');
      
      // Set a timer to lock after 5 minutes
      lockTimer = setTimeout(() => {
        console.log('[DIARY PAGE] 5 minutes elapsed, locking diary session...');
        store.lockSession();
      }, 5 * 60 * 1000) as unknown as number; // 5 minutes
    }

    return () => {
      // This runs when component unmounts (user navigates away from diary page)
      // Cancel any pending timer first (in case of re-entry)
      if (lockTimer !== null) {
        clearTimeout(lockTimer);
      }
    };
  }, [store.isUnlocked]); // Re-run when lock status changes

  // For weather/location
  // Removed unused loadSnapshotToForm function - it called non-existent store.loadDailySnapshot
  // and incorrectly tried to load weather_code/location from daily metrics
  // (weather and location are entry-specific, not from daily snapshot)

  // Memoized callback for wellness status changes
  const handleWellnessStatusChange = useCallback((hasMissing: boolean, isLoading: boolean) => {
    setWellnessHasMissing(hasMissing);
    setWellnessIsLoading(isLoading);
  }, []);

  return (
    <Container size="xl" py="lg">
      {/* Auto-lock: Diary locks 5 minutes after navigating away from this page (see useEffect cleanup) */}
      
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
            <KeyboardShortcutsButton onOpenHelp={() => setShowKeyboardShortcuts(true)} />
            {store.isUnlocked && (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={async () => {
                  form.reset();
                  // Use selected calendar date by default when creating a new entry
                  form.setFieldValue('date', selectedDate);
                  // Preload daily metadata (e.g., nepali_date)
                  try {
                    const iso = format(selectedDate, 'yyyy-MM-dd');
                    const snapshot = await diaryService.getDailyMetadata(iso);
                    if (snapshot?.nepali_date) {
                      form.setFieldValue('nepali_date', snapshot.nepali_date);
                    }
                  } catch {}
                  setViewMode('edit');
                  setModalOpen(true);
                }}
                aria-label="Create new diary entry (Ctrl+N)"
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
        ) : !store.isUnlocked ? (
          <Alert color="blue" title="Diary Locked" icon={<IconLock size={16} />}>
            <Text>Your diary is encrypted and locked. Please unlock it to view your entries.</Text>
            <Button mt="md" onClick={() => setUnlockModalOpen(true)}>
              Unlock Diary
            </Button>
          </Alert>
        ) : store.error ? (
          <Alert color="red" title="Error" icon={<IconAlertTriangle size={16} />}>
            {store.error}
          </Alert>
        ) : store.isUnlocked ? (
          <>
            {/* Analytics & Tracking Sections - Only one can be open at a time */}
            <Accordion variant="contained" defaultValue="" multiple={false}>
              <Accordion.Item value="weekly-highlights">
                <Accordion.Control>
                  <Text fw={600} size="md">🌟 Weekly Highlights (Weekends)</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <WeeklyHighlightsPanel />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Habit Tracking */}
              <Accordion.Item value="habit-tracker">
                <Accordion.Control>
                  <Text fw={600} size="md">🎯 Habit Tracker</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <HabitTracker
                    selectedDate={selectedDate}
                    onStatusChange={(hasChanges, isLoading) => {
                      // Handle habit tracker status changes if needed
                      console.log('Habit tracker status:', { hasChanges, isLoading });
                    }}
                  />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Habit Analytics */}
              <Accordion.Item value="habit-analytics">
                <Accordion.Control>
                  <Text fw={600} size="md">📈 Habit Analytics</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <HabitAnalytics />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Wellness Analytics */}
              <Accordion.Item value="wellness-analytics">
                <Accordion.Control>
                  <Text fw={600} size="md">📊 Wellness Analytics</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <WellnessAnalytics />
                </Accordion.Panel>
              </Accordion.Item>

              {/* Daily Wellness Tracker */}
              <Accordion.Item value="wellness">
                <Accordion.Control>
                  <div>
                    <Group gap="xs">
                      <Text fw={600} size="md">💪 Daily Wellness Tracker</Text>
                      {wellnessIsLoading ? (
                        <Loader size="xs" />
                      ) : wellnessHasMissing ? (
                        <Badge color="yellow" size="sm" variant="light">No Metadata for Today</Badge>
                      ) : (
                        <Badge color="green" size="sm" variant="light">✓ Tracked</Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      Today: {format(new Date(), 'MMMM d, yyyy')}
                    </Text>
                  </div>
                </Accordion.Control>
                <Accordion.Panel>
                  <DailyMetricsPanel
                    onStatusChange={handleWellnessStatusChange}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
            
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
                  {/* Header with ViewMenu */}
                  <Group justify="space-between" align="center">
                    <div>
                      <Title order={3}>Diary Entries</Title>
                      <Text c="dimmed" size="sm">
                        {paginatedEntries.length} {paginatedEntries.length === 1 ? 'entry' : 'entries'}
                      </Text>
                    </div>
                    <ViewMenu 
                      currentView={layoutMode}
                      onChange={(mode) => {
                        setLayoutMode(mode);
                        updatePreference('diary', mode);
                      }}
                      disabled={!store.isUnlocked}
                    />
                  </Group>
                  
                  {/* Search Component */}
                  <Tabs value={searchMode} onChange={(value) => setSearchMode(value as 'filter' | 'search')}>
                    <Tabs.List>
                      <Tabs.Tab value="filter" leftSection={<IconSearch size={16} />}>
                        Filter Entries
                      </Tabs.Tab>
                      <Tabs.Tab value="search" leftSection={<IconSearch size={16} />}>
                        Cross-Module Search
                      </Tabs.Tab>
                    </Tabs.List>
                    
                    <Tabs.Panel value="filter" pt="sm">
                      <AdvancedDiarySearch />
                    </Tabs.Panel>
                    
                    <Tabs.Panel value="search" pt="sm">
                      <DiarySearch onEntrySelect={(entryUuid) => {
                        // Navigate to diary entry
                        const entry = store.entries.find(e => e.uuid === entryUuid);
                        if (entry) {
                          // You could implement navigation to the specific entry here
                          notifications.show({
                            title: 'Entry Found',
                            message: `Found diary entry: ${entry.title || 'Untitled'}`,
                            color: 'blue'
                          });
                        }
                      }} />
                    </Tabs.Panel>
                  </Tabs>

                  {/* Optional media strip per entry (photos only) when available */}

                  <ViewModeLayouts
                    items={paginatedEntries.map(entry => ({...entry, id: entry.uuid})) as any[]}
                    viewMode={layoutMode}
                    isLoading={store.isLoading}
                    emptyMessage="No diary entries found. Create your first entry to get started."
                    onItemClick={(entry: any) => {
                      handleViewEntry(entry);
                    }}
                    renderSmallIcon={(entry: any) => (
                      <Stack gap={2} align="center">
                        <Group justify="flex-end" w="100%" gap={4} style={{ opacity: 0.9 }}>
                          <Menu shadow="md" width={200}>
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray" size="sm" onClick={(e) => e.stopPropagation()}>
                                <IconDots size={14} />
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
                                View/Edit
                              </Menu.Item>
                              <Menu.Item 
                                leftSection={<IconTrash size={14} />}
                                color="red"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(entry.uuid);
                                }}
                              >
                                Delete
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                        <Text size="lg">{getDiaryIcon(entry)}</Text>
                        <Group gap={2}>
                          <Badge size="xs" variant="light" color={getMoodColor(entry.mood || 3)}>
                            {getMoodLabel(entry.mood || 3).charAt(0)}
                          </Badge>
                          {entry.weather_code !== undefined && entry.weather_code !== null && (
                            <Text size="xs">{getWeatherLabel(entry.weather_code) || 'Weather'}</Text>
                          )}
                        </Group>
                      </Stack>
                    )}
                    renderMediumIcon={(entry: any) => (
                      <Stack gap="xs" align="center">
                        <Group justify="flex-end" w="100%" gap={4} style={{ opacity: 0.9 }}>
                          <Menu shadow="md" width={200}>
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray" size="sm" onClick={(e) => e.stopPropagation()}>
                                <IconDots size={14} />
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
                                View/Edit
                              </Menu.Item>
                              <Menu.Item 
                                leftSection={<IconTrash size={14} />}
                                color="red"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(entry.uuid);
                                }}
                              >
                                Delete
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                        <Text size="xl">{getDiaryIcon(entry)}</Text>
                        <Group gap={4}>
                          <Badge size="xs" variant="light" color={getMoodColor(entry.mood || 3)}>
                            {getMoodLabel(entry.mood || 3)}
                          </Badge>
                          <Badge size="xs" variant="outline" color="gray">
                            {formatSummarySubtitle(entry) || 'No details'}
                          </Badge>
                          {entry.media_count > 0 && (
                            <Badge size="xs" variant="outline" color="teal">📷 {entry.media_count}</Badge>
                          )}
                        </Group>
                        <Group gap={6}>
                          {entry.nepali_date && (
                            <Badge size="xs" variant="light" color="grape">NP {entry.nepali_date}</Badge>
                          )}
                          {entry.location && (
                            <Badge size="xs" variant="light" color="indigo">📍 {entry.location}</Badge>
                          )}
                          {entry.weather_code !== undefined && entry.weather_code !== null && (
                            <Badge size="xs" variant="light" color="cyan">{getWeatherLabel(entry.weather_code) || 'Weather'}</Badge>
                          )}
                          {entry.is_favorite && (
                            <Badge size="xs" variant="light" color="pink">Favorite</Badge>
                          )}
                        </Group>
                      </Stack>
                    )}
                    renderListItem={(entry: any) => (
                      <Group justify="space-between">
                        <Group gap="md">
                          <Paper 
                            bg={getMoodColor(entry.mood || 3)} 
                            p="xs" 
                            radius="sm"
                            style={{ minWidth: 60 }}
                          >
                            <Stack align="center" gap={2}>
                              <Text size="xs" c="white" fw={500}>
                                {formatDateForCard(entry.date).month}
                              </Text>
                              <Text size="sm" c="white" fw={700}>
                                {formatDateForCard(entry.date).day}
                              </Text>
                            </Stack>
                          </Paper>
                          <Stack gap={2}>
                            <Group gap="xs">
                              <Text 
                                fw={600} 
                                size="sm" 
                                style={{ cursor: 'pointer', color: '#228be6' }}
                                onClick={() => handleViewEntry(entry)}
                              >
                                {entry.title || 'Untitled Entry'}
                              </Text>
                              {entry.is_favorite && (
                                <Badge size="xs" variant="light" color="pink">Favorite</Badge>
                              )}
                            </Group>
                            <Group gap="xs">
                              <Badge size="xs" variant="light" color={getMoodColor(entry.mood || 3)}>
                                {getMoodEmoji(entry.mood || 3)} {getMoodLabel(entry.mood || 3)}
                              </Badge>
                              {entry.weather_code !== undefined && entry.weather_code !== null ? (
                                <Badge size="xs" variant="outline">
                                  {getWeatherLabel(entry.weather_code) || 'Weather'}
                              </Badge>
                              ) : (
                                <Text size="xs" c="dimmed">No weather</Text>
                              )}
                              <Badge size="xs" variant="outline" color="gray">
                                {formatSummarySubtitle(entry)}
                              </Badge>
                              <Text size="xs" c="dimmed">
                                {formatDateTime(entry.updated_at)}
                              </Text>
                              {(entry.tags || []).slice(0, 2).map((tag: string) => (
                                <Badge key={tag} size="xs" variant="dot">
                                  {tag}
                                </Badge>
                              ))}
                              {(entry.tags?.length || 0) > 2 && (
                                <Badge size="xs" variant="outline">+{(entry.tags?.length || 0) - 2}</Badge>
                              )}
                            </Group>
                          </Stack>
                        </Group>
                        <Menu shadow="md" width={200}>
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" onClick={(e) => e.stopPropagation()}>
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
                              View/Edit
                            </Menu.Item>
                            <Menu.Item 
                              leftSection={<IconTrash size={14} />}
                              color="red"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(entry.uuid);
                              }}
                            >
                              Delete
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Group>
                    )}
                    renderDetailColumns={(entry: any) => [
                      <Group key="title" gap="xs">
                        <Paper 
                          bg={getMoodColor(entry.mood || 3)} 
                          p={4} 
                          radius="sm"
                          style={{ minWidth: 40 }}
                        >
                          <Text size="xs" c="white" fw={700} ta="center">
                            {formatDateForCard(entry.date).day}
                          </Text>
                        </Paper>
                        <Text 
                          fw={500} 
                          size="sm" 
                          style={{ cursor: 'pointer', color: '#228be6' }}
                          onClick={() => handleViewEntry(entry)}
                        >
                          {entry.title || 'Untitled Entry'}
                        </Text>
                      </Group>,
                      <Group key="mood" gap="xs">
                        <Badge size="xs" variant="light" color={getMoodColor(entry.mood || 3)}>
                          {getMoodEmoji(entry.mood || 3)} {getMoodLabel(entry.mood || 3)}
                        </Badge>
                      </Group>,
                      <Group key="weather" gap="xs">
                        {entry.weather_code !== undefined && entry.weather_code !== null ? (
                          <Badge size="xs" variant="outline">
                            {getWeatherLabel(entry.weather_code) || 'Weather'}
                          </Badge>
                        ) : (
                          <Text size="xs" c="dimmed">No weather</Text>
                        )}
                      </Group>,
                      <Group key="summary" gap="xs">
                        <Badge size="xs" variant="outline" color="gray">
                          {formatSummarySubtitle(entry) || 'No details'}
                        </Badge>
                      </Group>,
                      <Group key="tags" gap={4}>
                        {(entry.tags || []).slice(0, 3).map((tag: string) => (
                          <Badge key={tag} size="xs" variant="dot">
                            {tag}
                          </Badge>
                        ))}
                        {(entry.tags?.length || 0) > 3 && (
                          <Tooltip label={`${(entry.tags?.length || 0) - 3} more tags`}>
                            <Badge size="xs" variant="outline">+{(entry.tags?.length || 0) - 3}</Badge>
                          </Tooltip>
                        )}
                      </Group>,
                      <Text key="date" size="xs" c="dimmed">
                        {formatDate(entry.date)}
                      </Text>,
                      <Text key="updated" size="xs" c="dimmed">
                        {formatDateTime(entry.updated_at)}
                      </Text>,
                      <Menu key="actions" shadow="md" width={200}>
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" size="sm" onClick={(e) => e.stopPropagation()}>
                            <IconDots size={14} />
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
                            View/Edit
                          </Menu.Item>
                          <Menu.Item 
                            leftSection={<IconTrash size={14} />}
                            color="red"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(entry.uuid);
                            }}
                          >
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    ]}
                    detailHeaders={[
                      'Entry', 
                      'Mood', 
                      'Weather', 
                      'Word Count', 
                      'Tags', 
                      'Date', 
                      'Updated', 
                      'Actions'
                    ]}
                  />
                  
                  {totalPages > 1 && (
                    <Group justify="center" mt="md">
                      <Pagination
                        total={totalPages}
                        value={currentPage}
                        onChange={setCurrentPage}
                        aria-label="Diary entries pagination"
                      />
                    </Group>
                  )}
                </Stack>
              </Grid.Col>
            </Grid>

            {/* Historical Entries - Shows entries from past (yesterday, last week, last month, last year) */}
            <HistoricalEntries onViewEntry={handleViewEntry} selectedDate={selectedDate} />
          </>
        ) : null}
      </Stack>

      {/* Media Preview Modal (photos) */}
      <Modal
        opened={!!mediaPreview}
        onClose={() => {
          if (mediaPreview?.url) {
            try { URL.revokeObjectURL(mediaPreview.url); } catch {}
          }
          setMediaPreview(null);
        }}
        title={mediaPreview?.name || 'Photo'}
        size="auto"
        centered
        overlayProps={{ opacity: 0.55, blur: 3 }}
      >
        {mediaPreview && (
          <div style={{ maxWidth: '90vw', maxHeight: '80vh' }}>
            <img
              src={mediaPreview.url.startsWith('blob:') || mediaPreview.url.startsWith('data:') ? mediaPreview.url : '#'}
              alt={mediaPreview.name}
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }}
              onError={(e) => {
                // SECURITY: Prevent loading of invalid URLs
                (e.target as HTMLImageElement).src = '#';
              }}
            />
          </div>
        )}
      </Modal>

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
        title={
          <Group justify="space-between" wrap="nowrap">
            <Text fw={600}>{viewMode === 'view' ? 'View Entry' : 'Edit Entry'}</Text>
            <Text size="sm" c="dimmed">
              Entry date: {format(form.values.date, 'yyyy-MM-dd')}
            </Text>
          </Group>
        }
        size="90%"
        centered
        scrollAreaComponent={ScrollArea.Autosize}
      >
        <form onSubmit={form.onSubmit(handleCreateOrUpdateEntry)}>
          <Stack>
            {/* Basic Entry Information */}
            <Stack>
              <Title order={4}>Basic Information</Title>
              <Group grow>
                <Select
                  label="Start from template"
                  placeholder="Blank (default)"
                  data={templateEntries.map((e) => ({ value: e.uuid, label: e.title || 'Untitled template' }))}
                  value={form.values.template_uuid}
                  onChange={async (value) => {
                    form.setFieldValue('template_uuid', value);
                    if (value && store.encryptionKey) {
                      const tmpl = templateEntries.find((e) => e.uuid === value);
                      if (tmpl) {
                        try {
                          const decrypted = await diaryService.decryptContent(
                            tmpl.encrypted_blob,
                            tmpl.encryption_iv,
                            store.encryptionKey
                          );
                          // Only replace content and optionally title
                          form.setFieldValue('content', decrypted);
                          if (!form.values.title) {
                            form.setFieldValue('title', tmpl.title || '');
                          }
                        } catch (err) {
                          console.error('Failed to load template', err);
                          notifications.show({ title: 'Template error', message: 'Failed to load template', color: 'red' });
                        }
                      }
                    }
                  }}
                  clearable
                  searchable
                  nothingFoundMessage="No templates"
                  description="Optional: pre-fill from a saved template"
                />
                <Checkbox
                  mt={24}
                  label="Save as template"
                  checked={!!form.values.is_template}
                  onChange={(e) => form.setFieldValue('is_template', e.currentTarget.checked)}
                />
              </Group>
              <TextInput
                label="Title"
                placeholder="Enter a title for your entry"
                {...form.getInputProps('title')}
              />
              <Calendar
                getDayProps={(date) => ({
                  selected: format(date, 'yyyy-MM-dd') === format(form.values.date, 'yyyy-MM-dd'),
                  onClick: async () => {
                    const next = date;
                    form.setFieldValue('date', next);
                    setSelectedDate(next);
                    try {
                      const iso = format(next, 'yyyy-MM-dd');
                      const metadata = await diaryService.getDailyMetadata(iso);
                      if (metadata && metadata.nepali_date) {
                        form.setFieldValue('nepali_date', metadata.nepali_date);
                      }
                    } catch {}
                  }
                })}
              />
              <Textarea
                label="Content"
                placeholder="Write your diary entry..."
                minRows={15}
                autosize
                {...form.getInputProps('content')}
              />
              <Card withBorder>
                <Title order={5} mb="xs">Photos</Title>
                <Stack gap="xs">
                  <FileInput
                    label="Add Photo"
                    placeholder="Choose an image to upload"
                    value={photoFile}
                    onChange={setPhotoFile}
                    accept="image/*"
                    clearable
                  />
                  <Group justify="flex-end">
                    <Button size="xs" onClick={handleUploadPhoto} loading={isUploadingPhoto} disabled={!photoFile}>
                      Upload Photo
                    </Button>
                    <Button size="xs" variant="subtle" onClick={handleInsertPhotoIntoContent}>
                      Insert into Content
                    </Button>
                  </Group>
                  {photoStatus && (
                    <Text size="xs" c="dimmed">{photoStatus}</Text>
                  )}
                </Stack>
              </Card>
              
              <TagsInput
                label="Tags"
                placeholder="Type to search and add tags"
                value={form.values.tags}
                onChange={(value) => form.setFieldValue('tags', value)}
                data={tagSuggestions}
                clearable
                onSearchChange={handleTagSearch}
                splitChars={[',', ' ']}
                description="Organize your entries with tags for easy searching and filtering. Start typing to see suggestions."
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
            </Stack>

            <Divider />

            {/* Weather & Location - Quick Entry Metadata */}
            <Stack gap="sm">
              <Text size="sm" fw={500} c="dimmed">Entry Details (Optional)</Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Select
                  label="Weather"
                  placeholder="Select weather"
                  value={form.values.weather_code !== undefined && form.values.weather_code !== null ? String(form.values.weather_code) : null}
                  data={WEATHER_CODES.map((code) => ({ value: String(code.value), label: code.label }))}
                  onChange={(value) =>
                    form.setFieldValue('weather_code', value === null ? undefined : (parseInt(value, 10) as WeatherCode))
                  }
                  searchable
                  clearable
                />
                <TextInput
                  label="Location"
                  placeholder="Where were you today?"
                  value={form.values.location || ''}
                  onChange={(event) => form.setFieldValue('location', event.currentTarget.value)}
                />
              </SimpleGrid>
              <Alert color="blue" variant="light" title="Daily Wellness Tracking">
                <Text size="sm">
                  Track your daily wellness metrics (sleep, exercise, mood, etc.) in the <strong>Daily Wellness Tracker</strong> on the main Diary page.
                </Text>
              </Alert>
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

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        opened={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />
    </Container>
  );
}