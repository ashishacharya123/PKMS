/**
 * Unified File List Component
 * 
 * A simplified, consistent file list component that works across all modules.
 * Uses the unified file service to handle different backend endpoints transparently.
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  IconPlayerPlay, 
  IconPlayerPause, 
  IconDownload, 
  IconTrash, 
  IconPhoto, 
  IconFileText, 
  IconMicrophone, 
  IconVideo, 
  IconUnlink, 
  IconGripVertical 
} from '@tabler/icons-react';
import { 
  Group, 
  Text, 
  ActionIcon, 
  Badge, 
  Card, 
  Stack, 
  Image, 
  Progress,
  Tooltip,
  Button
} from '@mantine/core';
import { unifiedFileService, UnifiedFileItem } from '../../services/unifiedFileService';
import { fileService } from '../../services/fileCacheService';
import { reorderArray, getDragPreviewStyles, getDropZoneStyles } from '../../utils/dragAndDrop';

interface UnifiedFileListProps {
  files: UnifiedFileItem[];
  onDelete: (fileId: string) => void;
  onUnlink?: (fileId: string) => void; // For project context
  onReorder?: (reorderedFiles: UnifiedFileItem[]) => void; // For drag-and-drop reordering
  className?: string;
  showUnlink?: boolean; // Show unlink action instead of delete
  enableDragDrop?: boolean; // Enable drag-and-drop reordering
}

export const UnifiedFileList: React.FC<UnifiedFileListProps> = ({
  files,
  onDelete,
  onUnlink,
  onReorder,
  className = '',
  showUnlink = false,
  enableDragDrop = false
}) => {
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  
  // Drag and drop state
  const [draggedFile, setDraggedFile] = useState<UnifiedFileItem | null>(null);
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

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isAudioFile = (mimeType: string, mediaType?: string) =>
    mimeType.startsWith('audio/') || mediaType === 'audio';

  const isVideoFile = (mimeType: string, mediaType?: string) =>
    mimeType.startsWith('video/') || mediaType === 'video';

  const isImageFile = (mimeType: string, mediaType?: string) =>
    mimeType.startsWith('image/') || mediaType === 'image';

  const getFileIcon = (mimeType: string, mediaType?: string) => {
    if (isImageFile(mimeType, mediaType)) return IconPhoto;
    if (isVideoFile(mimeType, mediaType)) return IconVideo;
    if (isAudioFile(mimeType, mediaType)) return IconMicrophone;
    return IconFileText;
  };

  const handleDownload = async (file: UnifiedFileItem) => {
    try {
      // Handle encrypted diary files
      if (file.module === 'diary' && file.isEncrypted) {
        const password = prompt('This file is encrypted. Please enter your diary password:');
        if (!password) {
          return; // User cancelled
        }
        
        // Generate encryption key from password
        const { diaryCryptoService } = await import('../../services/diaryCryptoService');
        const encryptionKey = await diaryCryptoService.generateEncryptionKey(password);
        
        // Download and decrypt file
        const decryptedBlob = await unifiedFileService.downloadFile(file, encryptionKey);
        const url = URL.createObjectURL(decryptedBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.originalName;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      // For non-encrypted files, use unified download
      const blob = await unifiedFileService.downloadFile(file);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download file');
    }
  };

  const handleDelete = async (fileId: string) => {
    if (window.confirm('Are you sure you want to delete this file?')) {
      try {
        const file = files.find(f => f.uuid === fileId);
        if (file) {
          await unifiedFileService.deleteFile(file);
          onDelete(fileId);
        }
      } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete file');
      }
    }
  };

  const handleUnlink = async (fileId: string) => {
    if (window.confirm('Are you sure you want to unlink this file from the project?')) {
      try {
        const file = files.find(f => f.uuid === fileId);
        if (file) {
          await unifiedFileService.unlinkFile(file);
          onUnlink?.(fileId);
        }
      } catch (error) {
        console.error('Unlink error:', error);
        alert('Failed to unlink file');
      }
    }
  };

  // Drag and drop handlers (only for projects)
  const handleDragStart = (e: React.DragEvent, file: UnifiedFileItem) => {
    if (!enableDragDrop || file.module !== 'projects') return;
    setDraggedFile(file);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', file.uuid);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!enableDragDrop || !draggedFile) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (!enableDragDrop || !draggedFile) return;
    e.preventDefault();
    
    const sourceIndex = files.findIndex(f => f.uuid === draggedFile.uuid);
    if (sourceIndex === -1 || sourceIndex === targetIndex) return;
    
    const reorderedFiles = reorderArray(files, sourceIndex, targetIndex);
    onReorder?.(reorderedFiles);
    
    setDraggedFile(null);
    setDragOverIndex(null);
  };

  if (files.length === 0) {
    return (
      <Card shadow="sm" padding="md" radius="md" withBorder>
        <Text c="dimmed" ta="center">No files attached</Text>
      </Card>
    );
  }

  return (
    <Stack gap="sm" className={className}>
      {files.map((file, index) => {
        const FileIcon = getFileIcon(file.mimeType, file.mediaType);
        const isAudio = isAudioFile(file.mimeType, file.mediaType);
        const isVideo = isVideoFile(file.mimeType, file.mediaType);
        const isImage = isImageFile(file.mimeType, file.mediaType);
        
        return (
          <Card
            key={file.uuid}
            shadow="sm"
            padding="md"
            radius="md"
            withBorder
            draggable={enableDragDrop}
            onDragStart={(e) => handleDragStart(e, file)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            style={{
              ...(dragOverIndex === index ? getDropZoneStyles() : {}),
              ...(draggedFile?.uuid === file.uuid ? getDragPreviewStyles() : {})
            }}
          >
            <Group justify="space-between" align="flex-start">
              <Group gap="sm" style={{ flex: 1, minWidth: 0 }}>
                <ThumbnailRenderer file={file} />
                <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={500} truncate title={file.originalName}>
                    {file.originalName}
                  </Text>
                  <Group gap="xs">
                    <Badge size="xs" variant="light">
                      {file.mimeType.split('/')[0].toUpperCase()}
                    </Badge>
                    <Text size="sm" c="dimmed">
                      {formatFileSize(file.fileSize)}
                    </Text>
                    {file.isEncrypted && (
                      <Badge size="xs" color="orange" variant="light">
                        Encrypted
                      </Badge>
                    )}
                  </Group>
                  {file.description && (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {file.description}
                    </Text>
                  )}
                </Stack>
              </Group>
              
              <Group gap="xs">
                {isAudio && (
                  <Tooltip label={playingAudio === file.uuid ? 'Pause' : 'Play'}>
                    <ActionIcon
                      variant="light"
                      size="sm"
                      onClick={() => {
                        // Audio playback logic would go here
                        setPlayingAudio(playingAudio === file.uuid ? null : file.uuid);
                      }}
                    >
                      {playingAudio === file.uuid ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                    </ActionIcon>
                  </Tooltip>
                )}
                
                <Tooltip label="Download">
                  <ActionIcon
                    variant="light"
                    size="sm"
                    onClick={() => handleDownload(file)}
                  >
                    <IconDownload size={16} />
                  </ActionIcon>
                </Tooltip>
                
                {showUnlink ? (
                  <Tooltip label="Unlink from project">
                    <ActionIcon
                      variant="light"
                      color="orange"
                      size="sm"
                      onClick={() => handleUnlink(file.uuid)}
                    >
                      <IconUnlink size={16} />
                    </ActionIcon>
                  </Tooltip>
                ) : (
                  <Tooltip label="Delete">
                    <ActionIcon
                      variant="light"
                      color="red"
                      size="sm"
                      onClick={() => handleDelete(file.uuid)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
                
                {enableDragDrop && (
                  <ActionIcon variant="light" size="sm" style={{ cursor: 'grab' }}>
                    <IconGripVertical size={16} />
                  </ActionIcon>
                )}
              </Group>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
};

// Thumbnail renderer component with caching
const ThumbnailRenderer: React.FC<{ file: UnifiedFileItem }> = ({ file }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getThumbnailUrl = async (file: UnifiedFileItem, size: 'small' | 'medium' | 'large' = 'small'): Promise<string | null> => {
    // First check if we have a cached thumbnail
    const cacheKey = `${file.uuid}_thumbnail`;
    const module = getCacheModule(file.module);
    
    try {
      const cachedThumbnail = await fileService.getThumbnail(cacheKey, module);
      if (cachedThumbnail) {
        console.log(`🎯 THUMBNAIL CACHE HIT: ${file.originalName}`);
        return URL.createObjectURL(cachedThumbnail);
      }
    } catch (error) {
      console.warn('Failed to get cached thumbnail:', error);
    }

    // Fallback to backend thumbnail
    if (file.thumbnailPath) {
      return file.thumbnailPath;
    }
    if (file.filePath) {
      const basePath = file.filePath.replace(/\\/g, '/');
      return `/api/v1/thumbnails/file/${basePath}?size=${size}`;
    }
    return null;
  };

  const getCacheModule = (module: string): 'documents' | 'archive' | 'diary' => {
    switch (module) {
      case 'documents':
        return 'documents';
      case 'archive':
        return 'archive';
      case 'diary':
        return 'diary';
      case 'notes':
        return 'documents'; // Notes use documents cache
      case 'projects':
        return 'documents'; // Projects use documents cache
      default:
        return 'documents';
    }
  };

  const getFileIcon = (mimeType: string, mediaType?: string) => {
    if (mediaType === 'voice' || mimeType.startsWith('audio/')) {
      return <IconMicrophone size={20} className="text-green-500" />;
    }
    if (mimeType.startsWith('image/')) {
      return <IconPhoto size={20} className="text-blue-500" />;
    }
    if (mimeType.startsWith('video/')) {
      return <IconVideo size={20} className="text-purple-500" />;
    }
    return <IconFileText size={20} className="text-gray-500" />;
  };

  useEffect(() => {
    const loadThumbnail = async () => {
      if (!file.mimeType.startsWith('image/')) {
        setIsLoading(false);
        return;
      }

      try {
        const url = await getThumbnailUrl(file, 'small');
        setThumbUrl(url);
      } catch (error) {
        console.warn('Failed to load thumbnail:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadThumbnail();
  }, [file]);

  if (isLoading) {
    return (
      <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200 animate-pulse flex items-center justify-center">
        <IconPhoto size={16} className="text-gray-400" />
      </div>
    );
  }

  if (thumbUrl && file.mimeType.startsWith('image/')) {
    return (
      <Image
        src={thumbUrl}
        alt={file.originalName}
        width={40}
        height={40}
        radius="sm"
        fit="cover"
        fallback={
          <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200 flex items-center justify-center">
            <IconPhoto size={16} className="text-gray-400" />
          </div>
        }
        onError={() => {
          // Fallback to icon on error
          setThumbUrl(null);
        }}
      />
    );
  }

  return getFileIcon(file.mimeType, file.mediaType);
};
