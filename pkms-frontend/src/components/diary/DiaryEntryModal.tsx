import { useState, useEffect } from 'react';

/**
 * DiaryEntryModal - Comprehensive diary entry creation modal with optimistic UUID pattern
 *
 * PURPOSE:
 * ========
 * Provides a complete interface for creating diary entries with immediate file upload capabilities.
 * Uses optimistic UUID reservation to enable file operations before the entry is saved.
 * Integrates mood tracking, weather logging, and multi-media support for rich journaling.
 *
 * KEY FEATURES:
 * ============
 * - Optimistic UUID: Reserves UUID on modal open, enables immediate file uploads
 * - Date Selection: Full date picker with calendar integration
 * - Mood Tracking: 5-point mood scale with visual indicators
 * - Weather Logging: Weather condition selection for mood correlation
 * - File Uploads: Immediate file upload, paste-to-upload, and audio recording
 * - Auto-Discard: Automatically removes empty entries on modal close
 * - Encryption Support: Integrates with diary encryption system
 *
 * FUNCTIONS:
 * ==========
 * - reserveUuid(): Reserves UUID for optimistic creation
 * - handleSubmit(): Validates and saves the diary entry
 * - handleCancel(): Handles modal close with auto-discard logic
 * - isEmptyEntry(): Determines if entry is empty enough to discard
 * - getWeatherCode(): Converts weather selection to numeric code
 *
 * INTEGRATION:
 * ============
 * - Uses entityReserveService for UUID reservation and discard operations
 * - Integrates with useDiaryStore for diary operations and encryption
 * - Uses UnifiedFileSection for consistent file handling across modules
 * - Supports toast notifications via save_discard_verification helpers
 *
 * UX PATTERNS:
 * ============
 * - Success notification on UUID reservation ("Ready for files")
 * - Discard notification on empty entry removal ("Draft discarded")
 * - Error handling with user-friendly messages
 * - Form validation with clear feedback
 * - Auto-focus on first input field
 *
 * @example
 * ```tsx
 * <DiaryEntryModal
 *   opened={isModalOpen}
 *   onClose={handleClose}
 *   initialDate={new Date()}
 * />
 * ```
 */
import {
  Modal,
  TextInput,
  Textarea,
  Button,
  Group,
  Stack,
  Select,
  NumberInput,
  Alert,
  Text,
} from '@mantine/core';
import {
  IconDeviceFloppy,
  IconX,
  IconCloudRain,
  IconSun,
  IconCloud,
  IconMoodSad,
  IconMoodHappy,
} from '@tabler/icons-react';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { useDiaryStore } from '../../stores/diaryStore';
import { entityReserveService } from '../../services/entityReserveService';
import { isEmptyDiaryEntry, DiaryEntryEntity } from '../../utils/save_discard_verification';
import { UnifiedFileSection } from '../file/UnifiedFileSection';

interface DiaryEntryModalProps {
  opened: boolean;
  onClose: () => void;
  initialDate?: Date;
}

// Mood options with icons
const moodOptions = [
  { value: 1, label: 'Very Bad', icon: IconMoodSad, color: 'red' },
  { value: 2, label: 'Bad', icon: IconMoodSad, color: 'orange' },
  { value: 3, label: 'Neutral', icon: IconCloud, color: 'gray' },
  { value: 4, label: 'Good', icon: IconMoodHappy, color: 'blue' },
  { value: 5, label: 'Very Good', icon: IconSun, color: 'green' },
];

