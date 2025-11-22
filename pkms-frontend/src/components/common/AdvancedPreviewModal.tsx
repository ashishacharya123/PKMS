/**
 * Advanced Preview Modal - Wrapper for IframePreview component
 *
 * Provides a clean modal interface for the advanced file preview with full controls
 * This creates the second tier of the two-tier preview architecture:
 * - Tier 1: ContentViewer (clean, document-like feel)
 * - Tier 2: AdvancedPreviewModal → IframePreview (full controls)
 */

import React, { useState, useEffect } from 'react';
import { Modal, Group, Button, Box, Alert, Text, Badge, Tooltip } from '@mantine/core';
import {
  IconExternalLink,
  IconDownload,
  IconX
} from '@tabler/icons-react';
import { IframePreview } from './IframePreview';
import { notifications } from '@mantine/notifications';
import { UnifiedFileItem } from '../../services/unifiedFileService';
import { formatFileSize } from '../../utils/fileUtils';

interface AdvancedPreviewModalProps {
  opened: boolean;
  onClose: () => void;
  file: UnifiedFileItem;
  encryptionKey?: CryptoKey;
}

export const AdvancedPreviewModal: React.FC<AdvancedPreviewModalProps> = ({
  opened,
  onClose,
  file,
  encryptionKey
}) => {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate preview URL when modal opens
  useEffect(() => {
    if (opened && file) {
      generatePreviewUrl();
    }

    // Cleanup on unmount
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [opened, file]);

  const generatePreviewUrl = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if file is encrypted
      if (file.isEncrypted) {
        if (!encryptionKey) {
          throw new Error('File is encrypted but no decryption key provided');
        }

        // For encrypted files, download and create blob URL
        const response = await fetch(`/api/v1/files/${file.module}/${file.uuid}/download`);
        if (!response.ok) {
          throw new Error('Failed to fetch encrypted file');
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setPreviewUrl(blobUrl);
      } else {
        // For unencrypted files, use preview endpoint
        const previewEndpoint = `/api/v1/files/${file.module}/${file.uuid}/preview`;
        setPreviewUrl(previewEndpoint);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load preview';
      setError(errorMessage);
      console.error('Preview URL generation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenInNewTab = () => {
    const newTabUrl = previewUrl || `/api/v1/files/${file.module}/${file.uuid}/download`;
    window.open(newTabUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/v1/files/${file.module}/${file.uuid}/download`);
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      notifications.show({
        title: 'Download Complete',
        message: `Successfully downloaded ${file.name}`,
        color: 'green'
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Download failed';
      notifications.show({
        title: 'Download Failed',
        message: errorMessage,
        color: 'red'
      });
    }
  };

  const handlePreviewError = (errorMessage: string) => {
    console.error('Iframe preview error:', errorMessage);
    // Fallback to opening in new tab if iframe fails
    handleOpenInNewTab();
  };

  const getFileTypeIcon = () => {
    if (file.mimeType?.startsWith('image/')) return '🖼️';
    if (file.mimeType === 'application/pdf') return '📕';
    if (file.mimeType?.includes('word')) return '📝';
    if (file.mimeType?.includes('excel') || file.mimeType?.includes('sheet')) return '📊';
    if (file.mimeType?.includes('powerpoint') || file.mimeType?.includes('presentation')) return '📈';
    if (file.mimeType?.startsWith('text/')) return '📄';
    return '📎';
  };

  const isPreviewable = () => {
    return (
      file.mimeType?.startsWith('image/') ||
      file.mimeType === 'application/pdf' ||
      file.mimeType?.includes('document') ||
      file.mimeType?.includes('pdf') ||
      file.mimeType?.startsWith('text/') ||
      file.mimeType?.includes('office') ||
      file.mimeType?.includes('sheet') ||
      file.mimeType?.includes('presentation')
    );
  };

  const getModalTitle = () => (
    <Group justify="space-between" align="center">
      <Group gap="sm" align="center">
        <Text size="lg">{getFileTypeIcon()}</Text>
        <div>
          <Text fw={600} size="sm">{file.name || 'File Preview'}</Text>
          {file.description && (
            <Text size="xs" c="dimmed" lineClamp={1}>{file.description}</Text>
          )}
        </div>
        <Group gap="xs">
          <Badge size="sm" variant="light" color="blue">
            {file.mimeType?.split('/')[1]?.toUpperCase() || 'FILE'}
          </Badge>
          {file.fileSize && (
            <Badge size="sm" variant="outline">
              {formatFileSize(file.fileSize)}
            </Badge>
          )}
          {file.isEncrypted && (
            <Tooltip label="Encrypted file">
              <Badge size="sm" color="yellow">🔒</Badge>
            </Tooltip>
          )}
        </Group>
      </Group>

      <Group gap="xs">
        <Tooltip label="Open in new tab">
          <Button
            variant="light"
            size="sm"
            leftSection={<IconExternalLink size={14} />}
            onClick={handleOpenInNewTab}
          >
            Open
          </Button>
        </Tooltip>

        <Tooltip label="Download file">
          <Button
            variant="light"
            size="sm"
            leftSection={<IconDownload size={14} />}
            onClick={handleDownload}
          >
            Download
          </Button>
        </Tooltip>
      </Group>
    </Group>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={getModalTitle()}
      size="xl"
      centered
      overlayProps={{ opacity: 0.7, blur: 3 }}
      styles={{
        title: {
          borderBottom: '1px solid #e9ecef',
          paddingBottom: 'md'
        }
      }}
    >
      {isLoading && (
        <Box p="xl" style={{ textAlign: 'center' }}>
          <Text>Loading preview...</Text>
        </Box>
      )}

      {error && !isLoading && (
        <Alert
          color="red"
          title="Preview Failed"
          mb="md"
        >
          {error}
        </Alert>
      )}

      {!isLoading && !error && previewUrl && isPreviewable() && (
        <IframePreview
          url={previewUrl}
          fileName={file.name || ''}
          mimeType={file.mimeType}
          onOpenInNewTab={handleOpenInNewTab}
          onDownload={handleDownload}
          onError={handlePreviewError}
        />
      )}

      {!isLoading && !error && !isPreviewable() && (
        <Box p="xl" style={{ textAlign: 'center' }}>
          <Text size="lg" mb="sm">📎</Text>
          <Text fw={500} mb="xs">Preview Not Available</Text>
          <Text size="sm" c="dimmed" mb="md">
            This file type cannot be previewed. Try downloading it instead.
          </Text>
          <Group justify="center" gap="sm">
            <Button
              variant="outline"
              leftSection={<IconDownload size={14} />}
              onClick={handleDownload}
            >
              Download File
            </Button>
            <Button
              variant="light"
              leftSection={<IconExternalLink size={14} />}
              onClick={handleOpenInNewTab}
            >
              Open in New Tab
            </Button>
          </Group>
        </Box>
      )}
    </Modal>
  );
};