/**
 * TagsPage - Global tag management
 */

import { useEffect, useState } from 'react';
import { 
  Container, 
  Title, 
  Stack, 
  Group, 
  Button, 
  Card, 
  Text, 
  Alert, 
  TextInput,
  Table,
  ActionIcon,
  Modal,
  Badge
} from '@mantine/core';
import { 
  IconPlus, 
  IconSearch, 
  IconEdit, 
  IconTrash,
  IconAlertTriangle,
  IconCheck,
  IconTag
} from '@tabler/icons-react';
import { useTagsStore } from '../stores/tagsStore';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';

export function TagsPage() {
  const {
    isLoading,
    error,
    searchQuery,
    filteredTags,
    loadTags,
    createTag,
    updateTag,
    deleteTag,
    searchTags,
    clearError
  } = useTagsStore();

  const [newTagName, setNewTagName] = useState('');
  const [editingTag, setEditingTag] = useState<{ uuid: string; name: string } | null>(null);
  const [editTagName, setEditTagName] = useState('');
  
  const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [tagToDelete, setTagToDelete] = useState<{ uuid: string; name: string; usageCount: number } | null>(null);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    
    const tag = await createTag(newTagName.trim());
    if (tag) {
      notifications.show({
        title: 'Tag Created',
        message: `Tag "${tag.name}" created successfully`,
        color: 'green',
        icon: <IconCheck size={16} />
      });
      setNewTagName('');
      closeCreateModal();
    }
  };

  const handleEditTag = async () => {
    if (!editingTag || !editTagName.trim()) return;
    
    const tag = await updateTag(editingTag.uuid, editTagName.trim());
    if (tag) {
      notifications.show({
        title: 'Tag Updated',
        message: `Tag updated to "${tag.name}"`,
        color: 'green',
        icon: <IconCheck size={16} />
      });
      setEditingTag(null);
      setEditTagName('');
      closeEditModal();
    }
  };

  const handleDeleteTag = async (uuid: string, name: string) => {
    const success = await deleteTag(uuid);
    if (success) {
      notifications.show({
        title: 'Tag Deleted',
        message: `Tag "${name}" deleted successfully`,
        color: 'green',
        icon: <IconCheck size={16} />
      });
    }
  };

  const handleOpenEditModal = (tag: { uuid: string; name: string }) => {
    setEditingTag(tag);
    setEditTagName(tag.name);
    openEditModal();
  };

  const confirmDeleteTag = async () => {
    if (!tagToDelete) return;
    await handleDeleteTag(tagToDelete.uuid, tagToDelete.name);
    closeDeleteModal();
    setTagToDelete(null);
  };

  // getTagUsageCount function deleted - using real tag.usageCount from backend

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2}>Tag Management</Title>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openCreateModal}
            disabled={isLoading}
          >
            Create Tag
          </Button>
        </Group>

        {error && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} />}
            title="Error"
            onClose={clearError}
            withCloseButton
          >
            {error}
          </Alert>
        )}

        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={4}>All Tags</Title>
              <TextInput
                placeholder="Search tags..."
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => searchTags(e.target.value)}
                style={{ width: 300 }}
              />
            </Group>

            {filteredTags.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                {searchQuery ? 'No tags match your search' : 'No tags found'}
              </Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Tag Name</Table.Th>
                    <Table.Th>Usage Count</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredTags.map((tag) => (
                    <Table.Tr key={tag.uuid}>
                      <Table.Td>
                        <Group gap="xs" align="center">
                          <IconTag size={16} />
                          <Text size="sm" fw={500}>
                            {tag.name}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="blue">
                          {tag.usageCount} items
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {new Date(tag.createdAt).toLocaleDateString()}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <ActionIcon
                            variant="light"
                            color="blue"
                            size="sm"
                            onClick={() => handleOpenEditModal(tag)}
                            title="Edit"
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            color="red"
                            size="sm"
                            onClick={() => {
                              setTagToDelete({ 
                                uuid: tag.uuid, 
                                name: tag.name,
                                usageCount: tag.usageCount 
                              });
                              openDeleteModal();
                            }}
                            title="Delete"
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Card>
      </Stack>

      {/* Create Tag Modal */}
      <Modal
        opened={createModalOpened}
        onClose={closeCreateModal}
        title="Create New Tag"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Tag Name"
            placeholder="Enter tag name"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            required
          />

          <Group justify="flex-end">
            <Button variant="light" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
            >
              Create Tag
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Edit Tag Modal */}
      <Modal
        opened={editModalOpened}
        onClose={closeEditModal}
        title="Edit Tag"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Tag Name"
            placeholder="Enter tag name"
            value={editTagName}
            onChange={(e) => setEditTagName(e.target.value)}
            required
          />

          <Group justify="flex-end">
            <Button variant="light" onClick={closeEditModal}>
              Cancel
            </Button>
            <Button 
              onClick={handleEditTag}
              disabled={!editTagName.trim()}
            >
              Update Tag
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Confirm Deletion"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete the tag "<strong>{tagToDelete?.name}</strong>"?
            This will remove it from <strong>{tagToDelete?.usageCount || 0} items</strong>.
          </Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmDeleteTag}>
              Delete Tag
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
