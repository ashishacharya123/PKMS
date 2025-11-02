/**
 * Specialized layout component for Archive module
 * Handles the unique folder-based structure with sidebar navigation
 */

import React from 'react';
import { Box, Paper, ScrollArea, Group, Title, Text, ActionIcon, Stack, Center, Avatar, Button } from '@mantine/core';
import { IconFiles, IconFolderPlus, IconRefresh } from '@tabler/icons-react';
import { FolderTree } from './FolderTree';
import ModuleHeader from '../common/ModuleHeader';
import ModuleLayout from '../common/ModuleLayout';
import { UnifiedFileSection } from '../file/UnifiedFileSection';
import { ArchiveItem, ArchiveFolder } from '../../types/archive';
import { BaseItem } from '../../types/common';

interface ArchiveLayoutProps {
  // Current state
  currentFolder: ArchiveFolder | null;
  folders: ArchiveFolder[];
  items: ArchiveItem[];
  isLoadingItems: boolean;
  
  // Actions
  setCurrentFolder: (folder: ArchiveFolder | null) => void;
  loadFolderItems: (folderUuid: string) => void;
  createFolder: () => void;
  handleRefresh: () => void;
  
  // View mode
  viewMode: 'small-icons' | 'medium-icons' | 'list' | 'details';
  ViewMenu: React.ComponentType<{ currentView: string; onChange: (mode: string) => void; disabled?: boolean }>;
  
  // File upload
  archiveFiles: ArchiveItem[];
  setArchiveFiles: React.Dispatch<React.SetStateAction<ArchiveItem[]>>;
  
  // Filters
  onFilter: () => void;
  
  // Item actions
  onItemClick: (item: ArchiveItem) => void;
  onToggleFavorite: (item: ArchiveItem) => void;
  onToggleArchive: (item: ArchiveItem) => void;
  onDelete: (item: ArchiveItem) => void;
  onEdit: (item: ArchiveItem) => void;
  onDownload: (item: ArchiveItem) => void;
  onPreview: (item: ArchiveItem) => void;
  
  // Render functions
  renderIcon: (item: ArchiveItem) => React.ReactNode;
  renderContent: (item: ArchiveItem) => React.ReactNode;
}

