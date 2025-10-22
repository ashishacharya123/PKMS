import { useEffect, useState } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
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
  TagsInput,
  Alert,
  Skeleton,
  Badge,
  Paper,
  Text,
  FileInput,
  Modal,
  Image
} from '@mantine/core';
import {
  IconDeviceFloppy,
  IconX,
  IconEye,
  IconEdit,
  IconMarkdown,
  IconFolder
} from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notesService, Note, type NoteFile } from '../services/notesService';
import { searchService } from '../services/searchService';
import { MultiProjectSelector } from '../components/common/MultiProjectSelector';
import { FileSection } from '../components/file';

export function NoteEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id && id !== 'new');

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [isExclusive, setIsExclusive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Attachments state (images for preview)
  const [noteFiles, setNoteFiles] = useState<NoteFile[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);

  const queryClient = useQueryClient();

  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Load note for editing using consistent pattern
  useAuthenticatedEffect(() => {
    if (!isEditing || !id) return;
    
    const loadNote = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const noteData = await notesService.getNote(id);
        setCurrentNote(noteData);
      } catch (err) {
        setError(err as Error);
        setCurrentNote(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadNote();
  }, [isEditing, id]);

  const createNoteMutation = useMutation({
    mutationFn: notesService.createNote,
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      notifications.show({
        title: 'Note Created',
        message: 'Your note has been created successfully',
        color: 'green'
      });
      // After creating a new note, return to the notes listing and highlight the new item
      navigate('/notes', { state: { highlightNoteId: newNote.uuid } });
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
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof notesService.updateNote>[1] }) => notesService.updateNote(id, data),
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

  useAuthenticatedEffect(() => {
    if (isEditing && currentNote) {
      setTitle(currentNote.title);
      setContent(currentNote.content);
      setTags(currentNote.tags);
      setProjectIds(
        currentNote.projects
          ?.filter(p => !p.isDeleted)
          .map(p => p as any)
          .map(p => p.uuid)
          .filter((uuid: string | null | undefined): uuid is string => Boolean(uuid)) || []
      );
      setIsExclusive(currentNote.isExclusiveMode || false);
      setHasUnsavedChanges(false);
      // Load attachments for this note
      notesService.getNoteFiles(currentNote.uuid).then(setNoteFiles).catch(() => setNoteFiles([]));
    } else if (!isEditing) {
      setTitle('');
      setContent('');
      setTags([]);
      setHasUnsavedChanges(false); // Reset for new note
      setNoteFiles([]);
      setAttachmentFile(null);
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

  const handleTagSearch = async (query: string) => {
    if (query.length < 1) {
      setTagSuggestions([]);
      return;
    }
    
    try {
      const tags = await searchService.getTagAutocomplete(query, 'note');
      setTagSuggestions(tags.map(tag => tag.name));
    } catch (error) {
      console.error('Failed to fetch tag suggestions:', error);
      setTagSuggestions([]);
    }
  };

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
      tags,
      projectIds: projectIds.length > 0 ? projectIds : undefined,
      isExclusiveMode: projectIds.length > 0 ? isExclusive : undefined
    };

    try {
      if (isEditing) {
        await updateNoteMutation.mutateAsync({ id: id!, data: noteData });
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

  const handleUploadImage = async () => {
    if (!isEditing || !currentNote || !attachmentFile) return;
    try {
      setIsUploadingAttachment(true);
      await notesService.uploadFile(attachmentFile, currentNote.uuid);
      const files = await notesService.getNoteFiles(currentNote.uuid);
      setNoteFiles(files);
      setAttachmentFile(null);
      notifications.show({ title: 'Uploaded', message: 'Image attached to note', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Upload failed', message: 'Could not upload image', color: 'red' });
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handlePreviewImage = async (file: NoteFile) => {
    try {
      const blob = await notesService.downloadFile(file.uuid);
      const url = URL.createObjectURL(blob);
      setImagePreview({ url, name: file.original_name || 'image' });
    } catch (e) {
      notifications.show({ title: 'Preview failed', message: 'Could not load image', color: 'red' });
    }
  };

  const handleInsertImageIntoContent = (file: NoteFile) => {
    // Insert markdown image referencing authenticated download endpoint
    const url = notesService.getFileDownloadUrl(file.uuid);
    const toInsert = `\n\n![${file.original_name || 'image'}](${url})\n`;
    setContent((prev) => (prev || '') + toInsert);
    notifications.show({ title: 'Inserted', message: 'Image reference added to content', color: 'green' });
  };

  // Ctrl+S to save
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [title, content, tags, isEditing, id]);

  // Autosave for edit mode
  useEffect(() => {
    if (!isEditing || !currentNote) return;
    if (!hasUnsavedChanges) return;

    const timer = setTimeout(() => {
      const noteData = {
        title: title.trim(),
        content: content.trim(),
        tags
      };
      // Do not autosave empty titles
      if (!noteData.title) return;
      // Silent autosave without user-facing notification
      notesService
        .updateNote(id!, noteData)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['note', id] });
          queryClient.invalidateQueries({ queryKey: ['notes'] });
          setHasUnsavedChanges(false);
        })
        .catch(() => {
          // Optional: surface a subtle warning; keeping silent per UX minimalism
        });
    }, 2000);

    return () => clearTimeout(timer);
  }, [title, content, tags, hasUnsavedChanges, isEditing, currentNote, id]);

  const previewName = imagePreview?.name ?? 'Image';
  const previewUrl = imagePreview?.url;

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
    <>
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
                  <TagsInput
                    label="Tags"
                    placeholder="Type to search and add tags"
                    value={tags}
                    onChange={setTags}
                    data={tagSuggestions}
                    clearable
                    onSearchChange={handleTagSearch}
                    splitChars={[',', ' ']}
                    description="Add multiple tags separated by comma or space. Start typing to see suggestions."
                  />
                  
                  <MultiProjectSelector
                    value={projectIds}
                    onChange={setProjectIds}
                    isExclusive={isExclusive}
                    onExclusiveChange={setIsExclusive}
                    description="Link this note to one or more projects"
                  />
                </Stack>
              </Card>

              {/* Attachments */}
              <FileSection
                module="notes"
                entityId={currentNote?.uuid || ''}
                files={noteFiles as any}
                onFilesUpdate={setNoteFiles as any}
              />

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

    {/* Image Preview Modal for attachments */}
    <Modal
      opened={!!imagePreview}
      onClose={() => setImagePreview(null)}
      title={previewName}
      size="auto"
      centered
    >
      {previewUrl && (
        <div style={{ maxWidth: '90vw', maxHeight: '80vh' }}>
          <Image src={previewUrl} alt={previewName} fit="contain" h={400} radius="md" />
        </div>
      )}
    </Modal>
    </>
  );
} 