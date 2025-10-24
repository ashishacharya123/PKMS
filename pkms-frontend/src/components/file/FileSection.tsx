/**
 * File Section Component
 * 
 * Handles file uploads, audio recording, and file management for various modules.
 * Supports chunked uploads, metadata collection, and module-specific commit workflows.
 * Used across notes, diary, documents, archive, and projects modules.
 */

import React, { useState, useEffect } from 'react';
import { Button, Group, Title, Progress, Alert } from '@mantine/core';
import { IconUpload, IconLink } from '@tabler/icons-react';
import { FileUploadModal } from './FileUploadModal';
import { AudioRecorderModal } from './AudioRecorderModal';
import FileList from './FileList';
import { projectApi } from '../../services/projectApi';

interface FileItem {
  uuid: string;
  filename: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  description?: string;
  created_at: string;
  media_type?: string;
  is_encrypted?: boolean;  // NEW: Track if file is encrypted (for diary files)
}

interface FileSectionProps {
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  entityId: string; // note_uuid, entry_id, project_uuid, etc.
  files: FileItem[];
  onFilesUpdate: React.Dispatch<React.SetStateAction<FileItem[]>>;
  className?: string;
  showUnlink?: boolean; // For project context
  onUnlink?: (fileId: string) => void; // For project context
}

/**
 * File management component with upload, recording, and metadata handling.
 * Manages file state updates and module-specific commit workflows.
 */
