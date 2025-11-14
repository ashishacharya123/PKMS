/**
 * Unified File Section Component
 * 
 * A simplified file section that works consistently across all modules.
 * Uses the unified file service to handle different backend endpoints transparently.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Group, Title, Progress, Alert, Stack } from '@mantine/core';
import { IconPlus, IconMicrophone } from '@tabler/icons-react';
import { FileUploadModal } from './FileUploadModal';
import { AudioRecorderModal } from './AudioRecorderModal';
import { UnifiedFileList } from './UnifiedFileList';
import { unifiedFileService, UnifiedFileItem } from '../../services/unifiedFileService';

/**
 * Improved filename inference with MIME type handling and edge case coverage
 */
const inferFileName = (blob: Blob): string => {
  // Handle empty/invalid MIME types
  const mimeType = blob.type?.trim().toLowerCase() || '';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  // Common MIME type to extension mapping
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',

    'text/plain': 'txt',
    'text/csv': 'csv',
    'text/html': 'html',
    'text/css': 'css',
    'text/javascript': 'js',
    'application/json': 'json',
    'application/xml': 'xml',
    'application/pdf': 'pdf',

    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',

    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/webm': 'weba',

    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/ogg': 'ogv',
    'video/quicktime': 'mov',
    'video/x-msvideo': 'avi',

    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar',
    'application/x-7z-compressed': '7z',
    'application/x-tar': 'tar',
    'application/gzip': 'gz',
  };

  // Try to get name from blob if available (some browsers provide this)
  if ((blob as any).name && typeof (blob as any).name === 'string') {
    const blobName = (blob as any).name.trim();
    if (blobName.length > 0) {
      return blobName;
    }
  }

  // Determine extension from MIME type
  let extension = mimeToExt[mimeType] || 'bin';

  // Handle special cases and sanitization
  if (!mimeType) {
    // Unknown MIME type - try to infer from common patterns
    if (blob.size > 1024 * 1024) {
      // Larger files are likely images or documents
      extension = 'bin';
    } else {
      extension = 'dat';
    }
  }

  // Sanitize extension (remove any unsafe characters)
  extension = extension.replace(/[^a-z0-9]/g, '').substring(0, 10);
  if (!extension) extension = 'bin';

  return `pasted-${timestamp}.${extension}`;
};

interface UnifiedFileSectionProps {
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  entityId: string; // The parent entity (note UUID, diary entry UUID, project UUID, etc.)
  files: UnifiedFileItem[];
  onFilesUpdate: (files: UnifiedFileItem[]) => void;
  className?: string;
  showUpload?: boolean;
  showAudioRecorder?: boolean;
  enableDragDrop?: boolean;
  showUnlink?: boolean; // For project context
  encryptionKey?: CryptoKey; // For diary encryption
}

