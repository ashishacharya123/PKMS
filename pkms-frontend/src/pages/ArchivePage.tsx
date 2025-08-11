import React from 'react';
import { 
  Group, 
  Title, 
  Text, 
  Button, 
  FileInput, 
  Stack, 
  Alert, 
  Progress, 
  Paper, 
  Badge, 
  TagsInput, 
  ActionIcon, 
  Menu, 
  Box,
  Modal,
  TextInput,
  Avatar,
  Image,
  ScrollArea,
  Loader,
  Center
} from '@mantine/core';
import { 
  IconUpload, 
  IconAlertCircle, 
  IconFiles, 
  IconDownload, 
  IconTrash, 
  IconDots,
  IconFolderPlus,
  IconEdit,
  IconFolderDown,
  IconCopy,
  IconPhoto,
  IconFile,
  IconFileText,
  IconFileMusic,
  IconVideo,
  IconRefresh,
  // IconSettings,
  IconEye,
  // IconX,
  IconTable,
  IconPresentation,
  IconArchive,
  IconCode,
  IconPlus,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import ViewMenu, { ViewMode } from '../components/common/ViewMenu';
import ViewModeLayouts, { formatDate, formatFileSize } from '../components/common/ViewModeLayouts';
import { useViewPreferences } from '../hooks/useViewPreferences';
import { FolderTree } from '../components/archive/FolderTree';
import { archiveService } from '../services/archiveService';
import { searchService } from '../services/searchService';
import { notifications } from '@mantine/notifications';
import { useArchiveStore } from '../stores/archiveStore';

// Enhanced file icon mapping with modern icons
const getFileIcon = (mimeType: string): JSX.Element => {
  const size = 24;
  const color = '#666';
  
  if (mimeType.startsWith('image/')) return <IconPhoto size={size} color="#ff6b6b" />;
  if (mimeType.startsWith('video/')) return <IconVideo size={size} color="#4c6ef5" />;
  if (mimeType.startsWith('audio/')) return <IconFileMusic size={size} color="#51cf66" />;
  if (mimeType.includes('pdf')) return <IconFileText size={size} color="#e03131" />;
  if (mimeType.includes('document') || mimeType.includes('word')) return <IconFileText size={size} color="#1971c2" />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <IconTable size={size} color="#2f9e44" />;
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return <IconPresentation size={size} color="#f76707" />;
  if (mimeType.includes('archive') || mimeType.includes('zip') || mimeType.includes('rar')) return <IconArchive size={size} color="#7c2d12" />;
  if (mimeType.includes('text') || mimeType.includes('code')) return <IconCode size={size} color="#495057" />;
  return <IconFile size={size} color={color} />;
};

const getFileTypeInfo = (mimeType: string): { label: string; color: string } => {
  if (mimeType.startsWith('image/')) return { label: 'Image', color: 'pink' };
  if (mimeType.startsWith('video/')) return { label: 'Video', color: 'blue' };
  if (mimeType.startsWith('audio/')) return { label: 'Audio', color: 'green' };
  if (mimeType.includes('pdf')) return { label: 'PDF', color: 'red' };
  if (mimeType.includes('document') || mimeType.includes('word')) return { label: 'Document', color: 'blue' };
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return { label: 'Spreadsheet', color: 'green' };
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return { label: 'Presentation', color: 'orange' };
  if (mimeType.includes('archive') || mimeType.includes('zip') || mimeType.includes('rar')) return { label: 'Archive', color: 'dark' };
  if (mimeType.includes('text')) return { label: 'Text', color: 'gray' };
  return { label: 'File', color: 'gray' };
};

// Thumbnail component for images
const FileThumbnail: React.FC<{ item: any }> = ({ item }) => {
  const [imageError, setImageError] = React.useState(false);
  const [imageLoading, setImageLoading] = React.useState(true);

  if (!item.mime_type.startsWith('image/') || imageError) {
    return (
      <Center style={{ width: 60, height: 60, backgroundColor: '#f8f9fa', borderRadius: 8 }}>
        {getFileIcon(item.mime_type)}
      </Center>
    );
  }

  return (
    <Box style={{ position: 'relative', width: 60, height: 60 }}>
      {imageLoading && (
        <Center style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          backgroundColor: '#f8f9fa', 
          borderRadius: 8,
          zIndex: 1
        }}>
          <Loader size="xs" />
        </Center>
      )}
      <Image
        src={`/api/v1/archive/items/${item.uuid}/download`}
        alt={item.name}
        width={60}
        height={60}
        fit="cover"
        radius="sm"
        onLoad={() => setImageLoading(false)}
        onError={() => {
          setImageError(true);
          setImageLoading(false);
        }}
        style={{ 
          opacity: imageLoading ? 0 : 1,
          transition: 'opacity 0.2s'
        }}
      />
    </Box>
  );
};

