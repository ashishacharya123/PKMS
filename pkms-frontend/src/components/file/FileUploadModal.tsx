/**
 * Modal wrapper for file upload with metadata forms
 * Provides consistent file upload experience across all modules
 */

import { Modal, Stack, Text, Group, Button, TextInput, Textarea, Divider, TagsInput, ScrollArea } from '@mantine/core';
import { IconUpload, IconX, IconInfoCircle } from '@tabler/icons-react';
import { FileUploadZone } from './FileUploadZone';
import { MetadataPreview } from './MetadataPreview';
import { useMetadataExtraction } from '../../hooks/useMetadataExtraction';
import { useState, useEffect, useMemo } from 'react';

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

  // Initialize metadata extraction
  const metadataExtraction = useMetadataExtraction({
    autoExtract: true,
    processingOptions: {
      includeContentAnalysis: true,
      generateTags: true,
      maxContentLength: 3000
    },
    onExtracted: (file, extractedMetadata) => {
      // Auto-populate form fields with extracted metadata
      if (selectedFiles.length === 1 && selectedFiles[0] === file) {
        setMetadata(prev => ({
          title: prev.title || extractedMetadata.title || '',
          description: prev.description || extractedMetadata.description || '',
          tags: prev.tags.length > 0 ? prev.tags : (extractedMetadata.tags || [])
        }));
      }
    }
  });

  const handleFilesSelected = async (files: File[]) => {
    setSelectedFiles(files);

    // Extract metadata for new files
    await metadataExtraction.processFiles(files);

    // Auto-generate title from first file if not provided and metadata not extracted
    if (!metadata.title && files.length === 1) {
      const extractedState = metadataExtraction.getExtractionState(files[0]);
      if (!extractedState.metadata?.title) {
        setMetadata(prev => ({
          ...prev,
          title: files[0].name.split('.')[0] // Remove extension
        }));
      }
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
    metadataExtraction.clearMetadata(); // Clear extracted metadata
    onClose();
  };

  const handleFileRemove = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);

    // Clear metadata for removed file
    if (selectedFiles[index]) {
      metadataExtraction.clearMetadata(selectedFiles[index]);
    }

    // Reset metadata form if no files left
    if (newFiles.length === 0) {
      setMetadata({ title: '', description: '', tags: [] });
    }
  };

  
  const totalSize = useMemo(
    () => selectedFiles.reduce((sum, file) => sum + file.size, 0),
    [selectedFiles]
  );

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
        {/* File Upload Zone with Enhanced UI */}
        <FileUploadZone
          accept={accept}
          multiple={multiple}
          maxFiles={maxFiles}
          maxSize={maxSize}
          onFilesSelected={handleFilesSelected}
          selectedFiles={selectedFiles}
          onRemoveFile={handleFileRemove}
          disabled={loading}
          showSelectedFiles={true}
        />

        {selectedFiles.length > 0 && <Divider />}

        {/* Extracted Metadata Preview */}
        {selectedFiles.length > 0 && selectedFiles.length === 1 && (
          <Stack gap="md">
            <Group gap="sm" align="center">
              <IconInfoCircle size={16} c="blue" />
              <Text size="sm" fw={500}>Auto-extracted Metadata</Text>
              {metadataExtraction.isFileLoading(selectedFiles[0]) && (
                <Text size="xs" c="blue">(Processing...)</Text>
              )}
            </Group>
            <ScrollArea.Autosize mah={300}>
              <MetadataPreview
                metadata={metadataExtraction.getExtractionState(selectedFiles[0]).metadata}
                loading={metadataExtraction.isFileLoading(selectedFiles[0])}
                error={metadataExtraction.getFileError(selectedFiles[0])}
              />
            </ScrollArea.Autosize>
          </Stack>
        )}

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
          
          <TagsInput
            label="Tags"
            placeholder="Add tags (optional)"
            value={metadata.tags || []}
            onChange={(tags) => setMetadata(prev => ({ ...prev, tags }))}
            disabled={loading}
            splitChars={[',', ' ']}
            description="Separate tags with comma or space"
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
