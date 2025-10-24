/**
 * Archive Page - Modular Version
 * Uses the new modular components for consistent UI across all modules
 */

import React from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { ArchivePreviewImage, ArchiveSelectedItem } from '../types/archive';
import { notifications } from '@mantine/notifications';
import { 
  Group, 
  Text, 
  Button, 
  Stack, 
  Modal,
  TextInput,
  Textarea,
  Center,
  Loader
} from '@mantine/core';
import { 
  IconFiles, 
  IconDownload, 
  IconTrash, 
  IconEdit,
  IconPhoto,
  IconFile,
  IconFileText,
  IconFileMusic,
  IconVideo,
  IconTable,
  IconPresentation,
  IconArchive,
  IconCode,
  IconStar,
  IconStarFilled,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import ViewMenu, { ViewMode } from '../components/common/ViewMenu';
import { formatDate, formatFileSize } from '../components/common/ViewModeLayouts';
import { useViewPreferences } from '../hooks/useViewPreferences';
import ModuleFilters, { getModuleFilterConfig } from '../components/common/ModuleFilters';
import { ArchiveItem, ArchiveFolder, ModuleFilters as CommonModuleFilters } from '../types/common';
import ArchiveLayout from '../components/archive/ArchiveLayout';
import { archiveService } from '../services/archiveService';
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
      <div style={{ 
        width: 60, 
        height: 60, 
        backgroundColor: 'var(--mantine-color-dark-5)', 
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {getFileIcon(item.mime_type)}
      </div>
    );
  }

  return (
    <div style={{ 
      width: 60, 
      height: 60, 
      backgroundColor: 'var(--mantine-color-dark-5)', 
      borderRadius: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    }}>
      {imageLoading && <Loader size="sm" />}
      <img
        src={item.thumbnail_path || `/api/v1/archive/items/${item.uuid}/thumbnail`}
        alt={item.name}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: imageLoading ? 'none' : 'block'
        }}
        onLoad={() => setImageLoading(false)}
        onError={() => {
          setImageError(true);
          setImageLoading(false);
        }}
      />
    </div>
  );
};

