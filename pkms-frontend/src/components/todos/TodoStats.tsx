/**
 * TodoStats Component
 * Displays statistics and metrics for todos
 */

import React from 'react';
import { 
  Group, 
  Paper, 
  Text, 
  Badge, 
  Progress, 
  Stack,
  ThemeIcon,
  SimpleGrid
} from '@mantine/core';
import { 
  IconChecklist, 
  IconClock, 
  IconAlertTriangle, 
  IconCheck,
  IconArchive
} from '@tabler/icons-react';
import { Todo, TodoStatus, TaskPriority } from '../../types/todo';

interface TodoStatsProps {
  todos: Todo[];
  showArchived?: boolean;
}

export function TodoStats({ todos, showArchived = false }: TodoStatsProps) {
  const visibleTodos = showArchived ? todos : todos.filter(todo => !todo.isArchived);
  
  const stats = React.useMemo(() => {
    const total = visibleTodos.length;
    const completed = visibleTodos.filter(todo => todo.status === TodoStatus.DONE).length;
    const inProgress = visibleTodos.filter(todo => todo.status === TodoStatus.IN_PROGRESS).length;
    const pending = visibleTodos.filter(todo => todo.status === TodoStatus.PENDING).length;
    const blocked = visibleTodos.filter(todo => todo.status === TodoStatus.BLOCKED).length;
    const archived = todos.filter(todo => todo.isArchived).length;
    
    const highPriority = visibleTodos.filter(todo => 
      todo.priority === TaskPriority.HIGH || todo.priority === TaskPriority.URGENT
    ).length;
    
    const overdue = visibleTodos.filter(todo => {
      if (!todo.dueDate || todo.status === TodoStatus.DONE) return false;
      const due = new Date(todo.dueDate);
      const now = new Date();
      return due < now;
    }).length;
    
    const dueToday = visibleTodos.filter(todo => {
      if (!todo.dueDate || todo.status === TodoStatus.DONE) return false;
      const due = new Date(todo.dueDate);
      const today = new Date();
      return due.toDateString() === today.toDateString();
    }).length;
    
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return {
      total,
      completed,
      inProgress,
      pending,
      blocked,
      archived,
      highPriority,
      overdue,
      dueToday,
      completionRate
    };
  }, [visibleTodos, todos, showArchived]);

  if (stats.total === 0) {
    return (
      <Paper p="md" withBorder>
        <Text size="sm" c="dimmed" ta="center">
          No todos to display statistics for
        </Text>
      </Paper>
    );
  }

  return (
    <Stack gap="md">
      {/* Main Stats Grid */}
      <SimpleGrid cols={{ base: 2, sm: 4, md: 6 }} spacing="md">
        <Paper p="sm" withBorder>
          <Group gap="xs" align="center">
            <ThemeIcon size="sm" color="blue" variant="light">
              <IconChecklist size={14} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed">Total</Text>
              <Text size="lg" fw={600}>{stats.total}</Text>
            </div>
          </Group>
        </Paper>

        <Paper p="sm" withBorder>
          <Group gap="xs" align="center">
            <ThemeIcon size="sm" color="green" variant="light">
              <IconCheck size={14} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed">Completed</Text>
              <Text size="lg" fw={600}>{stats.completed}</Text>
            </div>
          </Group>
        </Paper>

        <Paper p="sm" withBorder>
          <Group gap="xs" align="center">
            <ThemeIcon size="sm" color="blue" variant="light">
              <IconClock size={14} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed">In Progress</Text>
              <Text size="lg" fw={600}>{stats.inProgress}</Text>
            </div>
          </Group>
        </Paper>

        <Paper p="sm" withBorder>
          <Group gap="xs" align="center">
            <ThemeIcon size="sm" color="orange" variant="light">
              <IconAlertTriangle size={14} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed">Pending</Text>
              <Text size="lg" fw={600}>{stats.pending}</Text>
            </div>
          </Group>
        </Paper>

        <Paper p="sm" withBorder>
          <Group gap="xs" align="center">
            <ThemeIcon size="sm" color="red" variant="light">
              <IconAlertTriangle size={14} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed">Blocked</Text>
              <Text size="lg" fw={600}>{stats.blocked}</Text>
            </div>
          </Group>
        </Paper>

        <Paper p="sm" withBorder>
          <Group gap="xs" align="center">
            <ThemeIcon size="sm" color="gray" variant="light">
              <IconArchive size={14} />
            </ThemeIcon>
            <div>
              <Text size="xs" c="dimmed">Archived</Text>
              <Text size="lg" fw={600}>{stats.archived}</Text>
            </div>
          </Group>
        </Paper>
      </SimpleGrid>

      {/* Progress and Alerts */}
      <Group gap="md" align="flex-start">
        <Paper p="md" withBorder style={{ flex: 1 }}>
          <Group justify="space-between" mb="sm">
            <Text size="sm" fw={500}>Completion Rate</Text>
            <Badge color="blue" variant="light">
              {stats.completionRate}%
            </Badge>
          </Group>
          <Progress 
            value={stats.completionRate} 
            size="lg" 
            color="blue"
            radius="xl"
          />
        </Paper>

        <Paper p="md" withBorder style={{ flex: 1 }}>
          <Stack gap="sm">
            <Text size="sm" fw={500}>Priority & Due Dates</Text>
            
            <Group justify="space-between">
              <Text size="xs" c="dimmed">High Priority</Text>
              <Badge color="red" variant="light" size="sm">
                {stats.highPriority}
              </Badge>
            </Group>
            
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Overdue</Text>
              <Badge color="red" variant="light" size="sm">
                {stats.overdue}
              </Badge>
            </Group>
            
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Due Today</Text>
              <Badge color="orange" variant="light" size="sm">
                {stats.dueToday}
              </Badge>
            </Group>
          </Stack>
        </Paper>
      </Group>

      {/* Status Distribution */}
      <Paper p="md" withBorder>
        <Text size="sm" fw={500} mb="sm">Status Distribution</Text>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="xs">Pending</Text>
            <Group gap="xs" align="center">
              <Progress 
                value={(stats.pending / stats.total) * 100} 
                size="sm" 
                color="orange"
                style={{ width: 100 }}
              />
              <Text size="xs" c="dimmed">{stats.pending}</Text>
            </Group>
          </Group>
          
          <Group justify="space-between">
            <Text size="xs">In Progress</Text>
            <Group gap="xs" align="center">
              <Progress 
                value={(stats.inProgress / stats.total) * 100} 
                size="sm" 
                color="blue"
                style={{ width: 100 }}
              />
              <Text size="xs" c="dimmed">{stats.inProgress}</Text>
            </Group>
          </Group>
          
          <Group justify="space-between">
            <Text size="xs">Blocked</Text>
            <Group gap="xs" align="center">
              <Progress 
                value={(stats.blocked / stats.total) * 100} 
                size="sm" 
                color="red"
                style={{ width: 100 }}
              />
              <Text size="xs" c="dimmed">{stats.blocked}</Text>
            </Group>
          </Group>
          
          <Group justify="space-between">
            <Text size="xs">Completed</Text>
            <Group gap="xs" align="center">
              <Progress 
                value={(stats.completed / stats.total) * 100} 
                size="sm" 
                color="green"
                style={{ width: 100 }}
              />
              <Text size="xs" c="dimmed">{stats.completed}</Text>
            </Group>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
