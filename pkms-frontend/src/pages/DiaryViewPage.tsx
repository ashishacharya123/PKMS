import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Container, Stack, Group, Button, Title, Text, Badge, Card, Skeleton, Alert, Paper, Image } from '@mantine/core';
import { IconEdit, IconArrowLeft, IconTrash, IconAlertTriangle, IconLock } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import MDEditor from '@uiw/react-md-editor';
import { useDiaryStore } from '../stores/diaryStore';
import { diaryService } from '../services/diaryService';

export default function DiaryViewPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>(); // uuid
  const store = useDiaryStore();

  const [decryptedContent, setDecryptedContent] = useState<string>('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Ensure entries are loaded
  useEffect(() => {
    if (!store.entries || store.entries.length === 0) {
      store.loadEntries();
    }
  }, []);

  const entry = useMemo(() => {
    return store.entries.find((e) => e.uuid === id);
  }, [store.entries, id]);

  // Decrypt when possible
  useEffect(() => {
    const run = async () => {
      if (!entry) return;
      if (!store.encryptionKey) return;
      setIsDecrypting(true);
      try {
        const content = await diaryService.decryptContent(
          entry.encrypted_blob,
          entry.encryption_iv,
          entry.encryption_tag,
          store.encryptionKey
        );
        setDecryptedContent(content);

        // Load first photo if any exists
        try {
          const full = await diaryService.getEntry(entry.uuid);
          const mediaList = await diaryService.getEntryMedia((full as any).id);
          const firstPhoto = (mediaList || []).find((m: any) => m.media_type === 'photo');
          if (firstPhoto) {
            const blob = await diaryService.downloadMedia(firstPhoto.id);
            const url = URL.createObjectURL(blob);
            setPhotoUrl(url);
          } else {
            setPhotoUrl(null);
          }
        } catch {
          setPhotoUrl(null);
        }
      } catch (err) {
        notifications.show({ title: 'Error', message: 'Failed to decrypt entry', color: 'red' });
      } finally {
        setIsDecrypting(false);
      }
    };
    run();
  }, [entry, store.encryptionKey]);

  useEffect(() => {
    return () => {
      if (photoUrl) {
        try { URL.revokeObjectURL(photoUrl); } catch {}
      }
    };
  }, [photoUrl]);

  const handleDelete = () => {
    if (!entry) return;
    modals.openConfirmModal({
      title: 'Delete Diary Entry',
      children: <Text size="sm">Are you sure you want to delete "{entry.title || 'Untitled'}"? This action cannot be undone.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await store.deleteEntry(entry.uuid);
          notifications.show({ title: 'Deleted', message: 'Diary entry deleted', color: 'green' });
          navigate('/diary');
        } catch (err) {
          notifications.show({ title: 'Delete Failed', message: 'Could not delete the entry', color: 'red' });
        }
      }
    });
  };

  if (!id) return null;

  if (!entry) {
    return (
      <Container size="xl">
        <Alert icon={<IconAlertTriangle size={16} />} title="Not found" color="red" variant="light">
          This diary entry was not found.
        </Alert>
        <Button mt="md" variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/diary')}>
          Back to Diary
        </Button>
      </Container>
    );
  }

  if (!store.encryptionKey) {
    return (
      <Container size="xl">
        <Card withBorder>
          <Group justify="space-between" align="center">
            <Group>
              <IconLock size={18} />
              <Title order={4}>Diary Locked</Title>
            </Group>
            <Button onClick={() => navigate('/diary')}>
              Unlock in Diary Page
            </Button>
          </Group>
          <Text c="dimmed" mt="sm">Unlock your diary to view this entry.</Text>
        </Card>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/diary')}>
            Back to Diary
          </Button>
          <Group>
            <Button variant="subtle" leftSection={<IconEdit size={16} />} onClick={() => navigate('/diary')}>
              Edit in Diary
            </Button>
            <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={handleDelete}>
              Delete
            </Button>
          </Group>
        </Group>

        <Card withBorder>
          <Title order={1} mb="sm">{entry.title || 'Untitled'}</Title>
          <Group gap="xs" mb="md">
            {(entry.tags || []).map((tag) => (
              <Badge key={tag} variant="dot" size="sm">{tag}</Badge>
            ))}
          </Group>
          <Text size="xs" c="dimmed" mb="md">
            {new Date(entry.updated_at).toLocaleString()}
          </Text>

          {isDecrypting ? (
            <Skeleton height={300} radius="md" />
          ) : (
            <Paper p="md">
              <MDEditor.Markdown source={decryptedContent} />
            </Paper>
          )}

          {photoUrl && (
            <Paper p="md" mt="md">
              <Image src={photoUrl} alt="Photo" radius="md" fit="contain" h={400} withPlaceholder />
            </Paper>
          )}
        </Card>
      </Stack>
    </Container>
  );
}


