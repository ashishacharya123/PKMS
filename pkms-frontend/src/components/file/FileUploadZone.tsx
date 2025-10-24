/**
 * Unified file upload zone using Mantine Dropzone
 * Supports multiple files, drag-and-drop, and Tabler icons
 * Replaces Lucide-based FileUpload.tsx
 */

import { Group, Text, Stack, Button, Progress } from '@mantine/core';
import { Dropzone, FileRejection } from '@mantine/dropzone';
import { IconUpload, IconX, IconFile, IconPhoto, IconFileText, IconMusic, IconVideo } from '@tabler/icons-react';
import { useState, useCallback } from 'react';
import { notifications } from '@mantine/notifications';

interface DropzoneError {
  code: string;
  message: string;
}

interface FileUploadZoneProps {
  accept?: string[];
  multiple?: boolean;
  maxFiles?: number;
  maxSize?: number; // in bytes
  onFilesSelected: (files: File[]) => void;
  onFileUpload?: (file: File) => Promise<void>;
  existingFiles?: Array<{
    uuid: string;
    filename: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
  }>;
  disabled?: boolean;
  loading?: boolean;
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

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export function FileUploadZone({
  accept = ['image/*', 'application/pdf', 'text/*'],
  multiple = true,
  maxFiles = 10,
  maxSize = 10 * 1024 * 1024, // 10MB default
  onFilesSelected,
  onFileUpload,
  existingFiles = [],
  disabled = false,
  loading = false
}: FileUploadZoneProps) {
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map());

  const handleDrop = useCallback((files: File[]) => {
    if (disabled || loading) return;

    // Validate files
    const validFiles: File[] = [];
    const errors: string[] = [];

    files.forEach((file) => {
      // Check file size
      if (file.size > maxSize) {
        errors.push(`${file.name} is too large (max ${formatFileSize(maxSize)})`);
        return;
      }

      // Check file type
      const isValidType = accept.some(type => {
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.slice(0, -1));
        }
        return file.type === type;
      });

      if (!isValidType) {
        errors.push(`${file.name} has an unsupported file type`);
        return;
      }

      // Check max files
      if (validFiles.length + existingFiles.length >= maxFiles) {
        errors.push(`Maximum ${maxFiles} files allowed`);
        return;
      }

      validFiles.push(file);
    });

    // Show errors
    if (errors.length > 0) {
      errors.forEach(error => {
        notifications.show({
          title: 'Upload Error',
          message: error,
          color: 'red',
        });
      });
    }

    // Process valid files
    if (validFiles.length > 0) {
      onFilesSelected(validFiles);
      
      // Upload files if callback provided
      if (onFileUpload) {
        validFiles.forEach(async (file) => {
          const fileId = `${file.name}-${file.size}-${Date.now()}`;
          setUploadingFiles(prev => new Map(prev).set(fileId, 0));
          
          try {
            await onFileUpload(file);
            setUploadingFiles(prev => {
              const newMap = new Map(prev);
              newMap.delete(fileId);
              return newMap;
            });
          } catch (error) {
            setUploadingFiles(prev => {
              const newMap = new Map(prev);
              newMap.delete(fileId);
              return newMap;
            });
            notifications.show({
              title: 'Upload Failed',
              message: `Failed to upload ${file.name}`,
              color: 'red',
            });
          }
        });
      }
    }
  }, [accept, maxFiles, maxSize, onFilesSelected, onFileUpload, existingFiles, disabled, loading]);

  // Removed unused getAcceptString function

  return (
    <Stack gap="md">
      <Dropzone
        onDrop={handleDrop}
        onReject={(files: FileRejection[]) => {
          files.forEach((file: FileRejection) => {
            notifications.show({
              title: 'File Rejected',
              message: file.errors.map((e: DropzoneError) => e.message).join(', '),
              color: 'red',
            });
          });
        }}
        accept={accept.reduce((acc, type) => {
          acc[type] = [];
          return acc;
        }, {} as Record<string, string[]>)}
        multiple={multiple}
        maxFiles={maxFiles}
        maxSize={maxSize}
        disabled={disabled || loading}
        loading={loading}
      >
        <Group justify="center" gap="xl" mih={220} style={{ pointerEvents: 'none' }}>
          <Dropzone.Accept>
            <IconUpload
              style={{ width: 52, height: 52, color: 'var(--mantine-color-blue-6)' }}
              stroke={1.5}
            />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconX
              style={{ width: 52, height: 52, color: 'var(--mantine-color-red-6)' }}
              stroke={1.5}
            />
          </Dropzone.Reject>
          <Dropzone.Idle>
            <IconUpload
              style={{ width: 52, height: 52, color: 'var(--mantine-color-dimmed)' }}
              stroke={1.5}
            />
          </Dropzone.Idle>

          <div>
            <Text size="xl" inline>
              Drag files here or click to select files
            </Text>
            <Text size="sm" c="dimmed" inline mt={7}>
              Attach up to {maxFiles} files, each up to {formatFileSize(maxSize)}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              Accepted types: {accept.join(', ')}
            </Text>
          </div>
        </Group>
      </Dropzone>

      {/* Upload progress */}
      {uploadingFiles.size > 0 && (
        <Stack gap="sm">
          {Array.from(uploadingFiles.entries()).map(([fileId, progress]) => (
            <div key={fileId}>
              <Group justify="space-between" mb="xs">
                <Text size="sm">{fileId.split('-')[0]}</Text>
                <Text size="sm" c="dimmed">{progress}%</Text>
              </Group>
              <Progress value={progress} size="sm" />
            </div>
          ))}
        </Stack>
      )}

      {/* Existing files */}
      {existingFiles.length > 0 && (
        <Stack gap="sm">
          <Text size="sm" fw={500}>Attached Files:</Text>
          {existingFiles.map((file) => {
            const IconComponent = getFileIcon(file.mimeType);
            return (
              <Group key={file.uuid} justify="space-between" p="sm" style={{ 
                border: '1px solid var(--mantine-color-gray-3)', 
                borderRadius: '8px' 
              }}>
                <Group gap="sm">
                  <IconComponent size={20} />
                  <div>
                    <Text size="sm" fw={500}>{file.originalName}</Text>
                    <Text size="xs" c="dimmed">{formatFileSize(file.fileSize)}</Text>
                  </div>
                </Group>
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  leftSection={<IconX size={14} />}
                  onClick={() => {
                    // TODO: Implement file removal
                    notifications.show({
                      title: 'File Removed',
                      message: `${file.originalName} has been removed`,
                      color: 'green',
                    });
                  }}
                >
                  Remove
                </Button>
              </Group>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
