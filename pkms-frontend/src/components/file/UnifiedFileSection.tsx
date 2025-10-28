/**
 * Unified File Section Component
 * 
 * A simplified file section that works consistently across all modules.
 * Uses the unified file service to handle different backend endpoints transparently.
 */

import React, { useState, useEffect } from 'react';
import { Button, Group, Title, Progress, Alert, Stack } from '@mantine/core';
import { IconUpload, IconLink } from '@tabler/icons-react';
import { FileUploadModal } from './FileUploadModal';
import { AudioRecorderModal } from './AudioRecorderModal';
import { UnifiedFileList } from './UnifiedFileList';
import { unifiedFileService, UnifiedFileItem } from '../../services/unifiedFileService';

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

  const handleFileUpload = async (uploadedFiles: File[], metadata: any) => {
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
  };

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

      // Attempt to delete/unlink the old file (backend will preserve if shared)
      await unifiedFileService.deleteFile(oldFile);

      // Replace in local list: remove old, append new (keeping order roughly)
      const withoutOld = files.filter(f => f.uuid !== oldFileId);
      onFilesUpdate([...withoutOld, ...uploaded]);
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
              // Derive a filename when possible
              const inferredName = (blob as any).name || `pasted-${Date.now()}`;
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
  }, [entityId, module, encryptionKey, files]);

  return (
    <Stack gap="md" className={className}>
      <Group justify="space-between" align="center">
        <Title order={4}>Files</Title>
        <Group gap="xs">
          {showAudioRecorder && (
            <Button
              variant="light"
              size="sm"
              leftSection={<IconLink size={16} />}
              onClick={() => setAudioRecorderOpen(true)}
            >
              Record Audio
            </Button>
          )}
          {showUpload && (
            <Button
              variant="light"
              size="sm"
              leftSection={<IconUpload size={16} />}
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
