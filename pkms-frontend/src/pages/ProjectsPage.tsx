import { useState } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Title,
  Text,
  Group,
  Stack,
  Button,
  TextInput,
  Badge,
  ActionIcon,
  Menu,
  Paper,
  Grid,
  Modal,
  Textarea,
  ColorInput,
  Alert,
  LoadingOverlay
} from '@mantine/core';
import {
  IconPlus,
  IconSearch,
  IconDots,
  IconEdit,
  IconTrash,
  IconArchive,
  IconArchiveOff,
  IconFolder,
  IconFolders,
  IconCircleCheck,
  IconAlertCircle
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { todosService, Project } from '../services/todosService';

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#228be6'
  });

  useAuthenticatedEffect(() => {
    loadProjects();
  }, [showArchived]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await todosService.getProjects(showArchived);
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to load projects',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      notifications.show({
        title: 'Validation Error',
        message: 'Project name is required',
        color: 'red'
      });
      return;
    }

    try {
      await todosService.createProject({
        name: formData.name.trim(),
        description: formData.description.trim(),
        color: formData.color
      });
      
      notifications.show({
        title: 'Success',
        message: 'Project created successfully',
        color: 'green'
      });
      
      setCreateModalOpen(false);
      setFormData({ name: '', description: '', color: '#228be6' });
      loadProjects();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to create project',
        color: 'red'
      });
    }
  };

  const handleUpdate = async () => {
    if (!selectedProject || !formData.name.trim()) return;

    try {
      await todosService.updateProject(selectedProject.id, {
        name: formData.name.trim(),
        description: formData.description.trim(),
        color: formData.color
      });
      
      notifications.show({
        title: 'Success',
        message: 'Project updated successfully',
        color: 'green'
      });
      
      setEditModalOpen(false);
      setSelectedProject(null);
      setFormData({ name: '', description: '', color: '#228be6' });
      loadProjects();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update project',
        color: 'red'
      });
    }
  };

  const handleDelete = async (project: Project) => {
    if (!window.confirm(`Delete project "${project.name}"?\n\n⚠️ Warning:\n- Exclusive items will be permanently deleted\n- Linked items will preserve project name as "deleted"`)) {
      return;
    }

    try {
      await todosService.deleteProject(project.id);
      notifications.show({
        title: 'Success',
        message: 'Project deleted successfully',
        color: 'green'
      });
      loadProjects();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete project',
        color: 'red'
      });
    }
  };

  const handleArchiveToggle = async (project: Project) => {
    try {
      await todosService.updateProject(project.id, {
        ...project,
        is_archived: !project.is_archived
      });
      notifications.show({
        title: 'Success',
        message: `Project ${project.is_archived ? 'unarchived' : 'archived'}`,
        color: 'green'
      });
      loadProjects();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update project',
        color: 'red'
      });
    }
  };

  const openEditModal = (project: Project) => {
    setSelectedProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
      color: project.color
    });
    setEditModalOpen(true);
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getCompletionPercentage = (project: Project) => {
    if (project.todo_count === 0) return 0;
    return Math.round((project.completed_count / project.todo_count) * 100);
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={1}>
              <Group gap="xs">
                <IconFolders size={32} />
                Projects
              </Group>
            </Title>
            <Text size="sm" c="dimmed" mt="xs">
              Manage your project portfolios and track progress
            </Text>
          </div>
          <Button
            leftSection={<IconPlus size={18} />}
            onClick={() => setCreateModalOpen(true)}
          >
            New Project
          </Button>
        </Group>

        {/* Filters */}
        <Group justify="space-between">
          <TextInput
            placeholder="Search projects..."
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, maxWidth: 400 }}
          />
          <Button
            variant={showArchived ? 'filled' : 'light'}
            leftSection={showArchived ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? 'Show Active' : 'Show Archived'}
          </Button>
        </Group>

        {/* Projects Grid */}
        <div style={{ position: 'relative', minHeight: 200 }}>
          <LoadingOverlay visible={loading} />
          
          {filteredProjects.length === 0 ? (
            <Paper p="xl" withBorder>
              <Stack align="center" gap="md">
                <IconFolder size={48} stroke={1.5} color="var(--mantine-color-gray-5)" />
                <div>
                  <Text ta="center" fw={500}>
                    {searchQuery ? 'No projects found' : showArchived ? 'No archived projects' : 'No projects yet'}
                  </Text>
                  <Text ta="center" size="sm" c="dimmed">
                    {searchQuery ? 'Try a different search term' : 'Create your first project to get started'}
                  </Text>
                </div>
                {!searchQuery && !showArchived && (
                  <Button
                    leftSection={<IconPlus size={18} />}
                    onClick={() => setCreateModalOpen(true)}
                  >
                    Create Project
                  </Button>
                )}
              </Stack>
            </Paper>
          ) : (
            <Grid>
              {filteredProjects.map((project) => {
                const completionPct = getCompletionPercentage(project);
                
                return (
                  <Grid.Col key={project.id} span={{ base: 12, sm: 6, md: 4 }}>
                    <Paper
                      p="md"
                      withBorder
                      style={{ 
                        cursor: 'pointer',
                        borderLeft: `4px solid ${project.color}`,
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        ':hover': {
                          transform: 'translateY(-2px)',
                          boxShadow: 'var(--mantine-shadow-md)'
                        }
                      }}
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      <Stack gap="sm">
                        {/* Header */}
                        <Group justify="space-between" wrap="nowrap">
                          <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: '50%',
                                backgroundColor: project.color,
                                flexShrink: 0
                              }}
                            />
                            <Text fw={600} size="lg" truncate style={{ flex: 1 }}>
                              {project.name}
                            </Text>
                          </Group>
                          <Menu shadow="md" width={200}>
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray" onClick={(e) => e.stopPropagation()}>
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                leftSection={<IconEdit size={16} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(project);
                                }}
                              >
                                Edit
                              </Menu.Item>
                              <Menu.Item
                                leftSection={project.is_archived ? <IconArchiveOff size={16} /> : <IconArchive size={16} />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleArchiveToggle(project);
                                }}
                              >
                                {project.is_archived ? 'Unarchive' : 'Archive'}
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Item
                                leftSection={<IconTrash size={16} />}
                                color="red"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(project);
                                }}
                              >
                                Delete
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>

                        {/* Description */}
                        {project.description && (
                          <Text size="sm" c="dimmed" lineClamp={2}>
                            {project.description}
                          </Text>
                        )}

                        {/* Stats */}
                        <Group gap="xs">
                          <Badge size="sm" variant="light" color={project.color}>
                            {project.todo_count} tasks
                          </Badge>
                          {project.completed_count > 0 && (
                            <Badge size="sm" variant="light" color="green" leftSection={<IconCircleCheck size={12} />}>
                              {project.completed_count} done
                            </Badge>
                          )}
                        </Group>

                        {/* Progress */}
                        {project.todo_count > 0 && (
                          <Stack gap={4}>
                            <Group justify="space-between">
                              <Text size="xs" c="dimmed">Progress</Text>
                              <Text size="xs" fw={500}>{completionPct}%</Text>
                            </Group>
                            <div style={{ 
                              height: 6, 
                              background: 'var(--mantine-color-gray-2)',
                              borderRadius: 3,
                              overflow: 'hidden'
                            }}>
                              <div style={{ 
                                height: '100%', 
                                width: `${completionPct}%`,
                                background: project.color,
                                transition: 'width 0.3s'
                              }} />
                            </div>
                          </Stack>
                        )}
                      </Stack>
                    </Paper>
                  </Grid.Col>
                );
              })}
            </Grid>
          )}
        </div>

        {/* Info Alert */}
        {!showArchived && filteredProjects.length > 0 && (
          <Alert icon={<IconAlertCircle size={16} />} title="Project Modes" color="blue" variant="light">
            <Text size="sm">
              Projects can contain <strong>linked items</strong> (survive deletion) or <strong>exclusive items</strong> (deleted with project).
              Click on a project to view all items and manage settings.
            </Text>
          </Alert>
        )}
      </Stack>

      {/* Create Project Modal */}
      <Modal
        opened={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setFormData({ name: '', description: '', color: '#228be6' });
        }}
        title="Create New Project"
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Project Name"
            placeholder="Enter project name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Textarea
            label="Description"
            placeholder="Enter project description (optional)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            minRows={3}
          />
          <ColorInput
            label="Project Color"
            value={formData.color}
            onChange={(color) => setFormData({ ...formData, color })}
            format="hex"
            swatches={['#228be6', '#fa5252', '#40c057', '#fab005', '#be4bdb', '#fd7e14', '#15aabf']}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>
              Create Project
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        opened={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedProject(null);
          setFormData({ name: '', description: '', color: '#228be6' });
        }}
        title="Edit Project"
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Project Name"
            placeholder="Enter project name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Textarea
            label="Description"
            placeholder="Enter project description (optional)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            minRows={3}
          />
          <ColorInput
            label="Project Color"
            value={formData.color}
            onChange={(color) => setFormData({ ...formData, color })}
            format="hex"
            swatches={['#228be6', '#fa5252', '#40c057', '#fab005', '#be4bdb', '#fd7e14', '#15aabf']}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate}>
              Update Project
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}

