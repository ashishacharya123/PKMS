import { useState } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Title,
  Group,
  Paper,
  Text,
  Stack,
  Badge,
  Tabs,
  Button,
  ActionIcon,
  Alert,
  LoadingOverlay,
  Tooltip
} from '@mantine/core';
import {
  IconArrowLeft,
  IconEdit,
  IconTrash,
  IconLock,
  IconLink,
  IconAlertTriangle,
  IconNote,
  IconFile,
  IconCheckbox
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { todosService, Project, Todo } from '../services/todosService';
import { notesService, NoteSummary } from '../services/notesService';
import { documentsService, DocumentSummary } from '../services/documentsService';

export function ProjectDashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Items state
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  
  // Separate exclusive and linked items
  const exclusiveNotes = notes.filter(n => n.isExclusiveMode);
  const linkedNotes = notes.filter(n => !n.isExclusiveMode);
  
  const exclusiveDocs = documents.filter(d => d.isExclusiveMode);
  const linkedDocs = documents.filter(d => !d.isExclusiveMode);
  
  const exclusiveTodos = todos.filter(t => t.isExclusiveMode);
  const linkedTodos = todos.filter(t => !t.isExclusiveMode);

  useAuthenticatedEffect(() => {
    if (projectId) {
      loadProjectData();
    }
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      
      // Load project details
      const projectData = await todosService.getProject(projectId!);
      setProject(projectData);
      
      // Load all items for this project
      const [notesData, docsData, todosData] = await Promise.all([
        notesService.listNotes({}), // TODO: Add project filtering by UUID
        documentsService.listDocuments({}), // TODO: Add project filtering by UUID
        todosService.getTodos({}) // TODO: Add project filtering by UUID
      ]);

      // Filter items by project (temporary solution until services support UUID filtering)
      const filteredNotes = notesData.filter(note =>
        note.projects?.some(p => p.id === projectData.id)
      );
      const filteredDocs = docsData.filter(doc =>
        doc.projects?.some(p => p.id === projectData.id)
      );
      const filteredTodos = todosData.filter(todo =>
        todo.projects?.some(p => p.id === projectData.id)
      );

      setNotes(filteredNotes);
      setDocuments(filteredDocs);
      setTodos(filteredTodos as Todo[]);
    } catch (error) {
      console.error('Failed to load project data:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load project data',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    
    const exclusiveCount = exclusiveNotes.length + exclusiveDocs.length + exclusiveTodos.length;
    const linkedCount = linkedNotes.length + linkedDocs.length + linkedTodos.length;
    
    const confirmMessage = `Delete project "${project.name}"?\n\n⚠️ Warning:\n` +
      `- ${exclusiveCount} exclusive items will be PERMANENTLY DELETED\n` +
      `- ${linkedCount} linked items will preserve project name as "deleted"\n\n` +
      `This action cannot be undone!`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await todosService.deleteProject(project.uuid!);
      notifications.show({
        title: 'Success',
        message: 'Project deleted successfully',
        color: 'green'
      });
      navigate('/projects');
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete project',
        color: 'red'
      });
    }
  };

  if (!project) {
    return (
      <Container size="xl" py="xl">
        <LoadingOverlay visible={loading} />
        {!loading && (
          <Alert color="red" title="Project Not Found">
            The project you're looking for doesn't exist or you don't have permission to view it.
          </Alert>
        )}
      </Container>
    );
  }

  const ItemCard = ({ 
    item, 
    type, 
    onNavigate 
  }: { 
    item: NoteSummary | DocumentSummary | Todo; 
    type: 'note' | 'document' | 'todo';
    onNavigate: () => void;
  }) => (
    <Paper
      p="sm"
      withBorder
      style={{ cursor: 'pointer' }}
      onClick={onNavigate}
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
          {type === 'note' && <IconNote size={18} />}
          {type === 'document' && <IconFile size={18} />}
          {type === 'todo' && <IconCheckbox size={18} />}
          <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
            {item.title || (item as any).original_name}
          </Text>
        </Group>
        <Group gap="xs">
          {(() => {
            // Normalize both camelCase and snake_case
            const isExclusive = (item as any).isExclusiveMode ?? (item as any).is_exclusive_mode ?? false;
            return isExclusive ? (
              <Tooltip label="Exclusive - Will be deleted with project">
                <IconLock size={16} color="var(--mantine-color-red-6)" />
              </Tooltip>
            ) : (
              <Tooltip label="Linked - Will survive deletion">
                <IconLink size={16} color="var(--mantine-color-blue-6)" />
              </Tooltip>
            );
          })()}
          {item.tags && item.tags.length > 0 && (
            <Badge size="xs" variant="dot">
              {item.tags.length} tags
            </Badge>
          )}
        </Group>
      </Group>
    </Paper>
  );

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Stack gap="xs">
            <Group gap="sm">
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => navigate('/projects')}
              >
                <IconArrowLeft size={18} />
              </ActionIcon>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  backgroundColor: project.color
                }}
              />
              <Title order={2}>{project.name}</Title>
            </Group>
            {project.description && (
              <Text size="sm" c="dimmed" ml={44}>
                {project.description}
              </Text>
            )}
          </Stack>
          <Group>
            <Button
              variant="light"
              leftSection={<IconEdit size={18} />}
              onClick={() => navigate(`/projects`)} // Navigate back to list where edit modal opens
            >
              Edit
            </Button>
            <Button
              variant="light"
              color="red"
              leftSection={<IconTrash size={18} />}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </Group>
        </Group>

        {/* Stats */}
        <Group gap="md">
          <Paper p="md" withBorder style={{ flex: 1 }}>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">Total Tasks</Text>
              <Text size="xl" fw={700}>{project.todo_count}</Text>
            </Stack>
          </Paper>
          <Paper p="md" withBorder style={{ flex: 1 }}>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">Completed</Text>
              <Text size="xl" fw={700} c="green">{project.completed_count}</Text>
            </Stack>
          </Paper>
          <Paper p="md" withBorder style={{ flex: 1 }}>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">Progress</Text>
              <Text size="xl" fw={700} c="blue">
                {project.todo_count > 0 ? Math.round((project.completed_count / project.todo_count) * 100) : 0}%
              </Text>
            </Stack>
          </Paper>
        </Group>

        {/* Exclusive Items Warning */}
        {(exclusiveNotes.length > 0 || exclusiveDocs.length > 0 || exclusiveTodos.length > 0) && (
          <Alert
            icon={<IconAlertTriangle size={16} />}
            title="Exclusive Items Warning"
            color="orange"
            variant="light"
          >
            <Text size="sm">
              This project contains <strong>{exclusiveNotes.length + exclusiveDocs.length + exclusiveTodos.length} exclusive items</strong> that will be permanently deleted if this project is deleted.
            </Text>
          </Alert>
        )}

        {/* Items Tabs */}
        <Tabs defaultValue="all">
          <Tabs.List>
            <Tabs.Tab value="all">
              All Items ({notes.length + documents.length + todos.length})
            </Tabs.Tab>
            <Tabs.Tab value="exclusive" leftSection={<IconLock size={14} />}>
              Exclusive ({exclusiveNotes.length + exclusiveDocs.length + exclusiveTodos.length})
            </Tabs.Tab>
            <Tabs.Tab value="linked" leftSection={<IconLink size={14} />}>
              Linked ({linkedNotes.length + linkedDocs.length + linkedTodos.length})
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="all" pt="md">
            <Stack gap="md">
              {/* Notes */}
              {notes.length > 0 && (
                <div>
                  <Text size="sm" fw={600} mb="xs">📝 Notes ({notes.length})</Text>
                  <Stack gap="xs">
                    {notes.map(note => (
                      <ItemCard
                        key={note.uuid}
                        item={note}
                        type="note"
                        onNavigate={() => navigate(`/notes/${note.uuid}`)}
                      />
                    ))}
                  </Stack>
                </div>
              )}

              {/* Documents */}
              {documents.length > 0 && (
                <div>
                  <Text size="sm" fw={600} mb="xs">📄 Documents ({documents.length})</Text>
                  <Stack gap="xs">
                    {documents.map(doc => (
                      <ItemCard
                        key={doc.uuid}
                        item={doc}
                        type="document"
                        onNavigate={() => navigate(`/documents?doc=${doc.uuid}`)}
                      />
                    ))}
                  </Stack>
                </div>
              )}

              {/* Todos */}
              {todos.length > 0 && (
                <div>
                  <Text size="sm" fw={600} mb="xs">✓ Tasks ({todos.length})</Text>
                  <Stack gap="xs">
                    {todos.map(todo => (
                      <ItemCard
                        key={todo.uuid}
                        item={todo}
                        type="todo"
                        onNavigate={() => navigate(`/todos?todo=${todo.uuid}`)}
                      />
                    ))}
                  </Stack>
                </div>
              )}

              {notes.length === 0 && documents.length === 0 && todos.length === 0 && (
                <Paper p="xl" withBorder>
                  <Text ta="center" c="dimmed">
                    No items in this project yet. Create notes, documents, or todos and link them to this project!
                  </Text>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="exclusive" pt="md">
            <Stack gap="md">
              <Alert icon={<IconLock size={16} />} color="red" variant="light">
                <Text size="sm">
                  <strong>Exclusive items</strong> are permanently deleted when this project is deleted. They only exist within this project.
                </Text>
              </Alert>

              {exclusiveNotes.length > 0 && (
                <div>
                  <Text size="sm" fw={600} mb="xs">📝 Exclusive Notes ({exclusiveNotes.length})</Text>
                  <Stack gap="xs">
                    {exclusiveNotes.map(note => (
                      <ItemCard
                        key={note.uuid}
                        item={note}
                        type="note"
                        onNavigate={() => navigate(`/notes/${note.uuid}`)}
                      />
                    ))}
                  </Stack>
                </div>
              )}

              {exclusiveDocs.length > 0 && (
                <div>
                  <Text size="sm" fw={600} mb="xs">📄 Exclusive Documents ({exclusiveDocs.length})</Text>
                  <Stack gap="xs">
                    {exclusiveDocs.map(doc => (
                      <ItemCard
                        key={doc.uuid}
                        item={doc}
                        type="document"
                        onNavigate={() => navigate(`/documents?doc=${doc.uuid}`)}
                      />
                    ))}
                  </Stack>
                </div>
              )}

              {exclusiveTodos.length > 0 && (
                <div>
                  <Text size="sm" fw={600} mb="xs">✓ Exclusive Tasks ({exclusiveTodos.length})</Text>
                  <Stack gap="xs">
                    {exclusiveTodos.map(todo => (
                      <ItemCard
                        key={todo.uuid}
                        item={todo}
                        type="todo"
                        onNavigate={() => navigate(`/todos?todo=${todo.uuid}`)}
                      />
                    ))}
                  </Stack>
                </div>
              )}

              {exclusiveNotes.length === 0 && exclusiveDocs.length === 0 && exclusiveTodos.length === 0 && (
                <Paper p="xl" withBorder>
                  <Text ta="center" c="dimmed">
                    No exclusive items. Items created with "Exclusive Mode" enabled will appear here.
                  </Text>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="linked" pt="md">
            <Stack gap="md">
              <Alert icon={<IconLink size={16} />} color="blue" variant="light">
                <Text size="sm">
                  <strong>Linked items</strong> survive project deletion. The project name is preserved as a "deleted" badge.
                </Text>
              </Alert>

              {linkedNotes.length > 0 && (
                <div>
                  <Text size="sm" fw={600} mb="xs">📝 Linked Notes ({linkedNotes.length})</Text>
                  <Stack gap="xs">
                    {linkedNotes.map(note => (
                      <ItemCard
                        key={note.uuid}
                        item={note}
                        type="note"
                        onNavigate={() => navigate(`/notes/${note.uuid}`)}
                      />
                    ))}
                  </Stack>
                </div>
              )}

              {linkedDocs.length > 0 && (
                <div>
                  <Text size="sm" fw={600} mb="xs">📄 Linked Documents ({linkedDocs.length})</Text>
                  <Stack gap="xs">
                    {linkedDocs.map(doc => (
                      <ItemCard
                        key={doc.uuid}
                        item={doc}
                        type="document"
                        onNavigate={() => navigate(`/documents?doc=${doc.uuid}`)}
                      />
                    ))}
                  </Stack>
                </div>
              )}

              {linkedTodos.length > 0 && (
                <div>
                  <Text size="sm" fw={600} mb="xs">✓ Linked Tasks ({linkedTodos.length})</Text>
                  <Stack gap="xs">
                    {linkedTodos.map(todo => (
                      <ItemCard
                        key={todo.uuid}
                        item={todo}
                        type="todo"
                        onNavigate={() => navigate(`/todos?todo=${todo.uuid}`)}
                      />
                    ))}
                  </Stack>
                </div>
              )}

              {linkedNotes.length === 0 && linkedDocs.length === 0 && linkedTodos.length === 0 && (
                <Paper p="xl" withBorder>
                  <Text ta="center" c="dimmed">
                    No linked items. Items created with "Exclusive Mode" disabled will appear here.
                  </Text>
                </Paper>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
