import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Container,
  Stack,
  Title,
  Text,
  Card,
  Group,
  ThemeIcon,
  Badge,
  Button,
  SimpleGrid,
  Skeleton,
  Alert,
  ActionIcon,
  Tooltip,
  Progress,
  TextInput,
} from '@mantine/core';
import {
  IconNotes,
  IconFiles,
  IconChecklist,
  IconBook,
  IconArchive,
  IconPlus,
  IconFileText,
  IconCalendarEvent,
  IconClipboardList,
  IconRefresh,
  IconAlertCircle,
  IconTrendingUp,
  IconDatabase,
  IconSearch
} from '@tabler/icons-react';
import { useAuthStore } from '../stores/authStore';
import { dashboardService, type DashboardStats } from '../services/dashboardService';

// Update interfaces to match backend response
interface ModuleStats {
  notes: { total: number; recent: number };
  documents: { total: number; recent: number };
  todos: { total: number; pending: number; completed: number; overdue: number };
  diary: { entries: number; streak: number };
  archive: { folders: number; items: number };
}

interface QuickAction {
  label: string;
  icon: React.ComponentType<any>;
  path: string;
  color: string;
  description: string;
}

const modules = [
  {
    title: 'Notes',
    icon: IconNotes,
    color: 'blue',
    path: '/notes',
    description: 'Organized knowledge and ideas with bidirectional linking'
  },
  {
    title: 'Documents',
    icon: IconFiles,
    color: 'green',
    path: '/documents',
    description: 'File management with text extraction and search'
  },
  {
    title: 'Todos',
    icon: IconChecklist,
    color: 'orange',
    path: '/todos',
    description: 'Task and project management with priorities'
  },
  {
    title: 'Diary',
    icon: IconBook,
    color: 'purple',
    path: '/diary',
    description: 'Encrypted personal journal with mood tracking'
  },
  {
    title: 'Archive',
    icon: IconArchive,
    color: 'indigo',
    path: '/archive',
    description: 'Hierarchical file organization and storage'
  }
];

