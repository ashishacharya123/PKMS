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
  IconGripVertical,
  IconEye,
  IconChecklist,
  IconRefresh,
  IconEdit
} from '@tabler/icons-react';
import { 
  Group, 
  Text, 
  ActionIcon, 
  Badge, 
  Card, 
  Stack, 
  Image, 
  Tooltip
} from '@mantine/core';
import { unifiedFileService, UnifiedFileItem } from '../../services/unifiedFileService';
import { fileService } from '../../services/fileCacheService';
import { reorderArray, getDragPreviewStyles, getDropZoneStyles } from '../../utils/dragAndDrop';
import { ImageViewer } from '../common/ImageViewer';
import { TodoCard } from '../todos/TodoCard';
import { Todo } from '../../types/todo';
import { UnifiedContentModal } from './UnifiedContentModal';

// Utility function for getting cache module
const getCacheModule = (module: string): 'documents' | 'archive' | 'diary' => {
  switch (module) {
    case 'documents':
      return 'documents';
    case 'archive':
      return 'archive';
    case 'diary':
      return 'diary';
    default:
      return 'documents';
  }
};

// Utility function for getting thumbnail URLs
const getThumbnailUrl = async (file: UnifiedFileItem, size: 'small' | 'medium' | 'large' = 'small'): Promise<string | null> => {
  // First check if we have a cached thumbnail
  const cacheKey = `${file.uuid}_thumbnail`;
  const module = getCacheModule(file.module);
  
  try {
    const cachedThumbnail = await fileService.getThumbnail(cacheKey, module);
    if (cachedThumbnail) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(`🎯 THUMBNAIL CACHE HIT: ${file.originalName}`);
      }
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
    const encoded = encodeURIComponent(basePath);
    return `/api/v1/thumbnails/file/${encoded}?size=${size}`;
  }
  
  return null;
};

interface UnifiedFileListProps {
  files: UnifiedFileItem[];
  onDelete: (fileId: string) => void;
  onUnlink?: (fileId: string) => void; // For project context
  onReorder?: (reorderedFiles: UnifiedFileItem[]) => void; // For drag-and-drop reordering
  onReplace?: (fileId: string, newFile: File) => void; // For replacing files
  className?: string;
  showUnlink?: boolean; // Show unlink action instead of delete
  enableDragDrop?: boolean; // Enable drag-and-drop reordering
  encryptionKey?: CryptoKey; // For diary encryption
  // Content editing props
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  entityId: string; // Parent entity UUID
  onContentSave?: (data: any) => Promise<void>; // For content saving
  onContentDelete?: () => Promise<void>; // For content deletion
}