export function ArchiveLayout({
  currentFolder,
  folders,
  items,
  isLoadingItems,
  setCurrentFolder,
  loadFolderItems,
  createFolder,
  handleRefresh,
  viewMode,
  ViewMenu,
  archiveFiles,
  setArchiveFiles,
  onFilter,
  onItemClick,
  onToggleFavorite,
  onToggleArchive,
  onDelete,
  onEdit,
  onDownload,
  onPreview,
  renderIcon,
  renderContent,
}: ArchiveLayoutProps) {
  return (
    <Box style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Left Sidebar - Folder Tree */}
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
                onClick={createFolder}
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
            onSelect={(treeNode) => setCurrentFolder(treeNode ? treeNode.folder : null)}
          />
        </ScrollArea>
      </Paper>

      {/* Main Content Area */}
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--mantine-color-dark-8)' }}>
        {/* Main Header */}
        <Paper p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', backgroundColor: 'var(--mantine-color-dark-7)' }}>
          <ModuleHeader
            title={currentFolder?.name || 'Select a Folder'}
            itemCount={items.length}
            onRefresh={() => {
              if (currentFolder) {
                loadFolderItems(currentFolder.uuid);
              }
            }}
            onCreate={createFolder}
            onFilter={onFilter}
            showFilters={true}
            showCreate={true}
            showRefresh={true}
            isLoading={isLoadingItems}
            customActions={
              <ViewMenu 
                currentView={viewMode}
            onChange={() => {
              // This will be handled by parent
            }}
                disabled={isLoadingItems}
              />
            }
          />
          {currentFolder && currentFolder.path && (
            <Text size="sm" c="dimmed" mt="xs">
              {currentFolder.path}
            </Text>
          )}
        </Paper>

        {/* FileSection for uploads */}
        {currentFolder && (
          <Paper p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', backgroundColor: 'var(--mantine-color-dark-7)' }}>
            <UnifiedFileSection
              module="archive"
              entityId={currentFolder.uuid}
              files={archiveFiles.map(item => ({
                uuid: item.uuid,
                name: item.name,                    // ✅ ADDED: Required field
                filename: item.storedFilename,     // ArchiveItem.storedFilename → UnifiedFileItem.filename
                originalName: item.originalFilename, // ArchiveItem.originalFilename → UnifiedFileItem.originalName
                mimeType: item.mimeType,
                fileSize: item.fileSize,
                description: item.description,
                isFavorite: item.isFavorite,        // ✅ ADDED: Required field
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,          // ✅ ADDED: Missing field
                tags: item.tags || [],              // ✅ ADDED: Optional but should be included
                filePath: item.filePath,
                thumbnailPath: item.thumbnailPath,
                createdBy: item.createdBy,          // ✅ ADDED: Missing field
                isArchived: item.isArchived,        // ✅ ADDED: Missing field
                module: 'archive' as const,
                entityId: currentFolder.uuid,
              }))}
              onFilesUpdate={(unifiedFiles) => {
                const convertedFiles: ArchiveItem[] = unifiedFiles.map(file => {
                  // Find original item to preserve createdBy from backend
                  const originalItem = archiveFiles.find(item => item.uuid === file.uuid);

                  // If item exists, preserve user edits and backend fields
                  if (originalItem) {
                    return {
                      ...originalItem, // ✅ Preserves all BaseItem fields including createdBy
                      // Update only changed fields from unified file editor
                      name: file.name ?? originalItem.name,
                      description: file.description ?? originalItem.description,
                      isFavorite: file.isFavorite ?? originalItem.isFavorite,
                      tags: file.tags ?? originalItem.tags,
                      filePath: file.filePath ?? originalItem.filePath,
                      thumbnailPath: file.thumbnailPath ?? originalItem.thumbnailPath,
                    };
                  }

                  // New item - createdBy will be in backend response after creation
                  return {
                    itemType: 'file' as const,
                    uuid: file.uuid,
                    name: file.name ?? file.originalName,
                    description: file.description,
                    folderUuid: currentFolder.uuid,
                    originalFilename: file.originalName,
                    storedFilename: file.filename,
                    mimeType: file.mimeType,
                    fileSize: file.fileSize,
                    metadata: {},
                    thumbnailPath: file.thumbnailPath,
                    isFavorite: false,
                    isArchived: false,                 // ✅ ADDED: Required field
                    createdAt: file.createdAt,
                    updatedAt: file.createdAt,
                    tags: file.tags ?? [],
                    filePath: file.filePath || '',
                    fileHash: undefined,
                    createdBy: '', // Temporary: Backend response will have it after item creation
                  };
                });
                setArchiveFiles(convertedFiles);
              }}
              className="archive-file-section"
            />
          </Paper>
        )}

        {/* Content Area */}
        <Box style={{ flex: 1, overflow: 'hidden' }}>
          {!currentFolder ? (
            // Show folders when no folder selected
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
                      onClick={createFolder}
                      size="md"
                    >
                      Create Your First Folder
                    </Button>
                  </Stack>
                </Center>
              ) : (
                <ModuleLayout
                  items={folders as BaseItem[]}
                  viewMode={viewMode}
                  onItemClick={(folder: any) => {
                    if (folder.itemType === 'folder') {
                      setCurrentFolder(folder);
                    }
                  }}
                  renderIcon={(folder: any) => {
                    // Use folder properties to vary the icon
                    const getColor = () => {
                      if (folder.itemCount === 0) return "var(--mantine-color-gray-4)";    // Empty folders
                      if (folder.depth === 0) return "var(--mantine-color-orange-4)";    // Root level
                      return "var(--mantine-color-blue-4)";                             // Normal folders
                    };

                    return (
                      <Center style={{ width: 60, height: 60, backgroundColor: 'var(--mantine-color-dark-5)', borderRadius: 8 }}>
                        <IconFiles size={24} color={getColor()} />
                      </Center>
                    );
                  }}
                  renderContent={(folder: any) => (
                    <Stack gap="xs">
                      <Text fw={500} size="sm">{folder.name}</Text>
                      <Text size="xs" c="dimmed">Folder</Text>
                    </Stack>
                  )}
                  isLoading={isLoadingItems}
                  emptyMessage="No folders found."
                  showFavorite={true}
                  showArchive={true}
                  showDelete={true}
                />
              )}
            </Box>
          ) : (
            // Show items when folder selected
            <Box p="md">
              <ModuleLayout<ArchiveItem>
                items={items}
                viewMode={viewMode}
                onItemClick={onItemClick}
                onToggleFavorite={onToggleFavorite}
                onToggleArchive={onToggleArchive}
                onDelete={onDelete}
                onEdit={onEdit}
                onDownload={onDownload}
                onPreview={onPreview}
                renderIcon={renderIcon}
                renderContent={renderContent}
                isLoading={isLoadingItems}
                emptyMessage="No files found in this folder."
                showFavorite={true}
                showArchive={true}
                showDelete={true}
                showDownload={true}
                showPreview={true}
              />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default ArchiveLayout;