const quickActions: QuickAction[] = [
  {
    label: 'New Note',
    icon: IconFileText,
    path: '/notes/new',
    color: 'blue',
    description: 'Create a new note'
  },
  {
    label: 'Upload Document',
    icon: IconFiles,
    path: '/documents?action=upload',
    color: 'green',
    description: 'Upload documents'
  },
  {
    label: 'Add Todo',
    icon: IconClipboardList,
    path: '/todos?action=new',
    color: 'orange',
    description: 'Add a new task'
  },
  {
    label: 'Archive Files',
    icon: IconArchive,
    path: '/archive',
    color: 'indigo',
    description: 'Organize files'
  }
];

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async (isRefresh: boolean = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    
    try {
      // Use the new dashboard service to get real data
      const dashboardStats = await dashboardService.getDashboardStats();
      setStats(dashboardStats);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error('Dashboard load error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    loadDashboardData(true);
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
      component={Link}
      to={path}
      padding="md"
      radius="md"
      withBorder
      style={{ 
        textDecoration: 'none',
        transition: 'all 0.2s ease',
        height: '100%',
        cursor: 'pointer',
      }}
    >
      <Group justify="space-between" mb="md">
        <ThemeIcon size="xl" variant="light" color={color} radius="md">
          <Icon size={24} />
        </ThemeIcon>
        
        <Badge variant="light" color={color} size="sm">
          {title === 'Notes' && (moduleStats?.total || 0)}
          {title === 'Documents' && (moduleStats?.total || 0)}
          {title === 'Todos' && `${moduleStats?.pending || 0}/${moduleStats?.total || 0}`}
          {title === 'Diary' && (moduleStats?.entries || 0)}
          {title === 'Archive' && (moduleStats?.items || 0)}
        </Badge>
      </Group>

      <Text fw={600} size="lg" mb="xs">
        {title}
      </Text>
      
      <Text size="sm" c="dimmed" mb="md" lineClamp={2}>
        {description}
      </Text>

      <Stack gap="xs">
        {title === 'Notes' && (
          <>
            <Group justify="space-between">
              <Text size="sm">Total notes</Text>
              <Text size="sm" fw={500}>{moduleStats?.total || 0}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Recent (7 days)</Text>
              <Text size="sm" fw={500} c={moduleStats?.recent > 0 ? 'blue' : undefined}>
                {moduleStats?.recent || 0}
              </Text>
            </Group>
          </>
        )}

        {title === 'Documents' && (
          <>
            <Group justify="space-between">
              <Text size="sm">Total files</Text>
              <Text size="sm" fw={500}>{moduleStats?.total || 0}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Recent uploads</Text>
              <Text size="sm" fw={500} c={moduleStats?.recent > 0 ? 'green' : undefined}>
                {moduleStats?.recent || 0}
              </Text>
            </Group>
          </>
        )}

        {title === 'Todos' && (
          <>
            <Group justify="space-between">
              <Text size="sm">Pending</Text>
              <Text size="sm" fw={500}>
                {moduleStats?.pending || 0}
              </Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Completed</Text>
              <Text size="sm" fw={500} c="green">{moduleStats?.completed || 0}</Text>
            </Group>
            {(moduleStats?.overdue || 0) > 0 && (
              <Group justify="space-between">
                <Text size="sm" c="red">Overdue</Text>
                <Text size="sm" fw={500} c="red">{moduleStats?.overdue}</Text>
              </Group>
            )}
            {moduleStats?.total > 0 && (
              <Progress 
                value={dashboardService.calculateCompletionPercentage(moduleStats?.completed || 0, moduleStats?.total)} 
                size="sm" 
                color="green" 
                mt="xs"
              />
            )}
          </>
        )}

        {title === 'Diary' && (
          <>
            <Group justify="space-between">
              <Text size="sm">Total entries</Text>
              <Text size="sm" fw={500}>{moduleStats?.entries || 0}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Current streak</Text>
              <Text size="sm" fw={500} c={moduleStats?.streak > 0 ? 'purple' : undefined}>
                {dashboardService.getStreakStatus(moduleStats?.streak || 0)}
              </Text>
            </Group>
          </>
        )}

        {title === 'Archive' && (
          <>
            <Group justify="space-between">
              <Text size="sm">Folders</Text>
              <Text size="sm" fw={500}>{moduleStats?.folders || 0}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Total items</Text>
              <Text size="sm" fw={500}>{moduleStats?.items || 0}</Text>
            </Group>
          </>
        )}
      </Stack>
    </Card>
  );

  const QuickActionButton = ({ action }: { action: QuickAction }) => (
    <Button
      variant="light"
      color={action.color}
      size="sm"
      leftSection={<action.icon size={16} />}
      onClick={() => navigate(action.path)}
      fullWidth
      style={{ height: 'auto', padding: '8px 12px' }}
    >
      <div style={{ textAlign: 'left', width: '100%' }}>
        <Text fw={600} size="sm">{action.label}</Text>
        <Text size="xs" c="dimmed">{action.description}</Text>
      </div>
    </Button>
  );

  if (isLoading) {
    return (
      <Container size="xl">
        <Stack gap="xl">
          <Skeleton height={60} radius="md" />
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="lg">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} height={200} radius="md" />
            ))}
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} height={80} radius="md" />
            ))}
          </SimpleGrid>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={1} mb="xs">
              {getGreeting()}, {user?.username}! 👋
            </Title>
            <Group gap="xs">
              <Text c="dimmed">
                Welcome to your Personal Knowledge Management System
              </Text>
              {stats && (
                <>
                  <Text c="dimmed">•</Text>
                  <Text size="sm" c="dimmed">
                    Updated {dashboardService.formatLastUpdated(stats.last_updated)}
                  </Text>
                </>
              )}
            </Group>
          </div>
          
          <Group gap="md">
            {/* Global Search Bar */}
            <TextInput
              placeholder="Search everywhere..."
              leftSection={<IconSearch size={16} />}
              style={{ minWidth: '300px' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const query = e.currentTarget.value.trim();
                  if (query) {
                    navigate(`/search?q=${encodeURIComponent(query)}`);
                  }
                }
              }}
            />
            
            <Tooltip label="Refresh dashboard data">
              <ActionIcon 
                variant="light" 
                size="lg" 
                onClick={handleRefresh}
                loading={isRefreshing}
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Error Alert */}
        {error && (
          <Alert 
            icon={<IconAlertCircle size={16} />} 
            color="red" 
            title="Error loading dashboard"
          >
            {error}
          </Alert>
        )}

        {/* Overview Stats */}
        {stats && (
          <Card padding="sm" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Text fw={600} size="lg">Overview</Text>
              <Group gap="xs">
                <IconTrendingUp size={16} />
                <Text size="sm" c="dimmed">Total Items: {
                  (stats.notes.total + stats.documents.total + stats.todos.total + 
                   stats.diary.entries + stats.archive.items)
                }</Text>
              </Group>
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
              <div>
                <Text size="sm" c="dimmed">Active Projects</Text>
                <Text fw={600} size="lg">-</Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">Overdue Tasks</Text>
                <Text fw={600} size="lg" c={stats.todos.overdue > 0 ? 'red' : 'green'}>
                  {stats.todos.overdue}
                </Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">Diary Streak</Text>
                <Text fw={600} size="lg" c={stats.diary.streak > 0 ? 'purple' : undefined}>
                  {stats.diary.streak} days
                </Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">Storage Used</Text>
                <Group gap="xs">
                  <IconDatabase size={16} />
                  <Text fw={600} size="lg">-</Text>
                </Group>
              </div>
            </SimpleGrid>
          </Card>
        )}

        {/* Quick Actions */}
        <div>
          <Text fw={600} size="lg" mb="md">Quick Actions</Text>
          <SimpleGrid cols={{ base: 2, sm: 2, lg: 4 }} spacing="sm">
            {quickActions.map((action) => (
              <QuickActionButton key={action.label} action={action} />
            ))}
          </SimpleGrid>
        </div>

        {/* Module Cards */}
        <div>
          <Text fw={600} size="lg" mb="md">Modules</Text>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="lg">
            {modules.map((module) => (
              <ModuleCard
                key={module.title}
                title={module.title}
                icon={module.icon}
                color={module.color}
                stats={stats?.[module.title.toLowerCase() as keyof ModuleStats]}
                path={module.path}
                description={module.description}
              />
            ))}
          </SimpleGrid>
        </div>

        {/* Recent Updates */}
        <div>
          <Text fw={600} size="lg" mb="md">Recent Updates</Text>
          <Card padding="lg" radius="md" withBorder>
            <Stack gap="md">
              {stats && (
                <>
                  {stats.notes.recent > 0 && (
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm">
                        <ThemeIcon size="sm" variant="light" color="blue">
                          <IconNotes size={14} />
                        </ThemeIcon>
                        <Text size="sm">Recent notes created</Text>
                      </Group>
                      <Badge variant="light" color="blue" size="sm">
                        {stats.notes.recent} in last 7 days
                      </Badge>
                    </Group>
                  )}
                  
                  {stats.documents.recent > 0 && (
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm">
                        <ThemeIcon size="sm" variant="light" color="green">
                          <IconFiles size={14} />
                        </ThemeIcon>
                        <Text size="sm">Documents uploaded</Text>
                      </Group>
                      <Badge variant="light" color="green" size="sm">
                        {stats.documents.recent} in last 7 days
                      </Badge>
                    </Group>
                  )}
                  
                  {stats.todos.pending > 0 && (
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm">
                        <ThemeIcon size="sm" variant="light" color="orange">
                          <IconChecklist size={14} />
                        </ThemeIcon>
                        <Text size="sm">Pending todos</Text>
                      </Group>
                      <Badge variant="light" color="orange" size="sm">
                        {stats.todos.pending} tasks
                      </Badge>
                    </Group>
                  )}
                  
                  {stats.diary.streak > 0 && (
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm">
                        <ThemeIcon size="sm" variant="light" color="purple">
                          <IconBook size={14} />
                        </ThemeIcon>
                        <Text size="sm">Diary writing streak</Text>
                      </Group>
                      <Badge variant="light" color="purple" size="sm">
                        {stats.diary.streak} days
                      </Badge>
                    </Group>
                  )}
                  
                  {stats.archive.items > 0 && (
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm">
                        <ThemeIcon size="sm" variant="light" color="indigo">
                          <IconArchive size={14} />
                        </ThemeIcon>
                        <Text size="sm">Archive items organized</Text>
                      </Group>
                      <Badge variant="light" color="indigo" size="sm">
                        {stats.archive.items} items
                      </Badge>
                    </Group>
                  )}
                  
                  {stats.notes.recent === 0 && stats.documents.recent === 0 && 
                   stats.todos.pending === 0 && stats.diary.streak === 0 && 
                   stats.archive.items === 0 && (
                    <Group justify="center" py="xl">
                      <Stack align="center" gap="xs">
                        <ThemeIcon size="lg" variant="light" color="gray">
                          <IconTrendingUp size={24} />
                        </ThemeIcon>
                        <Text size="sm" c="dimmed" ta="center">
                          Start using PKMS to see your recent activity here
                        </Text>
                      </Stack>
                    </Group>
                  )}
                </>
              )}
              
              {!stats && (
                <Group justify="center" py="xl">
                  <Skeleton height={20} width="60%" />
                </Group>
              )}
            </Stack>
          </Card>
        </div>
      </Stack>
    </Container>
  );
} 