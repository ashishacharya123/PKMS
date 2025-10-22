import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Trash2, Image, FileText, Mic, Video, Unlink, GripVertical } from 'lucide-react';
import { apiService } from '../../services/api';
import { reorderArray, getDragPreviewStyles, getDropZoneStyles } from '../../utils/dragAndDrop';

interface FileItem {
  uuid: string;
  filename: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  description?: string;
  created_at: string;
  media_type?: string;
  // Optional: relative path in storage (if available from backend)
  file_path?: string;
  // Optional: direct or relative API path to thumbnail provided by backend
  thumbnail_path?: string;
}

interface FileListProps {
  files: FileItem[];
  onDelete: (fileId: string) => void;
  onUnlink?: (fileId: string) => void; // For project context
  onReorder?: (reorderedFiles: FileItem[]) => void; // For drag-and-drop reordering
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  className?: string;
  showUnlink?: boolean; // Show unlink action instead of delete
  enableDragDrop?: boolean; // Enable drag-and-drop reordering
}

export const FileList: React.FC<FileListProps> = ({
  files,
  onDelete,
  onUnlink,
  onReorder,
  module,
  className = '',
  showUnlink = false,
  enableDragDrop = false
}) => {
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  
  // Drag and drop state
  const [draggedFile, setDraggedFile] = useState<FileItem | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const getDownloadUrl = (currentModule: string, fileUuid: string): string => {
    // Documents module has a different download route structure
    if (currentModule === 'documents') {
      return `/${currentModule}/${fileUuid}/download`;
    }
    // Notes and Diary now use the same consistent structure
    return `/${currentModule}/files/${fileUuid}/download`;
  };

  const getThumbnailUrl = (file: FileItem, size: 'small' | 'medium' | 'large' = 'small'): string | null => {
    // Prefer explicit thumbnail_path from backend DB if present
    if (file.thumbnail_path) {
      return file.thumbnail_path;
    }
    // Else construct from file_path via thumbnails router
    if (file.file_path) {
      const basePath = file.file_path.replace(/\\/g, '/');
      return `/api/v1/thumbnails/file/${basePath}?size=${size}`;
    }
    // No thumbnail available
    return null;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string, mediaType?: string) => {
    if (mediaType === 'voice' || mimeType.startsWith('audio/')) {
      return <Mic className="w-5 h-5 text-green-500" />;
    }
    if (mimeType.startsWith('image/')) {
      return <Image className="w-5 h-5 text-blue-500" />;
    }
    if (mimeType.startsWith('video/')) {
      return <Video className="w-5 h-5 text-purple-500" />;
    }
    return <FileText className="w-5 h-5 text-gray-500" />;
  };

  const isAudioFile = (mimeType: string, mediaType?: string) => {
    return mediaType === 'voice' || mimeType.startsWith('audio/');
  };

  const cleanupAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setPlayingAudio(null);
  };

  const handlePlayAudio = async (file: FileItem) => {
    if (playingAudio === file.uuid) {
      cleanupAudio();
      return;
    }

    cleanupAudio();

    try {
      const downloadUrl = getDownloadUrl(module, file.uuid);
      const response = await apiService.get(downloadUrl, {
        responseType: 'blob',
      });

      const audioBlob = response.data as Blob;
      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.onended = cleanupAudio;
        audioRef.current.onerror = () => {
          console.error('Error playing audio file.');
          alert('Failed to play audio file');
          cleanupAudio();
        };
        await audioRef.current.play();
        setPlayingAudio(file.uuid);
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      alert('Failed to play audio file');
      cleanupAudio();
    }
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const downloadUrl = getDownloadUrl(module, file.uuid);
      const response = await apiService.get(downloadUrl, {
        responseType: 'blob',
      });

      const blob = response.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download file');
    }
  };

  const handleDelete = async (fileId: string) => {
    if (window.confirm('Are you sure you want to delete this file?')) {
      try {
        // Note: The delete URL might also be inconsistent, assuming /files/ for now
        const deleteUrl = `/${module}/files/${fileId}`;
        await apiService.delete(deleteUrl);
        onDelete(fileId);
      } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete file');
      }
    }
  };

  const handleUnlink = async (fileId: string) => {
    if (window.confirm('Are you sure you want to unlink this file from the project?')) {
      if (onUnlink) {
        onUnlink(fileId);
      }
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, file: FileItem) => {
    if (!enableDragDrop) return;
    setDraggedFile(file);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', file.uuid);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!enableDragDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    if (!enableDragDrop) return;
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (!enableDragDrop || !draggedFile || !onReorder) return;
    e.preventDefault();
    
    const sourceIndex = files.findIndex(file => file.uuid === draggedFile.uuid);
    if (sourceIndex === -1 || sourceIndex === targetIndex) {
      setDraggedFile(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder files and call onReorder callback
    const reorderedFiles = reorderArray(files, sourceIndex, targetIndex);
    onReorder(reorderedFiles);
    
    setDraggedFile(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    if (!enableDragDrop) return;
    setDraggedFile(null);
    setDragOverIndex(null);
  };

  // Files are already ordered by server - no local sorting needed
  if (files.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <p className="text-sm">No attachments yet</p>
        <p className="text-xs mt-1">Click "Add Media" to upload files or record audio</p>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {files.map((file, index) => (
        <div
          key={file.uuid}
          draggable={enableDragDrop}
          onDragStart={(e) => handleDragStart(e, file)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          style={{
            ...getDragPreviewStyles(draggedFile?.uuid === file.uuid),
            ...(dragOverIndex === index ? getDropZoneStyles(true, true) : {})
          }}
          className={`flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors ${
            enableDragDrop ? 'cursor-grab' : ''
          }`}
        >
          <div className="flex items-center flex-1 min-w-0">
            {enableDragDrop && (
              <div className="mr-2 cursor-grab">
                <GripVertical className="w-4 h-4 text-gray-400" />
              </div>
            )}
            {/* Thumbnail or fallback icon */}
            {(() => {
              const thumbUrl = getThumbnailUrl(file, 'small');
              if (thumbUrl && file.mime_type.startsWith('image/')) {
                return (
                  <img
                    src={thumbUrl}
                    alt={file.original_name}
                    className="w-10 h-10 rounded object-cover bg-gray-100 border border-gray-200"
                    onError={(e) => {
                      // Fallback to icon on error
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                );
              }
              return getFileIcon(file.mime_type, file.media_type);
            })()}
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {file.original_name}
              </p>
              <div className="flex items-center space-x-2 text-xs text-gray-500">
                <span>{formatFileSize(file.file_size)}</span>
                {file.description && (
                  <>
                    <span>•</span>
                    <span className="truncate">{file.description}</span>
                  </>
                )}
                <span>•</span>
                <span>{new Date(file.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 ml-3">
            {isAudioFile(file.mime_type, file.media_type) && (
              <button
                onClick={() => handlePlayAudio(file)}
                className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                title={playingAudio === file.uuid ? 'Pause' : 'Play'}
              >
                {playingAudio === file.uuid ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
            )}

            <button
              onClick={() => handleDownload(file)}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Download"
            >
              <Download className="w-4 h-4" />
            </button>
            
            {showUnlink ? (
              <button
                onClick={() => handleUnlink(file.uuid)}
                className="p-1 text-gray-400 hover:text-orange-600 transition-colors"
                title="Unlink from project"
              >
                <Unlink className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => handleDelete(file.uuid)}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}

      <audio ref={audioRef} style={{ display: 'none' }} preload="none" />
    </div>
  );
};

export default FileList;
