/**
 * HabitInput - Daily habit input/tracking interface
 * 
 * This component provides the daily habit tracking interface for both default
 * and defined habits. It allows users to input their daily habit values and
 * displays today's completion status with missing data warnings.
 * 
 * Features:
 * - Daily habit value input for default and defined habits
 * - Today-filled indicator display
 * - Missing data warnings for unfilled habits
 * - Habit type switching (default vs defined)
 * - Real-time validation and feedback
 * - Streak tracking and goal progress
 */

import { useState, useEffect } from 'react';
import { 
  Stack, Group, NumberInput, Button, Badge, Card, LoadingOverlay, 
  Title, Select, Divider, Alert, Text
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { format } from 'date-fns';
import { IconAlertCircle, IconCheck, IconTarget } from '@tabler/icons-react';
import { diaryService } from '../../services/diaryService';

interface HabitConfig {
  habitId: string;
  name: string;
  unit: string;
  goalType?: string;
  targetQuantity?: number;
  isActive?: boolean;
}

interface HabitInputProps {
  selectedDate: Date;
}

export function HabitInput({ selectedDate }: HabitInputProps) {
  const [defaultConfig, setDefaultConfig] = useState<HabitConfig[]>([]);
  const [definedConfig, setDefinedConfig] = useState<HabitConfig[]>([]);
  const [defaultData, setDefaultData] = useState<Record<string, number>>({});
  const [definedData, setDefinedData] = useState<Record<string, number>>({});
  const [defaultStreaks] = useState<Record<string, number>>({});
  const [definedStreaks, setDefinedStreaks] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [currentHabitType, setCurrentHabitType] = useState<'default' | 'defined'>('default');
  
  const dateKey = format(selectedDate, 'yyyy-MM-dd');
  
  // Load all data
  useEffect(() => {
    loadAllData();
  }, [selectedDate]);
  
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      // Load both configs
      const [defaultHabits, definedHabits] = await Promise.all([
        diaryService.getHabitConfig('default'),
        diaryService.getHabitConfig('defined')
      ]);
      setDefaultConfig(defaultHabits);
      setDefinedConfig(definedHabits);
      
      // Load existing data for this date
      const existing = await diaryService.getDailyMetadata(dateKey);
      
      // Parse the JSON *objects* directly
      const defaultDataMap: Record<string, number> = JSON.parse(
        (existing as any)?.defaultHabitsJson || "{}"
      );
      
      const definedHabitsJson = (existing as any)?.definedHabitsJson || "{}";
      const definedDataMap: Record<string, number> = JSON.parse(
        definedHabitsJson
      ).habits || {}; // Get the 'habits' sub-key
      
      setDefaultData(defaultDataMap);
      setDefinedData(definedDataMap);
    } catch (error) {
      console.error('Failed to load habit data:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  
  const handleSave = async () => {
    setIsLoading(true);
    try {
      // Create the single payload object the backend expects
      const payload = {
        default_habits: defaultData,
        defined_habits: definedData
      };

      // Call the service with the correct, unified payload
      const result = await diaryService.updateDailyHabits('unified', dateKey, payload);
      
      if (result.streaks) {
        setDefinedStreaks(result.streaks);
      }

      notifications.show({
        title: 'Saved',
        message: 'Habits saved successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save habits',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const renderHabitInputs = (config: HabitConfig[], data: Record<string, number>, streaks: Record<string, number>, showStreaks: boolean) => {
    return config.map((habit) => (
      <Group key={habit.habitId}>
        <NumberInput
          label={`${habit.name} (${habit.unit})`}
          value={data[habit.habitId] || 0}
          onChange={(val) => {
            if (showStreaks) {
              setDefinedData(prev => ({...prev, [habit.habitId]: Number(val) || 0}));
            } else {
              setDefaultData(prev => ({...prev, [habit.habitId]: Number(val) || 0}));
            }
          }}
          style={{ flex: 1 }}
        />
        {showStreaks && habit.goalType && (
          <Badge color="orange">
            🔥 {streaks[habit.habitId] || 0} day streak
          </Badge>
        )}
      </Group>
    ));
  };
  
  const getCurrentConfig = () => currentHabitType === 'default' ? defaultConfig : definedConfig;
  const getCurrentData = () => currentHabitType === 'default' ? defaultData : definedData;
  const getCurrentStreaks = () => currentHabitType === 'default' ? defaultStreaks : definedStreaks;

  return (
    <Stack gap="md">
      {/* Unified Update Interface */}
      <Card>
        <LoadingOverlay visible={isLoading} />
        <Stack>
          <Group justify="space-between" align="center">
            <Title order={4}>📊 Habit Tracker</Title>
            <Group gap="sm">
              <Select
                value={currentHabitType}
                onChange={(value) => setCurrentHabitType(value as 'default' | 'defined')}
                data={[
                  { value: 'default', label: '📊 Daily Stats' },
                  { value: 'defined', label: '🎯 My Habits' }
                ]}
                size="sm"
              />
              <Button 
                onClick={handleSave}
                loading={isLoading}
                size="sm"
              >
                Save
              </Button>
            </Group>
          </Group>

          <Divider />

          {/* Current Habit Inputs */}
          <Stack>
            {renderHabitInputs(getCurrentConfig(), getCurrentData(), getCurrentStreaks(), currentHabitType === 'defined')}
          </Stack>
        </Stack>
      </Card>

    </Stack>
  );
}
