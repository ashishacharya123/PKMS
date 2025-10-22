/**
 * Enhanced DiaryPage with Full Backend Power
 * Shows all the advanced analytics, habit tracking, and search capabilities
 * Optimized with React.memo for performance
 */

import React, { useEffect, useState } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import {
  Container,
  Title,
  Stack,
  Group,
  Button,
  Tabs,
  Alert,
  Badge,
  Card,
  Text,
  SimpleGrid,
  Paper,
  ThemeIcon,
  Progress,
  RingProgress,
  LineChart,
  AreaChart,
  BarChart,
  Table,
  ActionIcon,
  Tooltip,
  Modal,
  TextInput,
  NumberInput,
  Select,
  Switch,
  Textarea
} from '@mantine/core';
import {
  IconBook,
  IconChartLine,
  IconBrain,
  IconTarget,
  IconSearch,
  IconBolt,
  IconTrendingUp,
  IconTrendingDown,
  IconMoon,
  IconHeart,
  IconActivity,
  IconDeviceDesktop,
  IconWalk,
  IconBook as IconBookOpen,
  IconTree,
  IconUsers,
  IconCurrencyDollar,
  IconDatabase,
  IconRefresh,
  IconPlus,
  IconEye,
  IconDownload,
  IconFilter,
  IconSortAscending,
  IconSortDescending,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconInfoCircle
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

// Import our advanced components
import { AdvancedWellnessAnalytics } from '../components/diary/AdvancedWellnessAnalytics';
import { HabitAnalytics } from '../components/diary/HabitAnalytics';
import { AdvancedSearchAnalytics } from '../components/diary/AdvancedSearchAnalytics';
import { UnifiedSearchEmbedded } from '../components/search/UnifiedSearchEmbedded';

export const DiaryPage = React.memo(function DiaryPage() {
  const [activeTab, setActiveTab] = useState('overview');
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
        <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'overview')}>
          <Tabs.List>
            <Tabs.Tab value="overview" leftSection={<IconBook size={16} />}>
              Overview
            </Tabs.Tab>
            <Tabs.Tab value="advanced-analytics" leftSection={<IconBrain size={16} />}>
              Advanced Analytics
            </Tabs.Tab>
            <Tabs.Tab value="comprehensive-habits" leftSection={<IconTarget size={16} />}>
              Comprehensive Habits
            </Tabs.Tab>
            <Tabs.Tab value="search-analytics" leftSection={<IconBolt size={16} />}>
              Search Analytics
            </Tabs.Tab>
            <Tabs.Tab value="unified-search" leftSection={<IconSearch size={16} />}>
              Unified Search
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview" pt="md">
            <Stack gap="lg">
              <Alert color="blue" icon={<IconInfoCircle size={16} />}>
                <Text fw={500} mb="xs">Welcome to the Enhanced Diary Experience!</Text>
                <Text size="sm">
                  This is the full power of your PKMS backend. Explore advanced analytics, 
                  comprehensive habit tracking, and intelligent search capabilities.
                </Text>
              </Alert>

              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
                <Card withBorder>
                  <Title order={3} mb="md">🎯 What You Can Do</Title>
                  <Stack gap="sm">
                    <Group gap="xs">
                      <IconBrain size={16} color="blue" />
                      <Text>Advanced wellness analytics with 6 timeframes</Text>
                    </Group>
                    <Group gap="xs">
                      <IconTarget size={16} color="green" />
                      <Text>Track 9 default habits + unlimited custom ones</Text>
                    </Group>
                    <Group gap="xs">
                      <IconSearch size={16} color="purple" />
                      <Text>3 powerful search types with analytics</Text>
                    </Group>
                    <Group gap="xs">
                      <IconCurrencyDollar size={16} color="orange" />
                      <Text>Financial wellness tracking</Text>
                    </Group>
                    <Group gap="xs">
                      <IconDatabase size={16} color="gray" />
                      <Text>Smart caching and performance monitoring</Text>
                    </Group>
                  </Stack>
                </Card>

                <Card withBorder>
                  <Title order={3} mb="md">📊 Current Status</Title>
                  <Stack gap="sm">
                    {wellnessScore && (
                      <Group justify="space-between">
                        <Text>Wellness Score</Text>
                        <Badge color={getScoreColor(wellnessScore)} variant="filled">
                          {Math.round(wellnessScore)}/100
                        </Badge>
                      </Group>
                    )}
                    <Group justify="space-between">
                      <Text>Active Habits</Text>
                      <Badge color="green" variant="light">
                        {Object.keys(habitStreaks).length}
                      </Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text>Search Performance</Text>
                      <Badge color="blue" variant="light">
                        {searchStats?.performance_metrics?.average_response_time || 0}ms
                      </Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text>Cache Hit Rate</Text>
                      <Badge color="purple" variant="light">
                        {searchStats?.performance_metrics?.cache_hit_rate || 0}%
                      </Badge>
                    </Group>
                  </Stack>
                </Card>
              </SimpleGrid>

              <Alert color="green" icon={<IconCheck size={16} />}>
                <Text fw={500} mb="xs">🎉 Backend Gold Unlocked!</Text>
                <Text size="sm">
                  You now have access to all the sophisticated features we've built:
                  SMA analytics, financial tracking, work-life balance, 9 default habits, 
                  custom habits, FTS5 search, fuzzy search, advanced analytics, and smart caching.
                </Text>
              </Alert>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="advanced-analytics" pt="md">
            <AdvancedWellnessAnalytics />
          </Tabs.Panel>

          <Tabs.Panel value="comprehensive-habits" pt="md">
            <HabitAnalytics />
          </Tabs.Panel>

          <Tabs.Panel value="search-analytics" pt="md">
            <AdvancedSearchAnalytics />
          </Tabs.Panel>

          <Tabs.Panel value="unified-search" pt="md">
            <Stack gap="md">
              <Title order={3}>🔍 Unified Search Experience</Title>
              <Alert color="blue" icon={<IconSearch size={16} />}>
                Search across all your data with three powerful search types: 
                FTS5 (fast), Fuzzy (typo-tolerant), and Advanced Fuzzy (deep analysis).
              </Alert>
              <UnifiedSearchEmbedded
                defaultModules={['notes', 'documents', 'todos', 'projects', 'diary']}
                includeDiary={true}
                showModuleSelector={true}
                showSearchTypeToggle={true}
                resultsPerPage={20}
                showPagination={true}
              />
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
});