export function DiaryEntryModal({ opened, onClose, initialDate }: DiaryEntryModalProps) {
  const { createEntry, encryptionKey } = useDiaryStore();

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate || new Date());
  const [mood, setMood] = useState<number | null>(null);
  const [weather, setWeather] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Optimistic UUID state
  const [reservedUuid, setReservedUuid] = useState<string | null>(null);
  const [entryFiles, setEntryFiles] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Weather options
  const weatherOptions = [
    { value: 'sunny', label: '☀️ Sunny' },
    { value: 'cloudy', label: '☁️ Cloudy' },
    { value: 'rainy', label: '🌧️ Rainy' },
    { value: 'snowy', label: '❄️ Snowy' },
    { value: 'stormy', label: '⛈️ Stormy' },
  ];

  // Reset form when modal opens/closes
  useEffect(() => {
    if (opened) {
      resetForm();
      // Reserve UUID immediately when modal opens
      reserveUuid();
    } else {
      // Cleanup on close
      if (reservedUuid && isCreating && isEmptyEntry()) {
        entityReserveService.discard('diary', reservedUuid);
      }
      setReservedUuid(null);
      setIsCreating(false);
    }
  }, [opened]);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setSelectedDate(initialDate || new Date());
    setMood(null);
    setWeather(null);
    setEntryFiles([]);
    setIsCreating(false);
  };

  const isEmptyEntry = (): boolean => {
    const entryForCheck: Partial<DiaryEntryEntity> = {
      title,
      content,
      files: entryFiles,
      mood: mood || undefined,
    };
    return isEmptyDiaryEntry(entryForCheck);
  };

  const reserveUuid = async () => {
    if (!selectedDate) return;

    try {
      setIsCreating(true);
      const dateStr = selectedDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const { uuid } = await entityReserveService.reserve('diary', { date: dateStr });
      setReservedUuid(uuid);
    } catch (error) {
      console.error('Failed to reserve diary entry:', error);
      notifications.show({
        title: 'Failed to prepare entry',
        message: 'Could not enable file uploads',
        color: 'red',
      });
    }
  };

  const handleSubmit = async () => {
    if (!selectedDate) {
      notifications.show({
        title: 'Date required',
        message: 'Please select a date for your diary entry',
        color: 'orange',
      });
      return;
    }

    if (!title.trim() && !content.trim() && !mood && !entryFiles.length) {
      notifications.show({
        title: 'Empty entry',
        message: 'Please add some content to your diary entry',
        color: 'orange',
      });
      return;
    }

    try {
      setIsSubmitting(true);

      const dateStr = selectedDate.toISOString().split('T')[0];
      const entryData = {
        title: title.trim() || undefined,
        content: content.trim() || undefined,
        date: dateStr,
        mood: mood || undefined,
        weather_code: weather ? getWeatherCode(weather) : undefined,
      };

      const success = await createEntry(entryData);

      if (success) {
        notifications.show({
          title: 'Entry saved',
          message: 'Your diary entry has been saved successfully',
          color: 'green',
        });
        onClose();
      } else {
        notifications.show({
          title: 'Save failed',
          message: 'Could not save diary entry',
          color: 'red',
        });
      }
    } catch (error) {
      console.error('Failed to save diary entry:', error);
      notifications.show({
        title: 'Save failed',
        message: 'An error occurred while saving',
        color: 'red',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    // Auto-discard empty reserved entry
    if (reservedUuid && isCreating && isEmptyEntry()) {
      entityReserveService.discard('diary', reservedUuid).finally(() => {
        onClose();
      });
    } else {
      onClose();
    }
  };

  const getWeatherCode = (weather: string): number => {
    const weatherMap: Record<string, number> = {
      sunny: 1,
      cloudy: 2,
      rainy: 3,
      snowy: 4,
      stormy: 5,
    };
    return weatherMap[weather] || 0;
  };

  return (
    <Modal
      opened={opened}
      onClose={handleCancel}
      title="New Diary Entry"
      size="lg"
      overlayProps={{ blur: 4 }}
    >
      <Stack gap="md">
        {/* Date Selection */}
        <DatePickerInput
          label="Entry Date"
          placeholder="Select date"
          value={selectedDate}
          onChange={setSelectedDate}
          required
          maxDate={new Date()}
          clearable={false}
        />

        {/* Title */}
        <TextInput
          label="Title (optional)"
          placeholder="Give your entry a title..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* Content */}
        <Textarea
          label="Your Thoughts"
          placeholder="Write about your day, your feelings, whatever comes to mind..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          minRows={4}
          autosize
        />

        {/* Mood and Weather */}
        <Group grow>
          <Select
            label="Mood"
            placeholder="How are you feeling?"
            data={moodOptions.map(option => ({
              value: option.value.toString(),
              label: option.label,
            }))}
            value={mood?.toString()}
            onChange={(value) => setMood(value ? parseInt(value) : null)}
            clearable
          />

          <Select
            label="Weather"
            placeholder="What's the weather like?"
            data={weatherOptions}
            value={weather}
            onChange={setWeather}
            clearable
          />
        </Group>

        {/* File Upload Section */}
        {reservedUuid && (
          <div>
            <Text size="sm" fw={500} mb="xs">
              Attachments
            </Text>
            <UnifiedFileSection
              module="diary"
              entityId={reservedUuid}
              files={entryFiles}
              onFilesUpdate={setEntryFiles}
              showUpload={true}
              showAudioRecorder={true}
              enableDragDrop={true}
              encryptionKey={encryptionKey}
            />
          </div>
        )}

        {/* Action Buttons */}
        <Group justify="flex-end" gap="sm">
          <Button
            variant="light"
            onClick={handleCancel}
            leftSection={<IconX size={16} />}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={isSubmitting}
            disabled={!selectedDate}
            leftSection={<IconDeviceFloppy size={16} />}
          >
            Save Entry
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}