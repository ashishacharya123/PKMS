/**
 * Main Dashboard - Lightweight overview of all modules
 * Shows only essential metrics, detailed data available in module dashboards
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
  Progress,
  ThemeIcon,
  Anchor
} from '@mantine/core';
import {
  IconChecklist,
  IconNotes,
  IconFileText,
  IconFolder,
  IconBook,
  IconTrendingUp,
  IconAlertTriangle,
  IconRefresh,
  IconArchive
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { dashboardService } from '../../services/dashboardService';

interface MainDashboardData {
  notes: {
    total: number;
    recent: number;
  };
  documents: {
    total: number;
    recent: number;
  };
  todos: {
    total: number;
    pending: number;
    completed: number;
    overdue: number;
  };
  projects: {
    total: number;
    active: number;
  };
  diary: {
    entries: number;
    streak: number;
  };
  archive: {
    items: number;
  };
  last_updated: string;
}
import { notifications } from '@mantine/notifications';

interface MainDashboardProps {
  onRefresh?: () => void;
}

export function MainDashboard({ onRefresh }: MainDashboardProps) {
  const [data, setData] = useState<MainDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const dashboardData = await dashboardService.getMainDashboardData();
      setData(dashboardData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load dashboard data',
        color: 'red'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    dashboardService.invalidateCache();
    loadDashboardData();
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
          <Text c="dimmed">Failed to load dashboard data</Text>
          <Button onClick={handleRefresh} leftSection={<IconRefresh size={16} />}>
            Retry
          </Button>
        </Stack>
      </Center>
    );
  }

  const getCompletionRate = (completed: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  const getStatusColor = (rate: number) => {
    if (rate >= 80) return 'green';
    if (rate >= 60) return 'yellow';
    return 'red';
  };

  return (
    <Container size="xl" py="md">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="center">
          <div>
            <Title order={2}>Dashboard Overview</Title>
            <Text c="dimmed" size="sm">
              Quick overview of all your modules
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

        {/* Main Stats Grid */}
        <Grid>
          {/* Todos */}
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder p="md" style={{ cursor: 'pointer' }} onClick={() => navigate('/todos')}>
              <Group justify="space-between" mb="md">
                <Group gap="sm">
                  <ThemeIcon color="blue" variant="light" size="lg">
                    <IconChecklist size={20} />
                  </ThemeIcon>
                  <div>
                    <Text fw={500}>Todos</Text>
                    <Text size="sm" c="dimmed">
                      {data.todos.total} total
                    </Text>
                  </div>
                </Group>
                <Badge color={getStatusColor(getCompletionRate(data.todos.completed, data.todos.total))}>
                  {getCompletionRate(data.todos.completed, data.todos.total)}%
                </Badge>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm">Completed</Text>
                  <Text fw={500}>{data.todos.completed}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Pending</Text>
                  <Text fw={500}>{data.todos.pending}</Text>
                </Group>
                {data.todos.overdue > 0 && (
                  <Group justify="space-between">
                    <Text size="sm" c="red">Overdue</Text>
                    <Text fw={500} c="red">{data.todos.overdue}</Text>
                  </Group>
                )}
                <Progress
                  value={getCompletionRate(data.todos.completed, data.todos.total)}
                  color={getStatusColor(getCompletionRate(data.todos.completed, data.todos.total))}
                  size="sm"
                />
              </Stack>
            </Card>
          </Grid.Col>

          {/* Notes */}
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder p="md" style={{ cursor: 'pointer' }} onClick={() => navigate('/notes')}>
              <Group justify="space-between" mb="md">
                <Group gap="sm">
                  <ThemeIcon color="green" variant="light" size="lg">
                    <IconNotes size={20} />
                  </ThemeIcon>
                  <div>
                    <Text fw={500}>Notes</Text>
                    <Text size="sm" c="dimmed">
                      {data.notes.total} total
                    </Text>
                  </div>
                </Group>
                <Badge color="blue">{data.notes.recent} recent</Badge>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm">Total Notes</Text>
                  <Text fw={500}>{data.notes.total}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Recent</Text>
                  <Text fw={500}>{data.notes.recent}</Text>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>

          {/* Documents */}
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder p="md" style={{ cursor: 'pointer' }} onClick={() => navigate('/documents')}>
              <Group justify="space-between" mb="md">
                <Group gap="sm">
                  <ThemeIcon color="orange" variant="light" size="lg">
                    <IconFileText size={20} />
                  </ThemeIcon>
                  <div>
                    <Text fw={500}>Documents</Text>
                    <Text size="sm" c="dimmed">
                      {data.documents.total} total
                    </Text>
                  </div>
                </Group>
                <Badge color="blue">{data.documents.recent} recent</Badge>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm">Total Documents</Text>
                  <Text fw={500}>{data.documents.total}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Recent</Text>
                  <Text fw={500}>{data.documents.recent}</Text>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>

          {/* Projects */}
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder p="md" style={{ cursor: 'pointer' }} onClick={() => navigate('/projects')}>
              <Group justify="space-between" mb="md">
                <Group gap="sm">
                  <ThemeIcon color="purple" variant="light" size="lg">
                    <IconFolder size={20} />
                  </ThemeIcon>
                  <div>
                    <Text fw={500}>Projects</Text>
                    <Text size="sm" c="dimmed">
                      {data.projects.total} total
                    </Text>
                  </div>
                </Group>
                <Badge color="green">{data.projects.active} active</Badge>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm">Total Projects</Text>
                  <Text fw={500}>{data.projects.total}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Active</Text>
                  <Text fw={500}>{data.projects.active}</Text>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>

          {/* Diary */}
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder p="md" style={{ cursor: 'pointer' }} onClick={() => navigate('/diary')}>
              <Group justify="space-between" mb="md">
                <Group gap="sm">
                  <ThemeIcon color="pink" variant="light" size="lg">
                    <IconBook size={20} />
                  </ThemeIcon>
                  <div>
                    <Text fw={500}>Diary</Text>
                    <Text size="sm" c="dimmed">
                      {data.diary.entries} entries
                    </Text>
                  </div>
                </Group>
                <Badge color="blue">{data.diary.streak} day streak</Badge>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm">Total Entries</Text>
                  <Text fw={500}>{data.diary.entries}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Current Streak</Text>
                  <Text fw={500}>{data.diary.streak} days</Text>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>

          {/* Archive */}
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder p="md" style={{ cursor: 'pointer' }} onClick={() => navigate('/archive')}>
              <Group justify="space-between" mb="md">
                <Group gap="sm">
                  <ThemeIcon color="indigo" variant="light" size="lg">
                    <IconArchive size={20} />
                  </ThemeIcon>
                  <div>
                    <Text fw={500}>Archive</Text>
                    <Text size="sm" c="dimmed">
                      {data.archive.items} items
                    </Text>
                  </div>
                </Group>
                <Badge color="indigo">{data.archive.items} items</Badge>
              </Group>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm">Total Items</Text>
                  <Text fw={500}>{data.archive.items}</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Organized</Text>
                  <Text fw={500}>✓</Text>
                </Group>
              </Stack>
            </Card>
          </Grid.Col>

          {/* Quick Actions */}
          <Grid.Col span={{ base: 12, sm: 6, md: 4 }}>
            <Card withBorder p="md">
              <Group justify="space-between" mb="md">
                <Group gap="sm">
                  <ThemeIcon color="cyan" variant="light" size="lg">
                    <IconTrendingUp size={20} />
                  </ThemeIcon>
                  <div>
                    <Text fw={500}>Quick Actions</Text>
                    <Text size="sm" c="dimmed">
                      Jump to modules
                    </Text>
                  </div>
                </Group>
              </Group>
              <Stack gap="xs">
                <Anchor onClick={() => navigate('/todos')} size="sm">
                  View All Todos
                </Anchor>
                <Anchor onClick={() => navigate('/notes')} size="sm">
                  View All Notes
                </Anchor>
                <Anchor onClick={() => navigate('/documents')} size="sm">
                  View All Documents
                </Anchor>
                <Anchor onClick={() => navigate('/projects')} size="sm">
                  View All Projects
                </Anchor>
                <Anchor onClick={() => navigate('/diary')} size="sm">
                  View Diary
                </Anchor>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>

        {/* Alerts */}
        {data.todos.overdue > 0 && (
          <Card withBorder p="md" style={{ borderColor: 'var(--mantine-color-red-4)' }}>
            <Group gap="sm">
              <ThemeIcon color="red" variant="light">
                <IconAlertTriangle size={16} />
              </ThemeIcon>
              <div>
                <Text fw={500} c="red">Overdue Todos</Text>
                <Text size="sm" c="dimmed">
                  You have {data.todos.overdue} overdue todos that need attention.
                </Text>
              </div>
              <Button
                size="sm"
                variant="light"
                color="red"
                onClick={() => navigate('/todos?filter=overdue')}
              >
                View Overdue
              </Button>
            </Group>
          </Card>
        )}
      </Stack>
    </Container>
  );
}

export default MainDashboard;
