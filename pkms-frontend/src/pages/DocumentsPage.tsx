/**
 * Clean DocumentsPage using existing patterns
 *
 * Refactored from 839-line component to pattern-based implementation:
 * - Uses useDataLoader for document management
 * - Uses useModal for modal state management
 * - Uses LoadingState/ErrorState for better UX
 * - Maintains all file operations and upload functionality
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Grid,
  Title,
  Text,
  Group,
  Stack,
  Button,
  TextInput,
  Badge,
  Alert,
  Pagination,
  Paper,
  Modal,
  Tooltip
} from '@mantine/core';
import ViewMenu, { ViewMode } from '../components/common/ViewMenu';
import { getFileTypeConfig, getFileTypeConfigByExtension } from '../utils/fileUtils';
import ViewModeLayouts, { formatDate } from '../components/common/ViewModeLayouts';
import { formatFileSize } from '../utils/fileUtils';
import { addTokenToUrl } from '../utils/cookieUtils';
import { useViewPreferences } from '../hooks/useViewPreferences';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { ProjectBadges } from '../components/common/ProjectBadges';
import {
  IconUpload,
  IconSearch,
  IconFilter,
  IconSortAscending,
  IconSortDescending,
  IconEye,
  IconFolder,
  IconArchive,
  IconStar,
  IconRefresh,
  IconExternalLink,
  IconDownload,
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { searchService } from '../services/searchService';
import { useDocumentsStore } from '../stores/documentsStore';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { documentsService } from '../services/documentsService';
import { Document } from '../types/document';
import { ActionMenu } from '../components/common/ActionMenu';
import { FileUploadModalMemo } from '../components/file/FileUploadModal';
import { ModuleLayout } from '../components/common/ModuleLayout';
import { ModuleHeader } from '../components/common/ModuleHeader';
import { ModuleFilters, getModuleFilterConfig } from '../components/common/ModuleFilters';
import { useDataLoader } from '../hooks/useDataLoader';
import { useModal } from '../hooks/useModal';
import { UnifiedContentModal } from '../components/file/UnifiedContentModal';

type SortField = 'originalName' | 'fileSize' | 'createdAt' | 'updatedAt';
type SortOrder = 'asc' | 'desc';

// File type helpers: robust icon + label detection from MIME and filename
const getExt = (name?: string): string => {
  if (!name) return '';
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.substring(idx + 1).toLowerCase() : '';
};

const getFileIcon = (mimeType: string, name?: string): string => {
  const ext = getExt(name);
  // Images
  if (mimeType.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) return '🖼️';
  // PDF
  if (mimeType === 'application/pdf' || ext === 'pdf') return '📕';
  // Word
  if (mimeType.includes('word') || ['doc','docx','odt','rtf'].includes(ext)) return '📝';
  // Excel/Sheets
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || ['xls','xlsx','ods','csv'].includes(ext)) return '📊';
  // PowerPoint/Slides
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation') || ['ppt','pptx','odp'].includes(ext)) return '📈';
  // Text/Markdown/Code
  if (mimeType === 'text/plain' || ['txt','md'].includes(ext)) return '📄';
  if (['js','ts','tsx','py','java','go','rb','php','cs','cpp','c','sql','sh','yaml','yml','json','xml','html','css'].includes(ext)) return '💻';
  // Archives
  if (['zip','rar','7z','tar','gz','bz2'].includes(ext)) return '🗜️';
  // Media
  if (mimeType.startsWith('video/') || ['mp4','mkv','webm','mov','avi'].includes(ext)) return '🎥';
  if (mimeType.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac'].includes(ext)) return '🎵';
  return '📎';
};

// New React component for professional file type icons
const getFileIconComponent = (mimeType: string, name?: string) => {
  const config = getFileTypeConfig(mimeType);
  // Fallback to extension-based lookup if MIME type is generic
  if (config.label === 'Unknown File' && name) {
    const ext = getExt(name);
    const extConfig = getFileTypeConfigByExtension(name);
    if (extConfig.label !== 'Unknown File') {
      const IconComponent = extConfig.icon;
      return <IconComponent size={16} color={extConfig.color} />;
    }
  }
  const IconComponent = config.icon;
  return <IconComponent size={16} color={config.color} />;
};

const getFileTypeLabel = (mimeType: string, name?: string): string => {
  const ext = getExt(name);
  if (mimeType.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) return 'IMAGE';
  if (mimeType === 'application/pdf' || ext === 'pdf') return 'PDF';
  if (mimeType.includes('word') || ['doc','docx','odt','rtf'].includes(ext)) return 'WORD';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || ['xls','xlsx','ods','csv'].includes(ext)) return ext === 'csv' ? 'CSV' : 'EXCEL';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation') || ['ppt','pptx','odp'].includes(ext)) return 'PPT';
  if (mimeType === 'text/plain' || ['txt','md'].includes(ext)) return ext.toUpperCase() || 'TEXT';
  if (['js','ts','tsx','py','java','go','rb','php','cs','cpp','c','sql','sh','yaml','yml','json','xml','html','css'].includes(ext)) return ext.toUpperCase();
  if (['zip','rar','7z','tar','gz','bz2'].includes(ext)) return 'ARCHIVE';
  if (mimeType.startsWith('video/') || ['mp4','mkv','webm','mov','avi'].includes(ext)) return 'VIDEO';
  if (mimeType.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac'].includes(ext)) return 'AUDIO';
  return ext ? ext.toUpperCase() : 'FILE';
};

export function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const [sortField, setSortField] = useState<SortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Modular filter state
  const [filters, setFilters] = useState({
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    favorites: false,
    showArchived: false
  });
    const filterConfig = getModuleFilterConfig('documents');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal management with useModal hook
  const uploadModal = useModal<File>();
  const filterModal = useModal();
  const imagePreviewModal = useModal<{ url: string; name: string }>();
  const contentModal = useModal<{ file: any; mode: 'view' | 'edit' }>();
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const { getPreference, updatePreference } = useViewPreferences();
  const [viewMode, setViewMode] = useState<ViewMode>(getPreference('documents'));
  const itemsPerPage = 20;

  // Store state
  const {
    documents,
    isLoading,
    isUploading,
    uploadProgress,
    error,
    currentMimeType,
    currentTag,
    showArchived,
    showFavoritesOnly,
    showProjectOnly,
    loadDocuments,
    uploadDocument,
    deleteDocument,
    toggleArchive,
    downloadDocument,
    previewDocument,
    getDownloadUrl,
    setMimeType,
    setTag,
    setSearch,
    setShowArchived,
    setShowFavoritesOnly,
    setShowProjectOnly,
    clearError
  } = useDocumentsStore();

  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);

  // Image preview state (inline viewer)
  // Image preview now handled by imagePreviewModal

  // Modal handlers
  const handleOpenUploadModal = useCallback(() => {
    uploadModal.openModal();
  }, [uploadModal]);

  const handleOpenFilterModal = useCallback(() => {
    filterModal.openModal();
  }, [filterModal]);

  const handleImagePreview = useCallback((url: string, name: string) => {
    imagePreviewModal.openModal({ url, name });
  }, [imagePreviewModal]);

  // Keyboard shortcuts: search focus, toggle archived/favorites via sidebar, refresh
  useKeyboardShortcuts({
    shortcuts: [
      { key: '/', action: () => {
          const input = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement | null;
          input?.focus();
        }, description: 'Focus search', category: 'Navigation' },
      { key: 'r', action: () => loadDocuments(), description: 'Refresh documents', category: 'General' },
    ],
    enabled: true,
    showNotifications: false,
  });

  useEffect(() => {
    setSearch(debouncedSearchQuery);
  }, [debouncedSearchQuery, setSearch]);

  useAuthenticatedEffect(() => {
    // Skip loading documents if upload modal is open to prevent state reset
    if (!uploadModal.isOpen) {
      loadDocuments();
    }
  }, [loadDocuments, uploadModal.isOpen]);

  // Reload documents when the page becomes visible again (fixes minimize/restore issue)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && !uploadModal.isOpen) {
        // Page became visible, reload documents to ensure fresh data
        // Skip if upload modal is open to prevent state reset
        loadDocuments();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Also handle window focus as a backup
    const handleWindowFocus = () => {
      if (!uploadModal.isOpen) {
        // Window focused, reloading documents for fresh data
        // Skip if upload modal is open to prevent state reset
        loadDocuments();
      }
    };

    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [loadDocuments, uploadModal.isOpen]);

  // Auto-open upload modal when navigated with ?action=upload
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'upload') {
      uploadModal.openModal();
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('action');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Revoke object URL when closing image preview modal (only for blob URLs)
  const handleCloseImagePreview = useCallback(() => {
    // Only revoke blob URLs, not streaming URLs
    if (imagePreviewModal.selectedItem?.url && imagePreviewModal.selectedItem.url.startsWith('blob:')) {
      try { URL.revokeObjectURL(imagePreviewModal.selectedItem.url); } catch {}
    }
    imagePreviewModal.closeModal();
  }, [imagePreviewModal]);

  const handleTagSearch = async (query: string) => {
    if (query.length < 1) {
      setTagSuggestions([]);
      return;
    }
    
    try {
      const tags = await searchService.getTagAutocomplete(query, 'document');
      setTagSuggestions(tags.map(tag => tag.name));
    } catch (error) {
      console.error('Failed to fetch tag suggestions:', error);
      setTagSuggestions([]);
    }
  };

  
  const handleDeleteDocument = async (uuid: string, name: string) => {
    modals.openConfirmModal({
      title: 'Delete Document',
      children: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deleteDocument(uuid),
    });
  };

  const handleToggleArchive = async (doc: any) => {
    try {
      await toggleArchive(doc.uuid, !doc.isArchived);
      notifications.show({
        title: doc.isArchived ? 'Document Unarchived' : 'Document Archived',
        message: `"${doc.originalName}" has been ${doc.isArchived ? 'unarchived' : 'archived'}`,
        color: 'blue'
      });
    } catch (error) {
      notifications.show({
        title: 'Action Failed',
        message: 'Could not change archive status',
        color: 'red'
      });
    }
  };

  const handleDownloadFile = async (doc: any) => {
    try {
      const blob = await downloadDocument(doc.uuid);
      if (!blob) return;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.originalName || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      notifications.show({ title: 'Download failed', message: 'You may need to re-login.', color: 'red' });
    }
  };

  const renderActionMenu = (document: any, size: 'sm' | 'md' = 'md') => (
    <div onClick={(e) => e.stopPropagation()}>
      <ActionMenu
        onDownload={() => handleDownloadFile(document)}
        onArchive={document.isArchived ? undefined : () => handleToggleArchive(document)}
        onUnarchive={document.isArchived ? () => handleToggleArchive(document) : undefined}
        onDelete={() => handleDeleteDocument(document.uuid, document.originalName)}
        isArchived={document.isArchived}
        variant="subtle"
        color="gray"
        size={size === 'sm' ? 14 : 16}
        customActions={[
          {
            label: 'Open in New Tab',
            icon: <IconExternalLink size={14} />,
            onClick: () => handlePreview(document, true)
          }
        ]}
      />
    </div>
  );

  // Handle preview: document-focused preview system
  const handlePreview = async (doc: any, openInNewTab: boolean = false) => {
    try {
      const mimeType = doc?.mimeType;
      const originalName = doc?.originalName || '';

      // Helper function to open in new tab
      const openDownloadUrlInNewTab = (preview: boolean) => {
        const url = getDownloadUrl(doc.uuid, preview);
        console.log('🔍 DEBUG: New tab URL being opened:', url);
        console.log('🔍 DEBUG: New tab preview mode:', preview);
        window.open(url, '_blank', 'noopener,noreferrer');
      };

      // If user explicitly wants new tab, just open the download URL
      if (openInNewTab) {
        openDownloadUrlInNewTab(true); // Open with preview flag
        return;
      }

      // 1. Images: Download to blob for inline preview (documents need this)
      if (mimeType?.startsWith('image/')) {
        const blob = await downloadDocument(doc.uuid);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        imagePreviewModal.openModal({ url, name: originalName });
        return;
      }
      
      // 2. Archives and binary files: show notification
      const nonPreviewableTypes = [
        'application/zip',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
        'application/x-tar',
        'application/gzip',
        'application/octet-stream'
      ];

      if (nonPreviewableTypes.includes(mimeType) || originalName?.match(/\.(zip|rar|7z|tar|gz)$/i)) {
        notifications.show({
          title: 'File Cannot Be Previewed',
          message: 'This file type must be downloaded to be viewed.',
          color: 'blue'
        });
        return;
      }

      // 3. All other file types (PDF, text, office docs, etc.): Use preview URL for inline iframe display
      try {
        const url = getDownloadUrl(doc.uuid, true); // preview=true
        const urlWithToken = addTokenToUrl(url); // Add authentication token for iframe
        console.log('🔍 DEBUG: Modal iframe URL being generated:', urlWithToken);
        console.log('🔍 DEBUG: Document being previewed:', { uuid: doc.uuid, name: doc.originalName, type: doc.mimeType });
        contentModal.openModal(
          { file: doc, mode: 'view' },
          { content: null, pdfUrl: urlWithToken } // pdfUrl is reused for any iframe src with token
        );
        console.log('🔍 DEBUG: Modal opened with pdfUrl:', urlWithToken);
      } catch (error) {
        console.warn('Failed to get preview URL, opening in new tab:', error);
        openDownloadUrlInNewTab(true);
      }

    } catch (error) {
      console.error('Preview error:', error);
      notifications.show({
        title: 'Preview failed',
        message: 'Could not load preview. Try downloading instead.',
        color: 'red'
      });
    }
  };

  // 🔍 FIX 1: Extract onUpload function to useCallback to prevent excessive re-renders
  const handleUpload = useCallback(async (files: File[], metadata: { description?: string; tags?: string[] }) => {
    try {
      for (const file of files) {
        await uploadDocument(file, {
          description: metadata.description || '',
          tags: metadata.tags || [],
          // Note: projectIds and isExclusive not available in FileMetadata interface
          // If needed, extend FileMetadata interface to include these fields
        });
      }
      uploadModal.closeModal();
      notifications.show({
        title: 'Upload Successful',
        message: `Successfully uploaded ${files.length} file(s)`,
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Upload Failed',
        message: 'Failed to upload files. Please try again.',
        color: 'red'
      });
    }
  }, [uploadModal.closeModal, uploadDocument]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  // Sort and filter documents
  const sortedDocuments = useMemo(() => {
    if (!Array.isArray(documents)) return [];

    // Apply client-side filtering for "other" file types
    let filteredDocuments = documents;
    if (currentMimeType === 'other') {
      const specificTypes = ['application/pdf', 'image/', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      filteredDocuments = documents.filter(doc =>
        !specificTypes.some(type =>
          type.endsWith('/') ? doc.mimeType.startsWith(type) : doc.mimeType === type
        )
      );
    }

    const sorted = [...filteredDocuments].sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      if (sortField === 'fileSize') {
        aValue = a.fileSize || 0;
        bValue = b.fileSize || 0;
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [documents, sortField, sortOrder, currentMimeType]);

  const paginatedDocuments = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedDocuments.slice(start, end);
  }, [sortedDocuments, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedDocuments.length / itemsPerPage);

  // Loading state for initial data load
  if (isLoading && documents.length === 0) {
    return <LoadingState message="Loading documents..." />;
  }

  // Error state
  if (error) {
    return <ErrorState message={error instanceof Error ? error.message : String(error)} onRetry={loadDocuments} />;
  }

  return (
    <Container size="xl" py="md">
      <Grid>
        {/* Sidebar */}
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Stack gap="md">
            {/* Search */}
            <Paper p="md" withBorder>
              <Group mb="xs">
                <IconSearch size={16} />
                <Text fw={600} size="sm">Search Documents</Text>
              </Group>
              <TextInput
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => {
                  const newValue = e.currentTarget.value;
                  setSearchParams(prev => {
                    const newParams = new URLSearchParams(prev);
                    if (newValue) {
                      newParams.set('q', newValue);
                    } else {
                      newParams.delete('q');
                    }
                    return newParams;
                  });
                  setCurrentPage(1);
                }}
                leftSection={<IconSearch size={14} />}
              />
            </Paper>

            {/* File Type Filter */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">File Types</Text>
                <IconFolder size={16} />
              </Group>
              
              <Stack gap="xs">
                <Button
                  variant={!currentMimeType ? 'filled' : 'subtle'}
                  size="xs"
                  justify="space-between"
                  fullWidth
                  onClick={() => setMimeType(null)}
                >
                  <span>All Types</span>
                  <Badge size="xs" variant="light">{Array.isArray(documents) ? documents.length : 0}</Badge>
                </Button>
                
                {['application/pdf', 'image/', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'].map((type) => {
                  const documentsArray = Array.isArray(documents) ? documents : [];
                  const count = documentsArray.filter(doc =>
                    type.endsWith('/') ? doc.mimeType.startsWith(type) : doc.mimeType === type
                  ).length;
                  const label = type === 'application/pdf' ? 'PDF' :
                               type === 'image/' ? 'Images' :
                               type.includes('word') ? 'Word Docs' : 'Text Files';

                  return (
                    <Button
                      key={type}
                      variant={currentMimeType === type ? 'filled' : 'subtle'}
                      size="xs"
                      justify="space-between"
                      fullWidth
                      onClick={() => setMimeType(type)}
                    >
                      <span>{label}</span>
                      <Badge size="xs" variant="light">{count}</Badge>
                    </Button>
                  );
                })}

                {/* Other file types catch-all */}
                {(() => {
                  const documentsArray = Array.isArray(documents) ? documents : [];
                  const specificTypes = ['application/pdf', 'image/', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
                  const otherCount = documentsArray.filter(doc =>
                    !specificTypes.some(type =>
                      type.endsWith('/') ? doc.mimeType.startsWith(type) : doc.mimeType === type
                    )
                  ).length;

                  return (
                    <Button
                      variant={currentMimeType === 'other' ? 'filled' : 'subtle'}
                      size="xs"
                      justify="space-between"
                      fullWidth
                      onClick={() => setMimeType('other')}
                    >
                      <span>Other</span>
                      <Badge size="xs" variant="light">{otherCount}</Badge>
                    </Button>
                  );
                })()}
              </Stack>
            </Paper>

            {/* Archive & Favorite Toggles */}
            <Paper p="md" withBorder>
              <Stack gap="xs">
                <Button
                  variant={showArchived ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={<IconArchive size={14} />}
                  onClick={() => setShowArchived(!showArchived)}
                  fullWidth
                >
                  {showArchived ? 'Hide Archived' : 'Show Archived'}
                </Button>
                <Button
                  variant={showFavoritesOnly ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={<IconStar size={14} />}
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  fullWidth
                  color="yellow"
                >
                  {showFavoritesOnly ? 'Show All Documents' : 'Show Favorites Only'}
                </Button>
                <Button
                  variant={showProjectOnly ? 'filled' : 'subtle'}
                  size="xs"
                  onClick={() => setShowProjectOnly(!showProjectOnly)}
                  fullWidth
                >
                  {showProjectOnly ? 'Show Non-Project' : 'Show Project Documents'}
                </Button>
              </Stack>
            </Paper>
          </Stack>
        </Grid.Col>

        {/* Main Content */}
        <Grid.Col span={{ base: 12, md: 9 }}>
          <Stack gap="md">
            {/* Header */}
            <Group justify="space-between" align="center">
              <div>
                <Title order={2}>Documents</Title>
                <Text c="dimmed">
                  {sortedDocuments.length} {sortedDocuments.length === 1 ? 'document' : 'documents'}
                </Text>
              </div>
              
              <Group gap="xs">
                <ViewMenu 
                  currentView={viewMode}
                  onChange={(mode) => {
                    setViewMode(mode);
                    updatePreference('documents', mode);
                  }}
                  disabled={isLoading}
                />
                
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconRefresh size={16} />}
                  onClick={loadDocuments}
                  loading={isLoading}
                >
                  Refresh
                </Button>
                
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconFilter size={16} />}
                  onClick={handleOpenFilterModal}
                >
                  Filters
                </Button>
                <Button
                  variant="filled"
                  color="blue"
                  size="sm"
                  leftSection={<IconUpload size={16} />}
                  onClick={handleOpenUploadModal}
                >
                  Upload Document
                </Button>
              </Group>
            </Group>

            {/* Error Alert */}
            {error && (
              <Alert
                icon={<IconFilter size={16} />}
                title="Error"
                color="red"
                variant="light"
                withCloseButton
                onClose={clearError}
              >
                {error}
              </Alert>
            )}

            {/* Documents View */}
            <ViewModeLayouts
              items={paginatedDocuments}
              viewMode={viewMode}
              isLoading={isLoading}
              emptyMessage={
                searchQuery || currentMimeType || currentTag 
                  ? 'No documents found. Try adjusting your search or filters.'
                  : 'No documents yet. Upload your first document to get started.'
              }
              onItemClick={(document) => handlePreview(document)}
              renderSmallIcon={(document) => (
                <Stack gap={2} align="center">
                  {getFileIconComponent(document.mimeType, document.originalName)}
                  {document.isArchived && (
                    <Badge size="xs" color="orange" variant="dot">A</Badge>
                  )}
                </Stack>
              )}
              renderMediumIcon={(document) => (
                <Stack gap="xs" align="center" style={{ position: 'relative', width: '100%' }}>
                  <Group justify="flex-end" w="100%" gap={4} style={{ opacity: 0.9 }}>
                    {renderActionMenu(document, 'sm')}
                  </Group>
                  <div style={{ transform: 'scale(1.5)' }}>{getFileIconComponent(document.mimeType, document.originalName)}</div>
                  <Group gap={4}>
                    <Badge size="xs" variant="light" color="blue">
                      {formatFileSize(document.fileSize)}
                    </Badge>
                    {document.isArchived && (
                      <Badge size="xs" color="orange" variant="light">
                        Archived
                      </Badge>
                    )}
                  </Group>
                </Stack>
              )}
              renderListItem={(document) => (
                <Group justify="space-between" style={{ transition: 'background 120ms ease, box-shadow 120ms ease' }}>
                  <Group gap="md">
                    {getFileIconComponent(document.mimeType, document.originalName)}
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Text 
                          fw={600} 
                          size="sm" 
                          style={{ cursor: 'pointer', color: '#228be6' }}
                          onClick={() => handlePreview(document)}
                        >
                          {document.originalName}
                        </Text>
                        {document.isArchived && (
                          <Badge size="xs" color="orange" variant="light">
                            Archived
                          </Badge>
                        )}
                      </Group>
                      {document.description && (
                        <Text size="xs" c="dimmed" lineClamp={1}>{document.description}</Text>
                      )}
                      <Group gap="xs">
                        <Badge size="xs" variant="light" color="blue">
                          {formatFileSize(document.fileSize)}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {formatDate(document.updatedAt)}
                        </Text>
                        <ProjectBadges projects={document.projects || []} size="xs" maxVisible={2} />
                        {(document.tags ?? []).slice(0, 2).map((tag) => (
                          <Badge key={tag} size="xs" variant="dot" style={{ cursor: 'pointer' }} onClick={() => setTag(tag)}>
                            {tag}
                          </Badge>
                        ))}
                        {(document.tags ?? []).length > 2 && (
                          <Badge size="xs" variant="outline">+{(document.tags ?? []).length - 2}</Badge>
                        )}
                      </Group>
                    </Stack>
                  </Group>
                  {renderActionMenu(document)}
                </Group>
              )}
              renderDetailColumns={(document) => [
                <Group key="name" gap="xs">
                  {getFileIconComponent(document.mimeType, document.originalName)}
                  <Stack gap={2}>
                    <Text
                      fw={500}
                      size="sm"
                      style={{ cursor: 'pointer', color: '#228be6' }}
                      onClick={() => handlePreview(document)}
                    >
                      {document.originalName}
                    </Text>
                    {document.description && (
                      <Text size="xs" c="dimmed" lineClamp={1}>{document.description}</Text>
                    )}
                  </Stack>
                </Group>,
                <Group key="size" gap="xs">
                  <Badge size="xs" variant="light" color="blue">
                    {formatFileSize(document.fileSize)}
                  </Badge>
                </Group>,
                <Group key="type" gap={6}>
                  {getFileIconComponent(document.mimeType, document.originalName)}
                  <Text size="sm" c="dimmed">{getFileTypeLabel(document.mimeType, document.originalName)}</Text>
                </Group>,
                <Group key="tags" gap={4}>
                  <ProjectBadges projects={document.projects || []} size="xs" maxVisible={3} />
                  {(document.tags ?? []).slice(0, 3).map((tag) => (
                    <Badge key={tag} size="xs" variant="dot" style={{ cursor: 'pointer' }} onClick={() => setTag(tag)}>
                      {tag}
                    </Badge>
                  ))}
                  {(document.tags ?? []).length > 3 && (
                    <Tooltip label={`${(document.tags ?? []).length - 3} more tags`}>
                      <Badge size="xs" variant="outline">+{(document.tags ?? []).length - 3}</Badge>
                    </Tooltip>
                  )}
                </Group>,
                <Text key="created" size="xs" c="dimmed">
                  {formatDate(document.createdAt)}
                </Text>,
                <Text key="updated" size="xs" c="dimmed">
                  {formatDate(document.updatedAt)}
                </Text>,
                <Group key="status" gap="xs">
                  {document.isArchived && (
                    <Badge size="xs" color="orange" variant="light">
                      Archived
                    </Badge>
                  )}
                  {/* upload_status field removed - backend no longer tracks upload status */}
                  {document.isFavorite && (
                    <Badge size="xs" variant="light" color="pink">Favorite</Badge>
                  )}
                </Group>,
                <div key="actions" onClick={(e) => e.stopPropagation()}>
                  {renderActionMenu(document, 'sm')}
                </div>
              ]}
              detailHeaders={[
                'Name', 
                'Size', 
                'Type', 
                'Tags', 
                'Created', 
                'Updated', 
                'Status', 
                'Actions'
              ]}
            />

            {/* Pagination */}
            {!isLoading && paginatedDocuments.length > 0 && totalPages > 1 && (
              <Group justify="center">
                <Pagination
                  value={currentPage}
                  onChange={setCurrentPage}
                  total={totalPages}
                  size="sm"
                />
              </Group>
            )}

            {/* Empty State Actions */}
            {!isLoading && paginatedDocuments.length === 0 && (
              <Group justify="center" mt="md">
                <Button
                  leftSection={<IconUpload size={16} />}
                  onClick={handleOpenUploadModal}
                >
                  Upload Document
                </Button>
              </Group>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      {/* Image Preview Modal */}
      <Modal
        opened={imagePreviewModal.isOpen}
        onClose={handleCloseImagePreview}
        title={
          imagePreviewModal.selectedItem ? (
            <Group gap={8} justify="space-between">
              <Group gap={8}>
                {getFileIconComponent('image/', imagePreviewModal.selectedItem.name)}
                <Text>{imagePreviewModal.selectedItem.name || 'Image'}</Text>
              </Group>
              <Group gap="xs">
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconExternalLink size={14} />}
                  onClick={() => {
                    if (imagePreviewModal.selectedItem) {
                      // Find the original file by name
                      const originalFile = documents.find(f => f.originalName === imagePreviewModal.selectedItem?.name);
                      if (originalFile) {
                        handlePreview(originalFile, true);
                      }
                    }
                  }}
                >
                  Open in New Tab
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftSection={<IconDownload size={14} />}
                  onClick={() => {
                    if (imagePreviewModal.selectedItem) {
                      const originalFile = documents.find(f => f.originalName === imagePreviewModal.selectedItem?.name);
                      if (originalFile) {
                        handleDownloadFile(originalFile);
                      }
                    }
                  }}
                >
                  Download
                </Button>
              </Group>
            </Group>
          ) : 'Image'
        }
        size="auto"
        centered
        overlayProps={{ opacity: 0.55, blur: 3 }}
      >
        {imagePreviewModal.selectedItem && (
          <div style={{ maxWidth: '90vw', maxHeight: '80vh' }}>
            <img
              src={imagePreviewModal.selectedItem.url}
              alt={imagePreviewModal.selectedItem.name}
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }}
            />
          </div>
        )}
      </Modal>

      {/* Upload Modal */}
      <FileUploadModalMemo
        opened={uploadModal.isOpen}
        onClose={uploadModal.closeModal}
        onUpload={handleUpload}
        multiple={true}
        loading={isUploading}
      />

      {/* Modular Filter Modal */}
      <Modal
        opened={filterModal.isOpen}
        onClose={filterModal.closeModal}
        title="Document Filters & Sorting"
        size="lg"
      >
        <ModuleFilters
          filters={filters}
          onFiltersChange={setFilters}
          activeFiltersCount={Object.values(filters).filter(v => Array.isArray(v) ? v.length > 0 : v !== false && v !== 'all' && v !== 'updatedAt' && v !== 'desc').length}
          showFavorites={filterConfig.showFavorites}
          showMimeTypes={filterConfig.showMimeTypes}
          showDateRange={filterConfig.showDateRange}
          showArchived={filterConfig.showArchived}
          showSorting={filterConfig.showSorting}
          customFilters={filterConfig.customFilters}
          sortOptions={filterConfig.sortOptions}
        />
      </Modal>

      {/* Content Modal for text files and PDFs */}
      <Modal
        opened={contentModal.isOpen}
        onClose={contentModal.closeModal}
        size="xl"
        title={
          contentModal.selectedItem ? (
            <Group gap={8} justify="space-between">
              <Group gap={8}>
                <Text fw={600}>
                  {contentModal.selectedItem.file.originalName}
                </Text>
                <Badge size="sm" variant="light" color="blue">
                  Read-Only
                </Badge>
              </Group>
              <Group gap="xs">
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconExternalLink size={14} />}
                  onClick={() => {
                    if (contentModal.selectedItem?.file) {
                      handlePreview(contentModal.selectedItem.file, true);
                    }
                  }}
                >
                  Open in New Tab
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftSection={<IconDownload size={14} />}
                  onClick={() => {
                    if (contentModal.selectedItem?.file) {
                      handleDownloadFile(contentModal.selectedItem.file);
                    }
                  }}
                >
                  Download
                </Button>
              </Group>
            </Group>
          ) : 'File Preview'
        }
      >
        {contentModal.selectedItem && (
          <>
            {contentModal.modalData?.pdfUrl ? (
              // PDF preview with iframe
              <div style={{
                width: '100%',
                height: '70vh',
                border: '1px solid #e9ecef',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                <iframe
                  src={contentModal.modalData.pdfUrl}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none'
                  }}
                  title={contentModal.selectedItem.file.originalName}
                  onLoad={() => console.log('🔍 DEBUG: Iframe loaded successfully:', contentModal.modalData.pdfUrl)}
                  onError={() => {
                    console.error('🔍 DEBUG: Iframe failed to load:', contentModal.modalData.pdfUrl);
                    console.log('🔍 DEBUG: Falling back to new tab for document');
                    handlePreview(contentModal.selectedItem.file, true); // Open in new tab as fallback
                  }}
                />
              </div>
            ) : (
              // Text content preview
              <div style={{
                maxHeight: '70vh',
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '14px',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                backgroundColor: '#f8f9fa',
                padding: '20px',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
              }}>
                {contentModal.modalData?.content || 'No content available'}
              </div>
            )}
          </>
        )}
      </Modal>
    </Container>
  );
}

export default DocumentsPage;
