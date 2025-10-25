import { useState, useMemo } from 'react';
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
  Tooltip,
  Progress,
  RingProgress,
  SimpleGrid
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
  IconCheckbox,
  IconCalendar,
  IconProgress,
  IconGripVertical
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { todosService, Project, Todo } from '../services/todosService';
import { notesService, NoteSummary } from '../services/notesService';
import { unifiedFileService, UnifiedFileItem } from '../services/unifiedFileService';
import { projectApi } from '../services/projectApi';
import { reorderArray, generateDocumentReorderUpdate, getDragPreviewStyles, getDropZoneStyles } from '../utils/dragAndDrop';
import { TodosLayout } from '../components/todos/TodosLayout';
import { ModuleLayout } from '../components/common/ModuleLayout';
import { ModuleHeader } from '../components/common/ModuleHeader';
import { ModuleFilters } from '../components/common/ModuleFilters';

export function ProjectDashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Drag and drop state
  const [draggedDocument, setDraggedDocument] = useState<DocumentSummary | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
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

  const todoCounts = useMemo(() => {
    const byStatus: any = { done: 0, in_progress: 0, pending: 0, blocked: 0, cancelled: 0 };
    for (const t of todos) {
      const k = t.status as keyof typeof byStatus;
      byStatus[k] = (byStatus[k] ?? 0) + 1;
    }
    return {
      ...byStatus,
      total: todos.length,
      completedPct: project?.todo_count ? (project.completed_count / project.todo_count) * 100 : 0,
    };
  }, [todos, project?.todo_count, project?.completed_count]);

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
        unifiedFileService.listDocuments({}), // TODO: Add project filtering by UUID
        todosService.getTodos({}) // TODO: Add project filtering by UUID
      ]);

      // Filter items by project (temporary solution until services support UUID filtering)
      const filteredNotes = notesData.filter(note =>
        note.projects?.some(p => p.uuid === projectData.uuid)
      );
      const filteredDocs = docsData.filter(doc =>
        doc.projects?.some(p => p.uuid === projectData.uuid)
      );
      const filteredTodos = todosData.filter(todo =>
        todo.projects?.some(p => p.uuid === projectData.uuid)
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

  // Drag and drop handlers for document reordering
  const handleDragStart = (e: React.DragEvent, document: DocumentSummary) => {
    setDraggedDocument(document);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', document.uuid);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    
    if (!draggedDocument || !project) return;
    
    const sourceIndex = documents.findIndex(doc => doc.uuid === draggedDocument.uuid);
    if (sourceIndex === -1 || sourceIndex === targetIndex) {
      setDraggedDocument(null);
      setDragOverIndex(null);
      return;
    }

    try {
      // Optimistic update
      const reorderedDocuments = reorderArray(documents, sourceIndex, targetIndex);
      setDocuments(reorderedDocuments);

      // Generate new order for API
      const documentUuids = generateDocumentReorderUpdate(documents, {
        sourceIndex,
        destinationIndex: targetIndex,
        sourceId: draggedDocument.uuid
      });

      // Call API to persist the reorder
      await projectApi.reorderDocuments(project.uuid, documentUuids);

      notifications.show({
        title: 'Success',
        message: 'Document order updated',
        color: 'green'
      });
    } catch (error) {
      console.error('Failed to reorder documents:', error);
      // Revert optimistic update
      setDocuments(documents);
      notifications.show({
        title: 'Error',
        message: 'Failed to reorder documents',
        color: 'red'
      });
    } finally {
      setDraggedDocument(null);
      setDragOverIndex(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedDocument(null);
    setDragOverIndex(null);
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
            {item.title || (item as any).originalName}
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

        {/* Stats with Visual Progress */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
          <Paper p="md" withBorder>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">Total Tasks</Text>
              <Text size="xl" fw={700}>{project.todo_count}</Text>
            </Stack>
          </Paper>
          <Paper p="md" withBorder>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">Completed</Text>
              <Text size="xl" fw={700} c="green">{project.completed_count}</Text>
            </Stack>
          </Paper>
          <Paper p="md" withBorder>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">In Progress</Text>
              <Text size="xl" fw={700} c="blue">
                {todos.filter(t => t.status === 'in_progress').length}
              </Text>
            </Stack>
          </Paper>
          <Paper p="md" withBorder>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">Blocked</Text>
              <Text size="xl" fw={700} c="red">
                {todos.filter(t => t.status === 'blocked').length}
              </Text>
            </Stack>
          </Paper>
        </SimpleGrid>

        {/* Visual Progress Indicator */}
        <Paper p="lg" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600} size="lg">Overall Progress</Text>
              <Text size="xl" fw={700} c="blue">{Math.round(todoCounts.completedPct)}%</Text>
            </Group>
            <Progress
              value={todoCounts.completedPct}
              size="xl"
              radius="md"
              color="blue"
              animated
            />
            <Group gap="xl" justify="center">
              <Stack gap={2} align="center">
                <Text size="xs" c="dimmed">Completed</Text>
                <Badge color="green" variant="filled" size="lg">
                  {project.completed_count}
                </Badge>
              </Stack>
              <Stack gap={2} align="center">
                <Text size="xs" c="dimmed">Remaining</Text>
                <Badge color="gray" variant="filled" size="lg">
                  {project.todo_count - project.completed_count}
                </Badge>
              </Stack>
              <Stack gap={2} align="center">
                <Text size="xs" c="dimmed">Total</Text>
                <Badge color="blue" variant="filled" size="lg">
                  {project.todo_count}
                </Badge>
              </Stack>
            </Group>
          </Stack>
        </Paper>

        {/* Todo Status Breakdown */}
        <Paper p="lg" withBorder>
          <Stack gap="md">
            <Text fw={600} size="lg">Task Status Breakdown</Text>
            <Group justify="center">
              <RingProgress
                size={200}
                thickness={24}
                sections={[
                  { value: project.todo_count > 0 ? (todoCounts.done / project.todo_count) * 100 : 0, color: 'green', tooltip: `Done: ${todoCounts.done}` },
                  { value: project.todo_count > 0 ? (todoCounts.in_progress / project.todo_count) * 100 : 0, color: 'blue', tooltip: `In Progress: ${todoCounts.in_progress}` },
                  { value: project.todo_count > 0 ? (todoCounts.pending / project.todo_count) * 100 : 0, color: 'yellow', tooltip: `Pending: ${todoCounts.pending}` },
                  { value: project.todo_count > 0 ? (todoCounts.blocked / project.todo_count) * 100 : 0, color: 'red', tooltip: `Blocked: ${todoCounts.blocked}` },
                  { value: project.todo_count > 0 ? (todoCounts.cancelled / project.todo_count) * 100 : 0, color: 'gray', tooltip: `Cancelled: ${todoCounts.cancelled}` },
                ]}
                label={
                  <div style={{ textAlign: 'center' }}>
                    <Text size="xl" fw={700}>{project.todo_count}</Text>
                    <Text size="xs" c="dimmed">Total Tasks</Text>
                  </div>
                }
              />
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="xs">
              <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-green-0)' }}>
                <Stack gap={2} align="center">
                  <Badge color="green" size="lg">{todoCounts.done}</Badge>
                  <Text size="xs" c="dimmed">Done</Text>
                </Stack>
              </Paper>
              <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-blue-0)' }}>
                <Stack gap={2} align="center">
                  <Badge color="blue" size="lg">{todoCounts.in_progress}</Badge>
                  <Text size="xs" c="dimmed">In Progress</Text>
                </Stack>
              </Paper>
              <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-yellow-0)' }}>
                <Stack gap={2} align="center">
                  <Badge color="yellow" size="lg">{todoCounts.pending}</Badge>
                  <Text size="xs" c="dimmed">Pending</Text>
                </Stack>
              </Paper>
              <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-red-0)' }}>
                <Stack gap={2} align="center">
                  <Badge color="red" size="lg">{todoCounts.blocked}</Badge>
                  <Text size="xs" c="dimmed">Blocked</Text>
                </Stack>
              </Paper>
              <Paper p="sm" withBorder style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
                <Stack gap={2} align="center">
                  <Badge color="gray" size="lg">{todoCounts.cancelled}</Badge>
                  <Text size="xs" c="dimmed">Cancelled</Text>
                </Stack>
              </Paper>
            </SimpleGrid>
          </Stack>
        </Paper>

        {/* NEW: Project Details */}
        <Group gap="md">
          {/* Project Status */}
          {project.status && (
            <Paper p="md" withBorder style={{ flex: 1 }}>
              <Stack gap={4}>
                <Group gap="xs">
                  <IconProgress size={16} />
                  <Text size="xs" c="dimmed">Status</Text>
                </Group>
                <Badge 
                  color={
                    project.status === 'active' ? 'green' :
                    project.status === 'on_hold' ? 'yellow' :
                    project.status === 'completed' ? 'blue' :
                    project.status === 'cancelled' ? 'red' : 'gray'
                  }
                  variant="light"
                >
                  {project.status.replace('_', ' ').toUpperCase()}
                </Badge>
              </Stack>
            </Paper>
          )}

          {/* Project Timeline */}
          {(project.start_date || project.end_date) && (
            <Paper p="md" withBorder style={{ flex: 1 }}>
              <Stack gap={4}>
                <Group gap="xs">
                  <IconCalendar size={16} />
                  <Text size="xs" c="dimmed">Timeline</Text>
                </Group>
                <Text size="sm">
                  {project.start_date && `Start: ${new Date(project.start_date).toLocaleDateString()}`}
                  {project.start_date && project.end_date && ' • '}
                  {project.end_date && `End: ${new Date(project.end_date).toLocaleDateString()}`}
                </Text>
              </Stack>
            </Paper>
          )}

          {/* Project Progress Percentage */}
          {project.progress_percentage !== undefined && (
            <Paper p="md" withBorder style={{ flex: 1 }}>
              <Stack gap={4}>
                <Group gap="xs">
                  <IconProgress size={16} />
                  <Text size="xs" c="dimmed">Overall Progress</Text>
                </Group>
                <Text size="xl" fw={700} c="blue">{project.progress_percentage}%</Text>
              </Stack>
            </Paper>
          )}

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
            <Tabs.Tab value="todos" leftSection={<IconCheckbox size={14} />}>
              Todos ({todos.length})
            </Tabs.Tab>
            <Tabs.Tab value="notes" leftSection={<IconNote size={14} />}>
              Notes ({notes.length})
            </Tabs.Tab>
            <Tabs.Tab value="documents" leftSection={<IconFile size={14} />}>
              Documents ({documents.length})
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
                    {documents.map((doc, index) => (
                      <div
                        key={doc.uuid}
                        draggable
                        onDragStart={(e) => handleDragStart(e, doc)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        style={{
                          ...getDragPreviewStyles(draggedDocument?.uuid === doc.uuid),
                          ...(dragOverIndex === index ? getDropZoneStyles(true, true) : {})
                        }}
                      >
                        <Paper
                          p="sm"
                          withBorder
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'grab'
                          }}
                        >
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            style={{ cursor: 'grab' }}
                          >
                            <IconGripVertical size={14} />
                          </ActionIcon>
                          <ItemCard
                            item={doc}
                            type="document"
                            onNavigate={() => navigate(`/documents?doc=${doc.uuid}`)}
                          />
                        </Paper>
                      </div>
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
                    {exclusiveDocs.map((doc, index) => (
                      <div
                        key={doc.uuid}
                        draggable
                        onDragStart={(e) => handleDragStart(e, doc)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        style={{
                          ...getDragPreviewStyles(draggedDocument?.uuid === doc.uuid),
                          ...(dragOverIndex === index ? getDropZoneStyles(true, true) : {})
                        }}
                      >
                        <Paper
                          p="sm"
                          withBorder
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'grab'
                          }}
                        >
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            style={{ cursor: 'grab' }}
                          >
                            <IconGripVertical size={14} />
                          </ActionIcon>
                          <ItemCard
                            item={doc}
                            type="document"
                            onNavigate={() => navigate(`/documents?doc=${doc.uuid}`)}
                          />
                        </Paper>
                      </div>
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
                    {linkedDocs.map((doc, index) => (
                      <div
                        key={doc.uuid}
                        draggable
                        onDragStart={(e) => handleDragStart(e, doc)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        style={{
                          ...getDragPreviewStyles(draggedDocument?.uuid === doc.uuid),
                          ...(dragOverIndex === index ? getDropZoneStyles(true, true) : {})
                        }}
                      >
                        <Paper
                          p="sm"
                          withBorder
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'grab'
                          }}
                        >
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            style={{ cursor: 'grab' }}
                          >
                            <IconGripVertical size={14} />
                          </ActionIcon>
                          <ItemCard
                            item={doc}
                            type="document"
                            onNavigate={() => navigate(`/documents?doc=${doc.uuid}`)}
                          />
                        </Paper>
                      </div>
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

          {/* Todos Tab - Modular Kanban/Timeline View */}
          <Tabs.Panel value="todos" pt="md">
            <TodosLayout
              todos={todos.map(todo => ({
                uuid: todo.uuid,
                title: todo.title,
                description: todo.description,
                status: todo.status,
                priority: todo.priority,
                dueDate: todo.dueDate,
                isFavorite: todo.isFavorite,
                isArchived: todo.isArchived,
                tags: todo.tags || [],
                projects: todo.projects || [],
                subtasks: todo.subtasks || [],
                createdAt: todo.createdAt,
                updatedAt: todo.updatedAt
              }))}
              isLoading={loading}
              activeTab="ongoing"
              onCreateTodo={() => {
                // Navigate to create todo with project pre-selected
                navigate(`/todos/new?project=${projectId}`);
              }}
              onRefresh={() => {
                // Refresh todos for this project
                loadProjectData();
              }}
              onTabChange={() => {}}
              viewMode="kanban"
              ViewMenu={() => null}
              onItemClick={(item) => navigate(`/todos/${item.uuid}`)}
              onToggleFavorite={(item) => {
                // Toggle favorite for todo
                console.log('Toggle favorite:', item);
              }}
              onToggleArchive={(item) => {
                // Toggle archive for todo
                console.log('Toggle archive:', item);
              }}
              onDelete={(item) => {
                // Delete todo
                console.log('Delete todo:', item);
              }}
              onEdit={(item) => {
                // Edit todo
                navigate(`/todos/${item.uuid}/edit`);
              }}
              onComplete={(item) => {
                // Complete todo
                console.log('Complete todo:', item);
              }}
              renderIcon={(item) => <IconCheckbox size={16} />}
              renderContent={(item) => (
                <div>
                  <Text size="sm" fw={500}>{item.title}</Text>
                  {item.description && (
                    <Text size="xs" c="dimmed" lineClamp={2}>{item.description}</Text>
                  )}
                </div>
              )}
              projects={[project]}
            />
          </Tabs.Panel>

          {/* Notes Tab - Modular View */}
          <Tabs.Panel value="notes" pt="md">
            <ModuleLayout
              items={notes.map(note => ({
                uuid: note.uuid,
                title: note.title,
                description: note.content,
                isFavorite: note.isFavorite,
                isArchived: note.isArchived,
                tags: note.tags || [],
                createdAt: note.createdAt,
                updatedAt: note.updatedAt
              }))}
              isLoading={loading}
              viewMode="list"
              onItemClick={(item) => navigate(`/notes/${item.uuid}`)}
              onToggleFavorite={(item) => {
                console.log('Toggle favorite note:', item);
              }}
              onToggleArchive={(item) => {
                console.log('Toggle archive note:', item);
              }}
              onDelete={(item) => {
                console.log('Delete note:', item);
              }}
              renderIcon={(item) => <IconNote size={16} />}
              renderContent={(item) => (
                <div>
                  <Text size="sm" fw={500}>{item.title}</Text>
                  <Text size="xs" c="dimmed" lineClamp={2}>{item.description}</Text>
                </div>
              )}
            />
          </Tabs.Panel>

          {/* Documents Tab - Modular View */}
          <Tabs.Panel value="documents" pt="md">
            <ModuleLayout
              items={documents.map(doc => ({
                uuid: doc.uuid,
                title: doc.title,
                description: doc.description,
                isFavorite: doc.isFavorite,
                isArchived: doc.isArchived,
                tags: doc.tags || [],
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt
              }))}
              isLoading={loading}
              viewMode="list"
              onItemClick={(item) => navigate(`/documents/${item.uuid}`)}
              onToggleFavorite={(item) => {
                console.log('Toggle favorite document:', item);
              }}
              onToggleArchive={(item) => {
                console.log('Toggle archive document:', item);
              }}
              onDelete={(item) => {
                console.log('Delete document:', item);
              }}
              renderIcon={(item) => <IconFile size={16} />}
              renderContent={(item) => (
                <div>
                  <Text size="sm" fw={500}>{item.title}</Text>
                  <Text size="xs" c="dimmed" lineClamp={2}>{item.description}</Text>
                </div>
              )}
            />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