export default function ArchivePage() {
  const { 
    currentFolder, 
    items,
    folders,
    isLoadingItems,
    isUploading, 
    uploadProgress, 
    error, 
    uploadFile, 
    setCurrentFolder,
    loadFolderItems,
    createFolder
  } = useArchiveStore();

  const [files, setFiles] = React.useState<File[]>([]);
  const [uploadTags, setUploadTags] = React.useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = React.useState<string[]>([]);
  const { getPreference, updatePreference } = useViewPreferences();
  const [viewMode, setViewMode] = React.useState<ViewMode>(getPreference('archive'));
  const [isMultipleUploading, setIsMultipleUploading] = React.useState(false);
  const [multiUploadProgress, setMultiUploadProgress] = React.useState<{
    total: number;
    completed: number;
    current: string;
    currentProgress: number;
  } | null>(null);

  // Modal states
  const [createFolderOpened, { open: openCreateFolder, close: closeCreateFolder }] = useDisclosure(false);
  const [uploadModalOpened, { open: openUploadModal, close: closeUploadModal }] = useDisclosure(false);
  const [actionMenuOpened, { open: openActionMenu, close: closeActionMenu }] = useDisclosure(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [newFolderDescription, setNewFolderDescription] = React.useState('');
  const [imagePreviewOpened, { open: openImagePreview, close: closeImagePreview }] = useDisclosure(false);
  const [previewImage, setPreviewImage] = React.useState<any>(null);
  
  // Action menu states
  const [selectedItem, setSelectedItem] = React.useState<any>(null);
  const [renameModalOpened, { open: openRenameModal, close: closeRenameModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [newName, setNewName] = React.useState('');


  React.useEffect(() => {
    // Load root folders on initial mount
    const loadInitialData = async () => {
      try {
        await useArchiveStore.getState().loadFolders();
      } catch (error) {
        console.error('Failed to load initial folders:', error);
      }
    };
    loadInitialData();
  }, []);

  const handleTagSearch = async (query: string) => {
    if (query.length < 1) {
      setTagSuggestions([]);
      return;
    }
    
    try {
      const tags = await searchService.getTagAutocomplete(query, 'archive');
      setTagSuggestions(tags.map(tag => tag.name));
    } catch (error) {
      console.error('Failed to fetch tag suggestions:', error);
      setTagSuggestions([]);
    }
  };

  const handleSingleUpload = async () => {
    if (files.length === 0 || !currentFolder) return;
    
    if (files.length === 1) {
      // Single file upload using store
      await uploadFile(files[0], currentFolder.uuid, uploadTags);
      setFiles([]);
      setUploadTags([]);
      closeUploadModal();
    } else {
      // Multiple files upload
      await handleMultipleUpload();
    }
  };

  const handleMultipleUpload = async () => {
    if (files.length === 0 || !currentFolder) return;
    
    setIsMultipleUploading(true);
    setMultiUploadProgress({
      total: files.length,
      completed: 0,
      current: '',
      currentProgress: 0
    });

    try {
      await archiveService.uploadMultipleFiles(
        files,
        currentFolder.uuid,
        uploadTags,
        (progress) => {
          setMultiUploadProgress(prev => prev ? {
            ...prev,
            current: progress.fileName,
            currentProgress: progress.progress.progress
          } : null);
        }
      );

      setMultiUploadProgress(prev => prev ? {
        ...prev,
        completed: prev.total,
        current: 'Complete',
        currentProgress: 100
      } : null);

      notifications.show({
        title: 'Upload Complete',
        message: `Successfully uploaded ${files.length} files`,
        color: 'green'
      });

      // Refresh the folder items
      if (currentFolder) {
        await loadFolderItems(currentFolder.uuid);
      }
      
      // Clear form
      setFiles([]);
      setUploadTags([]);
      closeUploadModal();
    } catch (error) {
      notifications.show({
        title: 'Upload Failed',
        message: 'Some files failed to upload',
        color: 'red'
      });
    } finally {
      setFiles([]);
      setIsMultipleUploading(false);
      setMultiUploadProgress(null);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      // Pass description through store temporary key
      (useArchiveStore.getState() as any)._pendingFolderDescription = newFolderDescription.trim() || undefined;
      await createFolder(newFolderName.trim(), currentFolder?.uuid);
      setNewFolderName('');
      setNewFolderDescription('');
      closeCreateFolder();
      
      notifications.show({
        title: 'Success',
        message: 'Folder created successfully',
        color: 'green'
      });
      
      // Force refresh folder tree to show new folder immediately
      await useArchiveStore.getState().loadFolders(currentFolder?.uuid || undefined);
      
      // Small delay to ensure tree has updated, then refresh again if needed
      setTimeout(async () => {
        await useArchiveStore.getState().loadFolders(currentFolder?.uuid || undefined);
      }, 500);
      
    } catch (error) {
      console.error('Failed to create folder:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to create folder',
        color: 'red'
      });
    }
  };

  const handleItemClick = (item: any) => {
    if (item.mime_type.startsWith('image/')) {
      setPreviewImage(item);
      openImagePreview();
    } else {
      window.open(`/api/v1/archive/items/${item.uuid}/download`, '_blank');
    }
  };

  const handleRefresh = async () => {
    try {
      // Refresh folder tree first
      await useArchiveStore.getState().loadFolders();
      
      // Then refresh current folder items if a folder is selected
      if (currentFolder) {
        await loadFolderItems(currentFolder.uuid);
      }
      
      notifications.show({
        title: 'Refreshed',
        message: 'Archive data updated',
        color: 'green',
        autoClose: 2000
      });
    } catch (error) {
      console.error('Failed to refresh:', error);
      notifications.show({
        title: 'Refresh Failed',
        message: 'Could not update archive data',
        color: 'red'
      });
    }
  };

  // Action handlers
  const handleRename = async () => {
    if (!selectedItem || !newName.trim()) return;
    
    try {
      if (selectedItem.mime_type === 'folder') {
        await archiveService.renameFolder(selectedItem.uuid, newName.trim());
      } else {
        await archiveService.renameItem(selectedItem.uuid, newName.trim());
      }
      
      notifications.show({
        title: 'Success',
        message: `${selectedItem.mime_type === 'folder' ? 'Folder' : 'File'} renamed successfully`,
        color: 'green'
      });
      closeRenameModal();
      setNewName('');
      handleRefresh();
    } catch (error) {
      console.error('Rename error:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to rename item',
        color: 'red'
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    
    try {
      if (selectedItem.mime_type === 'folder') {
        await archiveService.deleteFolder(selectedItem.uuid);
      } else {
        await archiveService.deleteItem(selectedItem.uuid);
      }
      
      notifications.show({
        title: 'Success',
        message: `${selectedItem.mime_type === 'folder' ? 'Folder' : 'File'} deleted successfully`,
        color: 'green'
      });
      closeDeleteModal();
      handleRefresh();
    } catch (error) {
      console.error('Delete error:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete item',
        color: 'red'
      });
    }
  };

  const handleDownloadFolder = async (folder: any) => {
    try {
      await archiveService.downloadFolder(folder.uuid);
      notifications.show({
        title: 'Download Started',
        message: 'Folder download will begin shortly',
        color: 'blue'
      });
    } catch (error) {
      console.error('Download folder error:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to download folder',
        color: 'red'
      });
    }
  };

  const handleFileInputClick = () => {
    if (!currentFolder) {
      notifications.show({
        title: 'Select a folder first',
        message: 'Please select a folder before uploading files',
        color: 'orange'
      });
      return;
    }
    openUploadModal();
  };

  const handleAddButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openActionMenu();
  };

  // Render current folder view: merge subfolders + files
  const subfolderItems = folders.map(f => ({
    id: f.uuid,
    uuid: f.uuid,
    name: f.name,
    mime_type: 'folder',
    file_size: 0,
    created_at: f.created_at,
    updated_at: f.updated_at,
    path: f.path,
    description: f.description,
  }));

  const combinedItems = [
    ...subfolderItems,
    ...items.map(i => ({ ...i, id: i.uuid }))
  ];

  return (
    <Box style={{ height: '100vh', display: 'flex', overflow: 'hidden', backgroundColor: 'var(--mantine-color-dark-8)' }}>
      {/* Left Sidebar - Search + Tree */}
      <Paper 
        shadow="sm" 
        style={{ 
          width: 320, 
          minWidth: 320,
          borderRadius: 0,
          borderRight: '1px solid var(--mantine-color-dark-4)',
          backgroundColor: 'var(--mantine-color-dark-7)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%'
        }}
      >
        {/* Sidebar Header */}
        <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
          <Group justify="space-between" align="center">
            <Title order={4} c="gray.2">Archive</Title>
            <Group gap="xs">
              <ActionIcon 
                variant="light" 
                size="sm"
                onClick={openCreateFolder}
                title="Create Folder"
              >
                <IconFolderPlus size={16} />
              </ActionIcon>
              <ActionIcon 
                variant="light" 
                size="sm"
                onClick={handleRefresh}
                loading={isLoadingItems}
                title="Refresh"
              >
                <IconRefresh size={16} />
              </ActionIcon>
            </Group>
          </Group>
        </Box>

        {/* Folder Tree */}
        <ScrollArea style={{ flex: 1 }} p="md">
          <Text size="sm" fw={500} mb="sm" c="gray.4">FOLDERS</Text>
          
          {/* Root folder option */}
          <Box
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px 12px',
              cursor: 'pointer',
              backgroundColor: !currentFolder ? 'var(--mantine-color-dark-5)' : 'transparent',
              borderRadius: '4px',
              marginBottom: '8px'
            }}
            onClick={() => setCurrentFolder(null)}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = !currentFolder ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-dark-6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = !currentFolder ? 'var(--mantine-color-dark-5)' : 'transparent';
            }}
          >
            <IconFiles size={20} style={{ marginRight: '8px' }} />
            <Text size="sm" fw={!currentFolder ? 600 : 400}>
              All Folders (Root)
            </Text>
          </Box>
          
        <FolderTree 
          selectedId={currentFolder?.uuid || null}
          onSelect={(treeNode) => setCurrentFolder(treeNode ? treeNode.folder.uuid : null)}
        />
        </ScrollArea>
      </Paper>

      {/* Main Content Area */}
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--mantine-color-dark-8)' }}>
        {/* Main Header */}
        <Paper p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', backgroundColor: 'var(--mantine-color-dark-7)' }}>
          <Group justify="space-between" align="center">
            <Box>
              <Title order={3}>
                {currentFolder?.name || 'Select a Folder'}
              </Title>
              {currentFolder && (
                <Text size="sm" c="dimmed">
                  {currentFolder.path} • {items.length} items
                </Text>
              )}
            </Box>
            <Group gap="sm">
              {/* Add File/Folder Button */}
              <Button
                size="sm"
                variant="filled"
                color="blue"
                leftSection={<IconPlus size={18} />}
                onClick={handleAddButtonClick}
                style={{ 
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Add
              </Button>

          <ViewMenu 
            currentView={viewMode}
            onChange={(mode) => {
              setViewMode(mode);
              updatePreference('archive', mode);
            }}
            disabled={isLoadingItems}
          />
        </Group>
          </Group>
        </Paper>

        {/* Content Area */}
        <Box style={{ flex: 1, overflow: 'hidden' }}>
          {!currentFolder ? (
            <Box p="md">
              {folders.length === 0 ? (
                <Center style={{ height: '400px' }}>
                  <Stack align="center" gap="md">
                    <Avatar size="xl" color="blue" variant="light">
                      <IconFiles size={32} />
                    </Avatar>
                    <Text size="lg" fw={500} c="dimmed">Welcome to Archive</Text>
                    <Text size="sm" c="dimmed" ta="center">
                      Get started by creating your first folder, then upload files to organize them.
                    </Text>
                    <Button
                      leftSection={<IconFolderPlus size={16} />}
                      variant="filled"
                      color="blue"
                      onClick={openCreateFolder}
                      size="md"
                    >
                      Create Your First Folder
                    </Button>
                  </Stack>
                </Center>
              ) : (
        <ViewModeLayouts
                  items={folders.map(folder => ({
                    ...folder, 
                    id: folder.uuid,
                    mime_type: 'folder',
                    name: folder.name,
                    created_at: folder.created_at,
                    updated_at: folder.updated_at,
                    file_size: 0,
                    tags: []
                  })) as any[]}
          viewMode={viewMode}
          isLoading={isLoadingItems}
                  emptyMessage="No folders found."
                  onItemClick={(folder: any) => {
                    if (folder.mime_type === 'folder') {
                      setCurrentFolder(folder.uuid);
                    }
                  }}
                  renderSmallIcon={() => (
                    <Stack gap={4} align="center">
                      <Center style={{ width: 60, height: 60, backgroundColor: 'var(--mantine-color-dark-5)', borderRadius: 8 }}>
                        <IconFiles size={24} color="var(--mantine-color-blue-4)" />
                      </Center>
              <Badge size="xs" variant="light" color="blue">
                        Folder
              </Badge>
            </Stack>
          )}
                  renderMediumIcon={() => (
            <Stack gap="xs" align="center">
                      <Center style={{ width: 80, height: 80, backgroundColor: 'var(--mantine-color-dark-5)', borderRadius: 8 }}>
                        <IconFiles size={32} color="var(--mantine-color-blue-4)" />
                      </Center>
                <Badge size="xs" variant="light" color="blue">
                        Folder
                </Badge>
            </Stack>
          )}
                  renderListItem={(folder: any) => (
            <Group justify="space-between">
              <Group gap="md">
                        <Center style={{ width: 40, height: 40, backgroundColor: 'var(--mantine-color-dark-5)', borderRadius: 8 }}>
                          <IconFiles size={20} color="var(--mantine-color-blue-4)" />
                        </Center>
                <Stack gap={2}>
                    <Text 
                      fw={600} 
                      size="sm" 
                            style={{ cursor: 'pointer', color: 'var(--mantine-color-blue-4)' }}
                    >
                            {folder.name}
                    </Text>
                  <Group gap="xs">
                    <Badge size="xs" variant="light" color="blue">
                              Folder
                    </Badge>
                    <Text size="xs" c="dimmed">
                              {formatDate(folder.created_at)}
                    </Text>
                  </Group>
                </Stack>
              </Group>
              <Menu shadow="md" width={200}>
                <Menu.Target>
                          <ActionIcon 
                            variant="subtle" 
                            color="gray" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedItem(folder);
                            }}
                          >
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item 
                            leftSection={<IconEdit size={14} />}
                            onClick={() => {
                              setSelectedItem(folder);
                              setNewName(folder.name);
                              openRenameModal();
                            }}
                          >
                            Rename
                          </Menu.Item>
                          <Menu.Item 
                            leftSection={<IconFolderDown size={14} />}
                            onClick={() => handleDownloadFolder(folder)}
                  >
                    Download
                  </Menu.Item>
                          <Menu.Item 
                            leftSection={<IconCopy size={14} />}
                            onClick={() => navigator.clipboard.writeText(folder.name)}
                          >
                            Copy Name
                          </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item 
                    leftSection={<IconTrash size={14} />}
                    color="red"
                            onClick={() => {
                              setSelectedItem(folder);
                              openDeleteModal();
                    }}
                  >
                    Delete
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          )}
                  renderDetailColumns={(folder: any) => [
            <Group key="name" gap="xs">
                      <Center style={{ width: 32, height: 32, backgroundColor: 'var(--mantine-color-dark-5)', borderRadius: 4 }}>
                        <IconFiles size={16} color="var(--mantine-color-blue-4)" />
                      </Center>
              <Text 
                fw={500} 
                size="sm" 
                        style={{ cursor: 'pointer', color: 'var(--mantine-color-blue-4)' }}
              >
                        {folder.name}
              </Text>
            </Group>,
                    <Badge key="type" size="xs" variant="light" color="blue">
                      Folder
                    </Badge>,
            <Text key="size" size="xs" c="dimmed">
                      -
                    </Text>,
                    <Text key="tags" size="xs" c="dimmed">
                      -
            </Text>,
            <Text key="created" size="xs" c="dimmed">
                      {formatDate(folder.created_at)}
            </Text>,
            <Text key="modified" size="xs" c="dimmed">
                      {formatDate(folder.updated_at)}
            </Text>,
                    <Text key="path" size="xs" c="dimmed">
                      {folder.path}
            </Text>,
                    <Text key="actions" size="xs" c="dimmed">
                      -
                    </Text>
                  ]}
                  detailHeaders={[
                    'Name', 
                    'Type', 
                    'Size', 
                    'Tags', 
                    'Created', 
                    'Modified', 
                    'Path', 
                    'Actions'
                  ]}
                />
              )}
            </Box>
          ) : (
            <ViewModeLayouts
              items={combinedItems as any[]}
              viewMode={viewMode}
              isLoading={isLoadingItems}
              emptyMessage="This folder is empty."
              onItemClick={(entry: any) => {
                if (entry.mime_type === 'folder') {
                  setCurrentFolder(entry.uuid);
                } else {
                  handleItemClick(entry);
                }
              }}
              renderSmallIcon={(entry: any) => (
                entry.mime_type === 'folder' ? (
                  <Stack gap={4} align="center">
                    <Center style={{ width: 60, height: 60, backgroundColor: 'var(--mantine-color-dark-5)', borderRadius: 8 }}>
                      <IconFiles size={24} color="var(--mantine-color-blue-4)" />
                    </Center>
                    <Badge size="xs" variant="light" color="blue">Folder</Badge>
                  </Stack>
                ) : (
                  <Stack gap={4} align="center">
                    <FileThumbnail item={entry} />
                    <Badge size="xs" variant="light" color={getFileTypeInfo(entry.mime_type).color}>
                      {getFileTypeInfo(entry.mime_type).label}
                    </Badge>
                  </Stack>
                )
              )}
              renderMediumIcon={(entry: any) => (
                entry.mime_type === 'folder' ? (
                  <Stack gap="xs" align="center">
                    <Center style={{ width: 80, height: 80, backgroundColor: 'var(--mantine-color-dark-5)', borderRadius: 8 }}>
                      <IconFiles size={32} color="var(--mantine-color-blue-4)" />
                    </Center>
                    <Badge size="xs" variant="light" color="blue">Folder</Badge>
                  </Stack>
                ) : (
                  <Stack gap="xs" align="center">
                    <FileThumbnail item={entry} />
                    <Group gap={4}>
                      <Badge size="xs" variant="light" color={getFileTypeInfo(entry.mime_type).color}>
                        {getFileTypeInfo(entry.mime_type).label}
                      </Badge>
                      <Badge size="xs" variant="light" color="gray">
                        {formatFileSize(entry.file_size)}
                      </Badge>
                    </Group>
                  </Stack>
                )
              )}
              renderListItem={(entry: any) => (
                <Group justify="space-between">
                  <Group gap="md">
                    {entry.mime_type === 'folder' ? (
                      <Center style={{ width: 40, height: 40, backgroundColor: 'var(--mantine-color-dark-5)', borderRadius: 8 }}>
                        <IconFiles size={20} color="var(--mantine-color-blue-4)" />
                      </Center>
                    ) : (
                      <FileThumbnail item={entry} />
                    )}
                    <Stack gap={2}>
                      <Text
                        fw={600}
                        size="sm"
                        style={{ cursor: 'pointer', color: 'var(--mantine-color-blue-4)' }}
                        onClick={() => {
                          if (entry.mime_type === 'folder') setCurrentFolder(entry.uuid);
                          else handleItemClick(entry);
                        }}
                      >
                        {entry.name}
                      </Text>
                      {entry.description && (
                        <Text size="xs" c="dimmed" lineClamp={1}>{entry.description}</Text>
                      )}
                      <Group gap="xs">
                        {entry.mime_type === 'folder' ? (
                          <>
                            <Badge size="xs" variant="light" color="blue">Folder</Badge>
                            <Text size="xs" c="dimmed">{formatDate(entry.created_at)}</Text>
                          </>
                        ) : (
                          <>
                            <Badge size="xs" variant="light" color={getFileTypeInfo(entry.mime_type).color}>
                              {getFileTypeInfo(entry.mime_type).label}
                            </Badge>
                            <Badge size="xs" variant="light" color="gray">{formatFileSize(entry.file_size)}</Badge>
                          </>
                        )}
                      </Group>
                    </Stack>
                  </Group>
                  <Menu shadow="md" width={200}>
              <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" onClick={(e) => e.stopPropagation()}>
                        <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                      {entry.mime_type && entry.mime_type.startsWith('image/') && (
                        <>
                          <Menu.Item 
                            leftSection={<IconEye size={14} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewImage(entry);
                              openImagePreview();
                            }}
                          >
                            Preview
                          </Menu.Item>
                          <Menu.Divider />
                        </>
                      )}
                <Menu.Item 
                  leftSection={<IconDownload size={14} />}
                  onClick={(e) => {
                    e.stopPropagation();
                          window.open(`/api/v1/archive/items/${entry.uuid}/download`, '_blank');
                  }}
                >
                  Download
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item 
                  leftSection={<IconTrash size={14} />}
                  color="red"
                  onClick={(e) => {
                    e.stopPropagation();
                    notifications.show({
                      title: 'Delete functionality',
                      message: 'Delete feature will be implemented soon',
                      color: 'blue'
                    });
                  }}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
                </Group>
              )}
              renderDetailColumns={(entry: any) => (
                entry.mime_type === 'folder' ? [
                  <Group key="name" gap="xs">
                    <Center style={{ width: 32, height: 32, backgroundColor: 'var(--mantine-color-dark-5)', borderRadius: 4 }}>
                      <IconFiles size={16} color="var(--mantine-color-blue-4)" />
                    </Center>
                    <Text fw={500} size="sm" style={{ cursor: 'pointer', color: 'var(--mantine-color-blue-4)' }}>{entry.name}</Text>
                  </Group>,
                  <Badge key="type" size="xs" variant="light" color="blue">Folder</Badge>,
                  <Text key="size" size="xs" c="dimmed">-</Text>,
                  <Text key="desc" size="xs" c="dimmed">{entry.description || '-'}</Text>,
                  <Text key="created" size="xs" c="dimmed">{formatDate(entry.created_at)}</Text>,
                  <Text key="modified" size="xs" c="dimmed">{formatDate(entry.updated_at)}</Text>,
                  <Text key="path" size="xs" c="dimmed">{entry.path}</Text>,
                  <Text key="actions" size="xs" c="dimmed">-</Text>
                ] : [
                  // existing item columns
                  <Group key="name" gap="xs">
                    <FileThumbnail item={entry} />
                    <Text fw={500} size="sm" style={{ cursor: 'pointer', color: 'var(--mantine-color-blue-4)' }}>{entry.name}</Text>
                  </Group>,
                  <Badge key="type" size="xs" variant="light" color={getFileTypeInfo(entry.mime_type).color}>{getFileTypeInfo(entry.mime_type).label}</Badge>,
                  <Text key="size" size="xs" c="dimmed">{formatFileSize(entry.file_size)}</Text>,
                  <Text key="tags" size="xs" c="dimmed">-</Text>,
                  <Text key="created" size="xs" c="dimmed">{formatDate(entry.created_at)}</Text>,
                  <Text key="modified" size="xs" c="dimmed">{formatDate(entry.updated_at)}</Text>,
                  <Text key="path" size="xs" c="dimmed">{entry.path || '-'}</Text>,
                  <Text key="actions" size="xs" c="dimmed">-</Text>
                ]
              )}
          detailHeaders={[
                'Name', 'Type', 'Size', 'Description', 'Created', 'Modified', 'Path', 'Actions'
              ]}
            />
          )}
        </Box>
      </Box>

      {/* Action Menu Modal */}
      <Modal opened={actionMenuOpened} onClose={closeActionMenu} title="Add Files or Folder" size="sm">
        <Stack gap="md">
          <Button
            fullWidth
            leftSection={<IconFolderPlus size={16} />}
            variant="light"
            color="green"
            onClick={() => {
              closeActionMenu();
              openCreateFolder();
            }}
          >
            Create Folder
          </Button>
          <Button
            fullWidth
            leftSection={<IconUpload size={16} />}
            variant="light"
            color="blue"
            disabled={!currentFolder}
            onClick={() => {
              closeActionMenu();
              if (!currentFolder) {
                notifications.show({
                  title: 'Select a folder first',
                  message: 'Please select a folder before uploading files',
                  color: 'orange'
                });
                return;
              }
              handleFileInputClick();
            }}
          >
            Upload Files {!currentFolder && '(Select folder first)'}
          </Button>
        </Stack>
      </Modal>

      {/* Create Folder Modal */}
      <Modal opened={createFolderOpened} onClose={closeCreateFolder} title="Create New Folder">
        <Stack>
          <TextInput
            label="Folder Name"
            placeholder="Enter folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleCreateFolder(); } }}
          />
          <TextInput
            label="Description (optional)"
            placeholder="Enter description"
            value={newFolderDescription}
            onChange={(e) => setNewFolderDescription(e.currentTarget.value)}
          />
          <Group justify="end">
            <Button variant="outline" onClick={closeCreateFolder}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Upload Modal */}
      <Modal opened={uploadModalOpened} onClose={closeUploadModal} title="Upload Files" size="md">
        <Stack gap="md">
          {error && (
            <Alert 
              icon={<IconAlertCircle size={16} />} 
              title="Error" 
              color="red" 
              variant="light" 
              withCloseButton 
              onClose={() => useArchiveStore.setState({ error: null })}
            >
              {error}
            </Alert>
          )}

          <FileInput
            label="Select Files"
            placeholder={files.length > 1 ? `${files.length} files selected` : files.length === 1 ? files[0].name : "Choose file(s)"}
            value={files.length > 0 ? files : undefined}
            onChange={(selectedFiles) => {
              // Handle both single file and multiple files
              if (selectedFiles) {
                if (Array.isArray(selectedFiles)) {
                  setFiles(selectedFiles);
                } else {
                  setFiles([selectedFiles]);
                }
              } else {
                setFiles([]);
              }
            }}
            multiple
            accept="*/*"
            disabled={isUploading || isMultipleUploading}
            leftSection={<IconUpload size={16} />}
            clearable
          />

          {files.length > 1 && (
            <Badge variant="light" leftSection={<IconFiles size={12} />}>
              {files.length} files selected
            </Badge>
          )}

          <TagsInput
            label="Tags (Optional)"
            placeholder="Add tags..."
            value={uploadTags}
            onChange={setUploadTags}
            data={tagSuggestions}
            clearable
            onSearchChange={handleTagSearch}
            splitChars={[',', ' ']}
            disabled={isUploading || isMultipleUploading}
            description="Add tags separated by comma or space"
          />

          {/* Upload Progress */}
          {isUploading && uploadProgress && (
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                Uploading {uploadProgress.filename} ({Math.round(uploadProgress.progress)}%)
              </Text>
              <Progress value={uploadProgress.progress} size="sm" animated />
            </Stack>
          )}
          
          {isMultipleUploading && multiUploadProgress && (
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" fw={500}>
                  Uploading ({multiUploadProgress.completed}/{multiUploadProgress.total})
                </Text>
                <Text size="xs" c="dimmed">
                  {Math.round((multiUploadProgress.completed / multiUploadProgress.total) * 100)}%
                </Text>
              </Group>
              <Progress 
                value={(multiUploadProgress.completed / multiUploadProgress.total) * 100} 
                size="sm" 
                animated 
              />
              {multiUploadProgress.current && (
                <Text size="xs" c="dimmed" truncate>
                  {multiUploadProgress.current} ({Math.round(multiUploadProgress.currentProgress)}%)
                </Text>
              )}
            </Stack>
          )}

          <Group justify="end">
            <Button variant="outline" onClick={closeUploadModal} disabled={isUploading || isMultipleUploading}>
              Cancel
            </Button>
            <Button
              leftSection={<IconUpload size={16} />}
              onClick={handleSingleUpload}
              loading={isUploading || isMultipleUploading}
              disabled={files.length === 0}
            >
              Upload {files.length > 1 ? `${files.length} Files` : 'File'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Image Preview Modal */}
      <Modal 
        opened={imagePreviewOpened} 
        onClose={closeImagePreview} 
        title={previewImage?.name}
        size="xl"
        centered
      >
        {previewImage && (
          <Stack align="center" gap="md">
            <Image
              src={`/api/v1/archive/items/${previewImage.uuid}/download`}
              alt={previewImage.name}
              fit="contain"
              mah={600}
              maw="100%"
            />
            <Group gap="md">
              <Badge variant="light">{getFileTypeInfo(previewImage.mime_type).label}</Badge>
              <Badge variant="light" color="gray">{formatFileSize(previewImage.file_size)}</Badge>
              <Badge variant="light" color="blue">{formatDate(previewImage.created_at)}</Badge>
            </Group>
            <Button 
              leftSection={<IconDownload size={16} />}
              onClick={() => window.open(`/api/v1/archive/items/${previewImage.uuid}/download`, '_blank')}
            >
              Download
            </Button>
          </Stack>
        )}
      </Modal>

      {/* Rename Modal */}
      <Modal opened={renameModalOpened} onClose={closeRenameModal} title="Rename Item" size="sm">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Rename {selectedItem?.mime_type === 'folder' ? 'folder' : 'file'}: {selectedItem?.name}
          </Text>
          <TextInput
            label="New Name"
            placeholder="Enter new name"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            data-autofocus
          />
          <Group justify="end">
            <Button variant="outline" onClick={closeRenameModal}>
              Cancel
            </Button>
            <Button 
              onClick={handleRename}
              disabled={!newName.trim() || newName === selectedItem?.name}
            >
              Rename
            </Button>
          </Group>
      </Stack>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal opened={deleteModalOpened} onClose={closeDeleteModal} title="Confirm Delete" size="sm">
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to delete {selectedItem?.mime_type === 'folder' ? 'folder' : 'file'} <strong>{selectedItem?.name}</strong>?
          </Text>
          <Text size="xs" c="dimmed">
            This action cannot be undone.
          </Text>
          <Group justify="end">
            <Button variant="outline" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete}>
              Delete
            </Button>
    </Group>
        </Stack>
      </Modal>
    </Box>
  );
} 