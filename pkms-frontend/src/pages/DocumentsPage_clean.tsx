import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Container,
  Grid,
  Card,
  Title,
  Text,
  Group,
  Stack,
  Button,
  TextInput,
  TagsInput,
  Badge,
  ActionIcon,
  Menu,
  Skeleton,
  Alert,
  Pagination,
  Paper,
  ThemeIcon,
  FileInput,
  Progress,
  Modal,
  Tooltip
} from '@mantine/core';
import ViewMenu, { ViewMode } from '../components/common/ViewMenu';
import ViewModeLayouts, { formatDate, formatFileSize } from '../components/common/ViewModeLayouts';
import {
  IconUpload,
  IconSearch,
  IconFilter,
  IconSortAscending,
  IconSortDescending,
  IconEye,
  IconDownload,
  IconTrash,
  IconDots,
  IconFiles,
  IconFolder,
  IconArchive,
  IconArchiveOff
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { searchService } from '../services/searchService';
import { useDocumentsStore } from '../stores/documentsStore';

type SortField = 'original_name' | 'file_size' | 'created_at' | 'updated_at';
type SortOrder = 'asc' | 'desc';

// File icon utility function
const getFileIcon = (mimeType: string): string => {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📋';
  if (mimeType === 'text/plain') return '📄';
  if (mimeType.startsWith('video/')) return '🎥';
  if (mimeType.startsWith('audio/')) return '🎵';
  return '📎';
};

export default function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('medium-icons');
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
    clearError
  } = useDocumentsStore();

  const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);

  useEffect(() => {
    setSearch(debouncedSearchQuery);
  }, [debouncedSearchQuery, setSearch]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

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
      await uploadDocument(uploadFile, uploadTags);
      
      notifications.show({
        title: 'Upload Successful',
        message: `${uploadFile.name} has been uploaded successfully`,
        color: 'green'
      });
      
      // Close modal and reset form
      setUploadModalOpen(false);
      setUploadFile(null);
      setUploadTags([]);
      
      // Refresh documents list
      await loadDocuments();
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

  const handleToggleArchive = async (uuid: string, isArchived: boolean) => {
    await toggleArchive(uuid);
    notifications.show({
      title: isArchived ? 'Document Unarchived' : 'Document Archived',
      message: `Document has been ${isArchived ? 'unarchived' : 'archived'} successfully`,
      color: 'blue'
    });
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
      
      if (sortField === 'file_size') {
        aValue = a.file_size || 0;
        bValue = b.file_size || 0;
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
                    type.endsWith('/') ? doc.mime_type.startsWith(type) : doc.mime_type === type
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

            {/* Archive Toggle */}
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
                  onChange={setViewMode}
                  disabled={isLoading}
                />
                
                <Button
                  variant={sortField === 'original_name' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'original_name' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('original_name')}
                >
                  Name
                </Button>
                <Button
                  variant={sortField === 'file_size' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'file_size' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('file_size')}
                >
                  Size
                </Button>
                <Button
                  variant={sortField === 'updated_at' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'updated_at' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('updated_at')}
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
              onItemClick={(document) => previewDocument(document.uuid)}
              renderSmallIcon={(document) => (
                <Stack gap={2} align="center">
                  <Text size="lg">{getFileIcon(document.mime_type)}</Text>
                  {document.is_archived && (
                    <Badge size="xs" color="orange" variant="dot">A</Badge>
                  )}
                </Stack>
              )}
              renderMediumIcon={(document) => (
                <Stack gap="xs" align="center">
                  <Text size="xl">{getFileIcon(document.mime_type)}</Text>
                  <Group gap={4}>
                    <Badge size="xs" variant="light" color="blue">
                      {formatFileSize(document.file_size)}
                    </Badge>
                    {document.is_archived && (
                      <Badge size="xs" color="orange" variant="light">
                        Archived
                      </Badge>
                    )}
                  </Group>
                </Stack>
              )}
              renderListItem={(document) => (
                <Group justify="space-between">
                  <Group gap="md">
                    <Text size="lg">{getFileIcon(document.mime_type)}</Text>
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Text 
                          fw={600} 
                          size="sm" 
                          style={{ cursor: 'pointer', color: '#228be6' }}
                          onClick={() => previewDocument(document.uuid)}
                        >
                          {document.original_name}
                        </Text>
                        {document.is_archived && (
                          <Badge size="xs" color="orange" variant="light">
                            Archived
                          </Badge>
                        )}
                      </Group>
                      <Group gap="xs">
                        <Badge size="xs" variant="light" color="blue">
                          {formatFileSize(document.file_size)}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {formatDate(document.updated_at)}
                        </Text>
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
                  <Menu shadow="md" width={200}>
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray">
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item 
                        leftSection={<IconEye size={14} />}
                        onClick={() => previewDocument(document.uuid)}
                      >
                        Preview
                      </Menu.Item>
                      <Menu.Item 
                        leftSection={<IconDownload size={14} />}
                        onClick={() => downloadDocument(document.uuid)}
                      >
                        Download
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item 
                        leftSection={document.is_archived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                        onClick={() => handleToggleArchive(document.uuid, document.is_archived)}
                      >
                        {document.is_archived ? 'Unarchive' : 'Archive'}
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item 
                        leftSection={<IconTrash size={14} />}
                        color="red"
                        onClick={() => handleDeleteDocument(document.uuid, document.original_name)}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              )}
              renderDetailColumns={(document) => [
                <Group key="name" gap="xs">
                  <Text size="sm">{getFileIcon(document.mime_type)}</Text>
                  <Text 
                    fw={500} 
                    size="sm" 
                    style={{ cursor: 'pointer', color: '#228be6' }}
                    onClick={() => previewDocument(document.uuid)}
                  >
                    {document.original_name}
                  </Text>
                </Group>,
                <Group key="size" gap="xs">
                  <Badge size="xs" variant="light" color="blue">
                    {formatFileSize(document.file_size)}
                  </Badge>
                </Group>,
                <Text key="type" size="sm" c="dimmed">
                  {document.mime_type.split('/')[1]?.toUpperCase() || 'FILE'}
                </Text>,
                <Group key="tags" gap={4}>
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
                  {formatDate(document.created_at)}
                </Text>,
                <Text key="updated" size="xs" c="dimmed">
                  {formatDate(document.updated_at)}
                </Text>,
                <Group key="status" gap="xs">
                  {document.is_archived && (
                    <Badge size="xs" color="orange" variant="light">
                      Archived
                    </Badge>
                  )}
                </Group>,
                <Menu key="actions" shadow="md" width={200}>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" size="sm">
                      <IconDots size={14} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item 
                      leftSection={<IconEye size={14} />}
                      onClick={() => previewDocument(document.uuid)}
                    >
                      Preview
                    </Menu.Item>
                    <Menu.Item 
                      leftSection={<IconDownload size={14} />}
                      onClick={() => downloadDocument(document.uuid)}
                    >
                      Download
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item 
                      leftSection={document.is_archived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                      onClick={() => handleToggleArchive(document.uuid, document.is_archived)}
                    >
                      {document.is_archived ? 'Unarchive' : 'Archive'}
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item 
                      leftSection={<IconTrash size={14} />}
                      color="red"
                      onClick={() => handleDeleteDocument(document.uuid, document.original_name)}
                    >
                      Delete
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
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

      {/* Upload Modal */}
      <Modal
        opened={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Upload Document"
        size="md"
      >
        <Stack gap="md">
          <FileInput
            label="Select File"
            placeholder="Choose a file to upload"
            value={uploadFile}
            onChange={setUploadFile}
            accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.gif,.webp"
          />
          
          <TagsInput
            label="Tags"
            placeholder="Type to search and add tags"
            value={uploadTags}
            onChange={setUploadTags}
            data={tagSuggestions}
            clearable
            onSearchChange={handleTagSearch}
            splitChars={[',', ' ']}
            description="Add tags separated by comma or space. Start typing to see suggestions."
          />

          {isUploading && uploadProgress !== null && (
            <div style={{ position: 'relative' }}>
              <Progress 
                value={uploadProgress} 
                size="lg" 
                radius="xl"
                style={{ position: 'relative' }}
              />
              <Text size="xs" ta="center" style={{ position: 'absolute', width: '100%', top: 0, left: 0 }}>
                {uploadProgress}%
              </Text>
            </div>
          )}
          
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => setUploadModalOpen(false)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              loading={isUploading}
              disabled={!uploadFile}
            >
              Upload
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
