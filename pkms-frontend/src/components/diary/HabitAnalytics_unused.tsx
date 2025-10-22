import { useState, useEffect, useCallback } from 'react';
import {
  Paper,
  Stack,
  Group,
  Select,
  ActionIcon,
  SimpleGrid,
  Card,
  Text,
  Badge,
  Alert,
  Loader,
  Center,
  Progress,
  Title,
  Divider,
  Timeline,
  ThemeIcon,
} from '@mantine/core';
import {
  IconRefresh,
  IconSparkles,
  IconAlertCircle,
  IconFlame,
  IconTrendingUp,
  IconTrendingDown,
  IconActivity,
  IconTarget,
  IconTrophy,
  IconCalendar,
} from '@tabler/icons-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { diaryService } from '../../services/diaryService';
import { HabitAnalytics, HabitInsights } from '../../types/diary';
import { useDiaryStore } from '../../stores/diaryStore';

const PERIOD_OPTIONS = [
  { value: '7', label: '1 Week' },
  { value: '30', label: '1 Month' },
  { value: '90', label: '3 Months' },
  { value: '180', label: '6 Months' },
];

const COLORS = [
  '#339af0', // Blue
  '#51cf66', // Green
  '#ff6b6b', // Red
  '#ffd43b', // Yellow
  '#845ef7', // Purple
  '#ff8787', // Pink
  '#4dabf7', // Light Blue
  '#69db7c', // Light Green
];

interface ChartView {
  value: 'overview' | 'streaks' | 'trends' | 'completion' | 'insights';
  label: string;
}

const CHART_VIEWS: ChartView[] = [
  { value: 'overview', label: '📊 Overview' },
  { value: 'streaks', label: '🔥 Streaks' },
  { value: 'trends', label: '📈 Trends' },
  { value: 'completion', label: '✅ Completion Rates' },
  { value: 'insights', label: '💡 Insights' },
];

