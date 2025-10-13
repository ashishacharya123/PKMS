import { useState, useEffect } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
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
import { dashboardService, type DashboardStats, type QuickStats } from '../services/dashboardService';
import { todosService, type Project } from '../services/todosService';
import StorageBreakdownCard from '../components/dashboard/StorageBreakdownCard';

// Update interfaces to match backend response
interface ModuleStats {
  notes: { total: number; recent: number };
  documents: { total: number; recent: number };
  todos: { 
    total: number; 
    pending: number; 
    inProgress?: number;
    blocked?: number;
    done?: number;
    cancelled?: number;
    completed: number; 
    overdue: number;
    dueToday?: number;
    completedToday?: number;
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

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickStats | null>(null);

  useAuthenticatedEffect(() => {
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
      const [dashboardStats, quickStats] = await Promise.all([
        dashboardService.getDashboardStats(),
        dashboardService.getQuickStats()
      ]);
      console.log('[Dashboard] Stats received:', dashboardStats);
      setStats(dashboardStats);
      setQuick(quickStats);
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

        {quick && quick.storage_by_module && (
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
            {(moduleStats?.inProgress || 0) > 0 && (
              <Group justify="space-between">
                <Text size="sm">In Progress</Text>
                <Badge size="sm" variant="light" color="cyan">
                  {moduleStats?.inProgress}
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

  // Project Cards Section Component
  const ProjectCardsSection = () => {
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
              key={project.id}
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
                    // Route to simple FTS5 search by default
                    navigate(`/search/unified?q=${encodeURIComponent(query)}`);
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
                  ((stats?.notes?.total || 0) + (stats?.documents?.total || 0) + (stats?.todos?.total || 0) + 
                   (stats?.diary?.entries || 0) + (stats?.archive?.items || 0))
                }</Text>
              </Group>
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
              <div>
                <Text size="sm" c="dimmed">Active Projects</Text>
                <Text fw={600} size="lg" c={(stats?.projects?.active || 0) > 0 ? 'pink' : undefined}>
                  {stats?.projects?.active || 0}
                </Text>
                {(stats?.projects?.active || 0) > 0 && (
                  <Button size="xs" variant="light" color="pink" mt={6} onClick={() => navigate('/projects')}>
                    View projects
                  </Button>
                )}
              </div>
              <div>
                <Text size="sm" c="dimmed">Overdue Tasks</Text>
                <Text fw={600} size="lg" c={(stats?.todos?.overdue || 0) > 0 ? 'red' : 'green'}>
                  {stats?.todos?.overdue || 0}
                </Text>
                <Group gap={6} mt={6} wrap="wrap">
                  {(stats?.todos?.overdue || 0) > 0 && (
                    <Button size="xs" variant="light" color="red" onClick={() => navigate('/todos?overdue=true')}>
                      View overdue
                    </Button>
                  )}
                  <Button size="xs" variant="light" onClick={() => navigate('/todos')}>
                    View today
                  </Button>
                </Group>
              </div>
              <div>
                <Text size="sm" c="dimmed">Diary Streak</Text>
                <Text fw={600} size="lg" c={(stats?.diary?.streak || 0) > 0 ? 'purple' : undefined}>
                  {stats?.diary?.streak || 0} days
                </Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">Todo Status</Text>
                <Group gap="xs" wrap="wrap" mt={4}>
                  {(stats?.todos?.inProgress || 0) > 0 && (
                    <Badge variant="light" color="cyan" size="sm">
                      {stats?.todos?.inProgress} in progress
                    </Badge>
                  )}
                  {(stats?.todos?.blocked || 0) > 0 && (
                    <Badge variant="filled" color="red" size="sm">
                      {stats?.todos?.blocked} blocked
                    </Badge>
                  )}
                  {(stats?.todos?.done || 0) > 0 && (
                    <Badge variant="light" color="blue" size="sm">
                      {stats?.todos?.done} done
                    </Badge>
                  )}
                </Group>
              </div>
            </SimpleGrid>
          </Card>
        )}

        {quick && quick.storage_by_module && (
          <StorageBreakdownCard total={quick.storage_used_mb} byModule={quick.storage_by_module} />
        )}

        {/* Today Panel (conditional fields) */}
        {stats && (
          <Card padding="sm" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Text fw={600} size="lg">Today</Text>
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
              <div>
                <Text size="sm" c="dimmed">Due Today</Text>
                <Text fw={600} size="lg" c={(stats as any)?.todos?.due_today > 0 ? 'orange' : undefined}>
                  {(stats as any)?.todos?.due_today ?? '-'}
                </Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">Overdue</Text>
                <Text fw={600} size="lg" c={(stats?.todos?.overdue || 0) > 0 ? 'red' : 'green'}>
                  {stats?.todos?.overdue || 0}
                </Text>
              </div>
              <div>
                <Text size="sm" c="dimmed">Completed Today</Text>
                <Text fw={600} size="lg" c={(stats as any)?.todos?.completed_today > 0 ? 'green' : undefined}>
                  {(stats as any)?.todos?.completed_today ?? '-'}
                </Text>
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

        {/* Active Projects */}
        {stats?.projects && stats.projects.active > 0 && (
          <div>
            <Text fw={600} size="lg" mb="md">Active Projects</Text>
            <ProjectCardsSection />
          </div>
        )}

        {/* Recent Updates */}
        <div>
          <Text fw={600} size="lg" mb="md">Recent Updates</Text>
          <Card padding="lg" radius="md" withBorder>
            <Stack gap="md">
              {stats && (
                <>
                  {(stats?.notes?.recent || 0) > 0 && (
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm">
                        <ThemeIcon size="sm" variant="light" color="blue">
                          <IconNotes size={14} />
                        </ThemeIcon>
                        <Text size="sm">Recent notes created</Text>
                      </Group>
                      <Badge variant="light" color="blue" size="sm">
                        {stats?.notes?.recent || 0} in last 7 days
                      </Badge>
                    </Group>
                  )}
                  
                  {(stats?.documents?.recent || 0) > 0 && (
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm">
                        <ThemeIcon size="sm" variant="light" color="green">
                          <IconFiles size={14} />
                        </ThemeIcon>
                        <Text size="sm">Documents uploaded</Text>
                      </Group>
                      <Badge variant="light" color="green" size="sm">
                        {stats?.documents?.recent || 0} in last 7 days
                      </Badge>
                    </Group>
                  )}
                  
                  {(stats?.todos?.pending || 0) > 0 && (
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm">
                        <ThemeIcon size="sm" variant="light" color="orange">
                          <IconChecklist size={14} />
                        </ThemeIcon>
                        <Text size="sm">Pending todos</Text>
                      </Group>
                      <Badge variant="light" color="orange" size="sm">
                        {stats?.todos?.pending || 0} tasks
                      </Badge>
                    </Group>
                  )}
                  
                  {(stats?.diary?.streak || 0) > 0 && (
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm">
                        <ThemeIcon size="sm" variant="light" color="purple">
                          <IconBook size={14} />
                        </ThemeIcon>
                        <Text size="sm">Diary writing streak</Text>
                      </Group>
                      <Badge variant="light" color="purple" size="sm">
                        {stats?.diary?.streak || 0} days
                      </Badge>
                    </Group>
                  )}
                  
                  {(stats?.archive?.items || 0) > 0 && (
                    <Group justify="space-between" wrap="nowrap">
                      <Group gap="sm">
                        <ThemeIcon size="sm" variant="light" color="indigo">
                          <IconArchive size={14} />
                        </ThemeIcon>
                        <Text size="sm">Archive items organized</Text>
                      </Group>
                      <Badge variant="light" color="indigo" size="sm">
                        {stats?.archive?.items || 0} items
                      </Badge>
                    </Group>
                  )}
                  
                  {/* Safe check for empty state */}
                  {(stats?.notes?.recent || 0) === 0 && 
                   (stats?.documents?.recent || 0) === 0 && 
                   (stats?.todos?.pending || 0) === 0 && 
                   (stats?.diary?.streak || 0) === 0 && 
                   (stats?.archive?.items || 0) === 0 && (
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