export const FileSection: React.FC<FileSectionProps> = ({
  module,
  entityId,
  files,
  onFilesUpdate,
  className = '',
  showUnlink = false,
  onUnlink
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileUploadModalOpened, setFileUploadModalOpened] = useState(false);
  const [audioRecorderModalOpened, setAudioRecorderModalOpened] = useState(false);
  const [isExclusive, setIsExclusive] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Handle paste events for file uploads
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length > 0) {
        event.preventDefault();
        await handleUpload(files, { 
          title: '', 
          description: 'Pasted from clipboard',
          is_exclusive: isExclusive 
        });
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isExclusive]);

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleUpload(files, { 
        title: '', 
        description: 'Dropped files',
        is_exclusive: isExclusive 
      });
    }
  };

  // Preflight check for exclusivity checkbox
  const handleExclusivityChange = async (checked: boolean) => {
    if (checked && files.length > 0) {
      // Check each existing file for conflicts
      for (const file of files) {
        try {
          const preflight = await projectApi.getDeletePreflight('document', file.uuid);
          if (preflight.linkCount > 0) {
            const confirmed = window.confirm(
              `⚠️ Warning: "${file.filename || file.original_name}" is currently used in ${preflight.linkCount} other place(s).\n\n` +
              `${preflight.warningMessage}\n\n` +
              `Making it exclusive will hide it from those views. Continue?`
            );
            if (!confirmed) {
              return; // Don't change exclusivity
            }
          }
        } catch (error) {
          console.error('Error checking file conflicts:', error);
          // Continue anyway - don't block user if preflight fails
        }
      }
    }
    setIsExclusive(checked);
  };

  const handleUpload = async (selectedFiles: File[], metadata: { title?: string; description?: string; tags?: string[]; is_exclusive?: boolean }) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const newFiles: FileItem[] = [];
      
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress((i / selectedFiles.length) * 50);
        
        // Step 1: Upload file using chunk service
        const formData = new FormData();
        formData.append('file', file);
        formData.append('metadata', JSON.stringify({
          ...metadata,
          is_exclusive: isExclusive
        }));

        const uploadResponse = await fetch('/api/v1/uploads/chunk-upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error('Upload failed');
        }

        const { file_id } = await uploadResponse.json();
        setUploadProgress(50 + (i / selectedFiles.length) * 50);

        // Step 2: Commit upload using module-specific endpoint
        const commitEndpoint = getCommitEndpoint(module);
        const commitPayload = {
          file_id,
          ...metadata,
          ...getModuleSpecificPayload(module, entityId)
        };

        const commitResponse = await fetch(commitEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          },
          body: JSON.stringify(commitPayload)
        });

        if (!commitResponse.ok) {
          throw new Error('Commit failed');
        }

        const newFile = await commitResponse.json();
        newFiles.push(newFile);
      }

      setUploadProgress(100);

      // Step 3: Merge into existing list
      onFilesUpdate(prev => [...prev, ...newFiles]);

    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed: ' + (error as Error).message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const getCommitEndpoint = (module: string) => {
    switch (module) {
      case 'notes':
        return '/api/v1/notes/commit-note-file-upload';
      case 'diary':
        return '/api/v1/diary/commit-diary-media-upload';
      case 'documents':
        return '/api/v1/documents/commit-document-upload';
      case 'archive':
        return '/api/v1/archive/commit-uploaded-file';
      case 'projects':
        // For projects, we might link existing documents instead of uploading new ones
        return '/api/v1/documents/commit-document-upload';
      default:
        throw new Error(`Unknown module: ${module}`);
    }
  };

  const getModuleSpecificPayload = (module: string, entityId: string) => {
    switch (module) {
      case 'notes':
        return { note_uuid: entityId };
      case 'diary':
        return { entry_id: entityId };
      case 'documents':
        return {}; // Documents don't need entity ID
      case 'archive':
        return { folder_uuid: entityId };
      case 'projects':
        return {}; // For projects, we might link existing documents
      default:
        return {};
    }
  };

  const handleDelete = (fileId: string) => {
    onFilesUpdate(prev => prev.filter(f => f.uuid !== fileId));
  };

  const handleUnlink = (fileId: string) => {
    if (onUnlink) {
      onUnlink(fileId);
    }
    // Remove from local list
    onFilesUpdate(prev => prev.filter(f => f.uuid !== fileId));
  };

  const handleAudioSave = async (audioBlob: Blob, filename: string) => {
    const audioFile = new File([audioBlob], filename, { type: 'audio/webm' });
    await handleUpload([audioFile], { description: 'Audio recording' });
    setAudioRecorderModalOpened(false);
  };

  return (
    <div 
      className={className}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        border: isDragOver ? '2px dashed #1976d2' : '2px dashed transparent',
        borderRadius: '8px',
        transition: 'border-color 0.2s ease'
      }}
    >
      {/* Header */}
      <Group justify="space-between" mb="md">
        <Title order={4}>Attachments</Title>
        <Group gap="xs">
          {module === 'projects' && (
            <Button
              variant="outline"
              size="sm"
              leftSection={<IconLink size={16} />}
              onClick={() => {
                // TODO: Open "Attach Existing" modal
                console.log('Open attach existing modal');
              }}
            >
              Attach Existing
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            leftSection={<IconUpload size={16} />}
            onClick={() => setFileUploadModalOpened(true)}
          >
            Upload Files
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftSection={<IconUpload size={16} />}
            onClick={() => setAudioRecorderModalOpened(true)}
          >
            Record Audio
          </Button>
        </Group>
      </Group>

      {/* Exclusivity Checkbox */}
      {module !== 'diary' && (
        <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={isExclusive} 
              onChange={(e) => handleExclusivityChange(e.target.checked)}
              style={{ margin: 0 }}
            />
            <span style={{ fontSize: '0.9rem', color: '#666' }}>
              Make exclusive to this {module === 'notes' ? 'note' : module === 'projects' ? 'project' : module}
            </span>
          </label>
        </div>
      )}

      {/* Upload Tips */}
      <div style={{ marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#e3f2fd', borderRadius: '4px', border: '1px solid #bbdefb' }}>
        <span style={{ fontSize: '0.85rem', color: '#1976d2' }}>
          💡 Tips: Paste files with Ctrl+V (Cmd+V on Mac) or drag & drop files here
        </span>
      </div>

      {/* Upload Progress */}
      {isUploading && (
        <Alert color="blue" mb="md">
          <Progress value={uploadProgress} size="sm" mb="xs" />
          <div>Uploading... {Math.round(uploadProgress)}%</div>
        </Alert>
      )}

      {/* Files List */}
      <FileList
        files={files}
        onDelete={handleDelete}
        onUnlink={showUnlink ? handleUnlink : undefined}
        module={module}
        showUnlink={showUnlink}
      />

      {/* Modals */}
      <FileUploadModal
        opened={fileUploadModalOpened}
        onClose={() => setFileUploadModalOpened(false)}
        onUpload={handleUpload}
        multiple={true}
      />

      <AudioRecorderModal
        opened={audioRecorderModalOpened}
        onClose={() => setAudioRecorderModalOpened(false)}
        onSave={handleAudioSave}
      />
    </div>
  );
};

export default FileSection;
