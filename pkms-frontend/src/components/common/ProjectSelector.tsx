/**
 * Multi-project selector component
 * Supports both single and multi-project selection
 * Matches backend project association system
 */

import { MultiSelect, Badge, Group, Text, Stack } from '@mantine/core';
import { useState, useEffect } from 'react';
import { ProjectSummary } from '../../types/project';
import { ProjectStatus, TaskPriority } from '../../types/enums';
import { getStatusColor, getPriorityColor } from '../../theme/colors';

interface ProjectSelectorProps {
  value: string[]; // Array of project UUIDs
  onChange: (projectIds: string[]) => void;
  placeholder?: string;
  label?: string;
  description?: string;
  error?: string;
  disabled?: boolean;
  maxValues?: number;
  showProjectDetails?: boolean;
  isExclusiveMode?: boolean;
  onExclusiveModeChange?: (isExclusive: boolean) => void;
}

export function ProjectSelector({
  value = [],
  onChange,
  placeholder = "Select projects...",
  label = "Projects",
  description,
  error,
  disabled = false,
  maxValues,
  showProjectDetails = true,
  isExclusiveMode = false,
  onExclusiveModeChange
}: ProjectSelectorProps) {
  const [availableProjects, setAvailableProjects] = useState<ProjectSummary[]>([]);
  const [, setLoading] = useState(false);

  // Load available projects
  useEffect(() => {
    const loadProjects = async () => {
      setLoading(true);
      try {
        // TODO: Replace with actual API call when projectsService is implemented
        // const projects = await projectsService.getAll();
        // setAvailableProjects(projects);
        
        // Mock data for now
        setAvailableProjects([
          {
            uuid: '1',
            title: 'Website Redesign',
            name: 'Website Redesign',
            description: 'Complete website overhaul',
            status: ProjectStatus.IS_RUNNING,
            priority: TaskPriority.HIGH,
            dueDate: '2024-02-15',
            progressPercentage: 65,
            todoCount: 12,
            completedCount: 8,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-15',
            tags: ['web', 'design'],
            isFavorite: true,
          },
          {
            uuid: '2',
            title: 'Mobile App',
            name: 'Mobile App',
            description: 'iOS and Android app development',
            status: ProjectStatus.ON_HOLD,
            priority: TaskPriority.MEDIUM,
            dueDate: '2024-03-30',
            progressPercentage: 30,
            todoCount: 25,
            completedCount: 7,
            createdAt: '2024-01-10',
            updatedAt: '2024-01-20',
            tags: ['mobile', 'app'],
            isFavorite: false,
          },
          {
            uuid: '3',
            title: 'Database Migration',
            name: 'Database Migration',
            description: 'Migrate to new database system',
            status: ProjectStatus.COMPLETED,
            priority: TaskPriority.URGENT,
            dueDate: '2024-01-31',
            progressPercentage: 100,
            todoCount: 8,
            completedCount: 8,
            createdAt: '2024-01-05',
            updatedAt: '2024-01-31',
            tags: ['database', 'migration'],
            isFavorite: false,
          }
        ]);
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, []);

  const projectOptions = availableProjects.map(project => ({
    value: project.uuid,
    label: project.name,
    project: project
  }));

  const renderProjectOption = ({ option }: { option: any; checked?: boolean }) => {
    const project = option.project as ProjectSummary;
    
    if (!showProjectDetails) {
      return <Text size="sm">{option.label}</Text>;
    }

    return (
      <Stack gap="xs" style={{ width: '100%' }}>
        <Group gap="xs" justify="space-between">
          <Text fw={500} size="sm">{option.label}</Text>
          <Badge
            size="xs"
            color={getStatusColor({ colors: {} } as any, project.status)}
            variant="light"
          >
            {project.status.replace('_', ' ').toUpperCase()}
          </Badge>
        </Group>
        
        {project.description && (
          <Text size="xs" c="dimmed" lineClamp={1}>
            {project.description}
          </Text>
        )}
        
        <Group gap="xs" justify="space-between">
          <Group gap="xs">
            <Badge
              size="xs"
              color={getPriorityColor({ colors: {} } as any, project.priority)}
              variant="outline"
            >
              {project.priority.toUpperCase()}
            </Badge>
            <Text size="xs" c="dimmed">
              {project.progressPercentage}% complete
            </Text>
          </Group>
          
          <Text size="xs" c="dimmed">
            {project.todoCount} todos
          </Text>
        </Group>
      </Stack>
    );
  };

  // Removed unused renderSelectedProject function

  return (
    <Stack gap="sm">
      <MultiSelect
        label={label}
        description={description}
        placeholder={placeholder}
        data={projectOptions}
        value={value}
        onChange={onChange}
        error={error}
        disabled={disabled}
        maxValues={maxValues}
        searchable
        renderOption={renderProjectOption}
        clearable
        hidePickedOptions
        maxDropdownHeight={300}
      />
      
      {onExclusiveModeChange && (
        <Text size="xs" c="dimmed">
          Exclusive mode: {isExclusiveMode ? 'This item can only belong to one project' : 'This item can belong to multiple projects'}
        </Text>
      )}
    </Stack>
  );
}
