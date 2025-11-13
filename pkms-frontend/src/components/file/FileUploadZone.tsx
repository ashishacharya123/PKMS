/**
 * Unified file upload zone using Mantine Dropzone
 * Supports multiple files, drag-and-drop, and Tabler icons
 * Replaces Lucide-based FileUpload.tsx
 */

import { Group, Text, Stack, Button, Progress, Badge, Divider, Paper } from '@mantine/core';
import { Dropzone, FileRejection } from '@mantine/dropzone';
import { IconUpload, IconX, IconFile, IconPhoto, IconFileText, IconMusic, IconVideo, IconPlus, IconClick, IconCheck, IconFolder } from '@tabler/icons-react';
import { useState, useCallback, useMemo } from 'react';
import { notifications } from '@mantine/notifications';
import { formatFileSize } from '../../utils/fileUtils';

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
  selectedFiles?: File[]; // External files to display
  onRemoveFile?: (index: number) => void; // Handle file removal
  disabled?: boolean;
  loading?: boolean;
  showSelectedFiles?: boolean; // Whether to show selected files preview
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


export function FileUploadZone({
  accept = ['image/*', 'application/pdf', 'text/*'],
  multiple = true,
  maxFiles = 10,
  maxSize = 10 * 1024 * 1024, // 10MB default
  onFilesSelected,
  onFileUpload,
  existingFiles = [],
  selectedFiles = [],
  onRemoveFile,
  disabled = false,
  loading = false,
  showSelectedFiles = true
}: FileUploadZoneProps) {
  const [uploadingFiles, setUploadingFiles] = useState<Map<string, number>>(new Map());

  const handleDrop = useCallback(async (files: File[]) => {
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
        const results = await Promise.allSettled(
          validFiles.map(async (file) => {
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
              throw error; // Re-throw for Promise.allSettled
            }
          })
        );

        // Handle partial failures
        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
          notifications.show({
            title: 'Upload Issues',
            message: `${failures.length} file(s) failed to upload`,
            color: 'orange',
          });
        }
      }
    }
  }, [accept, maxFiles, maxSize, onFilesSelected, onFileUpload, existingFiles, disabled, loading]);

  // Removed unused getAcceptString function

  const totalSelectedSize = useMemo(
    () => selectedFiles.reduce((sum, file) => sum + file.size, 0),
    [selectedFiles]
  );

  return (
    <Stack gap="md">
      {/* Enhanced Upload Zone */}
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
        style={{
          border: selectedFiles.length > 0
            ? '3px solid var(--mantine-color-blue-6)'
            : '2px dashed var(--mantine-color-gray-3)',
          backgroundColor: selectedFiles.length > 0
            ? 'var(--mantine-color-blue-0)'
            : 'transparent',
          borderRadius: '12px',
          minHeight: 240,
          transition: 'all 0.3s ease',
        }}
      >
        <Group justify="center" gap="xl" style={{ pointerEvents: 'none', minHeight: 240 }}>
          <Dropzone.Accept>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: 'var(--mantine-color-blue-6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <IconPlus
                style={{ width: 32, height: 32, color: 'white' }}
                stroke={3}
              />
            </div>
          </Dropzone.Accept>
          <Dropzone.Reject>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: 'var(--mantine-color-red-6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <IconX
                style={{ width: 32, height: 32, color: 'white' }}
                stroke={3}
              />
            </div>
          </Dropzone.Reject>
          <Dropzone.Idle>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              backgroundColor: 'var(--mantine-color-gray-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <IconPlus
                style={{ width: 32, height: 32, color: 'var(--mantine-color-white)' }}
                stroke={3}
              />
            </div>
          </Dropzone.Idle>

          <Stack align="center" gap="md">
            <div>
              <Text size="xl" fw={700} c={selectedFiles.length > 0 ? 'blue' : 'dimmed'}>
                {selectedFiles.length === 0
                  ? 'Drop files here or click to browse'
                  : `${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} selected`
                }
              </Text>
              <Text size="md" c={selectedFiles.length > 0 ? 'blue' : 'dimmed'} ta="center">
                {selectedFiles.length === 0
                  ? `Drag & drop or click to select up to ${maxFiles} files`
                  : `Total size: ${formatFileSize(totalSelectedSize)}`
                }
              </Text>
              {selectedFiles.length === 0 && (
                <>
                  <Text size="xs" c="dimmed" align="center">
                    Maximum {formatFileSize(maxSize)} per file
                  </Text>
                  <Group gap="xs" justify="center" mt="xs">
                    <Badge size="xs" color="blue" variant="light">
                      Images
                    </Badge>
                    <Badge size="xs" color="red" variant="light">
                      PDFs
                    </Badge>
                    <Badge size="xs" color="gray" variant="light">
                      Documents
                    </Badge>
                  </Group>
                </>
              )}
            </div>
          </Stack>
        </Group>
      </Dropzone>

      {/* Selected Files Preview */}
      {showSelectedFiles && selectedFiles.length > 0 && (
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <IconFolder size={16} color="blue" />
              <Text size="sm" fw={500} c="blue">
                Selected Files ({selectedFiles.length}/{maxFiles})
              </Text>
            </Group>
            <Text size="xs" c="blue" fw={500}>
              {formatFileSize(totalSelectedSize)}
            </Text>
          </Group>

          <Paper
            p="sm"
            withBorder
            style={{
              borderColor: 'var(--mantine-color-blue-6)',
              backgroundColor: 'var(--mantine-color-blue-0)'
            }}
          >
            <Stack gap="xs">
              {selectedFiles.map((file, index) => {
                const IconComponent = getFileIcon(file.type);
                const isImage = file.type.startsWith('image/');

                return (
                  <Paper
                    key={`${file.name}-${index}`}
                    p="sm"
                    withBorder
                    sx={(theme) => ({
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        boxShadow: theme.shadows.md,
                        transform: 'translateY(-2px)',
                      },
                    })}
                  >
                    <Group justify="space-between">
                      <Group gap="sm" style={{ flex: 1 }}>
                        <IconComponent
                          size={20}
                          color={isImage ? 'blue' : 'var(--mantine-color-gray-6)'}
                        />
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                          <Text size="sm" fw={600} c="blue" truncate>
                            {file.name}
                          </Text>
                          <Group gap="sm">
                            <Badge size="sm" color="blue" variant="filled">
                              {file.type.split('/')[0].toUpperCase()}
                            </Badge>
                            <Text size="sm" fw={500}>
                              {formatFileSize(file.size)}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {new Date(file.lastModified).toLocaleDateString()}
                            </Text>
                          </Group>
                        </Stack>
                      </Group>

                      {onRemoveFile && (
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          leftSection={<IconX size={14} />}
                          onClick={() => onRemoveFile(index)}
                        >
                          Remove
                        </Button>
                      )}
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          </Paper>

          {/* Success Indicator */}
          {selectedFiles.length > 0 && (
            <Group gap="sm" justify="center" mt="md">
              <IconCheck size={20} color="green" />
              <Text size="md" c="green" fw={500}>
                Files ready for upload
              </Text>
            </Group>
          )}

          {/* File Limit Warning */}
          {selectedFiles.length >= maxFiles && (
            <Text size="xs" c="orange" ta="center">
              Maximum file limit reached. Remove files to add more.
            </Text>
          )}
        </Stack>
      )}

      {/* Upload progress */}
      {uploadingFiles.size > 0 && (
        <Stack gap="sm">
          <Text size="sm" fw={500}>Uploading...</Text>
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
      {existingFiles.length > 0 && selectedFiles.length === 0 && (
        <>
          <Divider label="Already attached files" />
          <Stack gap="sm">
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
        </>
      )}
    </Stack>
  );
}
