import { SimpleGrid, Card, Stack, Title, Text, Badge, Group } from '@mantine/core';
import { ViewMode } from './ViewMenu';

interface BaseItem {
  id: string | number;
  title?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
}

interface ViewModeLayoutsProps<T extends BaseItem> {
  items: T[];
  viewMode: ViewMode;
  renderSmallIcon: (item: T) => React.ReactNode;
  renderMediumIcon: (item: T) => React.ReactNode;
  renderListItem: (item: T) => React.ReactNode;
  renderDetailColumns: (item: T) => React.ReactNode[];
  detailHeaders: string[];
  onItemClick?: (item: T) => void;
  onItemAction?: (item: T, action: string) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function ViewModeLayouts<T extends BaseItem>({
  items,
  viewMode,
  renderSmallIcon,
  renderMediumIcon,
  renderListItem,
  renderDetailColumns,
  detailHeaders,
  onItemClick,
  onItemAction,
  isLoading = false,
  emptyMessage = 'No items found'
}: ViewModeLayoutsProps<T>) {

  if (isLoading) {
    return (
      <Stack gap="md">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} withBorder p="md" style={{ opacity: 0.6 }}>
            <Stack gap={4}>
              <div style={{ width: 120, height: 12, backgroundColor: '#f0f0f0', borderRadius: 2 }} />
              <div style={{ width: 80, height: 8, backgroundColor: '#f0f0f0', borderRadius: 2 }} />
            </Stack>
          </Card>
        ))}
      </Stack>
    );
  }

  if (items.length === 0) {
    return (
      <Card withBorder p="xl" style={{ textAlign: 'center' }}>
        <Text c="dimmed" size="lg">{emptyMessage}</Text>
      </Card>
    );
  }

  // Small Icons View (6 columns)
  if (viewMode === 'small-icons') {
    return (
      <SimpleGrid cols={{ base: 2, sm: 3, md: 4, lg: 6 }} spacing="xs">
        {items.map((item) => (
          <Card
            key={item.id}
            withBorder
            p="xs"
            style={{ 
              cursor: onItemClick ? 'pointer' : 'default',
              transition: 'all 0.2s ease'
            }}
            sx={onItemClick ? {
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }
            } : undefined}
            onClick={() => onItemClick?.(item)}
          >
            <Stack gap={4} align="center">
              {renderSmallIcon(item)}
              <Text 
                size="xs" 
                lineClamp={2} 
                style={{ textAlign: 'center', wordBreak: 'break-word' }}
              >
                {item.title || item.name || `Item ${item.id}`}
              </Text>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    );
  }

  // Medium Icons View (4 columns)
  if (viewMode === 'medium-icons') {
    return (
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
        {items.map((item) => (
          <Card
            key={item.id}
            withBorder
            padding="md"
            style={{ 
              cursor: onItemClick ? 'pointer' : 'default',
              transition: 'all 0.2s ease'
            }}
            sx={onItemClick ? {
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }
            } : undefined}
            onClick={() => onItemClick?.(item)}
          >
            <Stack gap="sm" align="center">
              {renderMediumIcon(item)}
              <Stack gap={4} align="center" w="100%">
                <Text 
                  size="sm" 
                  fw={500}
                  lineClamp={2} 
                  style={{ textAlign: 'center', wordBreak: 'break-word' }}
                >
                  {item.title || item.name || `Item ${item.id}`}
                </Text>
                {item.tags && item.tags.length > 0 && (
                  <Stack gap={4} justify="center">
                    {item.tags.slice(0, 2).map((tag, idx) => (
                      <Badge key={idx} size="xs" variant="light">
                        {tag}
                      </Badge>
                    ))}
                    {item.tags.length > 2 && (
                      <Badge size="xs" variant="outline">
                        +{item.tags.length - 2}
                      </Badge>
                    )}
                  </Stack>
                )}
              </Stack>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    );
  }

  // List View
  if (viewMode === 'list') {
    return (
      <Stack gap="xs">
        {items.map((item) => (
          <Card
            key={item.id}
            withBorder
            p="md"
            style={{ 
              cursor: onItemClick ? 'pointer' : 'default',
              transition: 'all 0.2s ease'
            }}
            sx={onItemClick ? {
              '&:hover': {
                backgroundColor: 'var(--mantine-color-gray-0)'
              }
            } : undefined}
            onClick={() => onItemClick?.(item)}
          >
            {renderListItem(item)}
          </Card>
        ))}
      </Stack>
    );
  }

  // Details View (Table) - Show all items
  if (viewMode === 'details') {
    return (
      <Card withBorder>
        <Stack gap="md">
          <Title order={5}>Details</Title>
          {items.map((item) => (
            <Stack 
              key={item.id} 
              gap="xs" 
              p="sm" 
              style={{ 
                borderBottom: '1px solid var(--mantine-color-gray-3)',
                cursor: onItemClick ? 'pointer' : 'default'
              }}
              onClick={() => onItemClick?.(item)}
            >
              {detailHeaders.map((header, idx) => (
                <Group key={`${item.id}-${header}`} justify="space-between" align="center">
                  <Text fw={500}>{header}</Text>
                  <Text>{renderDetailColumns(item)[idx]}</Text>
                </Group>
              ))}
            </Stack>
          ))}
        </Stack>
      </Card>
    );
  }

  return null;
}

// Utility function for formatting dates
export function formatDate(dateString: string | undefined): string {
  if (!dateString) return 'N/A';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return 'Invalid Date';
  }
}

// Utility function for formatting file sizes
export function formatFileSize(bytes: number | undefined): string {
  if (!bytes || bytes === 0) return 'N/A';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

export default ViewModeLayouts;
