import { useState, useMemo, useCallback } from 'react';
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
import { todosService, Project, TodoSummary } from '../services/todosService';
import { notesService, NoteSummary } from '../services/notesService';
import { unifiedFileService, UnifiedFileItem } from '../services/unifiedFileService';
import { projectApi } from '../services/projectApi';
import { reorderArray, generateDocumentReorderUpdate, getDragPreviewStyles, getDropZoneStyles } from '../utils/dragAndDrop';
import { TodosLayout } from '../components/todos/TodosLayout';
import { ModuleLayout } from '../components/common/ModuleLayout';
import { ModuleHeader } from '../components/common/ModuleHeader';
import { ModuleFilters } from '../components/common/ModuleFilters';
import { useDataLoader } from '../hooks/useDataLoader';
import { useModal } from '../hooks/useModal';

// Type guards for discriminated unions
type ExclusiveItem = { isExclusiveMode: boolean };
type TaggedItem = { tags: string[] };

function isExclusive(item: any): item is ExclusiveItem {
  return item && typeof item.isExclusiveMode === 'boolean';
}

function hasTags(item: any): item is TaggedItem {
  return item && Array.isArray(item.tags);
}

function getItemTitle(item: NoteSummary | UnifiedFileItem | TodoSummary): string {
  return (item as any).title || (item as any).originalName || 'Untitled';
}