export const UnifiedFileSection: React.FC<UnifiedFileSectionProps> = ({
  module,
  entityId,
  files,
  onFilesUpdate,
  className = '',
  showUpload = true,
  showAudioRecorder = false,
  enableDragDrop = false,
  showUnlink = false,
  encryptionKey
}) => {
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [audioRecorderOpen, setAudioRecorderOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load files when component mounts or entityId changes
  useEffect(() => {
    if (entityId) {
      loadFiles();
    }
  }, [entityId, module]);

  const loadFiles = async () => {
    try {
      const loadedFiles = await unifiedFileService.getFiles(module, entityId);
      onFilesUpdate(loadedFiles);
    } catch (err) {
      console.error('Failed to load files:', err);
      setError('Failed to load files');
    }
  };

  const handleFileUpload = useCallback(async (uploadedFiles: File[], metadata: any) => {
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Use unified file service for all uploads
      const uploadedFileItems = await unifiedFileService.uploadFiles(
        module,
        entityId,
        uploadedFiles,
        {
          description: metadata.description,
          tags: metadata.tags,
          caption: metadata.caption,
          isExclusive: metadata.isExclusive,
          projectIds: metadata.projectIds,
          encryptionKey: metadata.encryptionKey, // For diary encryption
          onProgress: (progress) => {
            setUploadProgress(progress.progress);
          }
        }
      );

      // Update files list with new uploads
      onFilesUpdate([...files, ...uploadedFileItems]);
      setUploadModalOpen(false);
    } catch (err) {
      console.error('Upload failed:', err);
      setError('Upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [module, entityId, files, onFilesUpdate]);

  const handleAudioRecording = async (audioBlob: Blob, metadata: any) => {
    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Use unified file service for audio recording
      const uploadedFile = await unifiedFileService.uploadAudioRecording(
        module,
        entityId,
        audioBlob,
        {
          filename: metadata.filename,
          description: metadata.description || 'Audio recording',
          encryptionKey: metadata.encryptionKey, // For diary encryption
          onProgress: (progress) => {
            setUploadProgress(progress.progress);
          }
        }
      );

      // Update files list with new recording
      onFilesUpdate([...files, uploadedFile]);
      setAudioRecorderOpen(false);
    } catch (err) {
      console.error('Audio recording upload failed:', err);
      setError('Audio recording upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileDelete = async (fileId: string) => {
    try {
      const file = files.find(f => f.uuid === fileId);
      if (file) {
        await unifiedFileService.deleteFile(file);
        onFilesUpdate(files.filter(f => f.uuid !== fileId));
      }
    } catch (err) {
      console.error('Delete failed:', err);
      setError('Delete failed');
    }
  };

  const handleFileUnlink = async (fileId: string) => {
    try {
      const file = files.find(f => f.uuid === fileId);
      if (file) {
        await unifiedFileService.unlinkFile(file);
        onFilesUpdate(files.filter(f => f.uuid !== fileId));
      }
    } catch (err) {
      console.error('Unlink failed:', err);
      setError('Unlink failed');
    }
  };

  const handleFileReorder = async (reorderedFiles: UnifiedFileItem[]) => {
    try {
      // Check if this module supports reordering
      const supportedModules = ['projects', 'diary', 'notes', 'documents', 'archive'];
      if (!supportedModules.includes(module)) {
        throw new Error(`Reordering not supported for module: ${module}`);
      }
      
      // Use unified file service for reordering
      const fileUuids = reorderedFiles.map(f => f.uuid);
      await unifiedFileService.reorderFiles(module as any, entityId, fileUuids);
      
      onFilesUpdate(reorderedFiles);
    } catch (err) {
      console.error('Reorder failed:', err);
      setError('Reorder failed');
    }
  };

  const handleFileReplace = async (oldFileId: string, newFile: File) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);
      const oldFile = files.find(f => f.uuid === oldFileId);
      if (!oldFile) return;

      // Find the position of the old file in the current list
      const oldFileIndex = files.findIndex(f => f.uuid === oldFileId);

      // Upload the replacement file (minimal metadata)
      const uploaded = await unifiedFileService.uploadFiles(
        module,
        entityId,
        [newFile],
        {
          description: oldFile.description,
          tags: [],
          caption: undefined,
          isExclusive: undefined,
          projectIds: undefined,
          encryptionKey,
          onProgress: (p) => setUploadProgress(p.progress)
        }
      );

      // Handle empty uploaded array (upload failed silently)
      if (!uploaded || uploaded.length === 0) {
        throw new Error('File upload returned no files');
      }

      // Attempt to delete/unlink the old file (backend will preserve if shared)
      await unifiedFileService.deleteFile(oldFile);

      // Replace in local list while preserving position
      const newFiles = [...files];

      // Remove old file
      newFiles.splice(oldFileIndex, 1);

      // Insert new file at the same position
      // If there were multiple files uploaded (unlikely for replacement), use the first one
      const replacementFile = uploaded[0];
      newFiles.splice(oldFileIndex, 0, replacementFile);

      onFilesUpdate(newFiles);
    } catch (e) {
      console.error('Replace failed:', e);
      setError('Replace failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Clipboard paste-to-upload support (images/files)
  useEffect(() => {
    if (!entityId) return; // require a target entity

    const onPaste = async (e: ClipboardEvent) => {
      try {
        const items = e.clipboardData?.items;
        if (!items || items.length === 0) return;

        const filesToUpload: File[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            const blob = item.getAsFile();
            if (blob) {
              // Derive a filename with improved MIME type handling
              const inferredName = inferFileName(blob);
              const file = new File([blob], inferredName, { type: blob.type });
              filesToUpload.push(file);
            }
          }
        }

        if (filesToUpload.length === 0) return;
        // Minimal metadata for paste
        await handleFileUpload(filesToUpload, {
          description: 'Pasted file',
          tags: [],
          caption: undefined,
          isExclusive: undefined,
          projectIds: undefined,
          encryptionKey
        });
      } catch (err) {
        console.error('Paste upload failed:', err);
        setError('Paste upload failed');
      }
    };

    window.addEventListener('paste', onPaste as any);
    return () => window.removeEventListener('paste', onPaste as any);
  }, [entityId, module, encryptionKey, handleFileUpload, setError]);

  return (
    <Stack gap="md" className={className}>
      <Group justify="space-between" align="center">
        <Title order={4}>Files</Title>
        <Group gap="xs">
          {showAudioRecorder && (
            <Button
              variant="light"
              size="sm"
              leftSection={<IconMicrophone size={16} />}
              onClick={() => setAudioRecorderOpen(true)}
            >
              Record Audio
            </Button>
          )}
          {showUpload && (
            <Button
              variant="light"
              size="sm"
              leftSection={<IconPlus size={16} />}
              onClick={() => setUploadModalOpen(true)}
            >
              Upload Files
            </Button>
          )}
        </Group>
      </Group>

      {error && (
        <Alert color="red" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {isUploading && (
        <Progress value={uploadProgress} label={`${Math.round(uploadProgress)}%`} />
      )}

      <UnifiedFileList
        files={files}
        onDelete={handleFileDelete}
        onUnlink={showUnlink ? handleFileUnlink : undefined}
        onReorder={enableDragDrop ? handleFileReorder : undefined}
        onReplace={handleFileReplace}
        showUnlink={showUnlink}
        enableDragDrop={enableDragDrop}
        encryptionKey={encryptionKey}
      />

      <FileUploadModal
        opened={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUpload={handleFileUpload}
        multiple={true}
      />

      {showAudioRecorder && (
        <AudioRecorderModal
          opened={audioRecorderOpen}
          onClose={() => setAudioRecorderOpen(false)}
          onSave={handleAudioRecording}
        />
      )}
    </Stack>
  );
};
