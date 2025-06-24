import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Title,
  Text,
  Group,
  Grid,
  Card,
  ThemeIcon,
  Stack,
  Badge,
  Progress,
  Button,
  Skeleton,
  Alert,
  Paper,
  ActionIcon,
  Tooltip
} from '@mantine/core';
import {
  IconNotes,
  IconFiles,
  IconChecklist,
  IconBook,
  IconPlus,
  IconSearch,
  IconClock,
  IconTrendingUp,
  IconAlertTriangle,
  IconRefresh
} from '@tabler/icons-react';
import { useAuthStore } from '../stores/authStore';

interface ModuleStats {
  notes: { total: number; recent: number };
  documents: { total: number; recent: number };
  todos: { total: number; completed: number; overdue: number };
  diary: { entries: number; streak: number };
}

interface QuickAction {
  label: string;
  icon: React.ComponentType<any>;
  path: string;
  color: string;
  description: string;
}

const quickActions: QuickAction[] = [
  {
    label: 'New Note',
    icon: IconNotes,
    path: '/notes/new',
    color: 'green',
    description: 'Create a new markdown note'
  },
  {
    label: 'Upload Document',
    icon: IconFiles,
    path: '/documents/upload',
    color: 'orange',
    description: 'Upload and manage documents'
  },
  {
    label: 'Add Todo',
    icon: IconChecklist,
    path: '/todos/new',
    color: 'red',
    description: 'Create a new task'
  },
  {
    label: 'Diary Entry',
    icon: IconBook,
    path: '/diary/today',
    color: 'purple',
    description: 'Write in your encrypted diary'
  }
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<ModuleStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // For now, use mock data since the stores might not be fully connected to working APIs
      // TODO: Replace with actual API calls when backend endpoints are fully tested
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate loading
      
      setStats({
        notes: { total: 42, recent: 5 },
        documents: { total: 18, recent: 3 },
        todos: { total: 24, completed: 16, overdue: 2 },
        diary: { entries: 15, streak: 7 }
      });
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error('Dashboard load error:', err);
      
      // Set default stats even on error to show the UI
      setStats({
        notes: { total: 0, recent: 0 },
        documents: { total: 0, recent: 0 },
        todos: { total: 0, completed: 0, overdue: 0 },
        diary: { entries: 0, streak: 0 }
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const ModuleCard = ({ 
    title, 
    icon: Icon, 
    color, 
    stats: moduleStats, 
    path, 
    description 
  }: {
    title: string;
    icon: React.ComponentType<any>;
    color: string;
    stats: any;
    path: string;
    description: string;
  }) => (
    <Card 
      shadow="sm" 
      padding="lg" 
      radius="md" 
      withBorder
      style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
      }}
      onClick={() => navigate(path)}
    >
      <Group justify="space-between" mb="xs">
        <Group gap="sm">
          <ThemeIcon size="lg" variant="light" color={color}>
            <Icon size={24} />
          </ThemeIcon>
          <div>
            <Text fw={600} size="lg">{title}</Text>
            <Text size="sm" c="dimmed">{description}</Text>
          </div>
        </Group>
        <ActionIcon variant="light" color={color} onClick={(e) => {
          e.stopPropagation();
          navigate(path);
        }}>
          <IconPlus size={16} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        {moduleStats && typeof moduleStats === 'object' && Object.entries(moduleStats).map(([key, value]) => (
          <Group justify="space-between" key={key}>
            <Text size="sm" tt="capitalize" c="dimmed">{key.replace(/([A-Z])/g, ' $1').trim()}</Text>
            <Badge variant="light" color={color} size="sm">
              {String(value)}
            </Badge>
          </Group>
        ))}
      </Stack>
    </Card>
  );

  const QuickActionButton = ({ action }: { action: QuickAction }) => (
    <Button
      variant="light"
      color={action.color}
      size="lg"
      leftSection={<action.icon size={20} />}
      onClick={() => navigate(action.path)}
      fullWidth
      style={{ height: 'auto', padding: '16px' }}
    >
      <div style={{ textAlign: 'left', width: '100%' }}>
        <Text fw={600}>{action.label}</Text>
        <Text size="xs" c="dimmed">{action.description}</Text>
      </div>
    </Button>
  );

  if (isLoading) {
    return (
      <Container size="xl">
        <Stack gap="xl">
          <Skeleton height={60} radius="md" />
          <Grid>
            {[1, 2, 3, 4].map((i) => (
              <Grid.Col span={{ base: 12, sm: 6, lg: 3 }} key={i}>
                <Skeleton height={120} radius="md" />
              </Grid.Col>
            ))}
          </Grid>
          <Grid>
            <Grid.Col span={{ base: 12, lg: 8 }}>
              <Skeleton height={300} radius="md" />
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 4 }}>
              <Skeleton height={300} radius="md" />
            </Grid.Col>
          </Grid>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <Stack gap="xl">
        {/* Show error alert if there was an issue loading data */}
        {error && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            title="Notice"
            color="yellow"
            variant="light"
          >
            <Group justify="space-between" align="center">
              <Text>{error} - Showing default values.</Text>
              <Button size="xs" variant="light" onClick={loadDashboardData}>
                <IconRefresh size={14} />
              </Button>
            </Group>
          </Alert>
        )}

        {/* Welcome Header */}
        <Paper p="xl" radius="md" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xl" fw={700} c="white">
                {getGreeting()}, {user?.username || 'User'}!
              </Text>
              <Text size="sm" c="rgba(255,255,255,0.8)" mt="xs">
                Welcome to your Personal Knowledge Management System
              </Text>
              {user?.is_first_login && (
                <Badge variant="light" color="yellow" mt="sm">
                  Setup Required
                </Badge>
              )}
            </div>
            <Group gap="xs">
              <Tooltip label="Global Search">
                <ActionIcon size="lg" variant="white" color="gray">
                  <IconSearch size={20} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Refresh Dashboard">
                <ActionIcon size="lg" variant="white" color="gray" onClick={loadDashboardData}>
                  <IconRefresh size={20} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Paper>

        {/* Module Overview Cards */}
        <div>
          <Group justify="space-between" mb="md">
            <Title order={2} fw={600}>Module Overview</Title>
            <Badge variant="light" leftSection={<IconTrendingUp size={14} />}>
              All Systems Active
            </Badge>
          </Group>
          
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
              <ModuleCard
                title="Notes"
                icon={IconNotes}
                color="green"
                stats={stats?.notes}
                path="/notes"
                description="Markdown notes with linking"
              />
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
              <ModuleCard
                title="Documents"
                icon={IconFiles}
                color="orange"
                stats={stats?.documents}
                path="/documents"
                description="File management & search"
              />
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
              <ModuleCard
                title="Todos"
                icon={IconChecklist}
                color="red"
                stats={stats?.todos}
                path="/todos"
                description="Task & project management"
              />
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
              <ModuleCard
                title="Diary"
                icon={IconBook}
                color="purple"
                stats={stats?.diary}
                path="/diary"
                description="Encrypted personal journal"
              />
            </Grid.Col>
          </Grid>
        </div>

        {/* Quick Actions and Recent Activity */}
        <Grid>
          {/* Quick Actions */}
          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="space-between" mb="md">
                <Title order={3} fw={600}>Quick Actions</Title>
                <ThemeIcon variant="light" color="blue">
                  <IconPlus size={16} />
                </ThemeIcon>
              </Group>
              
              <Stack gap="sm">
                {quickActions.map((action) => (
                  <QuickActionButton key={action.path} action={action} />
                ))}
              </Stack>
            </Card>
          </Grid.Col>

          {/* Recent Activity */}
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="space-between" mb="md">
                <Title order={3} fw={600}>Recent Activity</Title>
                <ThemeIcon variant="light" color="gray">
                  <IconClock size={16} />
                </ThemeIcon>
              </Group>
              
              <Text c="dimmed" ta="center" py="xl">
                Recent activity will appear here as you use the system
              </Text>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
} 