export default function ArchivePageNew() {
  const { 
    currentFolder, 
    items,
    folders,
    isLoadingItems,
    setCurrentFolder,
    loadFolderItems,
    createFolder
  } = useArchiveStore();

  const { getPreference, updatePreference } = useViewPreferences();
  const [viewMode, setViewMode] = React.useState<ViewMode>(getPreference('archive'));

  // Modal states
  const [createFolderOpened, { open: openCreateFolder, close: closeCreateFolder }] = useDisclosure(false);
  const [newFolderName, setNewFolderName] = React.useState('');
  const [newFolderDescription, setNewFolderDescription] = React.useState('');
  const [imagePreviewOpened, { open: openImagePreview, close: closeImagePreview }] = useDisclosure(false);
  const [previewImage, setPreviewImage] = React.useState<ArchivePreviewImage | null>(null);
  
  // Action menu states
  const [selectedItem, setSelectedItem] = React.useState<ArchiveSelectedItem | null>(null);
  const [renameModalOpened, { open: openRenameModal, close: closeRenameModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [newName, setNewName] = React.useState('');

  // FileSection state for archive files
  const [archiveFiles, setArchiveFiles] = React.useState<any[]>([]);
  
  // Filter state - using module-specific configuration
  const filterConfig = getModuleFilterConfig('archive');
  const [filters, setFilters] = React.useState<CommonModuleFilters>({
    favorites: false,
    mimeTypes: [],
    dateRange: 'all',
    sortBy: 'name',
    sortOrder: 'asc',
    archived: false,
  });
  const [filtersOpened, { open: openFilters, close: closeFilters }] = useDisclosure(false);

  useAuthenticatedEffect(() => {
    // Load root folders on initial mount
    const loadInitialData = async () => {
      try {
        await useArchiveStore.getState().loadItems();
      } catch (error) {
        console.error('Failed to load archive data:', error);
      }
    };
    
    loadInitialData();
  }, []);

  // Load items when folder changes
  React.useEffect(() => {
    if (currentFolder) {
      loadFolderItems(currentFolder.uuid);
    }
  }, [currentFolder, loadFolderItems]);

  const handleRefresh = async () => {
    try {
      if (currentFolder) {
        await loadFolderItems(currentFolder.uuid);
      } else {
        await useArchiveStore.getState().loadItems();
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to refresh archive',
        color: 'red'
      });
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      await createFolder(newFolderName.trim(), currentFolder?.uuid, newFolderDescription.trim() || undefined);
      setNewFolderName('');
      setNewFolderDescription('');
      closeCreateFolder();
      notifications.show({
        title: 'Success',
        message: 'Folder created successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to create folder',
        color: 'red'
      });
    }
  };

  const handleRename = async () => {
    if (!selectedItem || !newName.trim()) return;
    
    try {
      if (selectedItem.mime_type === 'folder') {
        await archiveService.updateFolder(selectedItem.uuid, { name: newName.trim() });
      } else {
        await archiveService.updateItem(selectedItem.uuid, { name: newName.trim() });
      }
      
      setNewName('');
      closeRenameModal();
      setSelectedItem(null);
      
      // Refresh current view
      if (currentFolder) {
        await loadFolderItems(currentFolder.uuid);
      } else {
        await useArchiveStore.getState().loadItems();
      }
      
      notifications.show({
        title: 'Success',
        message: 'Item renamed successfully',
        color: 'green'
      });
    } catch (error) {
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
      
      closeDeleteModal();
      setSelectedItem(null);
      
      // Refresh current view
      if (currentFolder) {
        await loadFolderItems(currentFolder.uuid);
      } else {
        await useArchiveStore.getState().loadItems();
      }
      
      notifications.show({
        title: 'Success',
        message: 'Item deleted successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete item',
        color: 'red'
      });
    }
  };

  const handleToggleFavorite = async (item: any) => {
    try {
      if (item.mime_type === 'folder') {
        await archiveService.updateFolder(item.uuid, { is_favorite: !item.is_favorite });
      } else {
        await archiveService.updateItem(item.uuid, { is_favorite: !item.is_favorite });
      }
      
      notifications.show({
        title: 'Success',
        message: `${item.is_favorite ? 'Removed from' : 'Added to'} favorites`,
        color: 'green'
      });
      
      // Refresh the current view
      if (currentFolder) {
        await loadFolderItems(currentFolder.uuid);
      } else {
        await useArchiveStore.getState().loadItems();
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update favorite status',
        color: 'red'
      });
    }
  };

  const handleDownloadFile = async (item: any) => {
    try {
      await archiveService.downloadItem(item.uuid);
      notifications.show({
        title: 'Download Started',
        message: 'File download will begin shortly',
        color: 'blue'
      });
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to download file',
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
      notifications.show({
        title: 'Error',
        message: 'Failed to download folder',
        color: 'red'
      });
    }
  };

  return (
    <>
      <ArchiveLayout
        currentFolder={currentFolder}
        folders={folders}
        items={items}
        isLoadingItems={isLoadingItems}
        setCurrentFolder={setCurrentFolder}
        loadFolderItems={loadFolderItems}
        createFolder={openCreateFolder}
        handleRefresh={handleRefresh}
        viewMode={viewMode}
        ViewMenu={({ currentView, onChange, disabled }: any) => (
          <ViewMenu 
            currentView={currentView}
            onChange={(mode) => {
              setViewMode(mode);
              updatePreference('archive', mode);
              onChange?.(mode);
            }}
            disabled={disabled}
          />
        )}
        archiveFiles={archiveFiles}
        setArchiveFiles={setArchiveFiles}
        onFilter={openFilters}
        onItemClick={(item: any) => {
          if (item.mime_type === 'folder') {
            setCurrentFolder(item.uuid);
          } else {
            // Handle file click (preview, download, etc.)
            if (item.mime_type.startsWith('image/')) {
              setPreviewImage({
                uuid: item.uuid,
                name: item.name,
                mime_type: item.mime_type,
                file_size: item.file_size,
                thumbnail_path: item.thumbnail_path,
                original_filename: item.original_filename,
                stored_filename: item.stored_filename,
                file_path: item.file_path,
                created_at: item.created_at,
                updated_at: item.updated_at
              });
              openImagePreview();
            }
          }
        }}
        onToggleFavorite={handleToggleFavorite}
        onToggleArchive={(item: any) => {
          // Archive items don't have archive functionality in this context
          console.log('Archive toggle not implemented for items');
        }}
        onDelete={(item: any) => {
          setSelectedItem({ uuid: item.uuid, name: item.name, mime_type: 'file' });
          openDeleteModal();
        }}
        onEdit={(item: any) => {
          setSelectedItem({ uuid: item.uuid, name: item.name, mime_type: 'file' });
          setNewName(item.name);
          openRenameModal();
        }}
        onDownload={handleDownloadFile}
        onPreview={(item: any) => {
          if (item.mime_type.startsWith('image/')) {
            setPreviewImage({
              uuid: item.uuid,
              name: item.name,
              mime_type: item.mime_type,
              file_size: item.file_size,
              thumbnail_path: item.thumbnail_path,
              original_filename: item.original_filename,
              stored_filename: item.stored_filename,
              file_path: item.file_path,
              created_at: item.created_at,
              updated_at: item.updated_at
            });
            openImagePreview();
          }
        }}
        renderIcon={(item: any) => (
          <FileThumbnail item={item} />
        )}
        renderContent={(item: any) => (
          <Stack gap="xs">
            <Text fw={500} size="sm">{item.name}</Text>
            <Text size="xs" c="dimmed">{getFileTypeInfo(item.mime_type).label}</Text>
          </Stack>
        )}
      />

      {/* Create Folder Modal */}
      <Modal 
        opened={createFolderOpened} 
        onClose={closeCreateFolder} 
        title="Create New Folder" 
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Folder Name"
            placeholder="Enter folder name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            required
          />
          <Textarea
            label="Description (Optional)"
            placeholder="Enter folder description"
            value={newFolderDescription}
            onChange={(e) => setNewFolderDescription(e.target.value)}
            rows={3}
          />
          <Group justify="end" gap="sm">
            <Button variant="outline" onClick={closeCreateFolder}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create Folder
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Rename Modal */}
      <Modal 
        opened={renameModalOpened} 
        onClose={closeRenameModal} 
        title="Rename Item" 
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="New Name"
            placeholder="Enter new name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <Group justify="end" gap="sm">
            <Button variant="outline" onClick={closeRenameModal}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>
              Rename
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal 
        opened={deleteModalOpened} 
        onClose={closeDeleteModal} 
        title="Delete Item" 
        size="md"
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete "{selectedItem?.name}"? This action cannot be undone.
          </Text>
          <Group justify="end" gap="sm">
            <Button variant="outline" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Image Preview Modal */}
      <Modal 
        opened={imagePreviewOpened} 
        onClose={closeImagePreview} 
        title={previewImage?.name || 'Image Preview'} 
        size="xl"
      >
        {previewImage && (
          <Center>
            <img
              src={`/api/v1/archive/items/${previewImage.uuid}/download`}
              alt={previewImage.name}
              style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }}
            />
          </Center>
        )}
      </Modal>

      {/* Filters Modal */}
      <Modal 
        opened={filtersOpened} 
        onClose={closeFilters} 
        title="Archive Filters" 
        size="lg"
      >
        <ModuleFilters
          filters={filters}
          onFiltersChange={setFilters}
          activeFiltersCount={Object.values(filters).filter(v => Array.isArray(v) ? v.length > 0 : v !== false && v !== 'all' && v !== 'name' && v !== 'asc').length}
          showFavorites={filterConfig.showFavorites}
          showMimeTypes={filterConfig.showMimeTypes}
          showDateRange={filterConfig.showDateRange}
          showArchived={filterConfig.showArchived}
          showSorting={filterConfig.showSorting}
          customFilters={filterConfig.customFilters}
          sortOptions={filterConfig.sortOptions}
        />
        <Group justify="end" mt="md">
          <Button variant="outline" onClick={closeFilters}>
            Cancel
          </Button>
          <Button onClick={closeFilters}>
            Apply Filters
          </Button>
        </Group>
      </Modal>
    </>
  );
}
