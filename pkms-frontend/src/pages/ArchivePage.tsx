import { useEffect, useState, useMemo } from 'react';
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
  Paper,
  ThemeIcon,
  Modal,
  FileInput,
  Textarea,
  Breadcrumbs,
  Anchor,
  Checkbox,
  Progress,
  Switch
} from '@mantine/core';
import {
  IconFolder,
  IconFolderPlus,
  IconUpload,
  IconSearch,
  IconFilter,
  IconGrid3x3,
  IconList,
  IconTree,
  IconSortAscending,
  IconSortDescending,
  IconEdit,
  IconTrash,
  IconDots,
  IconDownload,
  IconArchive,
  IconArchiveOff,
  IconStar,
  IconStarFilled,
  IconAlertTriangle,
  IconHome,
  IconFile,
  IconPhoto,
  IconFileText,
  IconVideo,
  IconMusic,
  IconFileZip,
  IconCode
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useArchiveStore } from '../stores/archiveStore';
import { archiveService, ArchiveFolder, ArchiveItemSummary } from '../services/archiveService';

export function ArchivePage() {
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ArchiveFolder | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadTags, setUploadTags] = useState<string>('');

  // Folder form state
  const [folderForm, setFolderForm] = useState({
    name: '',
    description: ''
  });

  // Store state
  const {
    folders,
    currentFolder,
    items,
    breadcrumb,
    isLoading,
    isUploadingItems,
    uploadProgress,
    error,
    currentFolderUuid,
    currentSearch,
    currentMimeType,
    currentTag,
    showArchived,
    selectedItems,
    viewMode,
    sortBy,
    sortOrder,
    
    loadFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    loadFolderItems,
    uploadItems,
    updateItem,
    deleteItem,
    downloadItem,
    navigateToFolder,
    
    setCurrentSearch,
    setCurrentMimeType,
    setCurrentTag,
    setShowArchived,
    toggleItemSelection,
    selectAllItems,
    clearSelection,
    setViewMode,
    setSortBy,
    clearError
  } = useArchiveStore();

  // Load initial data
  useEffect(() => {
    loadFolders();
  }, []);

  // Update search when debounced value changes
  useEffect(() => {
    setCurrentSearch(debouncedSearch);
  }, [debouncedSearch, setCurrentSearch]);

  const resetFolderForm = () => {
    setFolderForm({ name: '', description: '' });
    setEditingFolder(null);
  };

  const handleCreateFolder = async () => {
    if (!folderForm.name.trim()) return;
    
    const success = await createFolder(
      folderForm.name,
      folderForm.description || undefined,
      currentFolderUuid || undefined
    );
    
    if (success) {
      setFolderModalOpen(false);
      resetFolderForm();
    }
  };

  const handleUpdateFolder = async () => {
    if (!editingFolder || !folderForm.name.trim()) return;
    
    const success = await updateFolder(editingFolder.uuid, {
      name: folderForm.name,
      description: folderForm.description || undefined
    });
    
    if (success) {
      setFolderModalOpen(false);
      resetFolderForm();
      // Reload current view
      if (currentFolderUuid) {
        loadFolderItems(currentFolderUuid);
      } else {
        loadFolders();
      }
    }
  };

  const handleDeleteFolder = async (folder: ArchiveFolder) => {
    const hasContent = folder.item_count > 0 || folder.subfolder_count > 0;
    const confirmMessage = hasContent 
      ? `"${folder.name}" contains ${folder.item_count} items and ${folder.subfolder_count} folders. This will delete everything. Are you sure?`
      : `Are you sure you want to delete folder "${folder.name}"?`;
    
    if (window.confirm(confirmMessage)) {
      const success = await deleteFolder(folder.uuid, hasContent);
      if (success && currentFolderUuid) {
        loadFolderItems(currentFolderUuid);
      } else if (success) {
        loadFolders();
      }
    }
  };

  const handleUploadFiles = async () => {
    if (!selectedFiles.length || !currentFolderUuid) return;
    
    const tags = uploadTags.split(',').map((tag: string) => tag.trim()).filter((tag) => tag);
    const success = await uploadItems(currentFolderUuid, selectedFiles, tags);
    
    if (success) {
      setUploadModalOpen(false);
      setSelectedFiles([]);
      setUploadTags('');
    }
  };

  const handleDeleteItem = async (item: ArchiveItemSummary) => {
    if (window.confirm(`Are you sure you want to delete "${item.name}"?`)) {
      await deleteItem(item.uuid);
    }
  };

  const handleDownloadItem = async (item: ArchiveItemSummary) => {
    await downloadItem(item.uuid, item.original_filename);
  };

  const handleFolderClick = (folder: ArchiveFolder) => {
    navigateToFolder(folder.uuid);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === 0) {
      // Navigate to root
      loadFolders();
    } else {
      const folder = breadcrumb[index];
      navigateToFolder(folder.uuid);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <IconPhoto size={20} />;
    if (mimeType === 'application/pdf') return <IconFileText size={20} />;
    if (mimeType.startsWith('video/')) return <IconVideo size={20} />;
    if (mimeType.startsWith('audio/')) return <IconMusic size={20} />;
    if (mimeType.includes('zip') || mimeType.includes('tar')) return <IconFileZip size={20} />;
    if (mimeType.includes('javascript') || mimeType.includes('python')) return <IconCode size={20} />;
    return <IconFile size={20} />;
  };

  const formatFileSize = (bytes: number) => {
    return archiveService.formatFileSize(bytes);
  };

  const formatDate = (dateString: string) => {
    return archiveService.formatDate(dateString);
  };

  // Sort items
  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      let aValue: string | number = a[sortBy];
      let bValue: string | number = b[sortBy];
      
      if (sortBy.includes('_at')) {
        aValue = new Date(aValue as string).getTime();
        bValue = new Date(bValue as string).getTime();
      } else if (sortBy === 'file_size') {
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
  }, [items, sortBy, sortOrder]);

  // Sort folders
  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => a.name.localeCompare(b.name));
  }, [folders]);

  return (
    <Container size="xl">
      <Grid>
        {/* Sidebar */}
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Stack gap="md">
            {/* Quick Actions */}
            <Stack gap="xs">
              <Button
                leftSection={<IconFolderPlus size={16} />}
                size="md"
                onClick={() => setFolderModalOpen(true)}
                fullWidth
              >
                New Folder
              </Button>
              {currentFolderUuid && (
                <Button
                  leftSection={<IconUpload size={16} />}
                  size="sm"
                  variant="light"
                  onClick={() => setUploadModalOpen(true)}
                  fullWidth
                >
                  Upload Files
                </Button>
              )}
            </Stack>

            {/* Search */}
            <TextInput
              placeholder="Search archive..."
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
            />

            {/* File Type Filter */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">File Types</Text>
                <IconFilter size={16} />
              </Group>
              
              <Stack gap="xs">
                <Button
                  variant={!currentMimeType ? 'filled' : 'subtle'}
                  size="xs"
                  justify="space-between"
                  fullWidth
                  onClick={() => setCurrentMimeType(null)}
                >
                  <span>All Types</span>
                  <Badge size="xs" variant="light">{items.length}</Badge>
                </Button>
                
                {[
                  { type: 'image/', label: '🖼️ Images' },
                  { type: 'application/pdf', label: '📄 PDFs' },
                  { type: 'text/', label: '📃 Text' },
                  { type: 'video/', label: '🎬 Videos' },
                  { type: 'audio/', label: '🎵 Audio' }
                ].map(({ type, label }) => {
                  const count = items.filter(item => 
                    type.endsWith('/') ? item.mime_type.startsWith(type) : item.mime_type === type
                  ).length;
                  
                  return (
                    <Button
                      key={type}
                      variant={currentMimeType === type ? 'filled' : 'subtle'}
                      size="xs"
                      justify="space-between"
                      fullWidth
                      onClick={() => setCurrentMimeType(type)}
                    >
                      <span>{label}</span>
                      <Badge size="xs" variant="light">{count}</Badge>
                    </Button>
                  );
                })}
              </Stack>
            </Paper>

            {/* Options */}
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Switch
                  label="Show archived"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.currentTarget.checked)}
                />
              </Stack>
            </Paper>

            {/* View Mode */}
            <Paper p="md" withBorder>
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">View</Text>
              </Group>
              
              <Group justify="center">
                <ActionIcon
                  variant={viewMode === 'list' ? 'filled' : 'subtle'}
                  onClick={() => setViewMode('list')}
                >
                  <IconList size={16} />
                </ActionIcon>
                <ActionIcon
                  variant={viewMode === 'grid' ? 'filled' : 'subtle'}
                  onClick={() => setViewMode('grid')}
                >
                  <IconGrid3x3 size={16} />
                </ActionIcon>
                <ActionIcon
                  variant={viewMode === 'tree' ? 'filled' : 'subtle'}
                  onClick={() => setViewMode('tree')}
                >
                  <IconTree size={16} />
                </ActionIcon>
              </Group>
            </Paper>
          </Stack>
        </Grid.Col>

        {/* Main Content */}
        <Grid.Col span={{ base: 12, md: 9 }}>
          <Stack gap="md">
            {/* Breadcrumb */}
            <Group>
              <Breadcrumbs>
                <Anchor onClick={() => handleBreadcrumbClick(0)}>
                  <Group gap="xs">
                    <IconHome size={16} />
                    <span>Archive</span>
                  </Group>
                </Anchor>
                {breadcrumb.map((folder, index) => (
                  <Anchor 
                    key={folder.uuid}
                    onClick={() => handleBreadcrumbClick(index + 1)}
                  >
                    {folder.name}
                  </Anchor>
                ))}
              </Breadcrumbs>
            </Group>

            {/* Header */}
            <Group justify="space-between" align="center">
              <div>
                <Title order={2}>
                  {currentFolder ? currentFolder.name : 'Archive'}
                </Title>
                <Text c="dimmed">
                  {currentFolder 
                    ? `${sortedFolders.length} folders, ${sortedItems.length} files`
                    : `${sortedFolders.length} folders`
                  }
                </Text>
              </div>
              
              <Group gap="xs">
                {selectedItems.size > 0 && (
                  <Group gap="xs">
                    <Badge variant="light">{selectedItems.size} selected</Badge>
                    <Button size="xs" variant="subtle" onClick={clearSelection}>
                      Clear
                    </Button>
                  </Group>
                )}
                
                <Button
                  variant={sortBy === 'name' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortBy === 'name' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => setSortBy('name')}
                >
                  Name
                </Button>
                <Button
                  variant={sortBy === 'updated_at' ? 'filled' : 'subtle'}
                  size="xs"
                  leftSection={sortBy === 'updated_at' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                  onClick={() => setSortBy('updated_at')}
                >
                  Updated
                </Button>
                {currentFolder && (
                  <Button
                    variant={sortBy === 'file_size' ? 'filled' : 'subtle'}
                    size="xs"
                    leftSection={sortBy === 'file_size' && sortOrder === 'asc' ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
                    onClick={() => setSortBy('file_size')}
                  >
                    Size
                  </Button>
                )}
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

            {/* Upload Progress */}
            {isUploadingItems && (
              <Card padding="md">
                <Group justify="space-between" mb="xs">
                  <Text fw={500}>Uploading files...</Text>
                  <Text size="sm">{uploadProgress}%</Text>
                </Group>
                <Progress value={uploadProgress} />
              </Card>
            )}

            {/* Loading State */}
            {isLoading && (
              <Stack gap="md">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} height={80} radius="md" />
                ))}
              </Stack>
            )}

            {/* Folders */}
            {!isLoading && sortedFolders.length > 0 && (
              <div>
                <Text fw={600} mb="md">Folders</Text>
                <Grid>
                  {sortedFolders.map((folder: ArchiveFolder) => (
                    <Grid.Col span={{ base: 12, sm: 6, lg: 4 }} key={folder.uuid}>
                      <Card 
                        shadow="sm" 
                        padding="md" 
                        radius="md" 
                        withBorder
                        style={{ cursor: 'pointer' }}
                        onClick={() => handleFolderClick(folder)}
                      >
                        <Group justify="space-between" align="flex-start">
                          <Group align="flex-start" gap="md" style={{ flex: 1 }}>
                            <ThemeIcon size="lg" variant="light" color="blue">
                              <IconFolder size={20} />
                            </ThemeIcon>
                            
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Text fw={600} size="sm" truncate>{folder.name}</Text>
                              {folder.description && (
                                <Text size="xs" c="dimmed" lineClamp={2}>
                                  {folder.description}
                                </Text>
                              )}
                              <Group gap="xs" mt="xs">
                                <Badge variant="light" size="sm">
                                  {folder.item_count} files
                                </Badge>
                                <Badge variant="light" size="sm">
                                  {folder.subfolder_count} folders
                                </Badge>
                                {folder.total_size > 0 && (
                                  <Badge variant="light" size="sm">
                                    {formatFileSize(folder.total_size)}
                                  </Badge>
                                )}
                                {folder.is_archived && (
                                  <Badge variant="light" color="gray" size="sm">
                                    Archived
                                  </Badge>
                                )}
                              </Group>
                            </div>
                          </Group>
                          
                          <Menu withinPortal position="bottom-end">
                            <Menu.Target>
                              <ActionIcon 
                                variant="subtle" 
                                color="gray"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            
                            <Menu.Dropdown>
                              <Menu.Item 
                                leftSection={<IconEdit size={14} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingFolder(folder);
                                  setFolderForm({
                                    name: folder.name,
                                    description: folder.description || ''
                                  });
                                  setFolderModalOpen(true);
                                }}
                              >
                                Edit
                              </Menu.Item>
                              <Menu.Item 
                                leftSection={folder.is_archived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateFolder(folder.uuid, { is_archived: !folder.is_archived });
                                }}
                              >
                                {folder.is_archived ? 'Unarchive' : 'Archive'}
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Item 
                                leftSection={<IconTrash size={14} />}
                                color="red"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteFolder(folder);
                                }}
                              >
                                Delete
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      </Card>
                    </Grid.Col>
                  ))}
                </Grid>
              </div>
            )}

            {/* Files */}
            {!isLoading && currentFolder && sortedItems.length > 0 && (
              <div>
                <Group justify="space-between" align="center" mb="md">
                  <Text fw={600}>Files</Text>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={selectAllItems}
                    >
                      Select All
                    </Button>
                  </Group>
                </Group>
                
                {viewMode === 'grid' ? (
                  <Grid>
                    {sortedItems.map((item) => (
                      <Grid.Col span={{ base: 12, sm: 6, lg: 4 }} key={item.uuid}>
                        <Card 
                          shadow="sm" 
                          padding="md" 
                          radius="md" 
                          withBorder
                        >
                          <Group justify="space-between" align="flex-start">
                            <Group align="flex-start" gap="md" style={{ flex: 1 }}>
                              <Checkbox
                                checked={selectedItems.has(item.uuid)}
                                onChange={() => toggleItemSelection(item.uuid)}
                              />
                              
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <Group gap="xs" mb="xs">
                                  {getFileIcon(item.mime_type)}
                                  <Text fw={600} size="sm" truncate>{item.name}</Text>
                                </Group>
                                
                                <Text size="xs" c="dimmed" mb="xs">{item.original_filename}</Text>
                                
                                <Group gap="xs">
                                  <Badge variant="light" size="sm">
                                    {formatFileSize(item.file_size)}
                                  </Badge>
                                  {item.is_favorite && (
                                    <Badge variant="light" color="yellow" size="sm">
                                      ⭐ Favorite
                                    </Badge>
                                  )}
                                  {item.is_archived && (
                                    <Badge variant="light" color="gray" size="sm">
                                      Archived
                                    </Badge>
                                  )}
                                </Group>
                                
                                {item.tags.slice(0, 3).map((tag: string) => (
                                  <Badge key={tag} variant="dot" size="sm">
                                    {tag}
                                  </Badge>
                                ))}
                                {item.tags.length > 3 && (
                                  <Badge variant="dot" size="sm" color="gray">
                                    +{item.tags.length - 3}
                                  </Badge>
                                )}
                              </div>
                            </Group>
                            
                            <Menu withinPortal position="bottom-end">
                              <Menu.Target>
                                <ActionIcon variant="subtle" color="gray">
                                  <IconDots size={16} />
                                </ActionIcon>
                              </Menu.Target>
                              
                              <Menu.Dropdown>
                                <Menu.Item 
                                  leftSection={<IconDownload size={14} />}
                                  onClick={() => handleDownloadItem(item)}
                                >
                                  Download
                                </Menu.Item>
                                <Menu.Item 
                                  leftSection={item.is_favorite ? <IconStar size={14} /> : <IconStarFilled size={14} />}
                                  onClick={() => updateItem(item.uuid, { is_favorite: !item.is_favorite })}
                                >
                                  {item.is_favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                                </Menu.Item>
                                <Menu.Item 
                                  leftSection={item.is_archived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                                  onClick={() => updateItem(item.uuid, { is_archived: !item.is_archived })}
                                >
                                  {item.is_archived ? 'Unarchive' : 'Archive'}
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Item 
                                  leftSection={<IconTrash size={14} />}
                                  color="red"
                                  onClick={() => handleDeleteItem(item)}
                                >
                                  Delete
                                </Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          </Group>
                          
                          {item.preview && (
                            <Text size="sm" c="dimmed" lineClamp={3} mt="md">
                              {item.preview}
                            </Text>
                          )}
                          
                          <Text size="xs" c="dimmed" mt="md">
                            {formatDate(item.updated_at)}
                          </Text>
                        </Card>
                      </Grid.Col>
                    ))}
                  </Grid>
                ) : (
                  <Stack gap="sm">
                    {sortedItems.map((item) => (
                      <Card key={item.uuid} padding="md" withBorder>
                        <Group justify="space-between">
                          <Group gap="md" style={{ flex: 1 }}>
                            <Checkbox
                              checked={selectedItems.has(item.uuid)}
                              onChange={() => toggleItemSelection(item.uuid)}
                            />
                            
                            {getFileIcon(item.mime_type)}
                            
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <Group gap="xs" mb="xs">
                                <Text fw={600} size="sm" truncate>{item.name}</Text>
                                <Text size="xs" c="dimmed">({item.original_filename})</Text>
                              </Group>
                              
                              <Group gap="xs">
                                <Text size="sm" c="dimmed">{formatFileSize(item.file_size)}</Text>
                                <Text size="sm" c="dimmed">•</Text>
                                <Text size="sm" c="dimmed">{formatDate(item.updated_at)}</Text>
                                
                                {item.tags.slice(0, 3).map((tag: string) => (
                                  <Badge key={tag} variant="dot" size="sm">
                                    {tag}
                                  </Badge>
                                ))}
                                {item.tags.length > 3 && (
                                  <Badge variant="dot" size="sm" color="gray">
                                    +{item.tags.length - 3}
                                  </Badge>
                                )}
                              </Group>
                            </div>
                          </Group>
                          
                          <Menu withinPortal position="bottom-end">
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray">
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            
                            <Menu.Dropdown>
                              <Menu.Item 
                                leftSection={<IconDownload size={14} />}
                                onClick={() => handleDownloadItem(item)}
                              >
                                Download
                              </Menu.Item>
                              <Menu.Item 
                                leftSection={item.is_favorite ? <IconStar size={14} /> : <IconStarFilled size={14} />}
                                onClick={() => updateItem(item.uuid, { is_favorite: !item.is_favorite })}
                              >
                                {item.is_favorite ? 'Remove from Favorites' : 'Add to Favorites'}
                              </Menu.Item>
                              <Menu.Item 
                                leftSection={item.is_archived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                                onClick={() => updateItem(item.uuid, { is_archived: !item.is_archived })}
                              >
                                {item.is_archived ? 'Unarchive' : 'Archive'}
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Item 
                                leftSection={<IconTrash size={14} />}
                                color="red"
                                onClick={() => handleDeleteItem(item)}
                              >
                                Delete
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                )}
              </div>
            )}

            {/* Empty State */}
            {!isLoading && sortedFolders.length === 0 && (!currentFolder || sortedItems.length === 0) && (
              <Paper p="xl" radius="md" style={{ textAlign: 'center' }}>
                <ThemeIcon size="xl" variant="light" color="blue" mx="auto" mb="md">
                  <IconFolder size={32} />
                </ThemeIcon>
                <Title order={3} mb="xs">
                  {currentFolder ? 'Empty folder' : 'Archive is empty'}
                </Title>
                <Text c="dimmed" mb="lg">
                  {currentFolder 
                    ? 'Upload files or create subfolders to get started'
                    : 'Create your first folder to organize your files'
                  }
                </Text>
                <Group justify="center" gap="md">
                  <Button
                    leftSection={<IconFolderPlus size={16} />}
                    onClick={() => setFolderModalOpen(true)}
                  >
                    Create Folder
                  </Button>
                  {currentFolder && (
                    <Button
                      leftSection={<IconUpload size={16} />}
                      variant="light"
                      onClick={() => setUploadModalOpen(true)}
                    >
                      Upload Files
                    </Button>
                  )}
                </Group>
              </Paper>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      {/* Folder Modal */}
      <Modal
        opened={folderModalOpen}
        onClose={() => {
          setFolderModalOpen(false);
          resetFolderForm();
        }}
        title={editingFolder ? 'Edit Folder' : 'Create Folder'}
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="Enter folder name"
            value={folderForm.name}
            onChange={(e) => setFolderForm({ ...folderForm, name: e.currentTarget.value })}
            required
          />
          
          <Textarea
            label="Description"
            placeholder="Enter description (optional)"
            value={folderForm.description}
            onChange={(e) => setFolderForm({ ...folderForm, description: e.currentTarget.value })}
            minRows={3}
          />
          
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => {
                setFolderModalOpen(false);
                resetFolderForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingFolder ? handleUpdateFolder : handleCreateFolder}
              disabled={!folderForm.name.trim()}
            >
              {editingFolder ? 'Update' : 'Create'} Folder
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Upload Modal */}
      <Modal
        opened={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Upload Files"
        size="md"
      >
        <Stack gap="md">
          <FileInput
            label="Select Files"
            placeholder="Choose files to upload"
            multiple
            value={selectedFiles}
            onChange={setSelectedFiles}
          />
          
          <TextInput
            label="Tags (comma separated)"
            placeholder="work, important, project"
            value={uploadTags}
            onChange={(e) => setUploadTags(e.currentTarget.value)}
          />
          
          {selectedFiles.length > 0 && (
            <Text size="sm" c="dimmed">
              {selectedFiles.length} file(s) selected
            </Text>
          )}
          
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={() => setUploadModalOpen(false)}
              disabled={isUploadingItems}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUploadFiles}
              loading={isUploadingItems}
              disabled={selectedFiles.length === 0}
            >
              Upload
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
} 