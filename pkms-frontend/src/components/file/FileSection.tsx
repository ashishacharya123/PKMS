import React, { useState } from 'react';
import FileUpload from './FileUpload';
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
  defaultFilename = '',
  className = '',
  showUnlink = false,
  onUnlink
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleUpload = async (file: File, metadata: any) => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
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
      setUploadProgress(50);

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
      setUploadProgress(100);

      // Step 3: Update files list
      onFilesUpdate([...files, newFile]);

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

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Attachments</h3>
        <div className="flex items-center space-x-2">
          {module === 'projects' && (
            <button
              onClick={() => {
                // TODO: Open "Attach Existing" modal
                console.log('Open attach existing modal');
              }}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Attach Existing
            </button>
          )}
          <FileUpload
            module={module}
            onUpload={handleUpload}
            defaultFilename={defaultFilename}
            className="text-sm"
          />
        </div>
      </div>

      {/* Upload Progress */}
      {isUploading && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <div className="flex items-center">
            <div className="flex-1">
              <div className="text-sm text-blue-700">Uploading...</div>
              <div className="w-full bg-blue-200 rounded-full h-2 mt-1">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
            <div className="ml-3 text-sm text-blue-700">
              {Math.round(uploadProgress)}%
            </div>
          </div>
        </div>
      )}

      {/* Files List */}
      <FileList
        files={files}
        onDelete={handleDelete}
        onUnlink={showUnlink ? handleUnlink : undefined}
        module={module}
        showUnlink={showUnlink}
      />
    </div>
  );
};

export default FileSection;
