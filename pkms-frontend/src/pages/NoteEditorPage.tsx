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
  MultiSelect,
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
import { useNotesStore } from '../stores/notesStore';
import { notifications } from '@mantine/notifications';

export function NoteEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id && id !== 'new');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [area, setArea] = useState('Inbox');
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const {
    currentNote,
    areas,
    isLoading,
    error,
    loadNote,
    loadAreas,
    createNote,
    updateNote,
    clearCurrentNote,
    clearError
  } = useNotesStore();

  useEffect(() => {
    loadAreas();
    
    if (isEditing) {
      loadNote(parseInt(id!));
    } else {
      clearCurrentNote();
      // Set defaults for new note
      setTitle('');
      setContent('');
      setArea('Inbox');
      setTags([]);
    }

    return () => {
      clearCurrentNote();
    };
  }, [id, isEditing, loadNote, loadAreas, clearCurrentNote]);

  useEffect(() => {
    if (currentNote && isEditing) {
      setTitle(currentNote.title);
      setContent(currentNote.content);
      setArea(currentNote.area);
      setTags(currentNote.tags);
      setHasUnsavedChanges(false);
    }
  }, [currentNote, isEditing]);

  useEffect(() => {
    // Track unsaved changes
    if (isEditing && currentNote) {
      const hasChanges = 
        title !== currentNote.title ||
        content !== currentNote.content ||
        area !== currentNote.area ||
        JSON.stringify(tags.sort()) !== JSON.stringify(currentNote.tags.sort());
      setHasUnsavedChanges(hasChanges);
    } else if (!isEditing) {
      const hasChanges = title.trim() !== '' || content.trim() !== '';
      setHasUnsavedChanges(hasChanges);
    }
  }, [title, content, area, tags, currentNote, isEditing]);

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

    try {
      const noteData = {
        title: title.trim(),
        content: content.trim(),
        area,
        tags
      };

      if (isEditing) {
        const updated = await updateNote(parseInt(id!), noteData);
        if (updated) {
          notifications.show({
            title: 'Note Updated',
            message: 'Your note has been saved successfully',
            color: 'green'
          });
          setHasUnsavedChanges(false);
        }
      } else {
        const created = await createNote(noteData);
        if (created) {
          notifications.show({
            title: 'Note Created',
            message: 'Your note has been created successfully',
            color: 'green'
          });
          navigate(`/notes/${created.id}`);
        }
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save note. Please try again.',
        color: 'red'
      });
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

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
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
            <Text>{error}</Text>
            <Button size="xs" variant="light" onClick={() => { clearError(); navigate('/notes'); }}>
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
                </Title>
                
                <Stack gap="sm">
                  <Select
                    label="Area"
                    placeholder="Select area"
                    data={(() => {
                      // Default PARA method areas
                      const defaultAreas = [
                        { value: 'Inbox', label: 'Inbox' },
                        { value: 'Projects', label: 'Projects' },
                        { value: 'Areas', label: 'Areas' },
                        { value: 'Resources', label: 'Resources' },
                        { value: 'Archive', label: 'Archive' }
                      ];
                      
                      // Additional areas from the database
                      const additionalAreas = areas
                        .filter(a => !defaultAreas.some(d => d.value === a.name))
                        .map(a => ({ value: a.name, label: a.name }));
                      
                      return [...defaultAreas, ...additionalAreas];
                    })()}
                    value={area}
                    onChange={(value) => setArea(value || 'Inbox')}
                    searchable
                  />

                  <MultiSelect
                    label="Tags"
                    placeholder="Add tags"
                    data={tags.map(tag => ({ value: tag, label: tag }))}
                    value={tags}
                    onChange={setTags}
                    searchable
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
                  
                  <div>
                    <Text size="sm" c="dimmed" mb="xs">Area</Text>
                    <Badge variant="light" color="blue">{area}</Badge>
                  </div>
                  
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