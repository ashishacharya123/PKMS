import { useState, useEffect } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { nepaliDateCache } from '../utils/nepaliDateCache';
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
  TextInput
} from '@mantine/core';
import {
  IconNotes,
  IconFiles,
  IconChecklist,
  IconBook,
  IconArchive,
  IconFileText,
  IconCalendarEvent,
  IconClipboardList,
  IconRefresh,
  IconAlertCircle,
  IconTrendingUp,
  IconSearch,
  IconFolder,
  IconChevronRight
} from '@tabler/icons-react';
import { useAuthStore } from '../stores/authStore';
import { dashboardService, type DashboardStats, type QuickStats, type RecentActivityTimeline } from '../services/dashboardService';
import MainDashboard from '../components/dashboard/MainDashboard';
import { todosService, type LegacyProject } from '../services/todosService';
import { StorageBreakdownCard } from '../components/dashboard/StorageBreakdownCard';
import { ActivityTimeline } from '../components/dashboard/ActivityTimeline';

// Update interfaces to match backend response
interface ModuleStats {
  notes: { total: number; recent: number };
  documents: { total: number; recent: number };
  todos: {
    total: number;
    pending: number;
    in_progress?: number;
    blocked?: number;
    done?: number;
    cancelled?: number;
    completed: number;
    overdue: number;
    due_today?: number;
    completed_today?: number;
  };
  diary: { entries: number; streak: number };
  archive: { folders: number; items: number };
  projects?: { active: number };
}

interface QuickAction {
  label: string;
  icon: React.ComponentType<any>;
  path: string;
  color: string;
  description: string;
}

interface ModuleInfo {
  title: string;
  icon: React.ComponentType<any>;
  color: string;
  path: string;
  description: string;
}

// Quick Actions configuration
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
    description: 'Upload a document'
  },
  {
    label: 'Add Todo',
    icon: IconClipboardList,
    path: '/todos?action=new',
    color: 'orange',
    description: 'Create a new task'
  },
  {
    label: 'Diary Entry',
    icon: IconCalendarEvent,
    path: '/diary?action=new',
    color: 'purple',
    description: 'Write diary entry'
  }
];

// Modules configuration
const modules: ModuleInfo[] = [
  {
    title: 'Notes',
    icon: IconNotes,
    color: 'blue',
    path: '/notes',
    description: 'Organize your thoughts and ideas'
  },
  {
    title: 'Documents',
    icon: IconFiles,
    color: 'green',
    path: '/documents',
    description: 'Manage files and documents'
  },
  {
    title: 'Todos',
    icon: IconChecklist,
    color: 'orange',
    path: '/todos',
    description: 'Track tasks and projects'
  },
  {
    title: 'Diary',
    icon: IconBook,
    color: 'purple',
    path: '/diary',
    description: 'Private journal entries'
  },
  {
    title: 'Archive',
    icon: IconArchive,
    color: 'indigo',
    path: '/archive',
    description: 'Hierarchical file organization'
  }
];

