/**
 * HabitManagement - CRUD operations for habit configuration
 * 
 * This component provides the management interface for creating, editing,
 * and deleting (soft delete) both default and defined habits. It handles
 * the complete lifecycle of habit configuration with proper soft deletion.
 * 
 * Features:
 * - Create new custom habits with validation
 * - Edit existing habits (name, unit, target, category)
 * - Soft delete habits (sets is_active=false, preserves historical data)
 * - Reactivate deactivated habits
 * - Visual indicators for active/inactive habits
 * - Proper error handling and user feedback
 * - Integration with backend habit_config_service
 */

import { useState, useEffect } from 'react';
import {
  Container,
  Title,
  Stack,
  Group,
  Card,
  Text,
  Badge,
  SimpleGrid,
  Tabs,
  Alert,
  Button,
  TextInput,
  NumberInput,
  Modal,
  Select,
  ActionIcon,
  ThemeIcon,
  Paper,
} from '@mantine/core';
import {
  IconPlus,
  IconEdit,
  IconTrash,
  IconTarget,
  IconCheck,
  IconSettings,
  IconUsers,
  IconActivity,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useForm } from '@mantine/form';
import { diaryService } from '../../services/diaryService';

interface HabitConfig {
  habitId: string;
  name: string;
  unit: string;
  goalType?: string;
  targetQuantity?: number;
  isActive?: boolean;
  category?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface HabitManagementProps {
  onHabitChange?: () => void; // Callback when habits are modified
}

export function HabitManagement({ onHabitChange }: HabitManagementProps) {
  const [defaultHabits, setDefaultHabits] = useState<HabitConfig[]>([]);
  const [definedHabits, setDefinedHabits] = useState<HabitConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('defined');
  const [modalOpened, setModalOpened] = useState(false);
  const [editingHabit, setEditingHabit] = useState<HabitConfig | null>(null);

  const form = useForm({
    initialValues: {
      name: '',
      unit: '',
      targetQuantity: 0,
      goalType: 'minimum',
      category: 'Custom'
    },
    validate: {
      name: (value) => (value.length < 2 ? 'Name must be at least 2 characters' : null),
      unit: (value) => (value.length < 1 ? 'Unit is required' : null),
    }
  });

  // Load habit configurations
  const loadHabitConfigs = async () => {
    setLoading(true);
    try {
      // Load default habits
      const defaultData = await diaryService.getHabitConfig('default');
      setDefaultHabits(defaultData);

      // Load defined habits
      const definedData = await diaryService.getHabitConfig('defined');
      setDefinedHabits(definedData);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load habit configurations',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHabitConfigs();
  }, []);

  // Create new habit
  const handleCreateHabit = () => {
    form.reset();
    setEditingHabit(null);
    setModalOpened(true);
  };

  // Edit existing habit
  const handleEditHabit = (habit: HabitConfig) => {
    form.setValues({
      name: habit.name,
      unit: habit.unit,
      targetQuantity: habit.targetQuantity || 0,
      goalType: habit.goalType || 'minimum',
      category: habit.category || 'Custom'
    });
    setEditingHabit(habit);
    setModalOpened(true);
  };

  // Save habit (create or update)
  const handleSaveHabit = async () => {
    if (!form.validate().hasErrors) {
      try {
        if (editingHabit) {
          // Update existing habit
          await diaryService.updateHabitInConfig('defined', editingHabit.habitId, {
            name: form.values.name.toUpperCase(),
            unit: form.values.unit,
            targetQuantity: form.values.targetQuantity,
            goalType: form.values.goalType,
            category: form.values.category
          });
          
          // Update local state
          const updatedHabits = definedHabits.map(h => 
            h.habitId === editingHabit.habitId 
              ? { ...h, ...form.values, name: form.values.name.toUpperCase() }
              : h
          );
          setDefinedHabits(updatedHabits);
          
          notifications.show({
            title: 'Success',
            message: 'Habit updated successfully',
            color: 'green'
          });
        } else {
          // Create new habit
          const newHabit = await diaryService.addHabitToConfig(
            'defined',
            form.values.name,
            form.values.unit,
            form.values.goalType,
            form.values.targetQuantity
          );
          
          setDefinedHabits(prev => [...prev, newHabit]);
          
          notifications.show({
            title: 'Success',
            message: 'Habit created successfully',
            color: 'green'
          });
        }
        
        setModalOpened(false);
        form.reset();
        onHabitChange?.();
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: 'Failed to save habit',
          color: 'red'
        });
      }
    }
  };

  // Soft delete habit (sets is_active=false)
  const handleDeleteHabit = async (habitId: string) => {
    try {
      await diaryService.deleteHabitFromConfig('defined', habitId);
      
      // Update local state to show as inactive
      const updatedHabits = definedHabits.map(h => 
        h.habitId === habitId ? { ...h, isActive: false } : h
      );
      setDefinedHabits(updatedHabits);
      
      notifications.show({
        title: 'Habit Deactivated',
        message: 'Habit has been deactivated. Historical data is preserved.',
        color: 'orange'
      });
      
      onHabitChange?.();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete habit',
        color: 'red'
      });
    }
  };

  // Reactivate habit (sets is_active=true)
  const handleReactivateHabit = async (habitId: string) => {
    try {
      await diaryService.updateHabitInConfig('defined', habitId, { isActive: true });
      
      // Update local state
      const updatedHabits = definedHabits.map(h => 
        h.habitId === habitId ? { ...h, isActive: true } : h
      );
      setDefinedHabits(updatedHabits);
      
      notifications.show({
        title: 'Habit Reactivated',
        message: 'Habit has been reactivated successfully',
        color: 'green'
      });
      
      onHabitChange?.();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to reactivate habit',
        color: 'red'
      });
    }
  };

  // Render habit card
  const renderHabitCard = (habit: HabitConfig, isDefault: boolean) => (
    <Card 
      key={habit.habitId} 
      withBorder 
      p="md"
      style={{ 
        opacity: habit.isActive === false ? 0.6 : 1,
        borderColor: habit.isActive === false ? '#ff6b6b' : undefined
      }}
    >
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <ThemeIcon 
            color={habit.isActive === false ? "red" : isDefault ? "blue" : "green"} 
            variant="light" 
            size="lg"
          >
            <IconTarget size={20} />
          </ThemeIcon>
          <div>
            <Text fw={500}>
              {habit.name}
              {habit.isActive === false && (
                <Badge color="red" size="xs" ml="xs">INACTIVE</Badge>
              )}
            </Text>
            <Text size="xs" c="dimmed">
              {habit.category} • {habit.unit}
              {habit.targetQuantity && ` • Target: ${habit.targetQuantity}`}
            </Text>
          </div>
        </Group>
        {!isDefault && (
          <Group gap="xs">
            <ActionIcon
              variant="light"
              color="blue"
              size="sm"
              onClick={() => handleEditHabit(habit)}
            >
              <IconEdit size={14} />
            </ActionIcon>
            {habit.isActive !== false ? (
              <ActionIcon
                variant="light"
                color="red"
                size="sm"
                onClick={() => handleDeleteHabit(habit.habitId)}
              >
                <IconTrash size={14} />
              </ActionIcon>
            ) : (
              <ActionIcon
                variant="light"
                color="green"
                size="sm"
                onClick={() => handleReactivateHabit(habit.habitId)}
              >
                <IconCheck size={14} />
              </ActionIcon>
            )}
          </Group>
        )}
      </Group>
      
      {habit.isActive !== false && (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {habit.goalType === 'minimum' ? 'Minimum target' : 'Maximum target'}: {habit.targetQuantity || 'Not set'}
          </Text>
          {habit.createdAt && (
            <Text size="xs" c="dimmed">
              Created: {new Date(habit.createdAt).toLocaleDateString()}
            </Text>
          )}
        </Stack>
      )}
    </Card>
  );

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2}>🎯 Habit Management</Title>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={handleCreateHabit}
            variant="light"
          >
            Add Custom Habit
          </Button>
        </Group>

        <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'defined')}>
          <Tabs.List>
            <Tabs.Tab value="default" leftSection={<IconSettings size={16} />}>
              Default Habits (9)
            </Tabs.Tab>
            <Tabs.Tab value="defined" leftSection={<IconUsers size={16} />}>
              Custom Habits ({definedHabits.length})
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="default" pt="md">
            <Stack gap="md">
              <Alert color="blue" icon={<IconSettings size={16} />}>
                These are the 9 core wellness habits that are tracked by default. 
                You can modify their settings but cannot delete them.
              </Alert>
              
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                {defaultHabits.map(habit => renderHabitCard(habit, true))}
              </SimpleGrid>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="defined" pt="md">
            <Stack gap="md">
              {definedHabits.length === 0 ? (
                <Paper p="xl" style={{ textAlign: 'center' }}>
                  <Stack align="center" gap="md">
                    <IconActivity size={48} color="gray" />
                    <Text size="lg" c="dimmed">No custom habits yet</Text>
                    <Text size="sm" c="dimmed">
                      Create your first custom habit to start tracking personalized goals
                    </Text>
                    <Button onClick={handleCreateHabit}>
                      Create Custom Habit
                    </Button>
                  </Stack>
                </Paper>
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                  {definedHabits.map(habit => renderHabitCard(habit, false))}
                </SimpleGrid>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>

        {/* Create/Edit Habit Modal */}
        <Modal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          title={editingHabit ? 'Edit Habit' : 'Create New Habit'}
          size="md"
        >
          <form onSubmit={form.onSubmit(handleSaveHabit)}>
            <Stack gap="md">
              <TextInput
                label="Habit Name"
                placeholder="e.g., Reading, Meditation, Exercise"
                {...form.getInputProps('name')}
                required
              />
              
              <TextInput
                label="Unit"
                placeholder="e.g., pages, minutes, hours"
                {...form.getInputProps('unit')}
                required
              />
              
              <NumberInput
                label="Target Quantity"
                placeholder="e.g., 30, 60, 1"
                {...form.getInputProps('targetQuantity')}
                min={0}
              />
              
              <Select
                label="Goal Type"
                data={[
                  { value: 'minimum', label: 'Minimum (at least this much)' },
                  { value: 'maximum', label: 'Maximum (no more than this)' },
                  { value: 'exact', label: 'Exact (exactly this amount)' }
                ]}
                {...form.getInputProps('goalType')}
              />
              
              <TextInput
                label="Category"
                placeholder="e.g., Health, Learning, Productivity"
                {...form.getInputProps('category')}
              />
              
              <Group justify="flex-end" gap="sm">
                <Button variant="light" onClick={() => setModalOpened(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={loading}>
                  {editingHabit ? 'Update Habit' : 'Create Habit'}
                </Button>
              </Group>
            </Stack>
          </form>
        </Modal>
      </Stack>
    </Container>
  );
}
