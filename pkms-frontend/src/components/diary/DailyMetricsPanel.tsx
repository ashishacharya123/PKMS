import { useState, useEffect } from 'react';
import {
  Stack,
  Text,
  Group,
  Button,
  NumberInput,
  Switch,
  Slider,
  SimpleGrid,
  Loader,
  Alert
} from '@mantine/core';
import { IconRefresh, IconDeviceFloppy, IconAlertTriangle } from '@tabler/icons-react';
import { format } from 'date-fns';
import { notifications } from '@mantine/notifications';
import { diaryService } from '../../services/diaryService';
import { DiaryDailyMetrics } from '../../types/diary';
import { useDiaryStore } from '../../stores/diaryStore';

// Weather codes removed - only in diary entry form now

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

export function DailyMetricsPanel({ onStatusChange }: { onStatusChange?: (hasMissing: boolean, isLoading: boolean) => void }) {
  const store = useDiaryStore();
  const today = new Date();
  const [dailyMetrics, setDailyMetrics] = useState<DiaryDailyMetrics>(initialDailyMetrics);
  const [nepaliDate, setNepaliDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasMissingSnapshot, setHasMissingSnapshot] = useState(true);

  const convertToNepaliDate = (date: Date): string => {
    // Simple Nepali date conversion placeholder - you can improve this
    return format(date, 'yyyy-MM-dd');
  };

  const loadTodayMetadata = async () => {
    try {
      setIsLoading(true);
      const dateKey = format(today, 'yyyy-MM-dd');
      const snapshot = await diaryService.getDailyMetadata(dateKey);
      
      if (snapshot) {
        setDailyMetrics({
          ...initialDailyMetrics,
          ...snapshot.metrics,
        });
        setNepaliDate(snapshot.nepali_date || '');
        setHasMissingSnapshot(false);
      } else {
        setDailyMetrics(initialDailyMetrics);
        setNepaliDate(convertToNepaliDate(today));
        setHasMissingSnapshot(true);
      }
    } catch (error: any) {
      // 404 is expected when no metadata exists for today - not an error
      if (error?.message?.includes('No daily metadata found')) {
        setDailyMetrics(initialDailyMetrics);
        setNepaliDate(convertToNepaliDate(today));
        setHasMissingSnapshot(true);
      } else {
        console.error('Failed to load daily metadata:', error);
        setHasMissingSnapshot(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      const dateKey = format(today, 'yyyy-MM-dd');
      const snapshot = await diaryService.updateDailyMetadata(dateKey, {
        metrics: dailyMetrics,
        nepali_date: nepaliDate || convertToNepaliDate(today),
      });
      store.setDailyMetadata(snapshot);
      setHasMissingSnapshot(false);
      notifications.show({
        title: 'Snapshot Saved',
        message: 'Daily wellness snapshot updated successfully.',
        color: 'green',
      });
    } catch (error: any) {
      console.error('Failed to update snapshot', error);
      notifications.show({
        title: 'Snapshot Error',
        message: error?.response?.data?.detail || 'Failed to update daily snapshot.',
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateMetric = <K extends keyof DiaryDailyMetrics>(
    key: K,
    value: DiaryDailyMetrics[K]
  ) => {
    setDailyMetrics((prev: DiaryDailyMetrics) => ({ ...prev, [key]: value }));
  };

  // Load today's metadata on mount
  useEffect(() => {
    loadTodayMetadata();
  }, []);

  // Notify parent of status changes
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(hasMissingSnapshot, isLoading);
    }
  }, [hasMissingSnapshot, isLoading, onStatusChange]);

  return (
    <Stack gap="md">
      {isLoading && (
        <Group justify="center">
          <Loader size="sm" />
        </Group>
      )}

      {hasMissingSnapshot && (
        <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="No snapshot for today">
          Fill in the metrics below and save.
        </Alert>
      )}

      {/* Compact 3-column layout for better space utilization */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {/* Column 1: Sleep & Activity */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="blue">🌙 Sleep & Activity</Text>
          <NumberInput
            label="Sleep (hours)"
            placeholder="8"
            min={0}
            max={24}
            step={0.5}
            value={dailyMetrics.sleep_duration}
            onChange={(value) => updateMetric('sleep_duration', typeof value === 'string' ? parseFloat(value) || 0 : value)}
            size="sm"
          />
          <Switch
            label="Did Exercise"
            checked={dailyMetrics.did_exercise}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              setDailyMetrics(prev => ({
                ...prev,
                did_exercise: checked,
                exercise_minutes: checked ? (prev.exercise_minutes || 0) : 0
              }));
            }}
            size="sm"
          />
          {dailyMetrics.did_exercise && (
            <NumberInput
              label="Exercise (min)"
              placeholder="30"
              min={0}
              max={1440}
              value={dailyMetrics.exercise_minutes || 0}
              onChange={(value) => updateMetric('exercise_minutes', typeof value === 'string' ? parseInt(value) || 0 : value)}
              size="sm"
            />
          )}
          <NumberInput
            label="Time Outside (min)"
            placeholder="0"
            min={0}
            max={1440}
            value={dailyMetrics.time_outside}
            onChange={(value) => updateMetric('time_outside', typeof value === 'string' ? parseInt(value) || 0 : value)}
            size="sm"
          />
        </Stack>

        {/* Column 2: Mental Wellness */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="purple">🧘 Mental Wellness</Text>
          <Switch
            label="Did Meditation"
            checked={dailyMetrics.did_meditation}
            onChange={(event) => updateMetric('did_meditation', event.currentTarget.checked)}
            size="sm"
          />
          <Switch
            label="Gratitude Practice"
            checked={dailyMetrics.gratitude_practice}
            onChange={(event) => updateMetric('gratitude_practice', event.currentTarget.checked)}
            size="sm"
          />
          <Stack gap={4}>
            <Text size="xs" c="dimmed">Energy: {dailyMetrics.energy_level}/5</Text>
            <Slider
              value={dailyMetrics.energy_level}
              onChange={(value) => updateMetric('energy_level', value)}
              min={1}
              max={5}
              step={1}
              marks={[
                { value: 1, label: 'Low' },
                { value: 3, label: 'Med' },
                { value: 5, label: 'High' }
              ]}
              size="sm"
            />
          </Stack>
          <Stack gap={4}>
            <Text size="xs" c="dimmed">Stress: {dailyMetrics.stress_level}/5</Text>
            <Slider
              value={dailyMetrics.stress_level}
              onChange={(value) => updateMetric('stress_level', value)}
              min={1}
              max={5}
              step={1}
              marks={[
                { value: 1, label: 'Low' },
                { value: 3, label: 'Med' },
                { value: 5, label: 'High' }
              ]}
              size="sm"
            />
          </Stack>
        </Stack>

        {/* Column 3: Daily Habits */}
        <Stack gap="xs">
          <Text size="sm" fw={600} c="orange">🎯 Daily Habits</Text>
          <NumberInput
            label="Water (glasses)"
            placeholder="8"
            min={0}
            max={50}
            value={dailyMetrics.water_intake}
            onChange={(value) => updateMetric('water_intake', typeof value === 'string' ? parseInt(value) || 0 : value)}
            size="sm"
          />
          <NumberInput
            label="Screen Time (hrs)"
            placeholder="0"
            min={0}
            max={24}
            step={0.5}
            value={dailyMetrics.screen_time}
            onChange={(value) => updateMetric('screen_time', typeof value === 'string' ? parseFloat(value) || 0 : value)}
            size="sm"
          />
          <NumberInput
            label="Reading (min)"
            placeholder="0"
            min={0}
            max={1440}
            value={dailyMetrics.reading_time}
            onChange={(value) => updateMetric('reading_time', typeof value === 'string' ? parseInt(value) || 0 : value)}
            size="sm"
          />
          <Switch
            label="Social Interaction"
            checked={dailyMetrics.social_interaction}
            onChange={(event) => updateMetric('social_interaction', event.currentTarget.checked)}
            size="sm"
          />
        </Stack>
      </SimpleGrid>

      <Group justify="flex-end" mt="md">
        <Button
          variant="light"
          leftSection={<IconRefresh size={16} />}
          onClick={loadTodayMetadata}
          disabled={isLoading}
          size="sm"
        >
          Refresh
        </Button>
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={handleSave}
          loading={isLoading}
          size="sm"
        >
          Save Snapshot
        </Button>
      </Group>
    </Stack>
  );
}

