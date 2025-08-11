import { useNavigate, useParams } from 'react-router-dom';
import { Container, Stack, Group, Button, Title, Text, Badge, Card, Skeleton, Alert, Paper } from '@mantine/core';
import { IconEdit, IconArrowLeft, IconArchive, IconArchiveOff, IconTrash, IconAlertTriangle } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { notesService, type Note } from '../services/notesService';
import MDEditor from '@uiw/react-md-editor';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';

export default function NoteViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    data: note,
    isLoading,
    error,
  } = useQuery<Note, Error>({
    queryKey: ['note', id],
    queryFn: () => notesService.getNote(parseInt(id!)),
    enabled: Boolean(id),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const handleToggleArchive = async () => {
    if (!note) return;
    try {
      await notesService.toggleArchive(note.id, !note.is_archived);
      queryClient.invalidateQueries({ queryKey: ['note', id] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      notifications.show({
        title: note.is_archived ? 'Unarchived' : 'Archived',
        message: note.is_archived ? 'Note moved back to active' : 'Note moved to archive',
        color: 'green'
      });
    } catch (err) {
      notifications.show({ title: 'Action Failed', message: 'Could not change archive status', color: 'red' });
    }
  };

  const handleDelete = () => {
    if (!note) return;
    modals.openConfirmModal({
      title: 'Delete Note',
      children: <Text size="sm">Are you sure you want to delete "{note.title}"? This action cannot be undone.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await notesService.deleteNote(note.id);
          queryClient.invalidateQueries({ queryKey: ['notes'] });
          notifications.show({ title: 'Note Deleted', message: 'The note was deleted successfully', color: 'green' });
          navigate('/notes');
        } catch (err) {
          notifications.show({ title: 'Delete Failed', message: 'Could not delete the note. Please try again.', color: 'red' });
        }
      }
    });
  };

  if (isLoading) {
    return (
      <Container size="xl">
        <Stack gap="lg">
          <Skeleton height={40} radius="md" />
          <Skeleton height={24} radius="md" />
          <Skeleton height={400} radius="md" />
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl">
        <Alert icon={<IconAlertTriangle size={16} />} title="Error loading note" color="red" variant="light">
          {error.message}
        </Alert>
      </Container>
    );
  }

  if (!note) return null;

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Group>
            <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/notes')}>
              Back to Notes
            </Button>
            {note.is_archived && (
              <Badge variant="light" color="gray">Archived</Badge>
            )}
          </Group>
          <Group>
            <Button variant="subtle" leftSection={<IconEdit size={16} />} onClick={() => navigate(`/notes/${note.id}/edit`)}>
              Edit
            </Button>
            <Button
              variant="subtle"
              leftSection={note.is_archived ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
              onClick={handleToggleArchive}
            >
              {note.is_archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button color="red" variant="light" leftSection={<IconTrash size={16} />} onClick={handleDelete}>
              Delete
            </Button>
          </Group>
        </Group>

        <Card withBorder>
          <Title order={1} mb="sm">{note.title}</Title>
          <Group gap="xs" mb="md">
            {(note.tags || []).map((tag) => (
              <Badge key={tag} variant="dot" size="sm">{tag}</Badge>
            ))}
          </Group>
          <Text size="xs" c="dimmed" mb="md">
            Updated {new Date(note.updated_at).toLocaleString()}
          </Text>
          <Paper p="md">
            <MDEditor.Markdown source={note.content} />
          </Paper>
        </Card>
      </Stack>
    </Container>
  );
}


