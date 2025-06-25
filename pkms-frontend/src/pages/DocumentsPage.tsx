import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  Modal
} from '@mantine/core';
import {
  IconUpload,
  IconSearch,
  IconFilter,
  IconSortAscending,
  IconSortDescending,
  IconArchive,
  IconArchiveOff,
  IconDownload,
  IconTrash,
  IconDots,
  IconFiles,
  IconFolder,
  IconTag,
  IconAlertTriangle,
  IconX
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useDocumentsStore } from '../stores/documentsStore';
import { documentsService } from '../services/documentsService';

type SortField = 'original_name' | 'created_at' | 'updated_at' | 'size_bytes';
type SortOrder = 'asc' | 'desc';

export function DocumentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Local state
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTags, setUploadTags] = useState<string>('');
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
    setMimeType,
    setTag,
    setSearch,
    setShowArchived,
    clearError
  } = useDocumentsStore();

  // Load data on mount
  useEffect(() => {
    loadDocuments();
  }, []);

  // Update search in store when debounced value changes
  useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch]);

  // Sorted and paginated documents
  const sortedDocuments = useMemo(() => {
    const sorted = [...documents].sort((a, b) => {
      let aValue: string | number = a[sortField];
      let bValue: string | number = b[sortField];
      
      if (sortField.includes('_at')) {
        aValue = new Date(aValue as string).getTime();
        bValue = new Date(bValue as string).getTime();
      } else if (sortField === 'size_bytes') {
        aValue = Number(aValue);
        bValue = Number(bValue);
      } else if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = (bValue as string).toLowerCase();
      }
      
      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
    
    return sorted;
  }, [documents, sortField, sortOrder]);

  const paginatedDocuments = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return sortedDocuments.slice(start, end);
  }, [sortedDocuments, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedDocuments.length / itemsPerPage);

  const handleDeleteDocument = async (uuid: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      await deleteDocument(uuid);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    
    const tags = uploadTags.split(',').map(tag => tag.trim()).filter(tag => tag);
    const success = await uploadDocument(uploadFile, tags);
    
    if (success) {
      setUploadModalOpen(false);
      setUploadFile(null);
      setUploadTags('');
    }
  };

  const handleDownload = async (uuid: string, filename: string) => {
    const blob = await downloadDocument(uuid);
    if (blob) {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType === 'text/plain') return '📋';
    return '📎';
  };

  return (
    <Container size="xl">
      <Grid>
        {/* Sidebar */}
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Stack gap="md">
            {/* Upload Button */}
            <Button
              leftSection={<IconUpload size={16} />}
              size="md"
              onClick={() => setUploadModalOpen(true)}
              fullWidth
            >
              Upload Document
            </Button>

            {/* Search */}
            <TextInput
              placeholder="Search documents..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
            />

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
                  <Badge size="xs" variant="light">{documents.length}</Badge>
                </Button>
                
                {['application/pdf', 'image/', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'].map((type) => {
                  const count = documents.filter(doc => 
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

            {/* Filters */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">Filters</Text>
                <IconFilter size={16} />
              </Group>
              
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
                <Button
                  variant={sortField === 'original_name' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'original_name' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('original_name')}
                >
                  Name
                </Button>
                <Button
                  variant={sortField === 'updated_at' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'updated_at' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('updated_at')}
                >
                  Updated
                </Button>
                <Button
                  variant={sortField === 'size_bytes' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortField === 'size_bytes' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => handleSort('size_bytes')}
                >
                  Size
                </Button>
              </Group>
            </Group>

            {/* Error Alert */}
            {error && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                title="Error"
                color="red"
                variant="light"
                withCloseButton
                onClose={clearError}
              >
                {error}
              </Alert>
            )}

            {/* Loading State */}
            {isLoading && (
              <Stack gap="md">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} height={120} radius="md" />
                ))}
              </Stack>
            )}

            {/* Documents Grid */}
            {!isLoading && paginatedDocuments.length > 0 && (
              <>
                <Grid>
                  {paginatedDocuments.map((document) => (
                    <Grid.Col span={{ base: 12, sm: 6, lg: 4 }} key={document.uuid}>
                      <Card 
                        shadow="sm" 
                        padding="md" 
                        radius="md" 
                        withBorder
                        style={{ cursor: 'pointer', transition: 'transform 0.2s ease' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                      >
                        <Group justify="space-between" align="flex-start" mb="xs">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Group gap="xs" mb="xs">
                              <Text>{getFileIcon(document.mime_type)}</Text>
                              <Text fw={600} size="sm" truncate>{document.original_name}</Text>
                            </Group>
                            <Group gap="xs">
                              <Badge variant="light" color="blue" size="sm">
                                {formatFileSize(document.size_bytes)}
                              </Badge>
                              {document.is_archived && (
                                <Badge variant="light" color="gray" size="sm">
                                  Archived
                                </Badge>
                              )}
                            </Group>
                          </div>
                          
                          <Menu withinPortal position="bottom-end">
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray">
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            
                            <Menu.Dropdown>
                              <Menu.Item 
                                leftSection={<IconDownload size={14} />}
                                onClick={() => handleDownload(document.uuid, document.original_name)}
                              >
                                Download
                              </Menu.Item>
                              <Menu.Item 
                                leftSection={document.is_archived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                                onClick={() => toggleArchive(document.uuid, !document.is_archived)}
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
                        
                        <Text size="sm" c="dimmed" lineClamp={3}>
                          {document.preview || 'No preview available'}
                        </Text>
                        
                        <Group justify="space-between" mt="md">
                          <Group gap="xs">
                            {document.tags.slice(0, 3).map((tag: string) => (
                              <Badge 
                                key={tag} 
                                variant="dot" 
                                size="sm"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setTag(tag)}
                              >
                                {tag}
                              </Badge>
                            ))}
                            {document.tags.length > 3 && (
                              <Badge variant="dot" size="sm" color="gray">
                                +{document.tags.length - 3}
                              </Badge>
                            )}
                          </Group>
                          
                          <Text size="xs" c="dimmed">
                            {formatDate(document.updated_at)}
                          </Text>
                        </Group>
                      </Card>
                    </Grid.Col>
                  ))}
                </Grid>

                {/* Pagination */}
                {totalPages > 1 && (
                  <Group justify="center">
                    <Pagination
                      value={currentPage}
                      onChange={setCurrentPage}
                      total={totalPages}
                      size="sm"
                    />
                  </Group>
                )}
              </>
            )}

            {/* Empty State */}
            {!isLoading && paginatedDocuments.length === 0 && (
              <Paper p="xl" radius="md" style={{ textAlign: 'center' }}>
                <ThemeIcon size="xl" variant="light" color="gray" mx="auto" mb="md">
                  <IconFiles size={32} />
                </ThemeIcon>
                <Title order={3} mb="xs">
                  {searchQuery || currentMimeType || currentTag ? 'No documents found' : 'No documents yet'}
                </Title>
                <Text c="dimmed" mb="lg">
                  {searchQuery || currentMimeType || currentTag 
                    ? 'Try adjusting your search or filters'
                    : 'Upload your first document to get started'
                  }
                </Text>
                <Button
                  leftSection={<IconUpload size={16} />}
                  onClick={() => setUploadModalOpen(true)}
                >
                  Upload Document
                </Button>
              </Paper>
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
          
          <TextInput
            label="Tags (comma separated)"
            placeholder="work, important, project"
            value={uploadTags}
            onChange={(e) => setUploadTags(e.currentTarget.value)}
          />
          
          {isUploading && (
            <Progress value={uploadProgress} label={`${uploadProgress}%`} />
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