// Project Cards Section Component - extracted for performance
const ProjectCardsSection = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await todosService.getProjects();
        setProjects(data);
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        setLoadingProjects(false);
      }
    };
    loadProjects();
  }, []);

  if (loadingProjects) {
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={120} radius="md" />
        ))}
      </SimpleGrid>
    );
  }

  if (projects.length === 0) {
    return null;
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
      {projects.slice(0, 6).map((project) => {
        const completionPercentage = project.todo_count > 0 
          ? Math.round((project.completed_count / project.todo_count) * 100) 
          : 0;
        
        return (
          <Card
            key={project.uuid}
            padding="lg"
            radius="md"
            withBorder
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/projects/${project.uuid}`)}
          >
            <Stack gap="md">
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: project.color || '#2196F3',
                      flexShrink: 0
                    }}
                  />
                  <Text fw={600} size="sm" truncate style={{ flex: 1 }}>
                    {project.name}
                  </Text>
                </Group>
                <ActionIcon variant="subtle" size="sm" color="gray">
                  <IconChevronRight size={16} />
                </ActionIcon>
              </Group>

              {project.description && (
                <Text size="xs" c="dimmed" lineClamp={2}>
                  {project.description}
                </Text>
              )}

              <div>
                <Group justify="space-between" mb={4}>
                  <Text size="xs" c="dimmed">Progress</Text>
                  <Text size="sm" fw={600} c={completionPercentage === 100 ? 'green' : 'blue'}>
                    {completionPercentage}%
                  </Text>
                </Group>
                <Progress
                  value={completionPercentage}
                  size="sm"
                  radius="xl"
                  color={completionPercentage === 100 ? 'green' : 'blue'}
                />
              </div>

              <Group gap="md" justify="space-between">
                <Badge size="sm" variant="light" color="gray">
                  <IconFolder size={12} style={{ marginRight: 4 }} />
                  {project.todo_count} tasks
                </Badge>
                {project.completed_count > 0 && (
                  <Badge size="sm" variant="light" color="green">
                    {project.completed_count} done
                  </Badge>
                )}
              </Group>
            </Stack>
          </Card>
        );
      })}
    </SimpleGrid>
  );
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickStats | null>(null);
  const [activityTimeline, setActivityTimeline] = useState<RecentActivityTimeline | null>(null);

  useAuthenticatedEffect(() => {
    // Pre-cache Nepali dates for dashboard (past 7 + today + next 3 days)
    nepaliDateCache.preCacheDashboard();
    loadDashboardData();
  }, []);

  useEffect(() => {
    const handler = () => {
      console.log('[Dashboard] Folder change detected, refreshing stats...');
      loadDashboardData(true);
    };
    window.addEventListener('pkms-folder-change', handler);
    return () => window.removeEventListener('pkms-folder-change', handler);
  }, []);

  const loadDashboardData = async (isRefresh: boolean = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    
    try {
      console.log('[Dashboard] Loading dashboard data…');
      const [dashboardStats, quickStats, timeline] = await Promise.all([
        dashboardService.getMainDashboardData(),
        dashboardService.getQuickStats(),
        dashboardService.getRecentActivityTimeline(3, 20)
      ]);
      console.log('[Dashboard] Stats received:', dashboardStats);
      setStats(dashboardStats);
      setQuick(quickStats);
      setActivityTimeline(timeline);
    } catch (err) {
      setError('Failed to load dashboard data');
      console.error('Dashboard load error:', err);
      // Set fallback stats on error
      setStats({
        notes: { total: 0, recent: 0 },
        documents: { total: 0, recent: 0 },
        todos: { total: 0, pending: 0, completed: 0, overdue: 0 },
        diary: { entries: 0, streak: 0 },
        archive: { folders: 0, items: 0 },
        projects: { active: 0 },
        last_updated: new Date().toISOString()
      });
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
  }) => {
    const [hovered, setHovered] = useState(false);
    return (
    <Card
      component={Link}
      to={path}
      padding="md"
      radius="md"
      withBorder
      style={{ 
        textDecoration: 'none',
        transition: 'all 150ms ease',
        height: '100%',
        cursor: 'pointer',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'none'
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
              <Text size="sm" fw={500} c={(moduleStats?.recent || 0) > 0 ? 'blue' : undefined}>
                {moduleStats?.recent || 0}
              </Text>
            </Group>
          </>
        )}

        {title === 'Documents' && quick && quick.storage_by_module && (
          <StorageBreakdownCard total={quick.storage_used_mb} byModule={quick.storage_by_module} />
        )}

        {title === 'Documents' && (
          <>
            <Group justify="space-between">
              <Text size="sm">Total files</Text>
              <Text size="sm" fw={500}>{moduleStats?.total || 0}</Text>
            </Group>
            <Group justify="space-between">
              <Text size="sm">Recent uploads</Text>
              <Text size="sm" fw={500} c={(moduleStats?.recent || 0) > 0 ? 'green' : undefined}>
                {moduleStats?.recent || 0}
              </Text>
            </Group>
          </>
        )}

        {title === 'Todos' && (
          <>
            {(moduleStats?.in_progress || 0) > 0 && (
              <Group justify="space-between">
                <Text size="sm">In Progress</Text>
                <Badge size="sm" variant="light" color="cyan">
                  {moduleStats?.in_progress}
                </Badge>
              </Group>
            )}
            {(moduleStats?.pending || 0) > 0 && (
              <Group justify="space-between">
                <Text size="sm">Pending</Text>
                <Badge size="sm" variant="light" color="gray">
                  {moduleStats?.pending}
                </Badge>
              </Group>
            )}
            {(moduleStats?.blocked || 0) > 0 && (
              <Group justify="space-between">
                <Text size="sm">Blocked</Text>
                <Badge size="sm" variant="filled" color="red">
                  {moduleStats?.blocked}
                </Badge>
              </Group>
            )}
            {(moduleStats?.done || 0) > 0 && (
              <Group justify="space-between">
                <Text size="sm">Done</Text>
                <Badge size="sm" variant="light" color="blue">
                  {moduleStats?.done}
                </Badge>
              </Group>
            )}
            {(moduleStats?.overdue || 0) > 0 && (
              <Group justify="space-between">
                <Text size="sm">Overdue</Text>
                <Badge size="sm" variant="filled" color="orange">
                  {moduleStats?.overdue}
                </Badge>
              </Group>
            )}
            {(moduleStats?.total || 0) > 0 && (
              <Progress 
                value={dashboardService.calculateCompletionPercentage(moduleStats?.done || moduleStats?.completed || 0, moduleStats?.total || 0)} 
                size="sm" 
                color="blue" 
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
              <Text size="sm" fw={500} c={(moduleStats?.streak || 0) > 0 ? 'purple' : undefined}>
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
  ); };

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
    <MainDashboard onRefresh={handleRefresh} />
  );
}
