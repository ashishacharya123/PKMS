import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container,
  Grid,
  TextInput,
  Button,
  Group,
  Stack,
  Card,
  Title,
  Select,
  TagsInput,
  ActionIcon,
  Tabs,
  Alert,
  Skeleton,
  Badge,
  Paper,
  Text,
  Divider
} from '@mantine/core';
import {
  IconDeviceFloppy,
  IconX,
  IconEye,
  IconEdit,
  IconMarkdown,
  IconTag,
  IconFolder,
  IconLink,
  IconTrash
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { notifications } from '@mantine/notifications';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notesService, Note } from '../services/notesService';

export function NoteEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id && id !== 'new');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const queryClient = useQueryClient();

  const {
    data: currentNote,
    isLoading,
    error,
  } = useQuery<Note, Error>({
    queryKey: ['note', id],
    queryFn: () => notesService.getNote(parseInt(id!)),
    enabled: isEditing && id !== undefined,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
  });

  const createNoteMutation = useMutation({
    mutationFn: notesService.createNote,
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      notifications.show({
        title: 'Note Created',
        message: 'Your note has been created successfully',
        color: 'green'
      });
      // After creating a new note, return to the notes listing for clearer UX
      navigate('/notes');
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to create note. Please try again.',
        color: 'red'
      });
    }
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof notesService.updateNote>[1] }) => notesService.updateNote(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['note', id] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      notifications.show({
        title: 'Note Updated',
        message: 'Your note has been saved successfully',
        color: 'green'
      });
      setHasUnsavedChanges(false);
    },
    onError: () => {
      notifications.show({
        title: 'Error',
        message: 'Failed to update note. Please try again.',
        color: 'red'
      });
    }
  });

  useEffect(() => {
    if (isEditing && currentNote) {
      setTitle(currentNote.title);
      setContent(currentNote.content);
      setTags(currentNote.tags);
      setHasUnsavedChanges(false);
    } else if (!isEditing) {
      setTitle('');
      setContent('');
      setTags([]);
      setHasUnsavedChanges(false); // Reset for new note
    }
  }, [currentNote, isEditing]);

  useEffect(() => {
    // Track unsaved changes
    if (isEditing && currentNote) {
      const hasChanges = 
        title !== currentNote.title ||
        content !== currentNote.content ||
        JSON.stringify(tags.sort()) !== JSON.stringify(currentNote.tags.sort());
      setHasUnsavedChanges(hasChanges);
    } else if (!isEditing) {
      const hasChanges = title.trim() !== '' || content.trim() !== '';
      setHasUnsavedChanges(hasChanges);
    }
  }, [title, content, tags, currentNote, isEditing]);

  const handleSave = async () => {
    if (!title.trim()) {
      notifications.show({
        title: 'Validation Error',
        message: 'Please enter a title for your note',
        color: 'red'
      });
      return;
    }

    setIsSaving(true);

    const noteData = {
      title: title.trim(),
      content: content.trim(),
      tags
    };

    try {
      if (isEditing) {
        await updateNoteMutation.mutateAsync({ id: parseInt(id!), data: noteData });
      } else {
        await createNoteMutation.mutateAsync(noteData);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        navigate('/notes');
      }
    } else {
      navigate('/notes');
    }
  };

  

  if (isLoading && isEditing) {
    return (
      <Container size="xl">
        <Stack gap="lg">
          <Skeleton height={60} radius="md" />
          <Grid>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Skeleton height={400} radius="md" />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Skeleton height={400} radius="md" />
            </Grid.Col>
          </Grid>
        </Stack>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl">
        <Alert
          icon={<IconEdit size={16} />}
          title="Error loading note"
          color="red"
          variant="light"
        >
          <Group justify="space-between" align="center">
            <Text>{error.message}</Text>
            <Button size="xs" variant="light" onClick={() => { navigate('/notes'); }}>
              Back to Notes
            </Button>
          </Group>
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={1}>
              {isEditing ? 'Edit Note' : 'Create Note'}
            </Title>
            <Text c="dimmed">
              {isEditing ? `Editing: ${currentNote?.title}` : 'Write your thoughts in markdown'}
            </Text>
          </div>
          <Group gap="sm">
            <Button
              variant="subtle"
              leftSection={<IconX size={16} />}
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={handleSave}
              loading={isSaving}
              disabled={!title.trim()}
            >
              {isEditing ? 'Update' : 'Create'} Note
            </Button>
          </Group>
        </Group>

        {hasUnsavedChanges && (
          <Alert color="yellow" variant="light">
            You have unsaved changes
          </Alert>
        )}

        <Grid>
          {/* Main Editor */}
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap="md">
              {/* Title */}
              <TextInput
                label="Title"
                placeholder="Enter note title..."
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                size="md"
                required
              />

              {/* Content Editor */}
              <div>
                <Text fw={500} size="sm" mb="xs">Content</Text>
                <Paper>
                  <MDEditor
                    value={content}
                    onChange={(val) => setContent(val || '')}
                    preview="edit"
                    height={500}
                    data-color-mode={undefined}
                    visibleDragbar={false}
                  />
                </Paper>
              </div>
            </Stack>
          </Grid.Col>

          {/* Sidebar */}
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Stack gap="md">
              {/* Metadata */}
              <Card shadow="sm" padding="md" radius="md" withBorder>
                <Title order={4} mb="md">
                  <Group gap="xs">
                    <IconFolder size={18} />
                    Metadata
                  </Group>
                </Title>                  <Stack gap="sm">
                  <TagsInput
                    label="Tags"
                    placeholder="Type and press Enter to add tags"
                    value={tags}
                    onChange={setTags}
                    splitChars={[',', ' ']}
                    clearable
                    description="Add multiple tags separated by comma or space"
                  />
                </Stack>
              </Card>

              {/* Preview */}
              <Card shadow="sm" padding="md" radius="md" withBorder>
                <Title order={4} mb="md">
                  <Group gap="xs">
                    <IconEye size={18} />
                    Preview
                  </Group>
                </Title>
                
                <Stack gap="xs">
                  {title && (
                    <div>
                      <Text size="sm" c="dimmed" mb="xs">Title</Text>
                      <Text fw={600}>{title}</Text>
                    </div>
                  )}
                  
                  {tags.length > 0 && (
                    <div>
                      <Text size="sm" c="dimmed" mb="xs">Tags</Text>
                      <Group gap="xs">
                        {tags.map(tag => (
                          <Badge key={tag} variant="outline" size="sm">
                            {tag}
                          </Badge>
                        ))}
                      </Group>
                    </div>
                  )}
                  
                  {content && (
                    <div>
                      <Text size="sm" c="dimmed" mb="xs">Content Preview</Text>
                      <Text size="sm" lineClamp={3}>
                        {content.replace(/[#*`]/g, '').substring(0, 100)}...
                      </Text>
                    </div>
                  )}
                </Stack>
              </Card>

              {/* Help */}
              <Card shadow="sm" padding="md" radius="md" withBorder>
                <Title order={4} mb="md">
                  <Group gap="xs">
                    <IconMarkdown size={18} />
                    Markdown Tips
                  </Group>
                </Title>
                
                <Stack gap="xs">
                  <Text size="xs" c="dimmed">
                    <strong># Header</strong> - Creates a heading
                  </Text>
                  <Text size="xs" c="dimmed">
                    <strong>**bold**</strong> - Makes text bold
                  </Text>
                  <Text size="xs" c="dimmed">
                    <strong>*italic*</strong> - Makes text italic
                  </Text>
                  <Text size="xs" c="dimmed">
                    <strong>[[Note Title]]</strong> - Links to other notes
                  </Text>
                  <Text size="xs" c="dimmed">
                    <strong>- item</strong> - Creates a bullet list
                  </Text>
                  <Text size="xs" c="dimmed">
                    <strong>`code`</strong> - Inline code formatting
                  </Text>
                </Stack>
              </Card>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
} 