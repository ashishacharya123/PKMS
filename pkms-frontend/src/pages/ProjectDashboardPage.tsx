import React, { useState, useEffect } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { useParams } from 'react-router-dom';
import {
  Box,
  Container,
  Title,
  Group,
  Paper,
  Text,
  Stack,
  Badge,
  Tabs,
  Grid,
  Button,
  Modal,
  TextInput,
  Textarea,
  Select,
  NumberInput,
  ActionIcon
} from '@mantine/core';
import { IconPlus, IconEdit, IconTrash, IconArchive, IconCalendar, IconColumns } from '@tabler/icons-react';
import { Project, Todo, createTodo, updateProject, deleteProject } from '../services/todosService';
import { KanbanBoard } from '../components/todos/KanbanBoard';
import { CalendarView } from '../components/todos/CalendarView';

interface ProjectDashboardPageProps {
  onProjectUpdate?: (project: Project) => void;
  onProjectDelete?: (projectId: number) => void;
}

export const ProjectDashboardPage: React.FC<ProjectDashboardPageProps> = ({
  onProjectUpdate,
  onProjectDelete
}) => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createTodoModalOpen, setCreateTodoModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Partial<Project>>({});
  const [newTodo, setNewTodo] = useState({
    title: '',
    description: '',
    priority: 2,
    status: 'pending',
    due_date: ''
  });

  useAuthenticatedEffect(() => {
    if (projectId) {
      loadProjectData();
    }
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      // In a real app, you'd fetch project and todos data here
      // For now, we'll use mock data
      const mockProject: Project = {
        id: parseInt(projectId!),
        name: 'Sample Project',
        description: 'This is a sample project for demonstration',
        color: '#2196F3',
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        todo_count: 15,
        completed_count: 8
      };
      
      const mockTodos: Todo[] = [
        {
          id: 1,
          title: 'Design user interface',
          description: 'Create wireframes and mockups',
          project_id: parseInt(projectId!),
          project_name: 'Sample Project',
          priority: 3,
          status: 'in_progress',
          order_index: 0,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tags: ['design', 'ui'],
          is_archived: false
        },
        {
          id: 2,
          title: 'Implement backend API',
          description: 'Create REST endpoints',
          project_id: parseInt(projectId!),
          project_name: 'Sample Project',
          priority: 4,
          status: 'pending',
          order_index: 1,
          due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tags: ['backend', 'api'],
          is_archived: false
        }
      ];

      setProject(mockProject);
      setTodos(mockTodos);
    } catch (error) {
      console.error('Failed to load project data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectUpdate = async () => {
    if (!project || !editingProject) return;
    
    try {
      const updatedProject = await updateProject(project.id, editingProject);
      setProject(updatedProject);
      setEditModalOpen(false);
      setEditingProject({});
      onProjectUpdate?.(updatedProject);
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  const handleProjectDelete = async () => {
    if (!project) return;
    
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      try {
        await deleteProject(project.id);
        onProjectDelete?.(project.id);
      } catch (error) {
        console.error('Failed to delete project:', error);
      }
    }
  };

  const handleCreateTodo = async () => {
    if (!project || !newTodo.title.trim()) return;
    
    try {
      const createdTodo = await createTodo({
        ...newTodo,
        project_id: project.id
      });
      
      setTodos(prev => [...prev, createdTodo]);
      setCreateTodoModalOpen(false);
      setNewTodo({ title: '', description: '', priority: 2, status: 'pending', due_date: '' });
    } catch (error) {
      console.error('Failed to create todo:', error);
    }
  };

  const handleTodoUpdate = (updatedTodo: Todo) => {
    setTodos(prev => prev.map(todo => todo.id === updatedTodo.id ? updatedTodo : todo));
  };

  const handleTodoDelete = (todoId: number) => {
    setTodos(prev => prev.filter(todo => todo.id !== todoId));
  };

  const handleTodoArchive = (todoId: number) => {
    setTodos(prev => prev.map(todo => 
      todo.id === todoId ? { ...todo, is_archived: true } : todo
    ));
  };

  const handleTodoEdit = (todo: Todo) => {
    // In a real app, you'd open an edit modal here
    console.log('Edit todo:', todo);
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Text>Loading project...</Text>
      </Container>
    );
  }

  if (!project) {
    return (
      <Container size="xl" py="xl">
        <Text>Project not found</Text>
      </Container>
    );
  }

  const activeTodos = todos.filter(todo => !todo.is_archived);
  const overdueTodos = activeTodos.filter(todo => {
    if (!todo.due_date || todo.status === 'done') return false;
    return new Date(todo.due_date) < new Date();
  });

  return (
    <Container size="xl" py="xl">
      {/* Project Header */}
      <Group justify="space-between" mb="xl">
        <Box>
          <Title order={1} mb="xs">
            {project.name}
          </Title>
          {project.description && (
            <Text c="dimmed" size="lg">
              {project.description}
            </Text>
          )}
        </Box>
        
        <Group>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setCreateTodoModalOpen(true)}
          >
            Add Todo
          </Button>
          <Button
            variant="outline"
            leftSection={<IconEdit size={16} />}
            onClick={() => {
              setEditingProject(project);
              setEditModalOpen(true);
            }}
          >
            Edit Project
          </Button>
          <Button
            variant="outline"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={handleProjectDelete}
          >
            Delete Project
          </Button>
        </Group>
      </Box>

      {/* Dashboard Tiles */}
      <Grid mb="xl">
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Paper shadow="xs" p="md" ta="center">
            <Text size="xl" fw={700} c="blue">
              {project.todo_count}
            </Text>
            <Text size="sm" c="dimmed">
              Total Todos
            </Text>
          </Paper>
        </Grid.Col>
        
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Paper shadow="xs" p="md" ta="center">
            <Text size="xl" fw={700} c="green">
              {project.completed_count}
            </Text>
            <Text size="sm" c="dimmed">
              Completed
            </Text>
          </Paper>
        </Grid.Col>
        
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Paper shadow="xs" p="md" ta="center">
            <Text size="xl" fw={700} c="orange">
              {activeTodos.filter(t => t.status === 'in_progress').length}
            </Text>
            <Text size="sm" c="dimmed">
              In Progress
            </Text>
          </Paper>
        </Grid.Col>
        
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Paper shadow="xs" p="md" ta="center">
            <Text size="xl" fw={700} c="red">
              {overdueTodos.length}
            </Text>
            <Text size="sm" c="dimmed">
              Overdue
            </Text>
          </Paper>
        </Grid.Col>
      </Grid>

      {/* Project Tags */}
      {project.tags && project.tags.length > 0 && (
        <Group mb="xl">
          <Text size="sm" fw={500}>Tags:</Text>
          {project.tags.map((tag, index) => (
            <Badge key={index} variant="light">
              {tag}
            </Badge>
          ))}
        </Group>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="kanban">
        <Tabs.List>
                      <Tabs.Tab value="kanban" leftSection={<IconColumns size={16} />}>
            Kanban Board
          </Tabs.Tab>
          <Tabs.Tab value="calendar" leftSection={<IconCalendar size={16} />}>
            Calendar
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="kanban" pt="md">
          <KanbanBoard
            todos={activeTodos}
            onTodoUpdate={handleTodoUpdate}
            onTodoDelete={handleTodoDelete}
            onTodoArchive={handleTodoArchive}
            onTodoEdit={handleTodoEdit}
          />
        </Tabs.Panel>

        <Tabs.Panel value="calendar" pt="md">
          <CalendarView
            todos={activeTodos}
            onTodoEdit={handleTodoEdit}
            onTodoDelete={handleTodoDelete}
            onTodoArchive={handleTodoArchive}
          />
        </Tabs.Panel>
      </Tabs>

      {/* Edit Project Modal */}
      <Modal
        opened={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Project"
        size="md"
      >
        <Stack>
          <TextInput
            label="Project Name"
            value={editingProject.name || ''}
            onChange={(e) => setEditingProject(prev => ({ ...prev, name: e.target.value }))}
            required
          />
          
          <Textarea
            label="Description"
            value={editingProject.description || ''}
            onChange={(e) => setEditingProject(prev => ({ ...prev, description: e.target.value }))}
            rows={3}
          />
          
          <TextInput
            label="Color"
            value={editingProject.color || ''}
            onChange={(e) => setEditingProject(prev => ({ ...prev, color: e.target.value }))}
            placeholder="#2196F3"
          />
          
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleProjectUpdate}>
              Save Changes
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Create Todo Modal */}
      <Modal
        opened={createTodoModalOpen}
        onClose={() => setCreateTodoModalOpen(false)}
        title="Create New Todo"
        size="md"
      >
        <Stack>
          <TextInput
            label="Title"
            value={newTodo.title}
            onChange={(e) => setNewTodo(prev => ({ ...prev, title: e.target.value }))}
            required
          />
          
          <Textarea
            label="Description"
            value={newTodo.description}
            onChange={(e) => setNewTodo(prev => ({ ...prev, description: e.target.value }))}
            rows={3}
          />
          
          <Select
            label="Priority"
            value={newTodo.priority.toString()}
            onChange={(value) => setNewTodo(prev => ({ ...prev, priority: parseInt(value || '2') }))}
            data={[
              { value: '1', label: 'Low' },
              { value: '2', label: 'Medium' },
              { value: '3', label: 'High' },
              { value: '4', label: 'Urgent' }
            ]}
          />
          
          <Select
            label="Status"
            value={newTodo.status}
            onChange={(value) => setNewTodo(prev => ({ ...prev, status: value || 'pending' }))}
            data={[
              { value: 'pending', label: 'Pending' },
              { value: 'in_progress', label: 'In Progress' },
              { value: 'blocked', label: 'Blocked' },
              { value: 'done', label: 'Done' }
            ]}
          />
          
          <TextInput
            label="Due Date"
            type="date"
            value={newTodo.due_date}
            onChange={(e) => setNewTodo(prev => ({ ...prev, due_date: e.target.value }))}
          />
          
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setCreateTodoModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTodo}>
              Create Todo
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
};
