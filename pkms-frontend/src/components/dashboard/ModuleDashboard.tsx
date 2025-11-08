/**
 * Module Dashboard - Detailed analytics for specific modules
 * Uses cached data from dashboardService for performance
 */

import { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Card,
  Text,
  Group,
  Stack,
  Title,
  Badge,
  Button,
  Loader,
  Center,
  ThemeIcon,
  Tabs,
  SimpleGrid
} from '@mantine/core';
import {
  IconTrendingUp,
  IconClock,
  IconTarget,
  IconRefresh,
  IconChartBar,
  IconCalendar,
  IconStar
} from '@tabler/icons-react';
import { dashboardService } from '../../services/dashboardService';

interface ModuleDashboardData {
  [key: string]: any;
}
import { notifications } from '@mantine/notifications';

interface ModuleDashboardProps {
  module: 'todos' | 'notes' | 'documents' | 'projects' | 'diary';
  onRefresh?: () => void;
}

export function ModuleDashboard({ module, onRefresh }: ModuleDashboardProps) {
  const [data, setData] = useState<ModuleDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadModuleData();
  }, [module]);

  const loadModuleData = async () => {
    setIsLoading(true);
    try {
      const moduleData = await dashboardService.getModuleDashboardData(module);
      setData(moduleData);
    } catch (error) {
      console.error(`Failed to load ${module} dashboard data:`, error);
      notifications.show({
        title: 'Error',
        message: `Failed to load ${module} dashboard data`,
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    dashboardService.invalidateCache(module);
    loadModuleData();
    onRefresh?.();
  };

  if (isLoading) {
    return (
      <Center style={{ height: 400 }}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (!data) {
    return (
      <Center style={{ height: 400 }}>
        <Stack align="center" gap="md">
          <Text c="dimmed">Failed to load {module} dashboard data</Text>
          <Button onClick={handleRefresh} leftSection={<IconRefresh size={16} />}>
            Retry
          </Button>
        </Stack>
      </Center>
    );
  }

  const renderTodosDashboard = () => (
    <Stack gap="lg">
      {/* Key Metrics */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="green" variant="light">
              <IconTarget size={16} />
            </ThemeIcon>
            <Text fw={500}>Completion Rate</Text>
          </Group>
          <Text size="xl" fw={700} c="green">
            {data.completionRate?.toFixed(1) || 0}%
          </Text>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="blue" variant="light">
              <IconClock size={16} />
            </ThemeIcon>
            <Text fw={500}>Avg. Completion Time</Text>
          </Group>
          <Text size="xl" fw={700}>
            {data.averageCompletionTime || 0} days
          </Text>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="orange" variant="light">
              <IconTrendingUp size={16} />
            </ThemeIcon>
            <Text fw={500}>Productivity Score</Text>
          </Group>
          <Text size="xl" fw={700} c="orange">
            {data.productivityScore || 0}/100
          </Text>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="purple" variant="light">
              <IconStar size={16} />
            </ThemeIcon>
            <Text fw={500}>Active Projects</Text>
          </Group>
          <Text size="xl" fw={700}>
            {data.projects?.length || 0}
          </Text>
        </Card>
      </SimpleGrid>

      {/* Charts */}
      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder p="md">
            <Text fw={500} mb="md">Completion Trend</Text>
            <Text size="sm" c="dimmed">Last 30 days</Text>
            {/* Placeholder for chart */}
            <Center style={{ height: 200 }}>
              <Text c="dimmed">Chart would go here</Text>
            </Center>
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card withBorder p="md">
            <Text fw={500} mb="md">Priority Distribution</Text>
            <Text size="sm" c="dimmed">Current todos by priority</Text>
            {/* Placeholder for chart */}
            <Center style={{ height: 200 }}>
              <Text c="dimmed">Chart would go here</Text>
            </Center>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );

  const renderNotesDashboard = () => (
    <Stack gap="lg">
      {/* Key Metrics */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="green" variant="light">
              <IconTarget size={16} />
            </ThemeIcon>
            <Text fw={500}>Avg. Words per Note</Text>
          </Group>
          <Text size="xl" fw={700} c="green">
            {data.averageWordsPerNote || 0}
          </Text>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="blue" variant="light">
              <IconCalendar size={16} />
            </ThemeIcon>
            <Text fw={500}>Most Active Day</Text>
          </Group>
          <Text size="xl" fw={700}>
            {data.mostActiveDay || 'N/A'}
          </Text>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="orange" variant="light">
              <IconTrendingUp size={16} />
            </ThemeIcon>
            <Text fw={500}>Writing Streak</Text>
          </Group>
          <Text size="xl" fw={700} c="orange">
            {data.writingStreak || 0} days
          </Text>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="purple" variant="light">
              <IconStar size={16} />
            </ThemeIcon>
            <Text fw={500}>Total Notes</Text>
          </Group>
          <Text size="xl" fw={700}>
            {data.stats?.total || 0}
          </Text>
        </Card>
      </SimpleGrid>
    </Stack>
  );

  const renderDiaryDashboard = () => (
    <Stack gap="lg">
      {/* Key Metrics */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="green" variant="light">
              <IconTarget size={16} />
            </ThemeIcon>
            <Text fw={500}>Wellness Score</Text>
          </Group>
          <Text size="xl" fw={700} c="green">
            {data.wellnessScore || 0}/100
          </Text>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="blue" variant="light">
              <IconCalendar size={16} />
            </ThemeIcon>
            <Text fw={500}>Total Entries</Text>
          </Group>
          <Text size="xl" fw={700}>
            {data.stats?.totalEntries || 0}
          </Text>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="orange" variant="light">
              <IconTrendingUp size={16} />
            </ThemeIcon>
            <Text fw={500}>Active Habits</Text>
          </Group>
          <Text size="xl" fw={700} c="orange">
            {Object.keys(data.habitStreaks || {}).length}
          </Text>
        </Card>

        <Card withBorder p="md">
          <Group gap="sm" mb="md">
            <ThemeIcon color="purple" variant="light">
              <IconStar size={16} />
            </ThemeIcon>
            <Text fw={500}>Mood Trend</Text>
          </Group>
          <Text size="xl" fw={700}>
            {data.moodTrend?.length || 0} days
          </Text>
        </Card>
      </SimpleGrid>

      {/* Habit Streaks */}
      {data.habitStreaks && Object.keys(data.habitStreaks).length > 0 && (
        <Card withBorder p="md">
          <Text fw={500} mb="md">Habit Streaks</Text>
          <Stack gap="sm">
            {Object.entries(data.habitStreaks).map(([habit, streak]) => (
              <Group key={habit} justify="space-between">
                <Text>{habit}</Text>
                <Badge color="green">{String(streak)} days</Badge>
              </Group>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );

  const renderDashboard = () => {
    switch (module) {
      case 'todos':
        return renderTodosDashboard();
      case 'notes':
        return renderNotesDashboard();
      case 'diary':
        return renderDiaryDashboard();
      default:
        return (
          <Center style={{ height: 200 }}>
            <Text c="dimmed">Dashboard for {module} coming soon</Text>
          </Center>
        );
    }
  };

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>{module.charAt(0).toUpperCase() + module.slice(1)} Dashboard</Title>
            <Text c="dimmed" size="sm">
              Detailed analytics and insights
            </Text>
          </div>
          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={handleRefresh}
            variant="light"
          >
            Refresh
          </Button>
        </Group>

        {/* Tabs */}
        <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'overview')}>
          <Tabs.List>
            <Tabs.Tab value="overview" leftSection={<IconChartBar size={16} />}>
              Overview
            </Tabs.Tab>
            <Tabs.Tab value="analytics" leftSection={<IconTrendingUp size={16} />}>
              Analytics
            </Tabs.Tab>
            <Tabs.Tab value="insights" leftSection={<IconTarget size={16} />}>
              Insights
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview" pt="md">
            {renderDashboard()}
          </Tabs.Panel>

          <Tabs.Panel value="analytics" pt="md">
            <Center style={{ height: 200 }}>
              <Text c="dimmed">Analytics view coming soon</Text>
            </Center>
          </Tabs.Panel>

          <Tabs.Panel value="insights" pt="md">
            <Center style={{ height: 200 }}>
              <Text c="dimmed">Insights view coming soon</Text>
            </Center>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}

export default ModuleDashboard;
