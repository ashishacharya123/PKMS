import { useState, useEffect } from 'react';
import {
  Stack,
  Text,
  Group,
  Button,
  NumberInput,
  TextInput,
  Select,
  SimpleGrid,
  Loader,
  Alert,
  Badge,
  ActionIcon,
  Card,
  Divider,
  Tooltip,
  Modal,
  Title,
  Input,
} from '@mantine/core';
import {
  IconRefresh,
  IconDeviceFloppy,
  IconAlertTriangle,
  IconPlus,
  IconTrash,
  IconFlame,
  IconTrendingUp,
  IconInfoCircle,
} from '@tabler/icons-react';
import { format } from 'date-fns';
import { notifications } from '@mantine/notifications';
import { diaryService } from '../../services/diaryService';
import { HabitData } from '../../types/diary';

interface HabitTrackerProps {
  selectedDate?: Date;
  onStatusChange?: (hasChanges: boolean, isLoading: boolean) => void;
}

interface HabitConfig {
  name: string;
  unit: string;
  inputType: 'number' | 'text' | 'boolean';
  placeholder?: string;
}

const DEFAULT_HABITS: HabitConfig[] = [
  { name: 'reading', unit: 'pages', inputType: 'number', placeholder: 'Pages read' },
  { name: 'meditation', unit: 'minutes', inputType: 'number', placeholder: 'Minutes meditated' },
  { name: 'water', unit: 'glasses', inputType: 'number', placeholder: 'Glasses of water' },
  { name: 'exercise', unit: 'minutes', inputType: 'number', placeholder: 'Minutes exercised' },
];

