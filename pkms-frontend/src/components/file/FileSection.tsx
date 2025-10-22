import React, { useState } from 'react';
import { Button, Group, Title, Progress, Alert } from '@mantine/core';
import { IconUpload, IconLink } from '@tabler/icons-react';
import { FileUploadModal } from './FileUploadModal';
import { AudioRecorderModal } from './AudioRecorderModal';
import FileList from './FileList';

interface FileItem {
  uuid: string;
  filename: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  description?: string;
  created_at: string;
  media_type?: string;
}

interface FileSectionProps {
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  entityId: string; // note_uuid, entry_id, project_uuid, etc.
  files: FileItem[];
  onFilesUpdate: (files: FileItem[]) => void;
  defaultFilename?: string;
  className?: string;
  showUnlink?: boolean; // For project context
  onUnlink?: (fileId: string) => void; // For project context
}

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

  const handleUpload = async (files: File[], metadata: any) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const newFiles = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress((i / files.length) * 50);
        
        // Step 1: Upload file using chunk service
        const formData = new FormData();
        formData.append('file', file);
        formData.append('metadata', JSON.stringify(metadata));

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
        setUploadProgress(50 + (i / files.length) * 50);

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

      // Step 3: Update files list
      onFilesUpdate([...files, ...newFiles]);

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
    onFilesUpdate(files.filter(f => f.uuid !== fileId));
  };

  const handleUnlink = (fileId: string) => {
    if (onUnlink) {
      onUnlink(fileId);
    }
    // Remove from local list
    onFilesUpdate(files.filter(f => f.uuid !== fileId));
  };

  const handleAudioSave = async (audioBlob: Blob, filename: string) => {
    const audioFile = new File([audioBlob], filename, { type: 'audio/webm' });
    await handleUpload([audioFile], { description: 'Audio recording' });
    setAudioRecorderModalOpened(false);
  };

  return (
    <div className={className}>
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
