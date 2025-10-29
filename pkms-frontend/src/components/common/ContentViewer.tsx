/**
 * Content Viewer Component
 * 
 * A modular content viewer that can be reused across different modules (notes, diary, etc.)
 * Supports markdown rendering, file display, and various metadata fields.
 */

import React, { useState } from 'react';
import {
  Container,
  Stack,
  Group,
  Button,
  Title,
  Text,
  Badge,
  Card,
  Skeleton,
  Alert,
  Paper,
  Grid,
  Divider,
  ActionIcon,
  Tooltip
} from '@mantine/core';
import {
  IconEdit,
  IconArrowLeft,
  IconArchive,
  IconArchiveOff,
  IconTrash,
  IconAlertTriangle,
  IconMood,
  IconCloudRain,
  IconMapPin,
  IconCalendar,
  IconTag,
  IconFolder
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { UnifiedFileSection } from '../file/UnifiedFileSection';
import { UnifiedFileItem } from '../../services/unifiedFileService';

export interface ContentViewerProps {
  // Content fields
  title: string;
  content: string;
  
  // Metadata fields
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  isArchived?: boolean;
  
  // Project fields (for notes)
  projectBadges?: Array<{ id: string; name: string; color: string }>;
  
  // Diary-specific fields
  mood?: number;
  weatherCode?: number;
  location?: string;
  date?: string;
  
  // File management
  files: UnifiedFileItem[];
  onFilesUpdate: (files: UnifiedFileItem[]) => void;
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  entityId: string;
  
  // Actions
  onEdit: () => void;
  onBack: () => void;
  onToggleArchive?: () => void;
  onDelete?: () => void;
  
  // State
  isLoading?: boolean;
  error?: string | null;
  
  // UI options
  showFiles?: boolean;
  showProjects?: boolean;
  showDiaryFields?: boolean;
  enableDragDrop?: boolean;
}

export const ContentViewer: React.FC<ContentViewerProps> = ({
  title,
  content,
  tags = [],
  createdAt,
  updatedAt,
  isArchived = false,
  projectBadges = [],
  mood,
  weatherCode,
  location,
  date,
  files,
  onFilesUpdate,
  module,
  entityId,
  onEdit,
  onBack,
  onToggleArchive,
  onDelete,
  isLoading = false,
  error = null,
  showFiles = true,
  showProjects = false,
  showDiaryFields = false,
  enableDragDrop = false
}) => {
  const weatherLabels = [
    'Sunny', 'Partly Cloudy', 'Cloudy', 'Rainy', 'Stormy', 'Snowy', 'Foggy'
  ];

  const moodLabels = [
    'Very Sad', 'Sad', 'Neutral', 'Happy', 'Very Happy'
  ];

  const moodEmojis = ['😢', '😞', '😐', '😊', '😄'];

  const handleDelete = () => {
    modals.openConfirmModal({
      title: 'Delete Item',
      children: (
        <Text size="sm">
          Are you sure you want to delete this item? This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: onDelete
    });
  };

  if (isLoading) {
    return (
      <Container size="lg" py="md">
        <Stack gap="md">
          <Skeleton height={40} />
          <Skeleton height={200} />
          <Skeleton height={100} />
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="lg" py="md">
        <Alert color="red" title="Error" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Group gap="md">
            <Button
              variant="light"
              leftSection={<IconArrowLeft size={16} />}
              onClick={onBack}
            >
              Back
            </Button>
            <Title order={2}>{title}</Title>
            {isArchived && (
              <Badge color="orange" leftSection={<IconArchive size={12} />}>
                Archived
              </Badge>
            )}
          </Group>
          
          <Group gap="xs">
            <Button
              leftSection={<IconEdit size={16} />}
              onClick={onEdit}
            >
              Edit
            </Button>
            {onToggleArchive && (
              <Button
                variant="light"
                leftSection={isArchived ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
                onClick={onToggleArchive}
              >
                {isArchived ? 'Unarchive' : 'Archive'}
              </Button>
            )}
            {onDelete && (
              <Button
                variant="light"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={handleDelete}
              >
                Delete
              </Button>
            )}
          </Group>
        </Group>

        {/* Metadata */}
        <Card withBorder p="md">
          <Stack gap="sm">
            {/* Diary-specific fields */}
            {showDiaryFields && (
              <Grid>
                {mood && mood > 0 && (
                  <Grid.Col span={4}>
                    <Group gap="xs">
                      <IconMood size={16} />
                      <Text size="sm" fw={500}>Mood:</Text>
                      <Text size="sm">{moodEmojis[mood - 1]} {moodLabels[mood - 1]}</Text>
                    </Group>
                  </Grid.Col>
                )}
                {weatherCode !== undefined && weatherCode >= 0 && (
                  <Grid.Col span={4}>
                    <Group gap="xs">
                      <IconCloudRain size={16} />
                      <Text size="sm" fw={500}>Weather:</Text>
                      <Text size="sm">{weatherLabels[Math.min(weatherLabels.length - 1, Math.max(0, weatherCode))]}</Text>
                    </Group>
                  </Grid.Col>
                )}
                {location && (
                  <Grid.Col span={4}>
                    <Group gap="xs">
                      <IconMapPin size={16} />
                      <Text size="sm" fw={500}>Location:</Text>
                      <Text size="sm">{location}</Text>
                    </Group>
                  </Grid.Col>
                )}
                {date && (
                  <Grid.Col span={12}>
                    <Group gap="xs">
                      <IconCalendar size={16} />
                      <Text size="sm" fw={500}>Date:</Text>
                      <Text size="sm">{new Date(date).toLocaleDateString()}</Text>
                    </Group>
                  </Grid.Col>
                )}
              </Grid>
            )}

            {/* Tags */}
            {tags.length > 0 && (
              <Group gap="xs">
                <IconTag size={16} />
                <Text size="sm" fw={500}>Tags:</Text>
                <Group gap="xs">
                  {tags.map((tag, index) => (
                    <Badge key={index} variant="light" size="sm">
                      {tag}
                    </Badge>
                  ))}
                </Group>
              </Group>
            )}

            {/* Project badges */}
            {showProjects && projectBadges.length > 0 && (
              <Group gap="xs">
                <IconFolder size={16} />
                <Text size="sm" fw={500}>Projects:</Text>
                <Group gap="xs">
                  {projectBadges.map((project) => (
                    <Badge key={project.id} color={project.color} size="sm">
                      {project.name}
                    </Badge>
                  ))}
                </Group>
              </Group>
            )}

            {/* Timestamps */}
            <Group gap="lg">
              {createdAt && (
                <Text size="sm" c="dimmed">
                  Created: {new Date(createdAt).toLocaleString()}
                </Text>
              )}
              {updatedAt && updatedAt !== createdAt && (
                <Text size="sm" c="dimmed">
                  Updated: {new Date(updatedAt).toLocaleString()}
                </Text>
              )}
            </Group>
          </Stack>
        </Card>

        {/* Content */}
        <Card withBorder p="md">
          <Title order={5} mb="md">Content</Title>
          <Paper p="md" withBorder>
            <MDEditor.Markdown 
              source={content} 
              data-color-mode="light"
            />
          </Paper>
        </Card>

        {/* Files Section */}
        {showFiles && (
          <UnifiedFileSection
            module={module}
            entityId={entityId}
            files={files}
            onFilesUpdate={onFilesUpdate}
            showUpload={false}
            showAudioRecorder={false}
            enableDragDrop={enableDragDrop}
          />
        )}
      </Stack>
    </Container>
  );
};