export function HabitAnalytics() {
  const { isUnlocked } = useDiaryStore();
  const [selectedView, setSelectedView] = useState<ChartView['value']>('overview');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30');
  const [analyticsData, setAnalyticsData] = useState<HabitAnalytics | null>(null);
  const [insightsData, setInsightsData] = useState<HabitInsights | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalyticsData = useCallback(async () => {
    if (!isUnlocked) return;

    setIsLoading(true);
    setError(null);
    try {
      const [analytics, insights] = await Promise.all([
        diaryService.getHabitAnalytics(parseInt(selectedPeriod)),
        diaryService.getHabitInsights(parseInt(selectedPeriod)),
      ]);

      setAnalyticsData(analytics);
      setInsightsData(insights);
    } catch (err: any) {
      console.error('Failed to load habit analytics:', err);
      setError(err.message || 'Failed to load habit analytics');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriod, isUnlocked]);

  useEffect(() => {
    loadAnalyticsData();
  }, [loadAnalyticsData]);

  if (!isUnlocked) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed" ta="center">Unlock your diary to view habit analytics</Text>
      </Paper>
    );
  }

  if (isLoading && !analyticsData) {
    return (
      <Paper p="xl" withBorder>
        <Center>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text c="dimmed">Loading habit analytics...</Text>
          </Stack>
        </Center>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
        {error}
      </Alert>
    );
  }

  const hasData = analyticsData && analyticsData.habits.length > 0;

  // Render different views based on selection
  const renderView = () => {
    if (!hasData) {
      return (
        <Stack align="center" gap="md" py="xl">
          <Text size="xl">🎯</Text>
          <Title order={4}>No habit data yet</Title>
          <Text size="sm" c="dimmed" ta="center" maw={400}>
            Start tracking your daily habits in the Habit Tracker tab to see analytics and insights!
          </Text>
        </Stack>
      );
    }

    switch (selectedView) {
      case 'overview':
        return renderOverview();
      case 'streaks':
        return renderStreaks();
      case 'trends':
        return renderTrends();
      case 'completion':
        return renderCompletion();
      case 'insights':
        return renderInsights();
      default:
        return renderOverview();
    }
  };

  const renderOverview = () => {
    return (
      <Stack gap="md">
        {/* Summary Cards */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
          <Card withBorder>
            <Stack gap={4}>
              <Group gap="xs">
                <IconTarget size={16} color="blue" />
                <Text size="xs" c="dimmed" tt="uppercase">Total Habits</Text>
              </Group>
              <Text size="xl" fw={700}>
                {analyticsData?.habits.length || 0}
              </Text>
            </Stack>
          </Card>

          <Card withBorder>
            <Stack gap={4}>
              <Group gap="xs">
                <IconActivity size={16} color="green" />
                <Text size="xs" c="dimmed" tt="uppercase">Active Days</Text>
              </Group>
              <Text size="xl" fw={700}>
                {analyticsData?.daysWithData || 0}
              </Text>
            </Stack>
          </Card>

          <Card withBorder>
            <Stack gap={4}>
              <Group gap="xs">
                <IconTrophy size={16} color="orange" />
                <Text size="xs" c="dimmed" tt="uppercase">Best Streak</Text>
              </Group>
              <Text size="xl" fw={700} c="orange">
                {Math.max(...(analyticsData?.habits.map(h => h.longestStreak) || [0]))} days
              </Text>
            </Stack>
          </Card>

          <Card withBorder>
            <Stack gap={4}>
              <Group gap="xs">
                <IconTrendingUp size={16} color="purple" />
                <Text size="xs" c="dimmed" tt="uppercase">Avg Completion</Text>
              </Group>
              <Text size="xl" fw={700}>
                {analyticsData ?
                  Math.round(analyticsData.habits.reduce((sum, h) => sum + h.completionRate, 0) / analyticsData.habits.length)
                  : 0}%
              </Text>
            </Stack>
          </Card>
        </SimpleGrid>

        {/* Top Performing Habits */}
        <Card withBorder p="md">
          <Title order={5} mb="md">Top Performing Habits</Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {analyticsData?.habits
              .sort((a, b) => b.completionRate - a.completionRate)
              .slice(0, 6)
              .map((habit, index) => (
                <Group key={habit.name} justify="space-between">
                  <Group gap="xs">
                    <Badge color={COLORS[index % COLORS.length]} size="xs">
                      {index + 1}
                    </Badge>
                    <Text size="sm" tt="capitalize">
                      {habit.name.replace(/_/g, ' ')}
                    </Text>
                  </Group>
                  <Text size="sm" fw={600}>
                    {Math.round(habit.completionRate)}%
                  </Text>
                </Group>
              ))}
          </SimpleGrid>
        </Card>

        {/* Habit Progress Bars */}
        <Card withBorder p="md">
          <Title order={5} mb="md">Habit Completion Rates</Title>
          <Stack gap="sm">
            {analyticsData?.habits
              .sort((a, b) => b.completionRate - a.completionRate)
              .map((habit, index) => (
                <Stack key={habit.name} gap={4}>
                  <Group justify="space-between">
                    <Text size="sm" tt="capitalize">
                      {habit.name.replace(/_/g, ' ')}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {Math.round(habit.completionRate)}% ({habit.daysCompleted}/{analyticsData.totalDays} days)
                    </Text>
                  </Group>
                  <Progress
                    value={habit.completionRate}
                    color={COLORS[index % COLORS.length]}
                    size="sm"
                  />
                </Stack>
              ))}
          </Stack>
        </Card>
      </Stack>
    );
  };

  const renderStreaks = () => {
    const streakData = analyticsData?.habits
      .map(habit => ({
        name: habit.name.replace(/_/g, ' '),
        current: habit.currentStreak,
        longest: habit.longestStreak,
      }))
      .sort((a, b) => b.current - a.current);

    return (
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {streakData?.map((habit, index) => (
            <Card key={habit.name} withBorder p="md">
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Group gap="xs">
                    <IconFlame size={18} color="orange" />
                    <Text size="sm" fw={600} tt="capitalize">
                      {habit.name}
                    </Text>
                  </Group>
                  {habit.current > 0 && (
                    <Badge color="orange" variant="light">
                      🔥 {habit.current}
                    </Badge>
                  )}
                </Group>

                <Group justify="space-between">
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed">Current Streak</Text>
                    <Text size="lg" fw={700} c={habit.current > 0 ? 'orange' : 'dimmed'}>
                      {habit.current} days
                    </Text>
                  </Stack>
                  <Stack gap={2} ta="right">
                    <Text size="xs" c="dimmed">Longest</Text>
                    <Text size="lg" fw={700} c="blue">
                      {habit.longest} days
                    </Text>
                  </Stack>
                </Group>

                {habit.current === habit.longest && habit.current > 0 && (
                  <Group gap="xs" mt="xs">
                    <IconTrophy size={14} color="gold" />
                    <Text size="xs" c="yellow">Personal Best!</Text>
                  </Group>
                )}
              </Stack>
            </Card>
          ))}
        </SimpleGrid>

        {streakData?.some(h => h.current > 0) && (
          <Card withBorder p="md">
            <Title order={5} mb="md">Streak Leaderboard</Title>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={streakData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 12 }}
                />
                <YAxis label={{ value: 'Days', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Bar dataKey="current" fill="#ff6b35" name="Current Streak" />
                <Bar dataKey="longest" fill="#339af0" name="Longest Streak" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}
      </Stack>
    );
  };

  const renderTrends = () => {
    return (
      <Stack gap="md">
        {analyticsData?.habits.map((habit, habitIndex) => (
          <Card key={habit.name} withBorder p="md">
            <Group justify="space-between" mb="md">
              <Title order={6} tt="capitalize">
                {habit.name.replace(/_/g, ' ')} ({habit.unit})
              </Title>
              <Group gap="xs">
                <Text size="xs" c="dimmed">Avg:</Text>
                <Text size="sm" fw={600}>
                  {typeof habit.averageValue === 'number'
                    ? habit.averageValue.toFixed(1)
                    : habit.averageValue
                  } {habit.unit}
                </Text>
              </Group>
            </Group>

            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={habit.trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(date) => new Date(date).toLocaleDateString()}
                  formatter={(value: any, name: string) => [
                    name === 'value' ? `${value} ${habit.unit}` : `${value} days`,
                    name === 'value' ? 'Value' : 'Streak'
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={COLORS[habitIndex % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Value"
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="streak"
                  stroke="#ff6b35"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                  name="Streak"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        ))}
      </Stack>
    );
  };

  const renderCompletion = () => {
    const completionData = analyticsData?.habits.map(habit => ({
      name: habit.name.replace(/_/g, ' '),
      completed: habit.daysCompleted,
      missed: analyticsData.totalDays - habit.daysCompleted,
      rate: habit.completionRate,
    })) || [];

    return (
      <Stack gap="md">
        {/* Completion Pie Chart */}
        <Card withBorder p="md">
          <Title order={5} mb="md">Overall Completion Distribution</Title>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={completionData}
                dataKey="completed"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, rate }) => `${name}: ${Math.round(rate)}%`}
              >
                {completionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any, name: string) => [value, 'Days Completed']} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Completion Timeline */}
        <Card withBorder p="md">
          <Title order={5} mb="md">Completion by Habit</Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {completionData.map((habit, index) => (
              <Stack key={habit.name} gap="xs">
                <Group justify="space-between">
                  <Text size="sm" fw={600} tt="capitalize">
                    {habit.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {habit.completed}/{analyticsData?.totalDays} days
                  </Text>
                </Group>
                <Progress
                  value={(habit.completed / (analyticsData?.totalDays || 1)) * 100}
                  color={COLORS[index % COLORS.length]}
                  size="lg"
                />
                <Text size="xs" c="dimmed" ta="center">
                  {Math.round(habit.rate)}% completion rate
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
        </Card>
      </Stack>
    );
  };

  const renderInsights = () => {
    if (!insightsData?.insights.length) {
      return (
        <Alert color="blue" icon={<IconSparkles size={16} />}>
          <Text>Not enough data to generate insights yet. Keep tracking your habits!</Text>
        </Alert>
      );
    }

    return (
      <Stack gap="md">
        {/* Summary */}
        <Card withBorder p="md">
          <Title order={5} mb="md">Summary</Title>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">Total Habits</Text>
              <Text size="lg" fw={600}>{insightsData.summary.totalHabits}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">Active Habits</Text>
              <Text size="lg" fw={600}>{insightsData.summary.activeHabits}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">Top Performer</Text>
              <Text size="lg" fw={600} c="green" tt="capitalize">
                {insightsData.summary.topPerformingHabit?.replace(/_/g, ' ') || 'N/A'}
              </Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">Most Consistent</Text>
              <Text size="lg" fw={600} c="blue" tt="capitalize">
                {insightsData.summary.mostConsistentHabit?.replace(/_/g, ' ') || 'N/A'}
              </Text>
            </Stack>
          </SimpleGrid>
        </Card>

        {/* Insights Timeline */}
        <Card withBorder p="md">
          <Title order={5} mb="md">Insights & Recommendations</Title>
          <Timeline bulletSize={24} lineWidth={2}>
            {insightsData.insights.map((insight, index) => (
              <Timeline.Item
                key={index}
                bullet={
                  <ThemeIcon color={
                    insight.type === 'positive' ? 'green' :
                    insight.type === 'negative' ? 'red' : 'blue'
                  } size={24}>
                    {insight.type === 'positive' ? <IconTrendingUp size={14} /> :
                     insight.type === 'negative' ? <IconTrendingDown size={14} /> :
                     <IconSparkles size={14} />}
                  </ThemeIcon>
                }
              >
                <Stack gap="xs">
                  <Group gap="xs">
                    <Badge
                      color={
                        insight.type === 'positive' ? 'green' :
                        insight.type === 'negative' ? 'red' : 'blue'
                      }
                      variant="light"
                      size="xs"
                    >
                      {insight.type}
                    </Badge>
                    <Text size="sm" fw={600} tt="capitalize">
                      {insight.habit.replace(/_/g, ' ')}
                    </Text>
                  </Group>
                  <Text size="sm">{insight.message}</Text>
                </Stack>
              </Timeline.Item>
            ))}
          </Timeline>
        </Card>

        {/* Needs Attention */}
        {insightsData.summary.needsAttentionHabits.length > 0 && (
          <Card withBorder p="md">
            <Title order={5} mb="md" c="orange">Habits Needing Attention</Title>
            <Stack gap="xs">
              {insightsData.summary.needsAttentionHabits.map(habit => (
                <Group key={habit} gap="xs">
                  <IconAlertCircle size={14} color="orange" />
                  <Text size="sm" tt="capitalize">{habit.replace(/_/g, ' ')}</Text>
                </Group>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  };

  return (
    <Stack gap="md">
      {/* Controls */}
      <Group justify="space-between" wrap="wrap">
        <Group>
          <Select
            label="View"
            data={CHART_VIEWS}
            value={selectedView}
            onChange={(value) => {
              if (value !== null) {
                setSelectedView(value as ChartView['value']);
              }
            }}
            style={{ minWidth: 200 }}
            size="sm"
          />
          <Select
            label="Period"
            data={PERIOD_OPTIONS}
            value={selectedPeriod}
            onChange={(value) => setSelectedPeriod(value || '30')}
            size="sm"
          />
        </Group>
        <ActionIcon
          variant="light"
          size="lg"
          onClick={loadAnalyticsData}
          loading={isLoading}
          title="Refresh data"
        >
          <IconRefresh size={18} />
        </ActionIcon>
      </Group>

      {/* Main Content */}
      <Paper p="md" withBorder>
        {renderView()}
      </Paper>

      {/* Data Summary */}
      {hasData && analyticsData && (
        <Text size="xs" c="dimmed" ta="center">
          Showing data from {analyticsData.totalDays} days analyzed
          ({analyticsData.periodStart} to {analyticsData.periodEnd})
        </Text>
      )}
    </Stack>
  );
}