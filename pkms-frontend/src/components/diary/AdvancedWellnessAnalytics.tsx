/**
 * Advanced Wellness Analytics Component
 * Shows the full power of the backend analytics system
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
  Select,
  ThemeIcon,
  Paper,
  Divider,
  Timeline,
  RingProgress,
  LineChart,
  AreaChart,
  BarChart,
  PieChart
} from '@mantine/core';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconBrain,
  IconHeart,
  IconActivity,
  IconMoon,
  IconSun,
  IconCurrencyDollar,
  IconChartLine,
  IconTarget,
  IconClock,
  IconUsers,
  IconBook,
  IconTree,
  IconDeviceDesktop,
  IconRefresh
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface WellnessStats {
  period_start: string;
  period_end: string;
  total_days: number;
  days_with_data: number;
  average_mood: number;
  mood_trend: Array<{ date: string; value: number; label?: string }>;
  mood_distribution: Record<number, number>;
  // Default habits
  average_sleep: number;
  sleep_trend: Array<{ date: string; value: number }>;
  average_stress: number;
  stress_trend: Array<{ date: string; value: number }>;
  average_exercise: number;
  exercise_trend: Array<{ date: string; value: number }>;
  average_meditation: number;
  meditation_trend: Array<{ date: string; value: number }>;
  average_screen_time: number;
  screen_time_trend: Array<{ date: string; value: number }>;
  // Financial tracking
  financial_trend: Array<{ date: string; income: number; expense: number }>;
  total_income: number;
  total_expense: number;
  net_savings: number;
  average_daily_income: number;
  average_daily_expense: number;
  // Long-term averages
  average_daily_income_3m: number;
  average_daily_expense_3m: number;
  average_daily_income_6m: number;
  average_daily_expense_6m: number;
  // Overall wellness score
  overall_wellness_score: number;
  score_components: Record<string, number>;
  // Defined habits
  defined_habits_summary: Record<string, any>;
  insights: Array<{ type: string; message: string; impact: string }>;
}

interface HabitAnalytics {
  [habitKey: string]: {
    average: number;
    trend: 'improving' | 'stable' | 'declining';
    consistency: number;
    best_streak: number;
    current_streak: number;
    chart_data: Array<{ date: string; value: number }>;
  };
}

export function AdvancedWellnessAnalytics() {
  const [wellnessStats, setWellnessStats] = useState<WellnessStats | null>(null);
  const [habitAnalytics, setHabitAnalytics] = useState<HabitAnalytics>({});
  const [loading, setLoading] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('30');
  const [activeTab, setActiveTab] = useState('overview');

  const timeframes = [
    { value: '7', label: '7 Days' },
    { value: '30', label: '30 Days' },
    { value: '90', label: '3 Months' },
    { value: '180', label: '6 Months' },
    { value: '365', label: '1 Year' }
  ];

  const loadWellnessStats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/diary/habits/wellness-score-analytics?days=${selectedTimeframe}`);
      const data = await response.json();
      setWellnessStats(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load wellness analytics',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const loadHabitAnalytics = async () => {
    try {
      const response = await fetch(`/api/v1/diary/habits/analytics?days=${selectedTimeframe}`);
      const data = await response.json();
      setHabitAnalytics(data);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load habit analytics',
        color: 'red'
      });
    }
  };

  useEffect(() => {
    loadWellnessStats();
    loadHabitAnalytics();
  }, [selectedTimeframe]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'yellow';
    return 'red';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving': return <IconTrendingUp size={16} color="green" />;
      case 'declining': return <IconTrendingDown size={16} color="red" />;
      default: return <IconChartLine size={16} color="blue" />;
    }
  };

  if (loading) {
    return (
      <Container size="xl" py="md">
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={2}>Advanced Wellness Analytics</Title>
            <Button loading>Loading...</Button>
          </Group>
          <Alert color="blue" icon={<IconRefresh size={16} />}>
            Analyzing your wellness data... This may take a moment for longer timeframes.
          </Alert>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2}>🧠 Advanced Wellness Analytics</Title>
          <Group>
            <Select
              value={selectedTimeframe}
              onChange={(value) => setSelectedTimeframe(value || '30')}
              data={timeframes}
              size="sm"
            />
            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={() => {
                loadWellnessStats();
                loadHabitAnalytics();
              }}
              variant="light"
            >
              Refresh
            </Button>
          </Group>
        </Group>

        {wellnessStats && (
          <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'overview')}>
            <Tabs.List>
              <Tabs.Tab value="overview" leftSection={<IconBrain size={16} />}>
                Overview
              </Tabs.Tab>
              <Tabs.Tab value="habits" leftSection={<IconTarget size={16} />}>
                Habits
              </Tabs.Tab>
              <Tabs.Tab value="financial" leftSection={<IconCurrencyDollar size={16} />}>
                Financial
              </Tabs.Tab>
              <Tabs.Tab value="insights" leftSection={<IconChartLine size={16} />}>
                Insights
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="overview" pt="md">
              <Stack gap="lg">
                {/* Overall Wellness Score */}
                <Card withBorder>
                  <Group justify="space-between" mb="md">
                    <Title order={3}>Overall Wellness Score</Title>
                    <Badge
                      size="xl"
                      color={getScoreColor(wellnessStats.overall_wellness_score)}
                      variant="filled"
                    >
                      {Math.round(wellnessStats.overall_wellness_score)}/100
                    </Badge>
                  </Group>
                  
                  <RingProgress
                    size={200}
                    thickness={20}
                    sections={[
                      { value: wellnessStats.overall_wellness_score, color: getScoreColor(wellnessStats.overall_wellness_score) }
                    ]}
                    label={
                      <Text size="xl" fw={700} ta="center">
                        {Math.round(wellnessStats.overall_wellness_score)}
                      </Text>
                    }
                  />

                  <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} mt="md">
                    {Object.entries(wellnessStats.score_components).map(([component, score]) => (
                      <Paper key={component} p="sm" withBorder>
                        <Text size="sm" fw={500} mb="xs">
                          {component.replace('_', ' ').toUpperCase()}
                        </Text>
                        <Progress
                          value={score}
                          color={getScoreColor(score)}
                          size="sm"
                        />
                        <Text size="xs" c="dimmed" mt="xs">
                          {Math.round(score)}/100
                        </Text>
                      </Paper>
                    ))}
                  </SimpleGrid>
                </Card>

                {/* Mood Analysis */}
                <Card withBorder>
                  <Title order={3} mb="md">Mood Analysis</Title>
                  <SimpleGrid cols={{ base: 1, md: 2 }} gap="md">
                    <div>
                      <Text size="sm" c="dimmed" mb="xs">Average Mood</Text>
                      <Text size="xl" fw={700}>
                        {wellnessStats.average_mood?.toFixed(1) || 'N/A'}/5
                      </Text>
                      <Progress
                        value={(wellnessStats.average_mood || 0) * 20}
                        color="blue"
                        size="sm"
                        mt="xs"
                      />
                    </div>
                    <div>
                      <Text size="sm" c="dimmed" mb="xs">Mood Distribution</Text>
                      <SimpleGrid cols={5} spacing="xs">
                        {Object.entries(wellnessStats.mood_distribution).map(([mood, count]) => (
                          <div key={mood} style={{ textAlign: 'center' }}>
                            <Text size="xs">{mood}</Text>
                            <Text size="lg" fw={700}>{count}</Text>
                          </div>
                        ))}
                      </SimpleGrid>
                    </div>
                  </SimpleGrid>
                  
                  {wellnessStats.mood_trend.length > 0 && (
                    <LineChart
                      h={200}
                      data={wellnessStats.mood_trend}
                      dataKey="date"
                      series={[{ name: 'value', color: 'blue' }]}
                      mt="md"
                    />
                  )}
                </Card>

                {/* Default Habits Overview */}
                <Card withBorder>
                  <Title order={3} mb="md">Core Wellness Habits</Title>
                  <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} gap="md">
                    <Paper p="sm" withBorder>
                      <Group gap="xs" mb="xs">
                        <IconMoon size={16} color="blue" />
                        <Text size="sm" fw={500}>Sleep</Text>
                      </Group>
                      <Text size="xl" fw={700}>
                        {wellnessStats.average_sleep?.toFixed(1) || 'N/A'}h
                      </Text>
                      <Text size="xs" c="dimmed">avg per night</Text>
                    </Paper>

                    <Paper p="sm" withBorder>
                      <Group gap="xs" mb="xs">
                        <IconActivity size={16} color="green" />
                        <Text size="sm" fw={500}>Exercise</Text>
                      </Group>
                      <Text size="xl" fw={700}>
                        {wellnessStats.average_exercise?.toFixed(0) || 'N/A'}min
                      </Text>
                      <Text size="xs" c="dimmed">avg per day</Text>
                    </Paper>

                    <Paper p="sm" withBorder>
                      <Group gap="xs" mb="xs">
                        <IconBrain size={16} color="purple" />
                        <Text size="sm" fw={500}>Meditation</Text>
                      </Group>
                      <Text size="xl" fw={700}>
                        {wellnessStats.average_meditation?.toFixed(0) || 'N/A'}min
                      </Text>
                      <Text size="xs" c="dimmed">avg per day</Text>
                    </Paper>

                    <Paper p="sm" withBorder>
                      <Group gap="xs" mb="xs">
                        <IconDeviceDesktop size={16} color="orange" />
                        <Text size="sm" fw={500}>Screen Time</Text>
                      </Group>
                      <Text size="xl" fw={700}>
                        {wellnessStats.average_screen_time?.toFixed(1) || 'N/A'}h
                      </Text>
                      <Text size="xs" c="dimmed">avg per day</Text>
                    </Paper>

                    <Paper p="sm" withBorder>
                      <Group gap="xs" mb="xs">
                        <IconHeart size={16} color="red" />
                        <Text size="sm" fw={500}>Stress Level</Text>
                      </Group>
                      <Text size="xl" fw={700}>
                        {wellnessStats.average_stress?.toFixed(1) || 'N/A'}/5
                      </Text>
                      <Text size="xs" c="dimmed">avg per day</Text>
                    </Paper>
                  </SimpleGrid>
                </Card>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="habits" pt="md">
              <Stack gap="lg">
                <Title order={3}>Habit Analytics</Title>
                
                {/* Default Habits */}
                <Card withBorder>
                  <Title order={4} mb="md">Core Habits Performance</Title>
                  <SimpleGrid cols={{ base: 1, md: 2 }} gap="md">
                    {Object.entries(habitAnalytics).map(([habit, analytics]) => (
                      <Paper key={habit} p="md" withBorder>
                        <Group justify="space-between" mb="sm">
                          <Text fw={500} tt="uppercase">
                            {habit.replace('_', ' ')}
                          </Text>
                          {getTrendIcon(analytics.trend)}
                        </Group>
                        
                        <Text size="xl" fw={700} mb="xs">
                          {analytics.average.toFixed(1)}
                        </Text>
                        
                        <Group justify="space-between" mb="sm">
                          <div>
                            <Text size="xs" c="dimmed">Consistency</Text>
                            <Text size="sm" fw={500}>
                              {Math.round(analytics.consistency)}%
                            </Text>
                          </div>
                          <div>
                            <Text size="xs" c="dimmed">Best Streak</Text>
                            <Text size="sm" fw={500}>
                              {analytics.best_streak} days
                            </Text>
                          </div>
                          <div>
                            <Text size="xs" c="dimmed">Current</Text>
                            <Text size="sm" fw={500}>
                              {analytics.current_streak} days
                            </Text>
                          </div>
                        </Group>

                        {analytics.chart_data.length > 0 && (
                          <LineChart
                            h={100}
                            data={analytics.chart_data}
                            dataKey="date"
                            series={[{ name: 'value', color: 'blue' }]}
                          />
                        )}
                      </Paper>
                    ))}
                  </SimpleGrid>
                </Card>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="financial" pt="md">
              <Stack gap="lg">
                <Title order={3}>Financial Wellness</Title>
                
                <SimpleGrid cols={{ base: 1, md: 3 }} gap="md">
                  <Card withBorder>
                    <Group gap="xs" mb="sm">
                      <IconCurrencyDollar size={16} color="green" />
                      <Text fw={500}>Total Income</Text>
                    </Group>
                    <Text size="xl" fw={700} c="green">
                      ₹{wellnessStats.total_income.toLocaleString()}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Avg: ₹{wellnessStats.average_daily_income?.toFixed(0)}/day
                    </Text>
                  </Card>

                  <Card withBorder>
                    <Group gap="xs" mb="sm">
                      <IconCurrencyDollar size={16} color="red" />
                      <Text fw={500}>Total Expenses</Text>
                    </Group>
                    <Text size="xl" fw={700} c="red">
                      ₹{wellnessStats.total_expense.toLocaleString()}
                    </Text>
                    <Text size="xs" c="dimmed">
                      Avg: ₹{wellnessStats.average_daily_expense?.toFixed(0)}/day
                    </Text>
                  </Card>

                  <Card withBorder>
                    <Group gap="xs" mb="sm">
                      <IconTrendingUp size={16} color="blue" />
                      <Text fw={500}>Net Savings</Text>
                    </Group>
                    <Text size="xl" fw={700} c={wellnessStats.net_savings >= 0 ? 'green' : 'red'}>
                      ₹{wellnessStats.net_savings.toLocaleString()}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {wellnessStats.net_savings >= 0 ? 'Positive' : 'Negative'} balance
                    </Text>
                  </Card>
                </SimpleGrid>

                {wellnessStats.financial_trend.length > 0 && (
                  <Card withBorder>
                    <Title order={4} mb="md">Financial Trend</Title>
                    <AreaChart
                      h={300}
                      data={wellnessStats.financial_trend}
                      dataKey="date"
                      series={[
                        { name: 'income', color: 'green' },
                        { name: 'expense', color: 'red' }
                      ]}
                    />
                  </Card>
                )}

                <SimpleGrid cols={{ base: 1, md: 2 }} gap="md">
                  <Card withBorder>
                    <Title order={4} mb="md">3-Month Averages</Title>
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Text>Daily Income</Text>
                        <Text fw={500}>₹{wellnessStats.average_daily_income_3m?.toFixed(0)}</Text>
                      </Group>
                      <Group justify="space-between">
                        <Text>Daily Expense</Text>
                        <Text fw={500}>₹{wellnessStats.average_daily_expense_3m?.toFixed(0)}</Text>
                      </Group>
                    </Stack>
                  </Card>

                  <Card withBorder>
                    <Title order={4} mb="md">6-Month Averages</Title>
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Text>Daily Income</Text>
                        <Text fw={500}>₹{wellnessStats.average_daily_income_6m?.toFixed(0)}</Text>
                      </Group>
                      <Group justify="space-between">
                        <Text>Daily Expense</Text>
                        <Text fw={500}>₹{wellnessStats.average_daily_expense_6m?.toFixed(0)}</Text>
                      </Group>
                    </Stack>
                  </Card>
                </SimpleGrid>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="insights" pt="md">
              <Stack gap="lg">
                <Title order={3}>AI-Powered Insights</Title>
                
                {wellnessStats.insights.length > 0 ? (
                  <Timeline active={wellnessStats.insights.length - 1}>
                    {wellnessStats.insights.map((insight, index) => (
                      <Timeline.Item
                        key={index}
                        bullet={<IconBrain size={12} />}
                        title={insight.type}
                      >
                        <Text size="sm" mb="xs">
                          {insight.message}
                        </Text>
                        <Badge color="blue" variant="light" size="sm">
                          {insight.impact}
                        </Badge>
                      </Timeline.Item>
                    ))}
                  </Timeline>
                ) : (
                  <Alert color="blue" icon={<IconBrain size={16} />}>
                    No insights available yet. Keep tracking your habits to get personalized insights!
                  </Alert>
                )}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        )}
      </Stack>
    </Container>
  );
}
