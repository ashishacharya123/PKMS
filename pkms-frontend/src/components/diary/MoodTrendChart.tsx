import { useMemo, useState } from 'react';
import {
  Paper,
  Title,
  Text,
  Group,
  Stack,
  Grid,
  Card,
  Progress,
  Tooltip,
  Badge,
  Select,
  ActionIcon,
} from '@mantine/core';
import { IconTrendingUp, IconTrendingDown, IconMinus, IconRefresh } from '@tabler/icons-react';
import { useDiaryStore } from '../../stores/diaryStore';
import { format, parseISO, subDays, isAfter } from 'date-fns';

interface MoodDataPoint {
  date: string;
  mood: number;
  movingAverage: number;
  dayOfWeek: string;
}

interface TrendPeriod {
  value: string;
  label: string;
  days: number;
}

const trendPeriods: TrendPeriod[] = [
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
];

const moodColors = {
  1: '#fa5252', // red
  2: '#fd7e14', // orange  
  3: '#fab005', // yellow
  4: '#51cf66', // green
  5: '#339af0'  // blue
};

const moodEmojis = {
  1: '😢',
  2: '😕',
  3: '😐', 
  4: '😊',
  5: '😄'
};

export function MoodTrendChart({ compact = false, h }: { compact?: boolean; h?: number | string }) {
  const { entries, isUnlocked, loadEntries } = useDiaryStore();
  const [selectedPeriod, setSelectedPeriod] = useState('30');

  const trendData = useMemo(() => {
    if (!entries.length) return [];

    const period = trendPeriods.find(p => p.value === selectedPeriod);
    const days = period?.days || 30;
    const cutoffDate = subDays(new Date(), days);

    // Filter entries within the selected period and with mood data
    const filteredEntries = entries
      .filter(entry => {
        const entryDate = parseISO(entry.date);
        return isAfter(entryDate, cutoffDate) && entry.mood;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (!filteredEntries.length) return [];

    // Calculate moving average (7-day window)
    const movingAverageWindow = 7;
    const data: MoodDataPoint[] = filteredEntries.map((entry, index) => {
      const startIndex = Math.max(0, index - Math.floor(movingAverageWindow / 2));
      const endIndex = Math.min(filteredEntries.length - 1, index + Math.floor(movingAverageWindow / 2));
      
      const windowEntries = filteredEntries.slice(startIndex, endIndex + 1);
      const movingAverage = windowEntries.reduce((sum, e) => sum + (e.mood || 0), 0) / windowEntries.length;

      return {
        date: entry.date,
        mood: entry.mood || 0,
        movingAverage,
        dayOfWeek: format(parseISO(entry.date), 'EEEE'),
      };
    });

    return data;
  }, [entries, selectedPeriod]);

  const trendAnalysis = useMemo(() => {
    if (trendData.length < 2) return null;

    const firstWeek = trendData.slice(0, Math.min(7, trendData.length));
    const lastWeek = trendData.slice(-Math.min(7, trendData.length));

    const firstWeekAvg = firstWeek.reduce((sum, d) => sum + d.mood, 0) / firstWeek.length;
    const lastWeekAvg = lastWeek.reduce((sum, d) => sum + d.mood, 0) / lastWeek.length;

    const change = lastWeekAvg - firstWeekAvg;
    const changePercent = Math.abs(change / firstWeekAvg) * 100;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (change > 0.2) trend = 'up';
    else if (change < -0.2) trend = 'down';

    return {
      change,
      changePercent,
      trend,
      firstWeekAvg,
      lastWeekAvg,
    };
  }, [trendData]);

  const weeklyPattern = useMemo(() => {
    if (!trendData.length) return [];

    const dayGroups = trendData.reduce((acc, point) => {
      if (!acc[point.dayOfWeek]) {
        acc[point.dayOfWeek] = [];
      }
      acc[point.dayOfWeek].push(point.mood);
      return acc;
    }, {} as Record<string, number[]>);

    return Object.entries(dayGroups).map(([day, moods]) => ({
      day,
      average: moods.reduce((sum, mood) => sum + mood, 0) / moods.length,
      count: moods.length,
    })).sort((a, b) => {
      const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
    });
  }, [trendData]);

  const handleRefresh = () => {
    loadEntries();
  };

  if (!isUnlocked) {
    return null;
  }

  if (!trendData.length) {
    return (
      <Paper p={compact ? 'md' : 'lg'} withBorder>
        <Stack gap={compact ? 'sm' : 'md'} align="center" py={compact ? 'md' : 'xl'}>
          <Text size="xl">📈</Text>
          <Text fw={500} ta="center">No mood trend data</Text>
          <Text size="sm" c="dimmed" ta="center" maw={400}>
            Add more diary entries with mood ratings to see your mood trends over time.
          </Text>
        </Stack>
      </Paper>
    );
  }

  const getTrendIcon = () => {
    if (!trendAnalysis) return <IconMinus size={16} />;
    
    switch (trendAnalysis.trend) {
      case 'up': return <IconTrendingUp size={16} color="green" />;
      case 'down': return <IconTrendingDown size={16} color="red" />;
      default: return <IconMinus size={16} color="gray" />;
    }
  };

  const getTrendMessage = () => {
    if (!trendAnalysis) return 'Not enough data for trend analysis';
    
    const { trend, changePercent } = trendAnalysis;
    const direction = trend === 'up' ? 'improved' : trend === 'down' ? 'declined' : 'remained stable';
    
    return `Your mood has ${direction} by ${changePercent.toFixed(1)}% over this period`;
  };

  return (
    <Paper p={compact ? 'md' : 'lg'} withBorder h={h}>
      <Stack gap={compact ? 'md' : 'lg'}>
        <Group justify="space-between" align="center">
          <Title order={compact ? 4 : 3} size={compact ? 'h5' : 'h4'}>
            <Group gap="xs">
              {getTrendIcon()}
              Mood Trends
            </Group>
          </Title>
          <Group gap="xs">
            <Select
              value={selectedPeriod}
              onChange={(value) => setSelectedPeriod(value || '30')}
              data={trendPeriods}
              size={compact ? 'xs' : 'xs'}
              w={compact ? 110 : 120}
            />
            <ActionIcon
              variant="light"
              size="sm"
              onClick={handleRefresh}
            >
              <IconRefresh size={14} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Trend Summary */}
        {trendAnalysis && !compact && (
          <Card withBorder p="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" fw={500}>Trend Analysis</Text>
                <Badge 
                  color={
                    trendAnalysis.trend === 'up' ? 'green' : 
                    trendAnalysis.trend === 'down' ? 'red' : 'gray'
                  }
                  variant="light"
                >
                  {trendAnalysis.trend === 'up' ? '↗ Improving' : 
                   trendAnalysis.trend === 'down' ? '↘ Declining' : '→ Stable'}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                {getTrendMessage()}
              </Text>
              <Progress
                value={Math.abs(trendAnalysis.change) * 20} // Scale to 0-100
                color={
                  trendAnalysis.trend === 'up' ? 'green' : 
                  trendAnalysis.trend === 'down' ? 'red' : 'gray'
                }
                size="xs"
              />
            </Stack>
          </Card>
        )}

        {/* Simple Chart Visualization */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Text size="sm" fw={500}>Mood Over Time</Text>
            {trendData.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'end', gap: '2px', height: compact ? '80px' : '120px' }}>
                {trendData.map((point, index) => {
                const height = (point.mood / 5) * 100;
                const movingAvgHeight = (point.movingAverage / 5) * 100;
                
                return (
                  <Tooltip
                    key={index}
                    label={`${format(parseISO(point.date), 'MMM d')}: ${point.mood}/5 (${moodEmojis[point.mood as keyof typeof moodEmojis]})`}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth: '8px',
                        position: 'relative',
                        cursor: 'pointer',
                      }}
                    >
                      {/* Moving average line */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          width: '100%',
                          height: `${movingAvgHeight}%`,
                          backgroundColor: 'rgba(34, 139, 34, 0.3)',
                          borderRadius: '2px 2px 0 0',
                        }}
                      />
                      {/* Actual mood bar */}
                      <div
                        style={{
                          height: `${height}%`,
                          backgroundColor: moodColors[point.mood as keyof typeof moodColors],
                          borderRadius: '2px 2px 0 0',
                          minHeight: '2px',
                        }}
                      />
                    </div>
                  </Tooltip>
                );
                              })}
              </div>
            ) : (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No mood data available for the selected period
              </Text>
            )}
            {trendData.length > 0 && (
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  {format(parseISO(trendData[0].date), 'MMM d')}
                </Text>
                <Group gap="xs">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '12px', height: '8px', backgroundColor: '#339af0', borderRadius: '2px' }} />
                    <Text size="xs" c="dimmed">Mood</Text>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '12px', height: '8px', backgroundColor: 'rgba(34, 139, 34, 0.5)', borderRadius: '2px' }} />
                    <Text size="xs" c="dimmed">Trend</Text>
                  </div>
                </Group>
                <Text size="xs" c="dimmed">
                  {format(parseISO(trendData[trendData.length - 1].date), 'MMM d')}
                </Text>
              </Group>
            )}
          </Stack>
        </Card>

        {/* Weekly Pattern */}
        {weeklyPattern.length > 0 && trendData.length > 0 && !compact && (
          <Card withBorder p="md">
            <Stack gap="md">
              <Text size="sm" fw={500}>Weekly Pattern</Text>
              <Grid>
                {weeklyPattern.map((dayData) => (
                  <Grid.Col span={{ base: 6, xs: 3, sm: 1.7 }} key={dayData.day}>
                    <Stack gap="xs" align="center">
                      <Text size="xs" c="dimmed" ta="center">
                        {dayData.day.slice(0, 3)}
                      </Text>
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: moodColors[Math.round(dayData.average) as keyof typeof moodColors],
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                        }}
                      >
                        {moodEmojis[Math.round(dayData.average) as keyof typeof moodEmojis]}
                      </div>
                      <Text size="xs" fw={500}>
                        {dayData.average.toFixed(1)}
                      </Text>
                    </Stack>
                  </Grid.Col>
                ))}
              </Grid>
            </Stack>
          </Card>
        )}
      </Stack>
    </Paper>
  );
}
