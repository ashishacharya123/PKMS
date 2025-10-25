/**
 * Reusable action menu component for all modules
 * Provides consistent three-dot menu with common actions
 */

import React from 'react';
import { Menu, ActionIcon, Tooltip } from '@mantine/core';
import { IconDots, IconStar, IconStarFilled, IconArchive, IconTrash, IconEdit, IconDownload, IconEye } from '@tabler/icons-react';
import { ItemActionMenuProps } from '../../types/common';

export function ItemActionMenu({
  item,
  onToggleFavorite,
  onToggleArchive,
  onDelete,
  onEdit,
  onDownload,
  onPreview,
  customActions = [],
  showFavorite = true,
  showArchive = true,
  showDelete = true,
  showEdit = false,
  showDownload = false,
  showPreview = false,
}: ItemActionMenuProps) {
  const allActions = [
    // Favorite toggle
    ...(showFavorite && onToggleFavorite ? [{
      label: item.isFavorite ? 'Remove from Favorites' : 'Add to Favorites',
      icon: item.isFavorite ? IconStarFilled : IconStar,
      onClick: onToggleFavorite,
      color: item.isFavorite ? '#ffd43b' : undefined,
    }] : []),
    
    // Archive toggle
    ...(showArchive && onToggleArchive ? [{
      label: item.isArchived ? 'Unarchive' : 'Archive',
      icon: IconArchive,
      onClick: onToggleArchive,
      color: item.isArchived ? 'orange' : undefined,
    }] : []),
    
    // Edit
    ...(showEdit && onEdit ? [{
      label: 'Edit',
      icon: IconEdit,
      onClick: onEdit,
    }] : []),
    
    // Download
    ...(showDownload && onDownload ? [{
      label: 'Download',
      icon: IconDownload,
      onClick: onDownload,
    }] : []),
    
    // Preview
    ...(showPreview && onPreview ? [{
      label: 'Preview',
      icon: IconEye,
      onClick: onPreview,
    }] : []),
    
    // Custom actions
    ...customActions,
    
    // Delete (always last)
    ...(showDelete && onDelete ? [{
      label: 'Delete',
      icon: IconTrash,
      onClick: onDelete,
      color: 'red',
    }] : []),
  ];

  if (allActions.length === 0) {
    return null;
  }

  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <Tooltip label="More actions">
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={(e) => e.stopPropagation()}
          >
            <IconDots size={14} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>

      <Menu.Dropdown>
        {allActions.map((action, index) => {
          const Icon = action.icon;
          const isHidden = (action as any).hidden?.(item);
          
          if (isHidden) return null;
          
          return (
            <Menu.Item
              key={index}
              leftSection={<Icon size={14} />}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick(item);
              }}
              color={action.color}
              disabled={(action as any).disabled}
            >
              {action.label}
            </Menu.Item>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
}

export default ItemActionMenu;
