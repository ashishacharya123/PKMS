/**
 * File preview card component for showing file details before upload
 * Provides consistent file preview experience
 */

import { Card, Text, Group, Stack, Button, Badge, Image, Alert } from '@mantine/core';
import { IconFile, IconPhoto, IconMusic, IconVideo, IconFileText, IconDownload, IconTrash, IconEye } from '@tabler/icons-react';

interface FilePreviewCardProps {
  file: File;
  onRemove?: () => void;
  onPreview?: () => void;
  onDownload?: () => void;
  showActions?: boolean;
  compact?: boolean;
}

const getFileIcon = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return IconPhoto;
  if (mimeType.startsWith('video/')) return IconVideo;
  if (mimeType.startsWith('audio/')) return IconMusic;
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) {
    return IconFileText;
  }
  return IconFile;
};

const getFileTypeColor = (mimeType: string) => {
  if (mimeType.startsWith('image/')) return 'blue';
  if (mimeType.startsWith('video/')) return 'red';
  if (mimeType.startsWith('audio/')) return 'green';
  if (mimeType.includes('pdf')) return 'red';
  if (mimeType.includes('document')) return 'blue';
  if (mimeType.includes('text')) return 'gray';
  return 'gray';
};

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function FilePreviewCard({
  file,
  onRemove,
  onPreview,
  onDownload,
  showActions = true,
  compact = false
}: FilePreviewCardProps) {
  const FileIcon = getFileIcon(file.type);
  const fileTypeColor = getFileTypeColor(file.type);
  const isImage = file.type.startsWith('image/');
  const previewUrl = isImage ? URL.createObjectURL(file) : null;

  const handleRemove = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    onRemove?.();
  };

  if (compact) {
    return (
      <Group justify="space-between" p="sm" style={{ 
        border: '1px solid var(--mantine-color-gray-3)', 
        borderRadius: '8px' 
      }}>
        <Group gap="sm" style={{ flex: 1 }}>
          <FileIcon size={20} color={`var(--mantine-color-${fileTypeColor}-6)`} />
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" fw={500} truncate>
              {file.name}
            </Text>
            <Text size="xs" c="dimmed">
              {formatFileSize(file.size)}
            </Text>
          </Stack>
        </Group>
        
        {showActions && (
          <Group gap="xs">
            {onPreview && (
              <Button
                variant="subtle"
                size="xs"
                leftSection={<IconEye size={14} />}
                onClick={onPreview}
              >
                Preview
              </Button>
            )}
            {onRemove && (
              <Button
                variant="subtle"
                color="red"
                size="xs"
                leftSection={<IconTrash size={14} />}
                onClick={handleRemove}
              >
                Remove
              </Button>
            )}
          </Group>
        )}
      </Group>
    );
  }

  return (
    <Card shadow="sm" padding="md" radius="md" withBorder>
      <Stack gap="md">
        {/* File Header */}
        <Group justify="space-between" align="flex-start">
          <Group gap="sm" style={{ flex: 1 }}>
            <FileIcon size={24} color={`var(--mantine-color-${fileTypeColor}-6)`} />
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Text fw={500} size="md" lineClamp={2}>
                {file.name}
              </Text>
              <Group gap="xs">
                <Badge size="sm" color={fileTypeColor} variant="light">
                  {file.type.split('/')[0].toUpperCase()}
                </Badge>
                <Text size="xs" c="dimmed">
                  {formatFileSize(file.size)}
                </Text>
              </Group>
            </Stack>
          </Group>
          
          {showActions && (
            <Group gap="xs">
              {onPreview && (
                <Button
                  variant="subtle"
                  size="sm"
                  leftSection={<IconEye size={14} />}
                  onClick={onPreview}
                >
                  Preview
                </Button>
              )}
              {onDownload && (
                <Button
                  variant="subtle"
                  size="sm"
                  leftSection={<IconDownload size={14} />}
                  onClick={onDownload}
                >
                  Download
                </Button>
              )}
              {onRemove && (
                <Button
                  variant="subtle"
                  color="red"
                  size="sm"
                  leftSection={<IconTrash size={14} />}
                  onClick={handleRemove}
                >
                  Remove
                </Button>
              )}
            </Group>
          )}
        </Group>

        {/* Image Preview */}
        {isImage && previewUrl && (
          <div style={{ 
            width: '100%', 
            height: 200, 
            borderRadius: '8px',
            overflow: 'hidden',
            border: '1px solid var(--mantine-color-gray-3)'
          }}>
            <Image
              src={previewUrl}
              alt={file.name}
              fit="cover"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        )}

        {/* File Details */}
        <Stack gap="xs">
          <Group gap="md">
            <Text size="sm" c="dimmed">
              <strong>Type:</strong> {file.type}
            </Text>
            <Text size="sm" c="dimmed">
              <strong>Last Modified:</strong> {new Date(file.lastModified).toLocaleDateString()}
            </Text>
          </Group>
          
          {file.type.startsWith('image/') && (
            <Text size="sm" c="dimmed">
              <strong>Dimensions:</strong> Will be determined after upload
            </Text>
          )}
        </Stack>

        {/* Upload Status */}
        <Alert color="blue" variant="light">
          <Text size="sm">
            Ready for upload. This file will be processed and stored securely.
          </Text>
        </Alert>
      </Stack>
    </Card>
  );
}
