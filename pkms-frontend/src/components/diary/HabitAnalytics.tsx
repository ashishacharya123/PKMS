/**
 * Comprehensive Habit Tracker Component
 * Shows all 9 default habits + custom habits with advanced tracking
 */

import { useEffect, useState } from 'react';
import {
  Container,
  Title,
  Stack,
  Group,
  Card,
  Text,
  Badge,
  Progress,
  SimpleGrid,
  Tabs,
  Alert,
  Button,
  TextInput,
  NumberInput,
  Switch,
  Paper,
  Divider,
  ThemeIcon,
  ActionIcon,
  Modal,
  Textarea,
  Select,
  Stepper
} from '@mantine/core';
import {
  IconMoon,
  IconHeart,
  IconActivity,
  IconBrain,
  IconDeviceDesktop,
  IconWalk,
  IconBook,
  IconTree,
  IconUsers,
  IconPlus,
  IconEdit,
  IconTrash,
  IconTarget,
  IconCheck,
  IconTrendingUp,
  IconTrendingDown,
  IconChartLine
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useForm } from '@mantine/form';

interface HabitConfig {
  habitId: string;
  name: string;
  unit: string;
  enabled: boolean;
  target?: number;
  category?: string;
}

interface HabitEntry {
  habitId: string;
  value: number;
  date: string;
  notes?: string;
}

interface HabitAnalytics {
  [habitId: string]: {
    average: number;
    trend: 'improving' | 'stable' | 'declining';
    consistency: number;
    best_streak: number;
    current_streak: number;
    target_achievement: number;
    chart_data: Array<{ date: string; value: number }>;
  };
}

const DEFAULT_HABITS: HabitConfig[] = [
  { habitId: 'sleep', name: 'SLEEP', unit: 'hours', enabled: true, target: 8, category: 'Health' },
  { habitId: 'stress', name: 'STRESS', unit: '1-5', enabled: true, target: 2, category: 'Mental' },
  { habitId: 'exercise', name: 'EXERCISE', unit: 'minutes', enabled: true, target: 30, category: 'Physical' },
  { habitId: 'meditation', name: 'MEDITATION', unit: 'minutes', enabled: true, target: 15, category: 'Mental' },
  { habitId: 'screen_time', name: 'SCREEN TIME', unit: 'hours', enabled: true, target: 6, category: 'Digital' },
  { habitId: 'steps', name: 'STEPS', unit: 'count', enabled: true, target: 10000, category: 'Physical' },
  { habitId: 'learning', name: 'LEARNING', unit: 'minutes', enabled: true, target: 30, category: 'Growth' },
  { habitId: 'outdoor', name: 'OUTDOOR', unit: 'hours', enabled: true, target: 2, category: 'Nature' },
  { habitId: 'social', name: 'SOCIAL', unit: 'hours', enabled: true, target: 1, category: 'Social' }
];

const HABIT_ICONS = {
  sleep: IconMoon,
  stress: IconHeart,
  exercise: IconActivity,
  meditation: IconBrain,
  screen_time: IconDeviceDesktop,
  steps: IconWalk,
  learning: IconBook,
  outdoor: IconTree,
  social: IconUsers
};

