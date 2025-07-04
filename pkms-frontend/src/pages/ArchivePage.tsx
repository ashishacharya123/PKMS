import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Title,
  Text,
  Button,
  Grid,
  Breadcrumbs,
  Anchor,
  Group,
  ActionIcon,
  SegmentedControl,
  Menu,
  TextInput,
  Box,
  Collapse,
  useMantineTheme,
  alpha,
  Stack,
  Paper,
  MantineTheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  IconFolder,
  IconDots,
  IconTrash,
  IconPencil,
  IconArrowRight,
  IconFolderPlus,
  IconUpload,
  IconLayoutGrid,
  IconList,
  IconSortAscending,
  IconSortDescending,
  IconHome,
  IconChevronRight,
  IconChevronDown,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useDebouncedValue } from '@mantine/hooks';
import { useArchiveStore } from '../stores/archiveStore';
import { ArchiveFolder, FolderTree } from '../services/archiveService';

const FolderTreeView = () => {
  const theme = useMantineTheme();
  const { folderTree, navigateToFolder, currentFolderUuid, loadFolderTree } = useArchiveStore(state => ({
    folderTree: state.folderTree,
    navigateToFolder: state.navigateToFolder,
    currentFolderUuid: state.currentFolderUuid,
    loadFolderTree: state.loadFolderTree,
  }));
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const findFolderInTree = useCallback((nodes: FolderTree[], id: string | null): FolderTree | null => {
    for (const node of nodes) {
      if (node.folder.uuid === id) return node;
      if (node.children) {
        const found = findFolderInTree(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  useEffect(() => {
    loadFolderTree();
  }, [loadFolderTree]);

  useEffect(() => {
    const expandToNode = (folderId: string | null) => {
      if (!folderId) return;
      const path = new Set<string>();
      let current = findFolderInTree(folderTree, folderId);
      while (current) {
        if (current.folder.parent_uuid) {
          path.add(current.folder.parent_uuid);
        }
        current = findFolderInTree(folderTree, current.folder.parent_uuid);
      }
      setOpenFolders(prev => new Set([...prev, ...path]));
    };
    expandToNode(currentFolderUuid);
  }, [currentFolderUuid, folderTree, findFolderInTree]);

  const handleToggle = (folderId: string) => {
    setOpenFolders(current => {
      const newSet = new Set(current);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const renderTree = (nodes: FolderTree[], level = 0): JSX.Element[] => {
    return nodes.map((node) => {
      const isOpen = openFolders.has(node.folder.uuid);
      const hasChildren = node.children && node.children.length > 0;

      return (
        <Box key={node.folder.uuid} style={{ paddingLeft: level > 0 ? 20 : 0, position: 'relative' }}>
          {level > 0 && (
            <>
              <Box component="span" style={{ position: 'absolute', left: 8, top: -5, height: '100%', borderLeft: `1px solid ${theme.colors.gray[7]}` }} />
              <Box component="span" style={{ position: 'absolute', left: 8, top: 16, width: 12, borderTop: `1px solid ${theme.colors.gray[7]}` }} />
            </>
          )}
          <Group 
            gap="xs" 
            onClick={() => navigateToFolder(node.folder.uuid)}
            onMouseEnter={() => setHoveredNode(node.folder.uuid)}
            onMouseLeave={() => setHoveredNode(null)}
            style={{
              cursor: 'pointer',
              padding: '8px',
              borderRadius: theme.radius.sm,
              backgroundColor: node.folder.uuid === currentFolderUuid 
                ? alpha(theme.colors.blue[7], 0.25) 
                : (hoveredNode === node.folder.uuid ? alpha(theme.colors.gray[5], 0.1) : 'transparent'),
            }}
          >
            {hasChildren ? (
              <ActionIcon variant="transparent" size="sm" color="gray" onClick={(e) => { e.stopPropagation(); handleToggle(node.folder.uuid); }}>
                {isOpen ? <IconChevronDown /> : <IconChevronRight />}
              </ActionIcon>
            ) : <Box w={28} />}
            <IconFolder size={20} />
            <Text size="sm" fz="sm">{node.folder.name}</Text>
          </Group>
          {hasChildren && <Collapse in={isOpen}>{renderTree(node.children, level + 1)}</Collapse>}
        </Box>
      );
    });
  };

  return (
    <Box>
      <Title order={4} mb="md">Folder Tree</Title>
      <Group 
        gap="xs" 
        onClick={() => navigateToFolder()}
        onMouseEnter={() => setHoveredNode('root')}
        onMouseLeave={() => setHoveredNode(null)}
        style={{
            cursor: 'pointer',
            padding: '8px',
            borderRadius: theme.radius.sm,
            backgroundColor: currentFolderUuid === null 
                ? alpha(theme.colors.blue[7], 0.25) 
                : (hoveredNode === 'root' ? alpha(theme.colors.gray[5], 0.1) : 'transparent'),
        }}
      >
        <IconHome size={20} style={{ marginLeft: 6 }} />
        <Text size="sm" fw={500}>Archive Root</Text>
      </Group>
      {renderTree(folderTree)}
    </Box>
  );
};

export function ArchivePage() {
  const store = useArchiveStore();
  const [filter, setFilter] = useState('');
  const [debouncedFilter] = useDebouncedValue(filter, 200);
  const [action, setAction] = useState<'view' | 'create-folder' | 'edit-folder' | 'upload'>('view');
  const [editingFolder, setEditingFolder] = useState<ArchiveFolder | null>(null);

  const form = useForm({
    initialValues: { uuid: '', name: '', description: '' },
    validate: { name: (value) => (value.trim().length > 0 ? null : 'Folder name is required') },
  });

  useEffect(() => {
    store.navigateToFolder();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateFolderClick = () => {
    form.reset();
    setEditingFolder(null);
    setAction('create-folder');
  };

  const handleEditFolderClick = (folder: ArchiveFolder) => {
    form.setValues({ name: folder.name, description: folder.description || '', uuid: folder.uuid });
    setEditingFolder(folder);
    setAction('edit-folder');
  };

  const handleFormSubmit = async (values: typeof form.values) => {
    const success = editingFolder
      ? await store.updateFolder(values.uuid, { name: values.name, description: values.description })
      : await store.createFolder(values.name, values.description, store.currentFolder?.uuid);
    if (success) {
      setAction('view');
      form.reset();
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    const success = await store.deleteFolder(folderId);
    if (success) {
      notifications.show({ title: 'Folder Deleted', message: 'Folder was deleted.', color: 'green' });
    }
  };
  
  const filteredFolders = store.folders.filter(f => f.name.toLowerCase().includes(debouncedFilter.toLowerCase()));
  const filteredItems = store.items.filter(i => i.name.toLowerCase().includes(debouncedFilter.toLowerCase()));
  const breadcrumbItems = store.breadcrumb.map((item) => (
    <Anchor component="button" type="button" onClick={() => store.navigateToFolder(item.uuid || null)} key={item.uuid}>
      {item.name}
    </Anchor>
  ));

  const renderContent = () => {
    if (action === 'create-folder' || action === 'edit-folder') {
      return (
          <Container size="sm">
            <Title order={2} mb="lg">{action === 'create-folder' ? 'Create New Folder' : 'Edit Folder'}</Title>
            <form onSubmit={form.onSubmit(handleFormSubmit)}>
              <Stack>
                <TextInput label="Folder Name" placeholder="Enter folder name" {...form.getInputProps('name')} required />
                <TextInput label="Description" placeholder="Optional description" {...form.getInputProps('description')} />
                <Group mt="md">
                  <Button type="submit">Save Folder</Button>
                  <Button variant="default" onClick={() => setAction('view')}>Cancel</Button>
                </Group>
              </Stack>
            </form>
          </Container>
      );
    }
    if (action === 'upload') return <Text>Upload form goes here</Text>;

    return (
      <>
        <Title order={2} mb="xs">{store.currentFolder?.name || 'Archive Root'}</Title>
        <Text c="dimmed" mb="lg">{store.folders.length} folders, {store.items.length} files</Text>
        <Title order={4} mb="md">Folders</Title>
        <Grid>
          {filteredFolders.map((folder) => (
            <Grid.Col span={{ base: 12, xs: 6, sm: 4, md: 3 }} key={folder.uuid}>
              <Paper withBorder p="md" radius="md" style={{ position: 'relative' }}>
                <Box onClick={() => store.navigateToFolder(folder.uuid)} style={{ cursor: 'pointer', textAlign: 'center' }}>
                  <IconFolder size={48} />
                  <Text size="sm" mt={4}>{folder.name}</Text>
                  <Text size="xs" c="dimmed">{folder.item_count} files, {folder.subfolder_count} folders</Text>
                </Box>
                <Menu shadow="md" width={200} position="bottom-end">
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" style={{ position: 'absolute', top: 5, right: 5 }}>
                      <IconDots />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => handleEditFolderClick(folder)}>Edit</Menu.Item>
                    <Menu.Item leftSection={<IconArrowRight size={14} />}>Move</Menu.Item>
                    <Menu.Divider />
                    <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => handleDeleteFolder(folder.uuid)}>Delete</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Paper>
            </Grid.Col>
          ))}
        </Grid>
        <Title order={4} mt="xl" mb="md">Files</Title>
        {filteredItems.length === 0 ? <Text>No files in this folder.</Text> : <Text>Files list here.</Text>}
      </>
    );
  };

  return (
    <Container fluid mt="md">
      <Grid>
        <Grid.Col span={{ base: 12, md: 3, lg: 2 }}>
          <FolderTreeView />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 9, lg: 10 }}>
          <Box>
            <Group justify="space-between" mb="lg">
              <Breadcrumbs separator=">">
                <Anchor component="button" type="button" onClick={() => store.navigateToFolder(null)}>
                  <IconHome size={16} />
                </Anchor>
                {breadcrumbItems}
              </Breadcrumbs>
              <Group>
                <Button leftSection={<IconFolderPlus size={16} />} onClick={handleCreateFolderClick}>New Folder</Button>
                <Button leftSection={<IconUpload size={16} />} variant="outline" onClick={() => setAction('upload')}>Upload Files</Button>
              </Group>
            </Group>
            <Group justify="space-between" mb="lg">
              <TextInput placeholder="Search in this folder..." value={filter} onChange={(event) => setFilter(event.currentTarget.value)} w={250} />
              <Group>
                <SegmentedControl
                  value={store.viewMode}
                  onChange={(value) => store.setViewMode(value as 'grid' | 'list')}
                  data={[{ label: <IconLayoutGrid />, value: 'grid' }, { label: <IconList />, value: 'list' }]}
                />
                <SegmentedControl
                  value={store.sortBy}
                  onChange={(value) => store.setSortBy(value as 'name' | 'updated_at')}
                  data={[{ label: 'Name', value: 'name' }, { label: 'Updated', value: 'updated_at' }]}
                />
                <ActionIcon variant="default" onClick={() => store.setSortOrder(store.sortOrder === 'asc' ? 'desc' : 'asc')}>
                  {store.sortOrder === 'asc' ? <IconSortAscending /> : <IconSortDescending />}
                </ActionIcon>
              </Group>
            </Group>
            {store.isLoading ? <Text>Loading...</Text> : renderContent()}
          </Box>
        </Grid.Col>
      </Grid>
    </Container>
  );
}

export default ArchivePage; 