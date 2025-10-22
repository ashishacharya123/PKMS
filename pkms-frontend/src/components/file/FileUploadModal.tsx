/**
 * Modal wrapper for file upload with metadata forms
 * Provides consistent file upload experience across all modules
 */

import { Modal, Stack, Text, Group, Button, TextInput, Textarea, Divider } from '@mantine/core';
import { IconUpload, IconX } from '@tabler/icons-react';
import { FileUploadZone } from './FileUploadZone';
import { useState } from 'react';

interface FileMetadata {
  title?: string;
  description?: string;
  tags?: string[];
}

interface FileUploadModalProps {
  opened: boolean;
  onClose: () => void;
  onUpload: (files: File[], metadata: FileMetadata) => Promise<void>;
  accept?: string[];
  multiple?: boolean;
  maxFiles?: number;
  maxSize?: number;
  title?: string;
  loading?: boolean;
}

export function FileUploadModal({
  opened,
  onClose,
  onUpload,
  accept = ['image/*', 'application/pdf', 'text/*'],
  multiple = true,
  maxFiles = 10,
  maxSize = 10 * 1024 * 1024, // 10MB
  title = "Upload Files",
  loading = false
}: FileUploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState<FileMetadata>({
    title: '',
    description: '',
    tags: []
  });

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    
    // Auto-generate title from first file if not provided
    if (!metadata.title && files.length > 0) {
      setMetadata(prev => ({
        ...prev,
        title: files[0].name.split('.')[0] // Remove extension
      }));
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    
    try {
      await onUpload(selectedFiles, metadata);
      handleClose();
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  const handleClose = () => {
    setSelectedFiles([]);
    setMetadata({ title: '', description: '', tags: [] });
    onClose();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Group gap="sm">
          <IconUpload size={20} />
          <Text fw={500}>{title}</Text>
        </Group>
      }
      size="lg"
      padding="md"
    >
      <Stack gap="md">
        {/* File Upload Zone */}
        <FileUploadZone
          accept={accept}
          multiple={multiple}
          maxFiles={maxFiles}
          maxSize={maxSize}
          onFilesSelected={handleFilesSelected}
          disabled={loading}
        />

        {/* Selected Files Summary */}
        {selectedFiles.length > 0 && (
          <div>
            <Text size="sm" fw={500} mb="xs">
              Selected Files ({selectedFiles.length})
            </Text>
            <Stack gap="xs">
              {selectedFiles.map((file, index) => (
                <Group key={index} justify="space-between" p="xs" style={{ 
                  border: '1px solid var(--mantine-color-gray-3)', 
                  borderRadius: '4px' 
                }}>
                  <Text size="sm" style={{ flex: 1 }} truncate>
                    {file.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {formatFileSize(file.size)}
                  </Text>
                </Group>
              ))}
              <Text size="xs" c="dimmed">
                Total size: {formatFileSize(totalSize)}
              </Text>
            </Stack>
          </div>
        )}

        <Divider />

        {/* Metadata Form */}
        <Stack gap="sm">
          <Text size="sm" fw={500}>File Information</Text>
          
          <TextInput
            label="Title"
            placeholder="Enter a title for the files"
            value={metadata.title || ''}
            onChange={(e) => setMetadata(prev => ({ ...prev, title: e.target.value }))}
            disabled={loading}
          />
          
          <Textarea
            label="Description"
            placeholder="Enter a description (optional)"
            value={metadata.description || ''}
            onChange={(e) => setMetadata(prev => ({ ...prev, description: e.target.value }))}
            disabled={loading}
            minRows={2}
            maxRows={4}
          />
        </Stack>

        {/* Action Buttons */}
        <Group justify="flex-end" gap="sm" mt="md">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
            leftSection={<IconX size={16} />}
          >
            Cancel
          </Button>
          
          <Button
            onClick={handleUpload}
            loading={loading}
            disabled={selectedFiles.length === 0}
            leftSection={<IconUpload size={16} />}
          >
            Upload {selectedFiles.length > 0 ? `${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}` : 'Files'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