export function HabitAnalytics() {
  const [defaultHabits, setDefaultHabits] = useState<HabitConfig[]>(DEFAULT_HABITS);
  const [definedHabits, setDefinedHabits] = useState<HabitConfig[]>([]);
  const [todayEntries, setTodayEntries] = useState<HabitEntry[]>([]);
  const [analytics, setAnalytics] = useState<HabitAnalytics>({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('default');
  const [modalOpened, setModalOpened] = useState(false);
  const [editingHabit, setEditingHabit] = useState<HabitConfig | null>(null);

  const form = useForm({
    initialValues: {
      name: '',
      unit: '',
      target: 0,
      category: 'Custom'
    }
  });

  const loadHabitConfigs = async () => {
    try {
      // Load default habits
      const defaultResponse = await fetch('/api/v1/diary/habits/default/config');
      const defaultData = await defaultResponse.json();
      setDefaultHabits(defaultData);

      // Load defined habits
      const definedResponse = await fetch('/api/v1/diary/habits/defined/config');
      const definedData = await definedResponse.json();
      setDefinedHabits(definedData);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load habit configurations',
        color: 'red'
      });
    }
  };

  const loadTodayEntries = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/v1/diary/daily-metadata/${today}/habits`);
      const data = await response.json();
      setTodayEntries(data.habits || []);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load today\'s habit entries',
        color: 'red'
      });
    }
  };

  const loadAnalytics = async () => {
    try {
      const response = await fetch('/api/v1/diary/habits/analytics?days=30');
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load habit analytics',
        color: 'red'
      });
    }
  };

  const saveHabitEntry = async (habitId: string, value: number, notes?: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch('/api/v1/diary/daily-metadata/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_date: today,
          habits_data: { [habitId]: value },
          notes: notes
        })
      });

      if (response.ok) {
        notifications.show({
          title: 'Success',
          message: 'Habit entry saved successfully',
          color: 'green'
        });
        loadTodayEntries();
        loadAnalytics();
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save habit entry',
        color: 'red'
      });
    }
  };

  const saveHabitConfig = async (habitType: 'default' | 'defined', config: HabitConfig[]) => {
    try {
      const response = await fetch(`/api/v1/diary/habits/${habitType}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (response.ok) {
        notifications.show({
          title: 'Success',
          message: 'Habit configuration saved successfully',
          color: 'green'
        });
        loadHabitConfigs();
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save habit configuration',
        color: 'red'
      });
    }
  };

  useEffect(() => {
    loadHabitConfigs();
    loadTodayEntries();
    loadAnalytics();
  }, []);

  const getHabitValue = (habitId: string): number => {
    const entry = todayEntries.find(e => e.habitId === habitId);
    return entry?.value || 0;
  };

  const getHabitProgress = (habit: HabitConfig): number => {
    const value = getHabitValue(habit.habitId);
    if (!habit.target) return 0;
    return Math.min((value / habit.target) * 100, 100);
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <IconTrendingUp size={16} color="green" />;
      case 'declining': return <IconTrendingDown size={16} color="red" />;
      default: return <IconChartLine size={16} color="blue" />;
    }
  };

  const renderHabitCard = (habit: HabitConfig, isDefault: boolean = true) => {
    const IconComponent = HABIT_ICONS[habit.habitId as keyof typeof HABIT_ICONS] || IconTarget;
    const currentValue = getHabitValue(habit.habitId);
    const progress = getHabitProgress(habit);
    const habitAnalytics = analytics[habit.habitId];

    return (
      <Card key={habit.habitId} withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Group gap="xs">
            <ThemeIcon color="blue" variant="light" size="lg">
              <IconComponent size={20} />
            </ThemeIcon>
            <div>
              <Text fw={500}>{habit.name}</Text>
              <Text size="xs" c="dimmed">{habit.category}</Text>
            </div>
          </Group>
          <Group gap="xs">
            {habitAnalytics && getTrendIcon(habitAnalytics.trend)}
            <Badge color={progress >= 100 ? 'green' : progress >= 50 ? 'yellow' : 'red'}>
              {Math.round(progress)}%
            </Badge>
          </Group>
        </Group>

        <Group justify="space-between" mb="md">
          <div>
            <Text size="xl" fw={700}>
              {currentValue} {habit.unit}
            </Text>
            {habit.target && (
              <Text size="sm" c="dimmed">
                Target: {habit.target} {habit.unit}
              </Text>
            )}
          </div>
          <Switch
            checked={habit.enabled}
            onChange={(event) => {
              const updatedHabits = isDefault 
                ? defaultHabits.map(h => h.habitId === habit.habitId ? { ...h, enabled: event.currentTarget.checked } : h)
                : definedHabits.map(h => h.habitId === habit.habitId ? { ...h, enabled: event.currentTarget.checked } : h);
              
              if (isDefault) {
                setDefaultHabits(updatedHabits);
                saveHabitConfig('default', updatedHabits);
              } else {
                setDefinedHabits(updatedHabits);
                saveHabitConfig('defined', updatedHabits);
              }
            }}
          />
        </Group>

        {habit.enabled && (
          <>
            <Progress
              value={progress}
              color={progress >= 100 ? 'green' : progress >= 50 ? 'yellow' : 'red'}
              size="sm"
              mb="md"
            />

            <Group gap="xs">
              <NumberInput
                placeholder="Enter value"
                value={currentValue}
                onChange={(value) => {
                  if (value !== null) {
                    saveHabitEntry(habit.habitId, value);
                  }
                }}
                min={0}
                max={habit.unit === '1-5' ? 5 : undefined}
                size="sm"
                style={{ flex: 1 }}
              />
              <Button
                size="sm"
                variant="light"
                onClick={() => {
                  const newValue = currentValue + (habit.unit === 'hours' ? 0.5 : 1);
                  saveHabitEntry(habit.habitId, newValue);
                }}
              >
                +
              </Button>
            </Group>

            {habitAnalytics && (
              <Group justify="space-between" mt="md" pt="md" style={{ borderTop: '1px solid #e9ecef' }}>
                <div>
                  <Text size="xs" c="dimmed">Consistency</Text>
                  <Text size="sm" fw={500}>{Math.round(habitAnalytics.consistency)}%</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Streak</Text>
                  <Text size="sm" fw={500}>{habitAnalytics.current_streak} days</Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">Best</Text>
                  <Text size="sm" fw={500}>{habitAnalytics.best_streak} days</Text>
                </div>
              </Group>
            )}
          </>
        )}
      </Card>
    );
  };

  const handleCreateHabit = () => {
    form.reset();
    setEditingHabit(null);
    setModalOpened(true);
  };

  const handleEditHabit = (habit: HabitConfig) => {
    form.setValues({
      name: habit.name,
      unit: habit.unit,
      target: habit.target || 0,
      category: habit.category || 'Custom'
    });
    setEditingHabit(habit);
    setModalOpened(true);
  };

  const handleSaveHabit = () => {
    const newHabit: HabitConfig = {
      habitId: editingHabit?.habitId || form.values.name.toLowerCase().replace(/\s+/g, '_'),
      name: form.values.name.toUpperCase(),
      unit: form.values.unit,
      target: form.values.target,
      category: form.values.category,
      enabled: true
    };

    if (editingHabit) {
      const updatedHabits = definedHabits.map(h => 
        h.habitId === editingHabit.habitId ? newHabit : h
      );
      setDefinedHabits(updatedHabits);
      saveHabitConfig('defined', updatedHabits);
    } else {
      const updatedHabits = [...definedHabits, newHabit];
      setDefinedHabits(updatedHabits);
      saveHabitConfig('defined', updatedHabits);
    }

    setModalOpened(false);
    form.reset();
  };

  const handleDeleteHabit = (habitId: string) => {
    const updatedHabits = definedHabits.filter(h => h.habitId !== habitId);
    setDefinedHabits(updatedHabits);
    saveHabitConfig('defined', updatedHabits);
  };

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2}>🎯 Comprehensive Habit Tracker</Title>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={handleCreateHabit}
            variant="light"
          >
            Add Custom Habit
          </Button>
        </Group>

        <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'default')}>
          <Tabs.List>
            <Tabs.Tab value="default" leftSection={<IconTarget size={16} />}>
              Core Habits (9)
            </Tabs.Tab>
            <Tabs.Tab value="defined" leftSection={<IconPlus size={16} />}>
              Custom Habits ({definedHabits.length})
            </Tabs.Tab>
            <Tabs.Tab value="analytics" leftSection={<IconChartLine size={16} />}>
              Analytics
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="default" pt="md">
            <Stack gap="md">
              <Alert color="blue" icon={<IconTarget size={16} />}>
                Track your core wellness habits with our 9 default habits. These cover all aspects of your well-being.
              </Alert>
              
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                {defaultHabits.map(habit => renderHabitCard(habit, true))}
              </SimpleGrid>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="defined" pt="md">
            <Stack gap="md">
              <Alert color="green" icon={<IconPlus size={16} />}>
                Create and track your own custom habits. Perfect for personal goals and unique tracking needs.
              </Alert>
              
              {definedHabits.length === 0 ? (
                <Paper p="xl" withBorder style={{ textAlign: 'center' }}>
                  <ThemeIcon size="xl" color="gray" variant="light" mx="auto" mb="md">
                    <IconPlus size={32} />
                  </ThemeIcon>
                  <Text size="lg" fw={500} mb="xs">No Custom Habits Yet</Text>
                  <Text c="dimmed" mb="md">
                    Create your first custom habit to start tracking personal goals
                  </Text>
                  <Button onClick={handleCreateHabit}>
                    Create Custom Habit
                  </Button>
                </Paper>
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                  {definedHabits.map(habit => (
                    <Card key={habit.habitId} withBorder p="md">
                      <Group justify="space-between" mb="sm">
                        <Group gap="xs">
                          <ThemeIcon color="green" variant="light" size="lg">
                            <IconTarget size={20} />
                          </ThemeIcon>
                          <div>
                            <Text fw={500}>{habit.name}</Text>
                            <Text size="xs" c="dimmed">{habit.category}</Text>
                          </div>
                        </Group>
                        <Group gap="xs">
                          <ActionIcon
                            variant="light"
                            color="blue"
                            size="sm"
                            onClick={() => handleEditHabit(habit)}
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            color="red"
                            size="sm"
                            onClick={() => handleDeleteHabit(habit.habitId)}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Group>
                      {renderHabitCard(habit, false)}
                    </Card>
                  ))}
                </SimpleGrid>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="analytics" pt="md">
            <Stack gap="lg">
              <Title order={3}>Habit Performance Analytics</Title>
              
              <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
                {Object.entries(analytics).map(([habitId, data]) => {
                  const habit = [...defaultHabits, ...definedHabits].find(h => h.habitId === habitId);
                  if (!habit) return null;

                  return (
                    <Card key={habitId} withBorder p="md">
                      <Group justify="space-between" mb="sm">
                        <Text fw={500} tt="uppercase">
                          {habit.name}
                        </Text>
                        {getTrendIcon(data.trend)}
                      </Group>
                      
                      <Text size="xl" fw={700} mb="xs">
                        {data.average.toFixed(1)} {habit.unit}
                      </Text>
                      
                      <Group justify="space-between" mb="sm">
                        <div>
                          <Text size="xs" c="dimmed">Consistency</Text>
                          <Text size="sm" fw={500}>
                            {Math.round(data.consistency)}%
                          </Text>
                        </div>
                        <div>
                          <Text size="xs" c="dimmed">Current Streak</Text>
                          <Text size="sm" fw={500}>
                            {data.current_streak} days
                          </Text>
                        </div>
                        <div>
                          <Text size="xs" c="dimmed">Best Streak</Text>
                          <Text size="sm" fw={500}>
                            {data.best_streak} days
                          </Text>
                        </div>
                      </Group>

                      <Progress
                        value={data.target_achievement}
                        color={data.target_achievement >= 100 ? 'green' : data.target_achievement >= 50 ? 'yellow' : 'red'}
                        size="sm"
                        mb="sm"
                      />
                      <Text size="xs" c="dimmed" ta="center">
                        Target Achievement: {Math.round(data.target_achievement)}%
                      </Text>
                    </Card>
                  );
                })}
              </SimpleGrid>
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Habit Creation/Edit Modal */}
        <Modal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          title={editingHabit ? 'Edit Custom Habit' : 'Create Custom Habit'}
          centered
        >
          <form onSubmit={form.onSubmit(handleSaveHabit)}>
            <Stack gap="md">
              <TextInput
                label="Habit Name"
                placeholder="e.g., Reading, Water Intake"
                {...form.getInputProps('name')}
                required
              />
              
              <Select
                label="Unit"
                placeholder="Select unit"
                data={[
                  { value: 'minutes', label: 'Minutes' },
                  { value: 'hours', label: 'Hours' },
                  { value: 'count', label: 'Count' },
                  { value: '1-5', label: 'Scale (1-5)' },
                  { value: '1-10', label: 'Scale (1-10)' }
                ]}
                {...form.getInputProps('unit')}
                required
              />
              
              <NumberInput
                label="Daily Target"
                placeholder="Enter target value"
                min={0}
                {...form.getInputProps('target')}
              />
              
              <Select
                label="Category"
                data={[
                  { value: 'Health', label: 'Health' },
                  { value: 'Mental', label: 'Mental' },
                  { value: 'Physical', label: 'Physical' },
                  { value: 'Growth', label: 'Growth' },
                  { value: 'Social', label: 'Social' },
                  { value: 'Custom', label: 'Custom' }
                ]}
                {...form.getInputProps('category')}
              />

              <Group justify="flex-end">
                <Button variant="light" onClick={() => setModalOpened(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingHabit ? 'Update' : 'Create'} Habit
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>
      </Stack>
    </Container>
  );
}
