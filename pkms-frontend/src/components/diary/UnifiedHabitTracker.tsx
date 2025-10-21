import { useState, useEffect } from 'react';
import { 
  Stack, Group, NumberInput, Button, Badge, Card, LoadingOverlay, 
  Title, Select, Divider
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { format } from 'date-fns';
import { diaryService } from '../../services/diaryService';

interface HabitConfig {
  habitId: string;
  name: string;
  unit: string;
  goalType?: string;
  targetQuantity?: number;
  isActive?: boolean;
}

interface UnifiedHabitTrackerProps {
  selectedDate: Date;
}



export function UnifiedHabitTracker({ selectedDate }: UnifiedHabitTrackerProps) {
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
      const defaultDailyData = (existing as any)?.defaultHabitsJson || [];
      const definedDailyData = (existing as any)?.definedHabitsJson || [];
      
      const defaultDataMap: Record<string, number> = {};
      const definedDataMap: Record<string, number> = {};
      
      defaultDailyData.forEach((entry: any) => {
        defaultDataMap[entry.habitId] = entry.loggedQuantity;
      });
      
      definedDailyData.forEach((entry: any) => {
        definedDataMap[entry.habitId] = entry.loggedQuantity;
      });
      
      setDefaultData(defaultDataMap);
      setDefinedData(definedDataMap);
    } catch (error) {
      console.error('Failed to load habit data:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  
  const handleSaveDefault = async () => {
    setIsLoading(true);
    try {
      await diaryService.updateDailyHabits('default', dateKey, defaultData);
      notifications.show({
        title: 'Saved',
        message: 'Daily stats saved successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save daily stats',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSaveDefined = async () => {
    setIsLoading(true);
    try {
      const result = await diaryService.updateDailyHabits('defined', dateKey, definedData);
      
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
                onClick={currentHabitType === 'default' ? handleSaveDefault : handleSaveDefined}
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
