/**
 * Reusable layout component for all modules
 * Provides consistent layout with view modes and actions
 */

import React from 'react';
import { Center, Text, Loader, Stack } from '@mantine/core';
import { IconInbox } from '@tabler/icons-react';
import ViewModeLayouts from './ViewModeLayouts';
import ItemActionMenu from './ItemActionMenu';
import { ModuleLayoutProps } from '../../types/common';

export function ModuleLayout<T extends { uuid: string; name: string; title?: string; is_favorite: boolean; is_archived: boolean; created_by: string; created_at: string; updated_at: string }>({
  items,
  viewMode,
  onItemClick,
  onToggleFavorite,
  onToggleArchive,
  onDelete,
  onEdit,
  onDownload,
  onPreview,
  renderIcon,
  renderContent,
  renderActions,
  isLoading = false,
  emptyMessage = 'No items found',
  customActions = [],
  showFavorite = true,
  showArchive = true,
  showDelete = true,
  showEdit = false,
  showDownload = false,
  showPreview = false,
}: ModuleLayoutProps<T>) {
  // Loading state
  if (isLoading) {
    return (
      <Center h={200}>
        <Stack align="center" gap="md">
          <Loader size="md" />
          <Text c="dimmed">Loading items...</Text>
        </Stack>
      </Center>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <Center h={200}>
        <Stack align="center" gap="md">
          <IconInbox size={48} color="var(--mantine-color-gray-5)" />
          <Text c="dimmed" size="lg">{emptyMessage}</Text>
        </Stack>
      </Center>
    );
  }

  // Render items with view mode layouts
  return (
    <ViewModeLayouts
      items={items.map(item => ({
        ...item,
        id: item.uuid,
        // Ensure consistent naming
        name: item.name || item.title || 'Untitled',
      }))}
      viewMode={viewMode}
      onItemClick={onItemClick}
      renderIcon={renderIcon}
      renderContent={renderContent}
      renderActions={(item) => {
        // Use custom renderActions if provided, otherwise use default ItemActionMenu
        if (renderActions) {
          return renderActions(item);
        }
        
        return (
          <ItemActionMenu
            item={item}
            onToggleFavorite={onToggleFavorite}
            onToggleArchive={onToggleArchive}
            onDelete={onDelete}
            onEdit={onEdit}
            onDownload={onDownload}
            onPreview={onPreview}
            customActions={customActions}
            showFavorite={showFavorite}
            showArchive={showArchive}
            showDelete={showDelete}
            showEdit={showEdit}
            showDownload={showDownload}
            showPreview={showPreview}
          />
        );
      }}
    />
  );
}

export default ModuleLayout;