export function HabitTracker({ selectedDate = new Date(), onStatusChange }: HabitTrackerProps) {
  const dateKey = format(selectedDate, 'yyyy-MM-dd');

  const [habits, setHabits] = useState<HabitData>({});
  const [activeHabits, setActiveHabits] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [customHabits, setCustomHabits] = useState<HabitConfig[]>([]);
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabit, setNewHabit] = useState<HabitConfig>({
    name: '',
    unit: '',
    inputType: 'number',
    placeholder: '',
  });

  // Load habits for the selected date
  const loadHabits = async () => {
    try {
      setIsLoading(true);
      const [habitsData, activeHabitsList] = await Promise.all([
        diaryService.getHabitsForDay(dateKey),
        diaryService.getActiveHabits(30), // Get active habits from last 30 days
      ]);

      setHabits(habitsData);
      setActiveHabits(activeHabitsList);
      setHasChanges(false);
    } catch (error: any) {
      console.error('Failed to load habits:', error);
      // It's okay if no habits exist yet
      setHabits({});
      setActiveHabits([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Save habits for the selected date
  const saveHabits = async () => {
    try {
      setIsLoading(true);

      // Convert habit data to the format expected by API
      const habitsData: Record<string, any> = {};
      const unitsData: Record<string, string> = {};

      Object.entries(habits).forEach(([habitName, habitData]) => {
        habitsData[habitName] = habitData.value;
        unitsData[habitName] = habitData.unit || '';
      });

      await diaryService.updateHabitsForDay(dateKey, habitsData, unitsData);
      setHasChanges(false);

      notifications.show({
        title: 'Habits Saved',
        message: 'Your habit tracking data has been updated successfully.',
        color: 'green',
      });
    } catch (error: any) {
      console.error('Failed to save habits:', error);
      notifications.show({
        title: 'Save Error',
        message: error?.response?.data?.detail || 'Failed to save habit data.',
        color: 'red',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Update a habit value
  const updateHabit = (habitName: string, value: number | string, unit?: string) => {
    setHabits(prev => ({
      ...prev,
      [habitName]: {
        value,
        unit: unit || prev[habitName]?.unit || '',
        streak: prev[habitName]?.streak || 0,
      },
    }));
    setHasChanges(true);
  };

  // Add a custom habit
  const addCustomHabit = () => {
    if (!newHabit.name.trim() || !newHabit.unit.trim()) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please provide both habit name and unit.',
        color: 'red',
      });
      return;
    }

    const habitKey = newHabit.name.toLowerCase().replace(/\s+/g, '_');

    if (customHabits.some(h => h.name === habitKey)) {
      notifications.show({
        title: 'Duplicate Habit',
        message: 'This habit already exists.',
        color: 'red',
      });
      return;
    }

    setCustomHabits(prev => [...prev, { ...newHabit, name: habitKey }]);
    setNewHabit({ name: '', unit: '', inputType: 'number', placeholder: '' });
    setShowAddHabit(false);
  };

  // Remove a custom habit
  const removeCustomHabit = (habitName: string) => {
    setCustomHabits(prev => prev.filter(h => h.name !== habitName));
    setHabits(prev => {
      const newHabits = { ...prev };
      delete newHabits[habitName];
      return newHabits;
    });
    setHasChanges(true);
  };

  // Get streak for a habit
  const getHabitStreak = (habitName: string): number => {
    return habits[habitName]?.streak || 0;
  };

  // Get habit input field based on type
  const getHabitInput = (habit: HabitConfig) => {
    const currentValue = habits[habit.name]?.value ?? '';
    const streak = getHabitStreak(habit.name);

    const commonProps = {
      placeholder: habit.placeholder || `Enter ${habit.name}`,
      value: currentValue,
      size: 'sm' as const,
    };

    switch (habit.inputType) {
      case 'number':
        return (
          <NumberInput
            {...commonProps}
            min={0}
            step={1}
            onChange={(value) => updateHabit(habit.name, typeof value === 'string' ? parseFloat(value) || 0 : value, habit.unit)}
            rightSection={
              streak > 0 && (
                <Tooltip label={`${streak} day streak!`}>
                  <Badge color="orange" variant="light" size="xs">
                    <IconFlame size={12} />
                    {streak}
                  </Badge>
                </Tooltip>
              )
            }
          />
        );
      case 'text':
        return (
          <TextInput
            {...commonProps}
            onChange={(e) => updateHabit(habit.name, e.target.value, habit.unit)}
            rightSection={
              streak > 0 && (
                <Tooltip label={`${streak} day streak!`}>
                  <Badge color="orange" variant="light" size="xs">
                    <IconFlame size={12} />
                    {streak}
                  </Badge>
                </Tooltip>
              )
            }
          />
        );
      default:
        return null;
    }
  };

  // Combine default and custom habits, filter by active habits
  const allHabits = [...DEFAULT_HABITS, ...customHabits];
  const visibleHabits = allHabits.filter(habit =>
    activeHabits.length === 0 || activeHabits.includes(habit.name)
  );

  // Load habits on mount and when date changes
  useEffect(() => {
    loadHabits();
  }, [dateKey]);

  // Notify parent of status changes
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(hasChanges, isLoading);
    }
  }, [hasChanges, isLoading, onStatusChange]);

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between" align="center">
        <Title order={4}>🎯 Habit Tracker</Title>
        <Group gap="xs">
          <Button
            variant="light"
            leftSection={<IconPlus size={16} />}
            onClick={() => setShowAddHabit(true)}
            size="sm"
          >
            Add Habit
          </Button>
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} />}
            onClick={loadHabits}
            disabled={isLoading}
            size="sm"
          >
            Refresh
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={saveHabits}
            loading={isLoading}
            disabled={!hasChanges}
            size="sm"
          >
            Save
          </Button>
        </Group>
      </Group>

      {isLoading && (
        <Group justify="center">
          <Loader size="sm" />
          <Text size="sm">Loading habits...</Text>
        </Group>
      )}

      {/* Status Alert */}
      {!isLoading && visibleHabits.length === 0 && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />}>
          <Text size="sm">
            No habits found for this period. Start by adding some habits to track!
          </Text>
        </Alert>
      )}

      {hasChanges && (
        <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
          <Text size="sm">
            You have unsaved changes. Click "Save" to update your habit tracking.
          </Text>
        </Alert>
      )}

      {/* Habits Grid */}
      {visibleHabits.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {visibleHabits.map((habit) => (
            <Card key={habit.name} shadow="sm" p="md" withBorder>
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Text size="sm" fw={600} tt="capitalize">
                    {habit.name.replace(/_/g, ' ')}
                  </Text>
                  <Group gap="xs">
                    {getHabitStreak(habit.name) > 0 && (
                      <Badge color="orange" variant="light" size="xs">
                        <IconFlame size={10} />
                        {getHabitStreak(habit.name)}
                      </Badge>
                    )}
                    {customHabits.some(h => h.name === habit.name) && (
                      <ActionIcon
                        size="xs"
                        color="red"
                        variant="subtle"
                        onClick={() => removeCustomHabit(habit.name)}
                      >
                        <IconTrash size={10} />
                      </ActionIcon>
                    )}
                  </Group>
                </Group>

                <Text size="xs" c="dimmed">
                  {habit.unit}
                </Text>

                {getHabitInput(habit)}

                {habits[habit.name]?.value !== '' && habits[habit.name]?.value !== 0 && (
                  <Group gap="xs">
                    <IconTrendingUp size={12} color="green" />
                    <Text size="xs" c="green">
                      Tracked today
                    </Text>
                  </Group>
                )}
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      )}

      {/* Add Custom Habit Modal */}
      <Modal
        opened={showAddHabit}
        onClose={() => setShowAddHabit(false)}
        title="Add Custom Habit"
        size="sm"
      >
        <Stack gap="md">
          <TextInput
            label="Habit Name"
            placeholder="e.g., Reading, Exercise, Meditation"
            value={newHabit.name}
            onChange={(e) => setNewHabit(prev => ({ ...prev, name: e.target.value }))}
            required
          />

          <TextInput
            label="Unit"
            placeholder="e.g., pages, minutes, glasses"
            value={newHabit.unit}
            onChange={(e) => setNewHabit(prev => ({ ...prev, unit: e.target.value }))}
            required
          />

          <Select
            label="Input Type"
            data={[
              { value: 'number', label: 'Number' },
              { value: 'text', label: 'Text' },
            ]}
            value={newHabit.inputType}
            onChange={(value) => setNewHabit(prev => ({
              ...prev,
              inputType: (value as 'number' | 'text') || 'number'
            }))}
          />

          <TextInput
            label="Placeholder (optional)"
            placeholder="Helper text for the input field"
            value={newHabit.placeholder}
            onChange={(e) => setNewHabit(prev => ({ ...prev, placeholder: e.target.value }))}
          />

          <Group justify="flex-end">
            <Button variant="light" onClick={() => setShowAddHabit(false)}>
              Cancel
            </Button>
            <Button onClick={addCustomHabit}>
              Add Habit
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Divider />

      {/* Info Section */}
      <Stack gap="xs">
        <Text size="sm" fw={600} c="dimmed">
          💡 How it works:
        </Text>
        <Text size="xs" c="dimmed">
          • Track any custom habits you want to monitor daily
        </Text>
        <Text size="xs" c="dimmed">
          • Streaks are automatically calculated when you enter non-zero values
        </Text>
        <Text size="xs" c="dimmed">
          • View analytics and insights in the Analytics tab
        </Text>
      </Stack>
    </Stack>
  );
}