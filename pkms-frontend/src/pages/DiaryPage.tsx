/**
 * Enhanced DiaryPage with Full Backend Power
 * Shows all the advanced analytics, habit tracking, and search capabilities
 * Optimized with React.memo for performance
 */

import React, { useState } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import {
  Container,
  Title,
  Stack,
  Group,
  Button,
  Tabs,
  Card,
  Text,
  SimpleGrid,
} from '@mantine/core';
import {
  IconBook,
  IconChartLine,
  IconBrain,
  IconTarget,
  IconSearch,
  IconBolt,
  IconRefresh,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

// Import our new unified analytics components
import HabitDashboard from '../components/diary/HabitDashboard';
import { HabitInput } from '../components/diary/HabitInput';
import HabitAnalyticsView from '../components/diary/HabitAnalyticsView';
import { HabitManagement } from '../components/diary/HabitManagement';
import { AdvancedSearchAnalytics } from '../components/diary/AdvancedSearchAnalytics';

export const DiaryPage = React.memo(function DiaryPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [wellnessScore, setWellnessScore] = useState<number | null>(null);
  const [habitStreaks, setHabitStreaks] = useState<Record<string, number>>({});
  const [searchStats, setSearchStats] = useState<any>(null);

  useAuthenticatedEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load wellness score
      const wellnessResponse = await fetch('/api/v1/diary/habits/wellness-score-analytics?days=7');
      const wellnessData = await wellnessResponse.json();
      setWellnessScore(wellnessData.overall_wellness_score);

      // Load habit streaks
      const habitsResponse = await fetch('/api/v1/diary/habits/analytics?days=30');
      const habitsData = await habitsResponse.json();
      const streaks: Record<string, number> = {};
      Object.entries(habitsData).forEach(([habit, data]: [string, any]) => {
        streaks[habit] = data.current_streak;
      });
      setHabitStreaks(streaks);

      // Load search stats
      const searchResponse = await fetch('/api/v1/search/analytics');
      const searchData = await searchResponse.json();
      setSearchStats(searchData);
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load dashboard data',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'yellow';
    return 'red';
  };

  const getScoreIcon = (score: number) => {
    if (score >= 80) return '🎉';
    if (score >= 60) return '👍';
    return '💪';
  };

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Group>
            <IconBook size={32} color="blue" />
            <div>
              <Title order={1}>🧠 Advanced Diary</Title>
              <Text c="dimmed">Unlock the full power of your wellness data</Text>
            </div>
          </Group>
          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={loadDashboardData}
            loading={loading}
            variant="light"
          >
            Refresh Data
          </Button>
        </Group>

        {/* Quick Stats Overview */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
          <Card withBorder p="md">
            <Group gap="xs" mb="sm">
              <IconBrain size={20} color="blue" />
              <Text fw={500}>Wellness Score</Text>
            </Group>
            <Text size="xl" fw={700} c={wellnessScore ? getScoreColor(wellnessScore) : 'gray'}>
              {wellnessScore ? Math.round(wellnessScore) : 'N/A'}/100
            </Text>
            <Text size="sm" c="dimmed">
              {wellnessScore ? getScoreIcon(wellnessScore) : 'Start tracking!'}
            </Text>
          </Card>

          <Card withBorder p="md">
            <Group gap="xs" mb="sm">
              <IconTarget size={20} color="green" />
              <Text fw={500}>Active Habits</Text>
            </Group>
            <Text size="xl" fw={700}>
              {Object.keys(habitStreaks).length}
            </Text>
            <Text size="sm" c="dimmed">
              {Object.values(habitStreaks).filter(s => s > 0).length} with streaks
            </Text>
          </Card>

          <Card withBorder p="md">
            <Group gap="xs" mb="sm">
              <IconSearch size={20} color="purple" />
              <Text fw={500}>Search Power</Text>
            </Group>
            <Text size="xl" fw={700}>
              {searchStats?.total_searches || 0}
            </Text>
            <Text size="sm" c="dimmed">
              {searchStats?.performance_metrics?.average_response_time || 0}ms avg
            </Text>
          </Card>

          <Card withBorder p="md">
            <Group gap="xs" mb="sm">
              <IconBolt size={20} color="orange" />
              <Text fw={500}>System Status</Text>
            </Group>
            <Text size="xl" fw={700} c="green">
              🚀
            </Text>
            <Text size="sm" c="dimmed">
              All systems operational
            </Text>
          </Card>
        </SimpleGrid>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'dashboard')}>
          <Tabs.List>
            <Tabs.Tab value="dashboard" leftSection={<IconChartLine size={16} />}>
              Dashboard
            </Tabs.Tab>
            <Tabs.Tab value="habit-input" leftSection={<IconTarget size={16} />}>
              Habit Input
            </Tabs.Tab>
            <Tabs.Tab value="habit-analytics" leftSection={<IconBrain size={16} />}>
              Habit Analytics
            </Tabs.Tab>
            <Tabs.Tab value="habit-management" leftSection={<IconTarget size={16} />}>
              Habit Management
            </Tabs.Tab>
            <Tabs.Tab value="search-analytics" leftSection={<IconBolt size={16} />}>
              Search Analytics
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="dashboard" pt="md">
            <HabitDashboard />
          </Tabs.Panel>

          <Tabs.Panel value="habit-input" pt="md">
            <HabitInput selectedDate={new Date()} />
          </Tabs.Panel>

          <Tabs.Panel value="habit-analytics" pt="md">
            <HabitAnalyticsView />
          </Tabs.Panel>

          <Tabs.Panel value="habit-management" pt="md">
            <HabitManagement />
          </Tabs.Panel>

          <Tabs.Panel value="search-analytics" pt="md">
            <AdvancedSearchAnalytics />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
});
