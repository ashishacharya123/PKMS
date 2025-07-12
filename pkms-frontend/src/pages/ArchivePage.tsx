import React from 'react';
import { useArchiveStore } from '../stores/archiveStore';
import { Group, Title, Text, Button, FileInput, Stack, Alert, Progress, Paper, SimpleGrid, Center, Loader } from '@mantine/core';
import { IconUpload, IconAlertCircle, IconFile } from '@tabler/icons-react';
import { FolderTree } from '../components/archive/FolderTree';
import { ArchiveItem } from '../types/archive';

function ItemCard({ item }: { item: ArchiveItem }) {
  return (
    <Paper withBorder p="md">
      <Group>
        <IconFile size={32} />
        <Stack gap={0}>
          <Text fw={500} size="sm">{item.name}</Text>
          <Text c="dimmed" size="xs">{item.mime_type} - {(item.file_size / 1024).toFixed(2)} KB</Text>
        </Stack>
      </Group>
    </Paper>
  );
}

export function ArchivePage() {
  const { 
    currentFolder, 
    items,
    isLoadingItems,
    isUploading, 
    uploadProgress, 
    error, 
    uploadFile, 
    setCurrentFolder 
  } = useArchiveStore();
  const [file, setFile] = React.useState<File | null>(null);

  React.useEffect(() => {
    // Load root folders on initial mount
    useArchiveStore.getState().loadFolders();
  }, []);

  const handleUpload = async () => {
    if (!file || !currentFolder) return;
    await uploadFile(file, currentFolder.uuid);
    setFile(null); // Clear file input after upload starts
  };

  return (
    <Group p="md" align="flex-start" gap="xl">
      <Stack style={{ width: 300 }}>
        <Title order={3}>Folders</Title>
        <FolderTree 
          selectedId={currentFolder?.uuid || null}
          onSelect={(treeNode) => setCurrentFolder(treeNode ? treeNode.folder.uuid : null)}
        />
      </Stack>

      <Stack style={{ flex: 1 }}>
        <Title order={3}>{currentFolder?.name || 'Archive Root'}</Title>
        <Paper withBorder p="md">
          <Stack>
            <Text fw={500}>Upload to current folder</Text>
            {error && (
              <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" variant="filled" withCloseButton onClose={() => useArchiveStore.setState({ error: null })}>
                {error}
              </Alert>
            )}

            <Group>
              <FileInput
                placeholder="Choose file"
                value={file}
                onChange={setFile}
                accept="*/*"
                disabled={isUploading || !currentFolder}
                style={{ flex: 1 }}
              />
              <Button
                leftSection={<IconUpload size={14} />}
                onClick={handleUpload}
                loading={isUploading}
                disabled={!file || !currentFolder}
              >
                Upload
              </Button>
            </Group>

            {isUploading && uploadProgress && (
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Uploading {uploadProgress.filename} ({Math.round(uploadProgress.progress)}%)
                </Text>
                <Progress value={uploadProgress.progress} size="sm" animated />
              </Stack>
            )}
          </Stack>
        </Paper>

        <Title order={4} mt="md">Files</Title>
        
        {isLoadingItems ? (
            <Center style={{ height: 200 }}>
                <Loader />
            </Center>
        ) : items.length > 0 ? (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                {items.map(item => <ItemCard key={item.uuid} item={item} />)}
            </SimpleGrid>
        ) : (
            <Center style={{ height: 200 }}>
                <Text c="dimmed">This folder is empty.</Text>
            </Center>
        )}
      </Stack>
    </Group>
  );
} 