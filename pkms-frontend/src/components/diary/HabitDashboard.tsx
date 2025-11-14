/**
 * HabitDashboard - Lightweight dashboard summary for instant load (< 100ms)
 * 
 * This component provides a fast-loading dashboard with key metrics overview,
 * missing data warnings, and personalized insights. It fetches from the
 * lightweight /habits/dashboard endpoint for optimal performance.
 * 
 * Features:
 * - Ultra-fast response (< 100ms)
 * - Key metrics overview (sleep, exercise, mood)
 * - Missing data warnings with specific habits
 * - Personalized insights and recommendations
 * - Quick action buttons for navigation
 * - Mini sparkline trends
 * - Smart refresh only when needed (tab focus, manual refresh)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Paper,
  Stack,
  Group,
  Card,
  Text,
  Badge,
  Button,
  Alert,
  SimpleGrid,
  Progress,
  Center,
  Loader,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconAlertCircle,
  IconChartLine,
  IconClipboardList,
  IconRefresh,
  IconWalk,
  IconMoodHappy,
  IconMoon,
  IconTarget,
} from '@tabler/icons-react';
import HabitCharts from './HabitCharts';
import { diaryService } from '../../services/diaryService';

interface DashboardData {
  sleep_avg_7d: number;
  exercise_streak: number;
  mood_today: number;
  missing_today: string[];
  top_insights: string[];
  last_updated: string;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  icon: React.ReactNode;
  color: string;
  goal?: number;
  current?: number;
}

function MetricCard({ title, value, unit, trend, icon, color, goal, current }: MetricCardProps) {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return <IconTrendingUp size={16} color="green" />;
      case 'down': return <IconTrendingDown size={16} color="red" />;
      default: return <IconMinus size={16} color="gray" />;
    }
  };

  const getProgressValue = () => {
    if (goal && current !== undefined) {
      return Math.min((current / goal) * 100, 100);
    }
    return undefined;
  };

  return (
    <Card withBorder p="md" style={{ height: '100%' }}>
      <Stack spacing="sm">
        <Group position="apart">
          <Group spacing="xs">
            {icon}
            <Text size="sm" weight={500} color="dimmed">
              {title}
            </Text>
          </Group>
          {getTrendIcon()}
        </Group>
        
        <div>
          <Text size="xl" weight={700} color={color}>
            {value}{unit}
          </Text>
          {goal && current !== undefined && (
            <Progress
              value={getProgressValue()}
              size="sm"
              mt="xs"
              color={getProgressValue()! >= 80 ? 'green' : getProgressValue()! >= 60 ? 'yellow' : 'red'}
            />
          )}
        </div>
      </Stack>
    </Card>
  );
}

export default function HabitDashboard() {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [dashboard, analytics] = await Promise.all([
        diaryService.getHabitsDashboardSummary(),
        diaryService.getDefaultHabitsAnalytics(7, false, [])
      ]);
      setDashboardData(dashboard);
      setAnalyticsData(analytics);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Smart refresh: only when user returns to tab or manually refreshes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // User returned to tab, refresh data (might have changed)
        loadDashboardData();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadDashboardData]);

  const handleFillTodaysData = () => {
    navigate('/diary?tab=diary');
  };

  const handleViewAnalytics = () => {
    navigate('/diary?tab=analytics');
  };

  if (loading && !dashboardData) {
    return (
      <Paper p="md">
        <Center style={{ height: 200 }}>
          <Stack align="center" spacing="sm">
            <Loader size="md" />
            <Text size="sm" color="dimmed">Loading dashboard...</Text>
          </Stack>
        </Center>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper p="md">
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Dashboard Error"
          color="red"
        >
          {error}
        </Alert>
      </Paper>
    );
  }

  if (!dashboardData) {
    return (
      <Paper p="md">
        <Center style={{ height: 200 }}>
          <Text color="dimmed">No dashboard data available</Text>
        </Center>
      </Paper>
    );
  }

  const { sleep_avg_7d, exercise_streak, mood_today, missing_today, top_insights } = dashboardData;

  // Calculate trends (simplified - would be enhanced with actual trend data)
  const getSleepTrend = (): 'up' | 'down' | 'stable' => {
    if (sleep_avg_7d >= 7.5) return 'up';
    if (sleep_avg_7d < 6.5) return 'down';
    return 'stable';
  };

  const getMoodTrend = (): 'up' | 'down' | 'stable' => {
    if (mood_today >= 4) return 'up';
    if (mood_today < 3) return 'down';
    return 'stable';
  };

  const getExerciseTrend = (): 'up' | 'down' | 'stable' => {
    if (exercise_streak >= 5) return 'up';
    if (exercise_streak < 2) return 'down';
    return 'stable';
  };

  return (
    <Paper p="md">
      <Stack spacing="md">
        {/* Header */}
        <Group position="apart">
          <div>
            <Text size="xl" weight={700}>
              Habit Dashboard
            </Text>
            <Text size="sm" color="dimmed">
              Quick overview of your wellness metrics
            </Text>
          </div>
          <Group spacing="xs">
            <Tooltip label="Last updated">
              <Text size="xs" color="dimmed">
                {lastRefresh.toLocaleTimeString()}
              </Text>
            </Tooltip>
            <ActionIcon
              variant="light"
              onClick={loadDashboardData}
              loading={loading}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Missing today banner */}
        {missing_today.length > 0 && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Missing Today's Data"
            color="orange"
          >
            <Text size="sm">
              You haven't filled in today's data for: {missing_today.join(', ')}
            </Text>
            </Alert>
        )}

        {/* Key metrics */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          <MetricCard
            title="Sleep (7d avg)"
            value={sleep_avg_7d.toFixed(1)}
            unit="h"
            trend={getSleepTrend()}
            icon={<IconMoon size={20} color="#4CAF50" />}
            color="#4CAF50"
            goal={8}
            current={sleep_avg_7d}
          />
          
          <MetricCard
            title="Exercise Streak"
            value={exercise_streak}
            unit=" days"
            trend={getExerciseTrend()}
            icon={<IconWalk size={20} color="#FF9800" />}
            color="#FF9800"
            goal={7}
            current={exercise_streak}
          />
          
          <MetricCard
            title="Mood Today"
            value={mood_today.toFixed(1)}
            unit="/5"
            trend={getMoodTrend()}
            icon={<IconMoodHappy size={20} color="#2196F3" />}
            color="#2196F3"
            goal={4}
            current={mood_today}
          />
        </SimpleGrid>

        {/* Insights */}
        {top_insights.length > 0 && (
          <Card withBorder p="md">
            <Group spacing="xs" mb="sm">
              <IconTarget size={16} />
              <Text size="sm" weight={500}>
                Today's Insights
              </Text>
            </Group>
            <Stack spacing="xs">
              {top_insights.map((insight, index) => (
                <Text key={index} size="sm" color="dimmed">
                  • {insight}
                </Text>
              ))}
            </Stack>
          </Card>
        )}

        {/* Quick actions */}
        <Card withBorder p="md">
          <Text size="sm" weight={500} mb="sm">
            Quick Actions
          </Text>
          <Group spacing="sm">
            <Button
              leftSection={<IconClipboardList size={16} />}
              variant="light"
              size="sm"
              onClick={handleFillTodaysData}
            >
              Fill Today's Data
            </Button>
            <Button
              leftSection={<IconChartLine size={16} />}
              variant="light"
              size="sm"
              onClick={handleViewAnalytics}
            >
              View Analytics
            </Button>
          </Group>
        </Card>

        {/* Mini trends based on actual historical data from your diary entries */}
        <Card withBorder p="md">
          <Text size="sm" weight={500} mb="sm">
            Recent Performance
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <div>
              <Text size="xs" color="dimmed" mb="xs">
                Sleep Average This Week
              </Text>
              {analyticsData?.habits?.sleep?.trend && analyticsData.habits.sleep.trend.length > 0 ? (
                <HabitCharts
                  chartType="line"
                  data={analyticsData.habits.sleep.trend.slice(-7).map((point: any, index: number) => {
                    let dateLabel: string;
                    if (index === 6) {
                      dateLabel = 'Today';
                    } else if (index === 5) {
                      dateLabel = 'Yesterday';
                    } else {
                      const daysAgo = 6 - index;
                      dateLabel = `${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`;
                    }
                    return {
                      date: dateLabel,
                      value: point.value
                    };
                  })}
                  title=""
                  color="#4CAF50"
                  height={100}
                  showSMA={false}
                  unit="h"
                />
              ) : (
                <Text size="xs" color="dimmed" style={{ height: 100, display: 'flex', alignItems: 'center' }}>
                  No sleep data available for the last 7 days
                </Text>
              )}
            </div>
            <div>
              <Text size="xs" color="dimmed" mb="xs">
                Exercise This Week
              </Text>
              {analyticsData?.habits?.exercise?.trend && analyticsData.habits.exercise.trend.length > 0 ? (
                <HabitCharts
                  chartType="bar"
                  data={analyticsData.habits.exercise.trend.slice(-7).map((point: any, index: number) => {
                    let dateLabel: string;
                    if (index === 6) {
                      dateLabel = 'Today';
                    } else if (index === 5) {
                      dateLabel = 'Yesterday';
                    } else {
                      const daysAgo = 6 - index;
                      dateLabel = `${daysAgo} day${daysAgo === 1 ? '' : 's'} ago`;
                    }
                    return {
                      date: dateLabel,
                      value: point.value
                    };
                  })}
                  title=""
                  color="#FF9800"
                  height={100}
                  showSMA={false}
                  unit=""
                />
              ) : (
                <Text size="xs" color="dimmed" style={{ height: 100, display: 'flex', alignItems: 'center' }}>
                  No exercise data available for the last 7 days
                </Text>
              )}
            </div>
          </SimpleGrid>
        </Card>
      </Stack>
    </Paper>
  );
}
