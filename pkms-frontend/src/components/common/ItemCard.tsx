/**
 * Generic item card component for notes, todos, documents
 * Reusable across all modules with consistent styling
 */

import { Card, Text, Group, Badge, Stack, ActionIcon, Menu } from '@mantine/core';
import { IconDots, IconEdit, IconTrash, IconStar, IconStarFilled } from '@tabler/icons-react';
import { useMantineTheme } from '@mantine/core';
import { getStatusColor, getPriorityColor, getStatusBackgroundColor, getPriorityBackgroundColor } from '../../theme/colors';
import { TodoStatus, TaskPriority, ProjectStatus } from '../../types/enums';

interface ItemCardProps {
  title: string;
  description?: string;
  status?: TodoStatus | ProjectStatus;
  priority?: TaskPriority;
  tags?: string[];
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleFavorite?: () => void;
  onClick?: () => void;
  children?: React.ReactNode;
}

export function ItemCard({
  title,
  description,
  status,
  priority,
  tags = [],
  isFavorite = false,
  createdAt,
  updatedAt,
  onEdit,
  onDelete,
  onToggleFavorite,
  onClick,
  children
}: ItemCardProps) {
  const theme = useMantineTheme();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <Card 
      shadow="sm" 
      padding="md" 
      radius="md" 
      withBorder
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <Stack gap="sm">
        {/* Header with title and actions */}
        <Group justify="space-between" align="flex-start">
          <Text fw={500} size="lg" lineClamp={2} style={{ flex: 1 }}>
            {title}
          </Text>
          
          <Group gap="xs">
            {onToggleFavorite && (
              <ActionIcon
                variant="subtle"
                color={isFavorite ? 'yellow' : 'gray'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite();
                }}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {isFavorite ? <IconStarFilled size={16} /> : <IconStar size={16} />}
              </ActionIcon>
            )}
            
            <Menu shadow="md" width={200}>
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="More options"
                >
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              
              <Menu.Dropdown>
                {onEdit && (
                  <Menu.Item leftSection={<IconEdit size={14} />} onClick={onEdit}>
                    Edit
                  </Menu.Item>
                )}
                {onDelete && (
                  <Menu.Item 
                    leftSection={<IconTrash size={14} />} 
                    color="red"
                    onClick={onDelete}
                  >
                    Delete
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>

        {/* Description */}
        {description && (
          <Text size="sm" c="dimmed" lineClamp={3}>
            {description}
          </Text>
        )}

        {/* Status and Priority badges */}
        <Group gap="xs">
          {status && (
            <Badge
              color={getStatusColor(theme, status)}
              variant="light"
              style={{
                backgroundColor: getStatusBackgroundColor(theme, status),
                color: getStatusColor(theme, status)
              }}
            >
              {status.replace('_', ' ').toUpperCase()}
            </Badge>
          )}
          
          {priority && (
            <Badge
              color={getPriorityColor(theme, priority)}
              variant="light"
              style={{
                backgroundColor: getPriorityBackgroundColor(theme, priority),
                color: getPriorityColor(theme, priority)
              }}
            >
              {priority.toUpperCase()}
            </Badge>
          )}
        </Group>

        {/* Tags */}
        {tags.length > 0 && (
          <Group gap="xs">
            {tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="outline" size="sm">
                {tag}
              </Badge>
            ))}
            {tags.length > 3 && (
              <Badge variant="outline" size="sm">
                +{tags.length - 3} more
              </Badge>
            )}
          </Group>
        )}

        {/* Custom content */}
        {children}

        {/* Footer with dates */}
        <Group justify="space-between" mt="sm">
          <Text size="xs" c="dimmed">
            Created: {formatDate(createdAt)}
          </Text>
          <Text size="xs" c="dimmed">
            Updated: {formatDate(updatedAt)}
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}