export const UnifiedFileList: React.FC<UnifiedFileListProps> = ({
  files,
  onDelete,
  onUnlink,
  onReorder,
  onReplace,
  className = '',
  showUnlink = false,
  enableDragDrop = false,
  encryptionKey,
  module,
  entityId,
  onContentSave,
  onContentDelete
}) => {
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  
  // Content modal state
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [contentModalMode, setContentModalMode] = useState<'view' | 'edit' | 'create'>('view');
  const [contentModalFile, setContentModalFile] = useState<UnifiedFileItem | null>(null);
  
  // Image viewing state
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<UnifiedFileItem | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  
  // TODO viewing state
  const [todoViewerOpen, setTodoViewerOpen] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  
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

  const isPdfFile = (mimeType: string, mediaType?: string) =>
    mimeType === 'application/pdf' || mediaType === 'pdf';

  const isTodoFile = (mimeType: string, mediaType?: string) =>
    mimeType === 'application/json' && mediaType === 'todo';


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

  const handleViewImage = async (file: UnifiedFileItem) => {
    try {
      let imageUrl: string;

      if (file.isEncrypted && encryptionKey) {
        // Decrypt and create blob URL
        const decryptedBlob = await unifiedFileService.downloadFile(file, encryptionKey);
        imageUrl = URL.createObjectURL(decryptedBlob);
      } else {
        // Use existing thumbnail logic
        imageUrl = await getThumbnailUrl(file, 'large') || file.filePath || '';
      }

      setImageUrl(imageUrl);
      setSelectedImage(file);
      setImageViewerOpen(true);
    } catch (error) {
      console.error('Failed to load image:', error);
      // Show user-friendly error message
      setImageUrl(file.filePath || '');
      setSelectedImage(file);
      setImageViewerOpen(true);
    }
  };

  const handleViewDocument = (file: UnifiedFileItem) => {
    // Get the proper download URL for the file
    const downloadUrl = unifiedFileService.getDownloadUrl(file);
    // Open document in new tab using the download URL with security flags
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  };

  const handleViewTodo = async (file: UnifiedFileItem) => {
    try {
      // Download and parse the TODO file
      const downloadUrl = unifiedFileService.getDownloadUrl(file);
      const response = await fetch(downloadUrl);
      const todoData = await response.json();
      
      // Set the TODO data and open viewer
      setSelectedTodo(todoData as Todo);
      setTodoViewerOpen(true);
    } catch (error) {
      console.error('Failed to load TODO file:', error);
      // Fallback to opening as document
      handleViewDocument(file);
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

  const handleReplace = (fileId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = false;
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && onReplace) {
        onReplace(fileId, file);
      }
    };
    input.click();
  };

  // Content modal handlers
  const openContentModal = (mode: 'view' | 'edit' | 'create', file: UnifiedFileItem) => {
    setContentModalFile(file);
    setContentModalMode(mode);
    setContentModalOpen(true);
  };

  const closeContentModal = () => {
    setContentModalOpen(false);
    setContentModalFile(null);
  };

  const handleContentSave = async (data: any) => {
    if (onContentSave) {
      await onContentSave(data);
    }
    closeContentModal();
  };

  const handleContentDelete = async () => {
    if (onContentDelete) {
      await onContentDelete();
    }
    closeContentModal();
  };

  // Check if file is content-type (text/markdown)
  const isContentFile = (file: UnifiedFileItem): boolean => {
    return file.mimeType === 'text/markdown' || 
           file.mimeType === 'text/plain' ||
           file.originalName.endsWith('.md') ||
           file.originalName.endsWith('.txt');
  };

  // Drag and drop handlers (universal)
  const handleDragStart = (e: React.DragEvent, file: UnifiedFileItem) => {
    if (!enableDragDrop) return;
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
    <>
    <Stack gap="sm" className={className}>
      {files.map((file, index) => {
        const isAudio = isAudioFile(file.mimeType, file.mediaType);
        const isVideo = isVideoFile(file.mimeType, file.mediaType);
        const isImage = isImageFile(file.mimeType, file.mediaType);
        const isPdf = isPdfFile(file.mimeType, file.mediaType);
        const isTodo = isTodoFile(file.mimeType, file.mediaType);
        
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
              ...(dragOverIndex === index ? getDropZoneStyles(true, true) : {}),
              ...(draggedFile?.uuid === file.uuid ? getDragPreviewStyles(true) : {})
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
                {/* Audio controls */}
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
                
                {/* Image viewer */}
                {isImage && (
                  <Tooltip label="View Image">
                    <ActionIcon
                      variant="light"
                      size="sm"
                      onClick={() => handleViewImage(file)}
                    >
                      <IconEye size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
                
                {/* TODO viewer */}
                {isTodo && (
                  <Tooltip label="View TODO">
                    <ActionIcon
                      variant="light"
                      size="sm"
                      onClick={() => handleViewTodo(file)}
                    >
                      <IconChecklist size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
                
                {/* Document viewer */}
                {!isImage && !isAudio && !isVideo && !isTodo && (
                  <Tooltip label={isPdf ? "View PDF" : "View Document"}>
                    <ActionIcon
                      variant="light"
                      size="sm"
                      onClick={() => handleViewDocument(file)}
                    >
                      <IconEye size={16} />
                    </ActionIcon>
                  </Tooltip>
                )}
                
                {/* Download button */}
                <Tooltip label="Download">
                  <ActionIcon
                    variant="light"
                    size="sm"
                    onClick={() => handleDownload(file)}
                  >
                    <IconDownload size={16} />
                  </ActionIcon>
                </Tooltip>

                {/* View/Edit Content buttons for text files */}
                {isContentFile(file) && (
                  <>
                    <Tooltip label="View Content">
                      <ActionIcon
                        variant="light"
                        size="sm"
                        onClick={() => openContentModal('view', file)}
                      >
                        <IconEye size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Edit Content">
                      <ActionIcon
                        variant="light"
                        size="sm"
                        onClick={() => openContentModal('edit', file)}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </>
                )}

                {/* Replace button */}
                <Tooltip label="Replace">
                  <ActionIcon
                    variant="light"
                    size="sm"
                    onClick={() => handleReplace(file.uuid)}
                  >
                    <IconRefresh size={16} />
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
    
    {/* Image Viewer Modal */}
      {selectedImage && (
        <ImageViewer
          opened={imageViewerOpen}
          onClose={() => {
            setImageViewerOpen(false);
            setSelectedImage(null);
          }}
          imageUrl={imageUrl || unifiedFileService.getDownloadUrl(selectedImage)}
          imageName={selectedImage.originalName}
          onDownload={() => handleDownload(selectedImage)}
          size="lg"
        />
      )}

      {/* TODO Viewer Modal */}
      {selectedTodo && todoViewerOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', maxWidth: '80%', maxHeight: '80%', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3>TODO Viewer</h3>
              <button onClick={() => {
                setTodoViewerOpen(false);
                setSelectedTodo(null);
              }}>Close</button>
            </div>
            <TodoCard
              todo={selectedTodo}
              onEdit={() => {}}
              onDelete={() => {}}
              onArchive={() => {}}
              onUnarchive={() => {}}
              onComplete={() => {}}
              onAddSubtask={() => {}}
              showArchived={false}
            />
          </div>
        </div>
      )}

      {/* Unified Content Modal */}
      {contentModalFile && (
        <UnifiedContentModal
          opened={contentModalOpen}
          onClose={closeContentModal}
          mode={contentModalMode}
          module={module}
          entityId={entityId}
          initialData={{
            title: contentModalFile.originalName,
            content: '', // Will be loaded from file content
            createdAt: contentModalFile.createdAt,
          }}
          files={[contentModalFile]}
          onFilesUpdate={() => {}} // File updates handled by parent
          encryptionKey={encryptionKey}
          onSave={handleContentSave}
          onDelete={handleContentDelete}
          showProjects={module === 'notes' || module === 'projects'}
          showDiaryFields={module === 'diary'}
          enableDragDrop={false}
        />
      )}
    </>
  );
};

// Thumbnail renderer component with caching
const ThumbnailRenderer: React.FC<{ file: UnifiedFileItem }> = ({ file }) => {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    if (mimeType === 'application/pdf' || mediaType === 'pdf') {
      return <IconFileText size={20} className="text-red-500" />;
    }
    if (mimeType === 'application/json' && mediaType === 'todo') {
      return <IconChecklist size={20} className="text-orange-500" />;
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

    return () => {
      if (thumbUrl && thumbUrl.startsWith('blob:')) {
        URL.revokeObjectURL(thumbUrl);
      }
    };
  }, [file, thumbUrl]);

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
        onError={() => {
          // Fallback to icon on error
          setThumbUrl(null);
        }}
      />
    );
  }

  return getFileIcon(file.mimeType, file.mediaType);
};
