/**
 * Common action menu component for edit, delete, favorite operations
 * Reusable across all modules with consistent actions
 */

import { Menu, ActionIcon } from '@mantine/core';
import { 
  IconDots, 
  IconEdit, 
  IconTrash, 
  IconStar, 
  IconStarFilled, 
  IconArchive, 
  IconArchiveOff,
  IconCopy,
  IconShare,
  IconDownload
} from '@tabler/icons-react';

interface ActionMenuProps {
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleFavorite?: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onCopy?: () => void;
  onShare?: () => void;
  onDownload?: () => void;
  isFavorite?: boolean;
  isArchived?: boolean;
  variant?: 'subtle' | 'filled' | 'outline';
  color?: string;
  size?: string | number;
  disabled?: boolean;
  customActions?: Array<{
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    color?: string;
  }>;
}

export function ActionMenu({
  onEdit,
  onDelete,
  onToggleFavorite,
  onArchive,
  onUnarchive,
  onCopy,
  onShare,
  onDownload,
  isFavorite = false,
  isArchived = false,
  variant = 'subtle',
  color = 'gray',
  size = 16,
  disabled = false,
  customActions = []
}: ActionMenuProps) {
  const hasActions = !!(
    onEdit ||
    onDelete ||
    onToggleFavorite ||
    onArchive ||
    onUnarchive ||
    onCopy ||
    onShare ||
    onDownload ||
    customActions.length > 0
  );

  if (!hasActions) {
    return null;
  }

  return (
    <Menu shadow="md" width={200} position="bottom-end">
      <Menu.Target>
        <ActionIcon
          variant={variant}
          color={color}
          size={size}
          disabled={disabled}
          aria-label="More actions"
        >
          <IconDots size={size} />
        </ActionIcon>
      </Menu.Target>
      
      <Menu.Dropdown>
        {onEdit && (
          <Menu.Item 
            leftSection={<IconEdit size={14} />} 
            onClick={onEdit}
          >
            Edit
          </Menu.Item>
        )}
        
        {onToggleFavorite && (
          <Menu.Item 
            leftSection={isFavorite ? <IconStarFilled size={14} /> : <IconStar size={14} />}
            onClick={onToggleFavorite}
          >
            {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
          </Menu.Item>
        )}
        
        {onCopy && (
          <Menu.Item 
            leftSection={<IconCopy size={14} />}
            onClick={onCopy}
          >
            Copy
          </Menu.Item>
        )}
        
        {onShare && (
          <Menu.Item 
            leftSection={<IconShare size={14} />}
            onClick={onShare}
          >
            Share
          </Menu.Item>
        )}
        
        {onDownload && (
          <Menu.Item 
            leftSection={<IconDownload size={14} />}
            onClick={onDownload}
          >
            Download
          </Menu.Item>
        )}
        
        {(onArchive || onUnarchive) && (
          <Menu.Item 
            leftSection={isArchived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
            onClick={isArchived ? onUnarchive : onArchive}
          >
            {isArchived ? 'Unarchive' : 'Archive'}
          </Menu.Item>
        )}
        
        {customActions.map((action, index) => (
          <Menu.Item
            key={index}
            leftSection={action.icon}
            onClick={action.onClick}
            color={action.color}
          >
            {action.label}
          </Menu.Item>
        ))}
        
        {onDelete && (
          <>
            <Menu.Divider />
            <Menu.Item 
              leftSection={<IconTrash size={14} />} 
              color="red"
              onClick={onDelete}
            >
              Delete
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
