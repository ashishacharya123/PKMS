/**
 * TodoFilters Component
 * Filter and sort controls for todos
 */

import { 
  Group, 
  Select, 
  MultiSelect, 
  Button, 
  Badge, 
  Stack,
  Text,
  ActionIcon,
  Tooltip
} from '@mantine/core';
import { IconFilter, IconX, IconSortAscending, IconSortDescending } from '@tabler/icons-react';
import { TodoStatus, TaskPriority, TodoType } from '../../types/todo';
import { Project } from '../../types/project';

export interface TodoFilters {
  status: TodoStatus[];
  priority: TaskPriority[];
  type: TodoType[];
  projects: string[];
  sortBy: 'createdAt' | 'updatedAt' | 'dueDate' | 'title' | 'priority';
  sortOrder: 'asc' | 'desc';
  showArchived: boolean;
}

interface TodoFiltersProps {
  filters: TodoFilters;
  onFiltersChange: (filters: TodoFilters) => void;
  projects: Project[];
  activeFiltersCount: number;
}

export function TodoFilters({
  filters,
  onFiltersChange,
  projects,
  activeFiltersCount
}: TodoFiltersProps) {
  const updateFilter = <K extends keyof TodoFilters>(
    key: K, 
    value: TodoFilters[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      status: [],
      priority: [],
      type: [],
      projects: [],
      sortBy: 'createdAt',
      sortOrder: 'desc',
      showArchived: false
    });
  };

  const statusOptions = [
    { value: TodoStatus.PENDING, label: 'Pending' },
    { value: TodoStatus.IN_PROGRESS, label: 'In Progress' },
    { value: TodoStatus.BLOCKED, label: 'Blocked' },
    { value: TodoStatus.DONE, label: 'Done' }
  ];

  const priorityOptions = [
    { value: TaskPriority.LOW, label: 'Low' },
    { value: TaskPriority.MEDIUM, label: 'Medium' },
    { value: TaskPriority.HIGH, label: 'High' },
    { value: TaskPriority.URGENT, label: 'Urgent' }
  ];

  const typeOptions = [
    { value: TodoType.TASK, label: 'Task' },
    { value: TodoType.CHECKLIST, label: 'Checklist' },
    { value: TodoType.SUBTASK, label: 'Subtask' }
  ];

  const sortOptions = [
    { value: 'createdAt', label: 'Created Date' },
    { value: 'updatedAt', label: 'Updated Date' },
    { value: 'dueDate', label: 'Due Date' },
    { value: 'title', label: 'Title' },
    { value: 'priority', label: 'Priority' }
  ];

  const projectOptions = projects.map(project => ({
    value: project.uuid,
    label: project.name
  }));

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="xs" align="center">
          <IconFilter size={16} />
          <Text size="sm" fw={500}>Filters</Text>
          {activeFiltersCount > 0 && (
            <Badge size="sm" color="blue" variant="light">
              {activeFiltersCount}
            </Badge>
          )}
        </Group>
        
        {activeFiltersCount > 0 && (
          <Tooltip label="Clear all filters">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={clearAllFilters}
            >
              <IconX size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      <Group gap="md" align="flex-end">
        <MultiSelect
          label="Status"
          placeholder="All statuses"
          data={statusOptions}
          value={filters.status}
          onChange={(value) => updateFilter('status', value as TodoStatus[])}
          clearable
          size="sm"
          style={{ minWidth: 150 }}
        />

        <MultiSelect
          label="Priority"
          placeholder="All priorities"
          data={priorityOptions}
          value={filters.priority}
          onChange={(value) => updateFilter('priority', value as TaskPriority[])}
          clearable
          size="sm"
          style={{ minWidth: 150 }}
        />

        <MultiSelect
          label="Type"
          placeholder="All types"
          data={typeOptions}
          value={filters.type}
          onChange={(value) => updateFilter('type', value as TodoType[])}
          clearable
          size="sm"
          style={{ minWidth: 150 }}
        />

        <MultiSelect
          label="Projects"
          placeholder="All projects"
          data={projectOptions}
          value={filters.projects}
          onChange={(value) => updateFilter('projects', value)}
          clearable
          size="sm"
          style={{ minWidth: 200 }}
        />
      </Group>

      <Group gap="md" align="flex-end">
        <Select
          label="Sort by"
          data={sortOptions}
          value={filters.sortBy}
          onChange={(value) => updateFilter('sortBy', value as TodoFilters['sortBy'])}
          size="sm"
          style={{ minWidth: 150 }}
        />

        <Button
          variant="light"
          size="sm"
          leftSection={
            filters.sortOrder === 'asc' ? 
              <IconSortAscending size={14} /> : 
              <IconSortDescending size={14} />
          }
          onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
        >
          {filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        </Button>
      </Group>
    </Stack>
  );
}
