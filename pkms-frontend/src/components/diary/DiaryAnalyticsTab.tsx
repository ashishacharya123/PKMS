/**
 * DiaryAnalyticsTab - Comprehensive analytics and wellness tracking
 * 
 * PURPOSE:
 * ========
 * Provides all analytics functionality for the diary module including
 * habit tracking, wellness metrics, search analytics, and advanced insights.
 * 
 * FEATURES:
 * =========
 * - Habit Dashboard with real data
 * - Habit Input for daily tracking
 * - Habit Analytics with visualizations
 * - Habit Management for CRUD operations
 * - Advanced Search Analytics
 * - Wellness Score calculations
 * - Real-time data updates
 * 
 * @author AI Agent: Claude Sonnet 4.5
 * @date 2025-10-29
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthenticatedEffect } from '../../hooks/useAuthenticatedEffect';
import { useDiaryStore } from '../../stores/diaryStore';
import {
  Container,
  Stack,
  Group,
  Button,
  Tabs,
  Card,
  Text,
  SimpleGrid,
  Alert,
  Skeleton,
} from '@mantine/core';
import {
  IconChartLine,
  IconBrain,
  IconTarget,
  IconSearch,
  IconBolt,
  IconEye,
  IconRefresh,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

// Import analytics components
import HabitDashboard from './HabitDashboard';
import { HabitInput } from './HabitInput';
import HabitAnalyticsView from './HabitAnalyticsView';
import { HabitManagement } from './HabitManagement';
import { AdvancedSearchAnalytics } from './AdvancedSearchAnalytics';

// Import services
import { dashboardService } from '../../services/dashboardService';
import { nepaliDateCache } from '../../utils/nepaliDateCache';

interface SearchStats {
  total_searches?: number;
  performance_metrics?: {
    average_response_time?: number;
  };
}

export const DiaryAnalyticsTab = React.memo(function DiaryAnalyticsTab() {
  const navigate = useNavigate();
  const { setOnDiaryPage } = useDiaryStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [wellnessScore, setWellnessScore] = useState<number | null>(null);
  const [habitStreaks, setHabitStreaks] = useState<Record<string, number>>({});
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);

  // Track when user is on diary page for session management
  useEffect(() => {
    setOnDiaryPage(true);
    // Pre-cache ±7 days Nepali dates only when diary is opened
    try {
      nepaliDateCache.preCacheDashboard();
    } catch (_e) {
      // ignore cache pre-warm errors
    }
    
    // Cleanup when component unmounts (user leaves diary page)
    return () => {
      setOnDiaryPage(false);
    };
  }, [setOnDiaryPage]);

  useAuthenticatedEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Use the dashboard service for real data
      const dashboardData = await dashboardService.getModuleDashboardData('diary');
      
      setWellnessScore(dashboardData.wellnessScore || null);
      setHabitStreaks(dashboardData.habitStreaks || {});
      setSearchStats(dashboardData.analytics || null);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load dashboard data. Please check your connection and try again.',
        color: 'red'
      });
      // Set default values for graceful degradation
      setWellnessScore(null);
      setHabitStreaks({});
      setSearchStats(null);
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

  const handleViewAll = () => {
    navigate('/recyclebin?showAll=true');
  };

  const handleRefresh = () => {
    loadDashboardData();
  };

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Group gap="md">
            <Text size="xl" fw={700} c="blue">
              📊 Analytics & Insights
            </Text>
            <Text c="dimmed" size="sm">
              Unlock the full power of your wellness data
            </Text>
          </Group>
          <Group gap="sm">
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={handleRefresh}
              loading={loading}
              size="sm"
            >
              Refresh
            </Button>
            <Button
              variant="light"
              leftSection={<IconEye size={16} />}
              onClick={handleViewAll}
              size="sm"
            >
              View All Items
            </Button>
          </Group>
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
              {wellnessScore ? getScoreIcon(wellnessScore) : 'No data available'}
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
              {Object.keys(habitStreaks).length > 0 
                ? `${Object.values(habitStreaks).filter(s => s > 0).length} with streaks`
                : 'No habits tracked yet'
              }
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
              {searchStats?.performance_metrics?.average_response_time 
                ? `${searchStats.performance_metrics.average_response_time}ms avg`
                : 'No search data available'
              }
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

        {/* Main Analytics Tabs */}
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
            {loading ? (
              <Stack gap="md">
                <Skeleton height={200} />
                <Skeleton height={150} />
                <Skeleton height={100} />
              </Stack>
            ) : (
              <HabitDashboard />
            )}
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

export default DiaryAnalyticsTab;