export function ProjectDashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  
  // Modal management
  const deleteModal = useModal();

  // Drag and drop state (keeping as is - complex functionality)
  const [draggedDocument, setDraggedDocument] = useState<UnifiedFileItem | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Project data loading with useDataLoader
  const {
    data: project,
    loading,
    error,
    refetch: refetchProject
  } = useDataLoader(
    () => todosService.getProject(projectId!),
    {
      dependencies: [projectId],
      onError: (error) => {
        console.error('Failed to load project:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load project data',
          color: 'red'
        });
      }
    }
  );

  // Items data loading with useDataLoader
  const {
    data: itemsData = { notes: [], documents: [], todos: [] },
    loading: itemsLoading,
    error: itemsError,
    refetch: refetchItems
  } = useDataLoader(
    async () => {
      if (!project) return { notes: [], documents: [], todos: [] };

      // Load items filtered by project using server-side filtering
      const [notesData, docsData, todosData] = await Promise.all([
        notesService.listNotes({ projectId: project.uuid }),
        unifiedFileService.listDocuments({ projectId: project.uuid }),
        todosService.getTodos({ projectId: project.uuid })
      ]);

      return {
        notes: notesData,
        documents: docsData,
        todos: todosData as TodoSummary[]
      };
    },
    {
      dependencies: [project],
      onError: (error) => {
        console.error('Failed to load project items:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to load project items',
          color: 'red'
        });
      }
    }
  );

  // Extract items from loaded data
  const notes = itemsData.notes || [];
  const documents = itemsData.documents || [];
  const todos = itemsData.todos || [];

  // Combined loading state
  const isLoading = loading || itemsLoading;

  // Combined error handling
  const hasError = error || itemsError;
  
  // Separate exclusive and linked items (with proper type guards)
  const exclusiveNotes = notes.filter(n => isExclusive(n));
  const linkedNotes = notes.filter(n => !isExclusive(n));

  const exclusiveDocs = documents.filter(d => isExclusive(d));
  const linkedDocs = documents.filter(d => !isExclusive(d));

  const exclusiveTodos = todos.filter(t => isExclusive(t));
  const linkedTodos = todos.filter(t => !isExclusive(t));

  const todoCounts = useMemo(() => {
    const byStatus: any = { done: 0, in_progress: 0, pending: 0, blocked: 0, cancelled: 0 };
    for (const t of todos) {
      const k = t.status as keyof typeof byStatus;
      byStatus[k] = (byStatus[k] ?? 0) + 1;
    }
    return {
      ...byStatus,
      total: todos.length,
      completedPct: project?.todoCount ? (project.completedCount / project.todoCount) * 100 : 0,
    };
  }, [todos, project?.todoCount, project?.completedCount]);

  
  const handleDelete = useCallback(() => {
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

    deleteModal.openModal();
  }, [project, exclusiveNotes.length, exclusiveDocs.length, exclusiveTodos.length, linkedNotes.length, linkedDocs.length, linkedTodos.length, deleteModal]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!project) return;

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
  }, [project, navigate]);

  // Drag and drop handlers for document reordering
  const handleDragStart = useCallback((e: React.DragEvent, document: UnifiedFileItem) => {
    setDraggedDocument(document);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', document.uuid);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

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

      // Refetch items to get updated order
      refetchItems();
    } catch (error) {
      console.error('Failed to reorder documents:', error);
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

  const handleDragEnd = useCallback(() => {
    setDraggedDocument(null);
    setDragOverIndex(null);
  }, []);

  if (!project) {
    return (
      <Container size="xl" py="xl">
        <LoadingOverlay visible={isLoading} />
        {!isLoading && (
          <Alert color="red" title="Project Not Found">
            The project you're looking for doesn't exist or you don't have permission to view it.
          </Alert>
        )}
      </Container>
    );
  }

  if (hasError) {
    return (
      <Container size="xl" py="xl">
        <Alert color="red" title="Error Loading Project Data">
          Failed to load project data. Please try refreshing the page.
        </Alert>
      </Container>
    );
  }

  const ItemCard = ({ 
    item, 
    type, 
    onNavigate 
  }: { 
    item: NoteSummary | UnifiedFileItem | TodoSummary; 
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
            {getItemTitle(item)}
          </Text>
        </Group>
        <Group gap="xs">
          {(() => {
            // Use proper type guard for exclusive mode
            const isExclusiveItem = isExclusive(item);
            return isExclusiveItem ? (
              <Tooltip label="Exclusive - Will be deleted with project">
                <IconLock size={16} color="var(--mantine-color-red-6)" />
              </Tooltip>
            ) : (
              <Tooltip label="Linked - Will survive deletion">
                <IconLink size={16} color="var(--mantine-color-blue-6)" />
              </Tooltip>
            );
          })()}
          {hasTags(item) && item.tags.length > 0 && (
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
                  backgroundColor: '#228be6'
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
              <Text size="xl" fw={700}>{project.todoCount}</Text>
            </Stack>
          </Paper>
          <Paper p="md" withBorder>
            <Stack gap={4}>
              <Text size="xs" c="dimmed">Completed</Text>
              <Text size="xl" fw={700} c="green">{project.completedCount}</Text>
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
                  {project.completedCount}
                </Badge>
              </Stack>
              <Stack gap={2} align="center">
                <Text size="xs" c="dimmed">Remaining</Text>
                <Badge color="gray" variant="filled" size="lg">
                  {project.todoCount - project.completedCount}
                </Badge>
              </Stack>
              <Stack gap={2} align="center">
                <Text size="xs" c="dimmed">Total</Text>
                <Badge color="blue" variant="filled" size="lg">
                  {project.todoCount}
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
                  { value: project.todoCount > 0 ? (todoCounts.done / project.todoCount) * 100 : 0, color: 'green', tooltip: `Done: ${todoCounts.done}` },
                  { value: project.todoCount > 0 ? (todoCounts.in_progress / project.todoCount) * 100 : 0, color: 'blue', tooltip: `In Progress: ${todoCounts.in_progress}` },
                  { value: project.todoCount > 0 ? (todoCounts.pending / project.todoCount) * 100 : 0, color: 'yellow', tooltip: `Pending: ${todoCounts.pending}` },
                  { value: project.todoCount > 0 ? (todoCounts.blocked / project.todoCount) * 100 : 0, color: 'red', tooltip: `Blocked: ${todoCounts.blocked}` },
                  { value: project.todoCount > 0 ? (todoCounts.cancelled / project.todoCount) * 100 : 0, color: 'gray', tooltip: `Cancelled: ${todoCounts.cancelled}` },
                ]}
                label={
                  <div style={{ textAlign: 'center' }}>
                    <Text size="xl" fw={700}>{project.todoCount}</Text>
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
              isLoading={isLoading}
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
              isLoading={isLoading}
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
              isLoading={isLoading}
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
