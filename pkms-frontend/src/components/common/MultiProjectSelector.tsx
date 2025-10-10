import React, { useState, useEffect } from 'react';
import {
  MultiSelect,
  Checkbox,
  Stack,
  Text,
  Badge,
  Group,
  Loader,
  Alert
} from '@mantine/core';
import { IconAlertCircle, IconLock, IconLink } from '@tabler/icons-react';
import { todosService } from '../../services/todosService';

interface Project {
  id: number;
  name: string;
  color: string;
}

interface MultiProjectSelectorProps {
  value: number[];
  onChange: (projectIds: number[]) => void;
  isExclusive: boolean;
  onExclusiveChange: (isExclusive: boolean) => void;
  label?: string;
  description?: string;
  error?: string;
  disabled?: boolean;
}

export const MultiProjectSelector: React.FC<MultiProjectSelectorProps> = ({
  value,
  onChange,
  isExclusive,
  onExclusiveChange,
  label = "Projects",
  description,
  error,
  disabled = false
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await todosService.getProjects(false);  // Pass archived flag directly
      setProjects(response);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectData = projects.map(p => ({
    value: p.id.toString(),
    label: p.name,
    // Store color in custom prop for potential future use
    color: p.color
  }));

  const handleChange = (values: string[]) => {
    onChange(values.map(v => parseInt(v, 10)));
  };

  const selectedProjects = projects.filter(p => value.includes(p.id));

  return (
    <Stack gap="sm">
      <MultiSelect
        label={label}
        description={description}
        placeholder={loading ? "Loading projects..." : "Select projects (optional)"}
        data={selectData}
        value={value.map(v => v.toString())}
        onChange={handleChange}
        searchable
        clearable
        disabled={disabled || loading}
        error={error}
        leftSection={loading ? <Loader size="xs" /> : undefined}
        renderOption={({ option }) => {
          const project = projects.find(p => p.id.toString() === option.value);
          return (
            <Group gap="xs">
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  backgroundColor: project?.color || '#868e96'
                }}
              />
              <Text size="sm">{option.label}</Text>
            </Group>
          );
        }}
      />

      {/* Exclusive Mode Checkbox - only show if projects are selected */}
      {value.length > 0 && (
        <Stack gap="xs">
          <Checkbox
            label={
              <Group gap="xs">
                <Text size="sm">Exclusive Mode</Text>
                {isExclusive ? (
                  <IconLock size={16} color="var(--mantine-color-red-6)" />
                ) : (
                  <IconLink size={16} color="var(--mantine-color-blue-6)" />
                )}
              </Group>
            }
            description={
              isExclusive
                ? "This item will be deleted if any of its projects are deleted"
                : "This item will survive project deletion (project name preserved)"
            }
            checked={isExclusive}
            onChange={(e) => onExclusiveChange(e.currentTarget.checked)}
            disabled={disabled}
          />

          {/* Warning for exclusive mode */}
          {isExclusive && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Exclusive Mode Enabled"
              color="orange"
              variant="light"
            >
              <Text size="xs">
                This item is <strong>exclusive</strong> to its projects. Deleting any linked project will permanently delete this item.
              </Text>
            </Alert>
          )}

          {/* Display selected projects with badges */}
          <Group gap="xs">
            <Text size="xs" c="dimmed">Selected:</Text>
            {selectedProjects.map(p => (
              <Badge
                key={p.id}
                color={p.color}
                variant="light"
                size="sm"
                leftSection={
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: p.color
                    }}
                  />
                }
              >
                {p.name}
              </Badge>
            ))}
          </Group>
        </Stack>
      )}
    </Stack>
  );
};

