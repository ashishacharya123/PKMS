/**
 * Content Editor Component
 * 
 * A modular content editor that can be reused across different modules (notes, diary, etc.)
 * Supports markdown editing, file attachments, and various metadata fields.
 */

import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  TextInput,
  Button,
  Group,
  Stack,
  Card,
  Title,
  TagsInput,
  Alert,
  Skeleton,
  Badge,
  Paper,
  Text,
  Select,
  NumberInput,
  Switch,
  Textarea
} from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import {
  IconDeviceFloppy,
  IconX,
  IconEye,
  IconEdit,
  IconMarkdown,
  IconFolder,
  IconMood,
  IconCloudRain,
  IconMapPin
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { notifications } from '@mantine/notifications';
import { UnifiedFileSection } from '../file/UnifiedFileSection';
import { UnifiedFileItem } from '../../services/unifiedFileService';


export interface ContentEditorProps {
  // Content fields
  title: string;
  content: string;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  
  // Metadata fields (optional)
  tags?: string[];
  onTagsChange?: (tags: string[]) => void;
  tagSuggestions?: string[];
  
  // Project fields (for notes)
  projectIds?: string[];
  onProjectIdsChange?: (projectIds: string[]) => void;
  isExclusive?: boolean;
  onIsExclusiveChange?: (isExclusive: boolean) => void;
  
  // Diary-specific fields
  mood?: number;
  onMoodChange?: (mood: number) => void;
  weatherCode?: number;
  onWeatherCodeChange?: (weatherCode: number) => void;
  location?: string;
  onLocationChange?: (location: string) => void;
  date?: Date;
  onDateChange?: (date: Date) => void;
  
  // Template selection
  availableTemplates?: Array<{ uuid: string; title: string; date: string; isTemplate: boolean }>;
  selectedTemplateId?: string;
  onTemplateSelect?: (templateId: string | null) => void;
  onCreateFromTemplate?: (templateId: string) => void;
  
  // File management
  files: UnifiedFileItem[];
  onFilesUpdate: (files: UnifiedFileItem[]) => void;
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  entityId: string;
  
  // Actions
  onSave: () => void;
  onCancel: () => void;
  onPreview?: () => void;
  
  // State
  isSaving?: boolean;
  isLoading?: boolean;
  error?: string | null;
  
  // UI options
  showPreview?: boolean;
  showFiles?: boolean;
  showProjects?: boolean;
  showDiaryFields?: boolean;
  showTemplateSelection?: boolean;
  enableDragDrop?: boolean;
}

export const ContentEditor: React.FC<ContentEditorProps> = ({
  title,
  content,
  onTitleChange,
  onContentChange,
  tags = [],
  onTagsChange,
  tagSuggestions = [],
  projectIds = [],
  onProjectIdsChange,
  isExclusive = false,
  onIsExclusiveChange,
  mood,
  onMoodChange,
  weatherCode,
  onWeatherCodeChange,
  location,
  onLocationChange,
  availableTemplates,
  selectedTemplateId,
  onTemplateSelect,
  onCreateFromTemplate,
  files,
  onFilesUpdate,
  module,
  entityId,
  onSave,
  onCancel,
  onPreview,
  isSaving = false,
  isLoading = false,
  error = null,
  showPreview = true,
  showFiles = true,
  showProjects = false,
  showDiaryFields = false,
  showTemplateSelection = false,
  enableDragDrop = false
}) => {
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const weatherOptions = [
    { value: '0', label: 'Sunny' },
    { value: '1', label: 'Partly Cloudy' },
    { value: '2', label: 'Cloudy' },
    { value: '3', label: 'Rainy' },
    { value: '4', label: 'Stormy' },
    { value: '5', label: 'Snowy' },
    { value: '6', label: 'Foggy' }
  ];

  const moodOptions = [
    { value: '1', label: '😢 Very Sad' },
    { value: '2', label: '😞 Sad' },
    { value: '3', label: '😐 Neutral' },
    { value: '4', label: '😊 Happy' },
    { value: '5', label: '😄 Very Happy' }
  ];

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

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}

        {/* Title */}
        <TextInput
          label="Title"
          placeholder="Enter title..."
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          size="lg"
          required
        />

        {/* Diary-specific fields */}
        {showDiaryFields && (
          <Grid>
            <Grid.Col span={3}>
              <DatePicker
                label="Date"
                placeholder="Select date"
                value={date}
                onChange={(value) => onDateChange?.(value || new Date())}
                size="md"
              />
            </Grid.Col>
            <Grid.Col span={3}>
              <Select
                label="Mood"
                placeholder="Select mood"
                data={moodOptions}
                value={mood?.toString()}
                onChange={(value) => onMoodChange?.(value ? parseInt(value) : 0)}
                leftSection={<IconMood size={16} />}
              />
            </Grid.Col>
            <Grid.Col span={3}>
              <Select
                label="Weather"
                placeholder="Select weather"
                data={weatherOptions}
                value={weatherCode?.toString()}
                onChange={(value) => onWeatherCodeChange?.(value ? parseInt(value) : 0)}
                leftSection={<IconCloudRain size={16} />}
              />
            </Grid.Col>
            <Grid.Col span={3}>
              <TextInput
                label="Location"
                placeholder="Enter location"
                value={location || ''}
                onChange={(e) => onLocationChange?.(e.target.value)}
                leftSection={<IconMapPin size={16} />}
              />
            </Grid.Col>
          </Grid>
        )}

        {/* Template Selection */}
        {showTemplateSelection && availableTemplates && availableTemplates.length > 0 && (
          <Card withBorder p="md">
            <Stack gap="md">
              <Title order={5}>Template Selection</Title>
              <Group gap="md" align="end">
                <Select
                  label="Use Template"
                  placeholder="Select a template to start from"
                  data={availableTemplates
                    .filter(t => t.isTemplate)
                    .map(t => ({
                      value: t.uuid,
                      label: `${t.title} (${new Date(t.date).toLocaleDateString()})`
                    }))}
                  value={selectedTemplateId || null}
                  onChange={(value) => onTemplateSelect?.(value)}
                  style={{ flex: 1 }}
                />
                {selectedTemplateId && onCreateFromTemplate && (
                  <Button
                    variant="light"
                    onClick={() => onCreateFromTemplate(selectedTemplateId)}
                  >
                    Create from Template
                  </Button>
                )}
              </Group>
            </Stack>
          </Card>
        )}

        {/* Tags */}
        {onTagsChange && (
          <TagsInput
            label="Tags"
            placeholder="Add tags..."
            value={tags}
            onChange={onTagsChange}
            data={tagSuggestions}
            splitChars={[',', ' ', '|']}
          />
        )}

        {/* Project fields (for notes) */}
        {showProjects && onProjectIdsChange && (
          <Card withBorder p="md">
            <Stack gap="md">
              <Title order={5}>Project Association</Title>
              <MultiProjectSelector
                selectedProjectIds={projectIds}
                onProjectIdsChange={onProjectIdsChange}
              />
              <Switch
                label="Exclusive to this project"
                description="This note will only be visible within the selected project"
                checked={isExclusive}
                onChange={(e) => onIsExclusiveChange?.(e.currentTarget.checked)}
              />
            </Stack>
          </Card>
        )}

        {/* Content Editor */}
        <Card withBorder p="md">
          <Group justify="space-between" mb="md">
            <Title order={5}>Content</Title>
            <Group gap="xs">
              {showPreview && (
                <Button
                  variant={isPreviewMode ? 'filled' : 'light'}
                  size="sm"
                  leftSection={<IconEye size={16} />}
                  onClick={() => setIsPreviewMode(!isPreviewMode)}
                >
                  {isPreviewMode ? 'Edit' : 'Preview'}
                </Button>
              )}
            </Group>
          </Group>

          {isPreviewMode ? (
            <Paper p="md" withBorder>
              <MDEditor.Markdown 
                source={content} 
                data-color-mode="light"
              />
            </Paper>
          ) : (
            <MDEditor
              value={content}
              onChange={(value) => onContentChange(value || '')}
              height={250}
              data-color-mode="light"
            />
          )}
        </Card>

        {/* Files Section */}
        {showFiles && (
          <UnifiedFileSection
            module={module}
            entityId={entityId}
            files={files}
            onFilesUpdate={onFilesUpdate}
            showUpload={true}
            showAudioRecorder={true}
            enableDragDrop={enableDragDrop}
          />
        )}

        {/* Action Buttons */}
        <Group justify="flex-end" gap="sm">
          <Button
            variant="light"
            leftSection={<IconX size={16} />}
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          {onPreview && (
            <Button
              variant="light"
              leftSection={<IconEye size={16} />}
              onClick={onPreview}
              disabled={isSaving}
            >
              Preview
            </Button>
          )}
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={onSave}
            loading={isSaving}
            disabled={!title.trim()}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </Group>
      </Stack>
    </Container>
  );
};
