import { useEffect, useState, useMemo } from 'react';
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
import ViewModeLayouts, { formatDate, formatFileSize } from '../components/common/ViewModeLayouts';
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
  IconStar
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { searchService } from '../services/searchService';
import { useDocumentsStore } from '../stores/documentsStore';
import { ActionMenu } from '../components/common/ActionMenu';
import { FileUploadModal } from '../components/file/FileUploadModal';

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
  const [currentPage, setCurrentPage] = useState(1);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [uploadProjectIds, setUploadProjectIds] = useState<string[]>([]);
  const [uploadIsExclusive, setUploadIsExclusive] = useState(false);
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
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);

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
    loadDocuments();
  }, [loadDocuments]);

  // Reload documents when the page becomes visible again (fixes minimize/restore issue)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Page became visible, reload documents to ensure fresh data
        // Page became visible, reloading documents for fresh data
        loadDocuments();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also handle window focus as a backup
    const handleWindowFocus = () => {
      // Window focused, reloading documents for fresh data
      loadDocuments();
    };
    
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [loadDocuments]);

  // Revoke object URL on unmount or when changing image
  useEffect(() => {
    return () => {
      if (imagePreview?.url) {
        try { URL.revokeObjectURL(imagePreview.url); } catch {}
      }
    };
  }, [imagePreview]);

  // Auto-open upload modal when navigated with ?action=upload
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'upload') {
      setUploadModalOpen(true);
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('action');
      setSearchParams(newParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  const handleUpload = async () => {
    if (!uploadFile) return;
    
    try {
      const uploadedDoc = await uploadDocument(uploadFile, uploadTags, uploadProjectIds, uploadIsExclusive);
      
      // Guard against null upload result
      if (!uploadedDoc) {
        notifications.show({
          title: 'Upload Failed',
          message: `Failed to upload ${uploadFile.name}. Please try again.`,
          color: 'red'
        });
        return;
      }
      
      // Get fresh store state to check visibility (avoid stale closure)
      const currentDocuments = useDocumentsStore.getState().documents;
      const isInList = currentDocuments.some(doc => doc.uuid === uploadedDoc.uuid);
      
      if (isInList) {
        notifications.show({
          title: 'Upload Successful',
          message: `${uploadFile.name} has been uploaded successfully`,
          color: 'green'
        });
      } else {
        // Document uploaded but not visible due to filters
        notifications.show({
          title: 'Upload Successful',
          message: `${uploadFile.name} uploaded, but not visible due to current filters. Clear filters to see it.`,
          color: 'blue',
          autoClose: 7000
        });
      }
      
      // Close modal and reset form only after successful upload
      setUploadModalOpen(false);
      setUploadFile(null);
      setUploadTags([]);
      setUploadProjectIds([]);
      setUploadIsExclusive(false);
    } catch (error) {
      console.error('Upload failed:', error);
      notifications.show({
        title: 'Upload Failed',
        message: error instanceof Error ? error.message : 'Failed to upload document',
        color: 'red'
      });
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
          label: 'Preview',
          icon: <IconEye size={14} />,
          onClick: () => handlePreview(document)
        }
      ]}
    />
  );

  // Handle preview: inline modal for images, fallback to existing behavior
  const handlePreview = async (doc: any) => {
    try {
      if (typeof doc?.mimeType === 'string' && doc.mimeType.startsWith('image/')) {
        const blob = await downloadDocument(doc.uuid);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setImagePreview({ url, name: doc.originalName || 'image' });
        return;
      }
      // Non-images: keep existing open-in-new-tab behavior
      previewDocument(doc.uuid);
    } catch {
      notifications.show({ title: 'Preview failed', message: 'Could not load preview. Try downloading instead.', color: 'red' });
    }
  };

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
    
    const sorted = [...documents].sort((a, b) => {
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
  }, [documents, sortField, sortOrder]);

  const paginatedDocuments = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedDocuments.slice(start, end);
  }, [sortedDocuments, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedDocuments.length / itemsPerPage);

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
                  variant={sortField === 'originalName' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'originalName' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('originalName')}
                >
                  Name
                </Button>
                <Button
                  variant={sortField === 'fileSize' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'fileSize' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('fileSize')}
                >
                  Size
                </Button>
                <Button
                  variant={sortField === 'updatedAt' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'updatedAt' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('updatedAt')}
                >
                  Date
                </Button>
                <Button
                  leftSection={<IconUpload size={14} />}
                  onClick={() => setUploadModalOpen(true)}
                  size="xs"
                >
                  Upload
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
                  <Text size="lg">{getFileIcon(document.mimeType, document.originalName)}</Text>
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
                  <Text size="xl">{getFileIcon(document.mimeType, document.originalName)}</Text>
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
                    <Text size="lg">{getFileIcon(document.mimeType, document.originalName)}</Text>
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
                        {document.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} size="xs" variant="dot" style={{ cursor: 'pointer' }} onClick={() => setTag(tag)}>
                            {tag}
                          </Badge>
                        ))}
                        {document.tags.length > 2 && (
                          <Badge size="xs" variant="outline">+{document.tags.length - 2}</Badge>
                        )}
                      </Group>
                    </Stack>
                  </Group>
                  {renderActionMenu(document)}
                </Group>
              )}
              renderDetailColumns={(document) => [
                <Group key="name" gap="xs">
                  <Text size="sm">{getFileIcon(document.mimeType, document.originalName)}</Text>
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
                  <Text size="sm">{getFileIcon(document.mimeType, document.originalName)}</Text>
                  <Text size="sm" c="dimmed">{getFileTypeLabel(document.mimeType, document.originalName)}</Text>
                </Group>,
                <Group key="tags" gap={4}>
                  <ProjectBadges projects={document.projects || []} size="xs" maxVisible={3} />
                  {document.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} size="xs" variant="dot" style={{ cursor: 'pointer' }} onClick={() => setTag(tag)}>
                      {tag}
                    </Badge>
                  ))}
                  {document.tags.length > 3 && (
                    <Tooltip label={`${document.tags.length - 3} more tags`}>
                      <Badge size="xs" variant="outline">+{document.tags.length - 3}</Badge>
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
                  onClick={() => setUploadModalOpen(true)}
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
        opened={!!imagePreview}
        onClose={() => {
          if (imagePreview?.url) {
            try { URL.revokeObjectURL(imagePreview.url); } catch {}
          }
          setImagePreview(null);
        }}
         title={
           imagePreview ? (
             <Group gap={8}>
               <Text>{getFileIcon('image/', imagePreview.name)}</Text>
               <Text>{imagePreview.name || 'Image'}</Text>
             </Group>
           ) : 'Image'
         }
        size="auto"
        centered
        overlayProps={{ opacity: 0.55, blur: 3 }}
      >
        {imagePreview && (
          <div style={{ maxWidth: '90vw', maxHeight: '80vh' }}>
            <img
              src={imagePreview.url}
              alt={imagePreview.name}
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8 }}
            />
          </div>
        )}
      </Modal>

      {/* Upload Modal */}
      <FileUploadModal
        opened={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUpload={async (files, metadata) => {
          try {
            for (const file of files) {
              await uploadDocument(file, metadata.tags || [], uploadProjectIds, uploadIsExclusive);
            }
            setUploadModalOpen(false);
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
        }}
        multiple={true}
      />
    </Container>
  );
}

export default DocumentsPage;
