import React, { useState, useEffect } from 'react';
import {
  Container,
  Title,
  Text,
  Tabs,
  Card,
  Group,
  Badge,
  Button,
  Stack,
  Alert,
  LoadingOverlay,
  Modal,
  ActionIcon,
  Tooltip,
  Skeleton,
  Center,
  Box
} from '@mantine/core';
import {
  IconTrash,
  IconRestore,
  IconTrashX,
  IconAlertTriangle,
  IconInfoCircle,
  IconFolder,
  IconFile,
  IconNotes,
  IconCheckbox,
  IconBook,
  IconArchive,
  IconCalendar
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import recycleBinService, { RecycleBinItem } from '../services/recyclebinService';
import deletionImpactService from '../services/deletionImpactService';

type TabValue = 'all' | 'projects' | 'notes' | 'todos' | 'documents' | 'diary' | 'archive';

interface RecycleBinPageProps {}

export function RecycleBinPage({}: RecycleBinPageProps) {
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringItems, setRestoringItems] = useState<string[]>([]);
  const [deletingItems, setDeletingItems] = useState<string[]>([]);
  const [emptyModalOpen, setEmptyModalOpen] = useState(false);
  const [emptyLoading, setEmptyLoading] = useState(false);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RecycleBinItem | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<any>(null);

  // Load items based on active tab
  const loadItems = async () => {
    setLoading(true);
    try {
      let fetchedItems: RecycleBinItem[] = [];
      
      switch (activeTab) {
        case 'all':
          fetchedItems = await recycleBinService.getAllDeletedItems();
          break;
        case 'projects':
          const projects = await recycleBinService.getDeletedProjects();
          fetchedItems = projects.map(item => ({ ...item, type: 'project' as const }));
          break;
        case 'notes':
          const notes = await recycleBinService.getDeletedNotes();
          fetchedItems = notes.map(item => ({ ...item, type: 'note' as const }));
          break;
        case 'todos':
          const todos = await recycleBinService.getDeletedTodos();
          fetchedItems = todos.map(item => ({ ...item, type: 'todo' as const }));
          break;
        case 'documents':
          const documents = await recycleBinService.getDeletedDocuments();
          fetchedItems = documents.map(item => ({ ...item, type: 'document' as const }));
          break;
        case 'diary':
          const diary = await recycleBinService.getDeletedDiaryEntries();
          fetchedItems = diary.map(item => ({ ...item, type: 'diary' as const }));
          break;
        case 'archive':
          const archive = await recycleBinService.getDeletedArchiveItems();
          fetchedItems = archive.map(item => ({ ...item, type: 'archive' as const }));
          break;
      }
      
      setItems(fetchedItems);
    } catch (error) {
      console.error('Error loading deleted items:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load deleted items',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [activeTab]);

  const handleRestore = async (item: RecycleBinItem) => {
    try {
      setRestoringItems(prev => [...prev, item.uuid]);
      await recycleBinService.restoreItem(item);
      
      notifications.show({
        title: 'Success',
        message: `${item.title} has been restored`,
        color: 'green'
      });
      
      // Remove from list
      setItems(prev => prev.filter(i => i.uuid !== item.uuid));
    } catch (error) {
      console.error('Error restoring item:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to restore item',
        color: 'red'
      });
    } finally {
      setRestoringItems(prev => prev.filter(id => id !== item.uuid));
    }
  };

  const handleDeleteForever = async (item: RecycleBinItem) => {
    try {
      // Get deletion impact first
      const impact = await deletionImpactService.analyzeDeletionImpact(
        item.type,
        item.uuid,
        'hard'
      );
      
      setDeletionImpact(impact);
      setSelectedItem(item);
      setPermanentDeleteOpen(true);
    } catch (error) {
      console.error('Error analyzing deletion impact:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to analyze deletion impact',
        color: 'red'
      });
    }
  };

  const confirmPermanentDelete = async () => {
    if (!selectedItem) return;
    
    try {
      setDeletingItems(prev => [...prev, selectedItem.uuid]);
      await recycleBinService.permanentDeleteItem(selectedItem);
      
      notifications.show({
        title: 'Success',
        message: `${selectedItem.title} has been permanently deleted`,
        color: 'green'
      });
      
      // Remove from list
      setItems(prev => prev.filter(i => i.uuid !== selectedItem.uuid));
      setPermanentDeleteOpen(false);
      setSelectedItem(null);
      setDeletionImpact(null);
    } catch (error) {
      console.error('Error permanently deleting item:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to permanently delete item',
        color: 'red'
      });
    } finally {
      setDeletingItems(prev => prev.filter(id => id !== selectedItem.uuid));
    }
  };

  const handleEmptyRecycleBin = async () => {
    try {
      setEmptyLoading(true);
      const result = await recycleBinService.emptyRecycleBin();
      
      notifications.show({
        title: 'Success',
        message: `Recycle bin emptied. ${result.deletedCount} items permanently deleted.`,
        color: 'green'
      });
      
      setItems([]);
      setEmptyModalOpen(false);
    } catch (error) {
      console.error('Error emptying recycle bin:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to empty recycle bin',
        color: 'red'
      });
    } finally {
      setEmptyLoading(false);
    }
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'project': return <IconFolder size={16} />;
      case 'note': return <IconNotes size={16} />;
      case 'todo': return <IconCheckbox size={16} />;
      case 'document': return <IconFile size={16} />;
      case 'diary': return <IconBook size={16} />;
      case 'archive': return <IconArchive size={16} />;
      default: return <IconFile size={16} />;
    }
  };

  const getItemTypeColor = (type: string) => {
    switch (type) {
      case 'project': return 'blue';
      case 'note': return 'green';
      case 'todo': return 'red';
      case 'document': return 'orange';
      case 'diary': return 'purple';
      case 'archive': return 'teal';
      default: return 'gray';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderItemCard = (item: RecycleBinItem) => {
    const isRestoring = restoringItems.includes(item.uuid);
    const isDeleting = deletingItems.includes(item.uuid);
    
    return (
      <Card key={item.uuid} shadow="sm" padding="md" radius="md" withBorder>
        <Group justify="space-between" align="flex-start">
          <Group gap="sm" align="flex-start" style={{ flex: 1 }}>
            {getItemIcon(item.type)}
            <div style={{ flex: 1 }}>
              <Text fw={500} size="sm" lineClamp={2}>
                {item.title}
              </Text>
              <Group gap="xs" mt="xs">
                <Badge size="xs" color={getItemTypeColor(item.type)}>
                  {item.type}
                </Badge>
                {item.tags && item.tags.length > 0 && (
                  <Badge size="xs" variant="light">
                    {item.tags.length} tag{item.tags.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </Group>
              <Text size="xs" c="dimmed" mt="xs">
                Deleted: {formatDate(item.deletedAt || item.updatedAt)}
              </Text>
            </div>
          </Group>
          
          <Group gap="xs">
            <Tooltip label="Restore">
              <ActionIcon
                variant="light"
                color="green"
                size="sm"
                loading={isRestoring}
                disabled={isDeleting}
                onClick={() => handleRestore(item)}
              >
                <IconRestore size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Delete Forever">
              <ActionIcon
                variant="light"
                color="red"
                size="sm"
                loading={isDeleting}
                disabled={isRestoring}
                onClick={() => handleDeleteForever(item)}
              >
                <IconTrashX size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Card>
    );
  };

  const renderEmptyState = () => (
    <Center py="xl">
      <Stack align="center" gap="md">
        <IconTrash size={48} color="var(--mantine-color-gray-4)" />
        <Text size="lg" c="dimmed">
          No deleted items
        </Text>
        <Text size="sm" c="dimmed">
          Items you delete will appear here
        </Text>
      </Stack>
    </Center>
  );

  const renderLoadingSkeleton = () => (
    <Stack gap="md">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} shadow="sm" padding="md" radius="md" withBorder>
          <Group justify="space-between" align="flex-start">
            <Group gap="sm" align="flex-start" style={{ flex: 1 }}>
              <Skeleton height={16} width={16} radius="sm" />
              <div style={{ flex: 1 }}>
                <Skeleton height={16} width="80%" radius="sm" />
                <Skeleton height={12} width="40%" mt="xs" />
                <Skeleton height={12} width="60%" mt="xs" />
              </div>
            </Group>
            <Group gap="xs">
              <Skeleton height={32} width={32} radius="sm" />
              <Skeleton height={32} width={32} radius="sm" />
            </Group>
          </Group>
        </Card>
      ))}
    </Stack>
  );

  return (
    <Container size="lg" py="md">
      <Group justify="space-between" align="center" mb="md">
        <div>
          <Title order={2}>Recycle Bin</Title>
          <Text c="dimmed" size="sm">
            Manage your deleted items
          </Text>
        </div>
        {items.length > 0 && (
          <Button
            variant="filled"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={() => setEmptyModalOpen(true)}
          >
            Empty Recycle Bin
          </Button>
        )}
      </Group>

      <Tabs value={activeTab} onChange={(value) => setActiveTab(value as TabValue)}>
        <Tabs.List>
          <Tabs.Tab value="all" leftSection={<IconTrash size={16} />}>
            All Items ({items.length})
          </Tabs.Tab>
          <Tabs.Tab value="projects" leftSection={<IconFolder size={16} />}>
            Projects
          </Tabs.Tab>
          <Tabs.Tab value="notes" leftSection={<IconNotes size={16} />}>
            Notes
          </Tabs.Tab>
          <Tabs.Tab value="todos" leftSection={<IconCheckbox size={16} />}>
            Todos
          </Tabs.Tab>
          <Tabs.Tab value="documents" leftSection={<IconFile size={16} />}>
            Documents
          </Tabs.Tab>
          <Tabs.Tab value="diary" leftSection={<IconBook size={16} />}>
            Diary
          </Tabs.Tab>
          <Tabs.Tab value="archive" leftSection={<IconArchive size={16} />}>
            Archive
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value={activeTab} pt="md">
          <Box pos="relative">
            <LoadingOverlay visible={loading} />
            {loading ? (
              renderLoadingSkeleton()
            ) : items.length === 0 ? (
              renderEmptyState()
            ) : (
              <Stack gap="md">
                {items.map(renderItemCard)}
              </Stack>
            )}
          </Box>
        </Tabs.Panel>
      </Tabs>

      {/* Empty Recycle Bin Modal */}
      <Modal
        opened={emptyModalOpen}
        onClose={() => setEmptyModalOpen(false)}
        title="Empty Recycle Bin"
        centered
      >
        <Stack gap="md">
          <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
            <Text fw={500}>This action cannot be undone!</Text>
            <Text size="sm">
              This will permanently delete ALL items in your recycle bin.
            </Text>
          </Alert>
          <Text size="sm">
            You are about to permanently delete {items.length} item{items.length !== 1 ? 's' : ''}.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="outline" onClick={() => setEmptyModalOpen(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={emptyLoading}
              onClick={handleEmptyRecycleBin}
            >
              Empty Bin
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Permanent Delete Modal */}
      <Modal
        opened={permanentDeleteOpen}
        onClose={() => {
          setPermanentDeleteOpen(false);
          setSelectedItem(null);
          setDeletionImpact(null);
        }}
        title={selectedItem ? `Permanently Delete "${selectedItem.title}"` : 'Permanently Delete Item'}
        centered
      >
        <Stack gap="md">
          <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
            <Text fw={500}>This action cannot be undone!</Text>
            <Text size="sm">
              The item and any orphaned children will be deleted forever.
            </Text>
          </Alert>
          
          {deletionImpact && (
            <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
              <Text size="sm">
                {deletionImpactService.getImpactSummary(deletionImpact, 'hard')}
              </Text>
            </Alert>
          )}
          
          <Group justify="flex-end" gap="sm">
            <Button
              variant="outline"
              onClick={() => {
                setPermanentDeleteOpen(false);
                setSelectedItem(null);
                setDeletionImpact(null);
              }}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={deletingItems.includes(selectedItem?.uuid || '')}
              onClick={confirmPermanentDelete}
            >
              Delete Forever
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}