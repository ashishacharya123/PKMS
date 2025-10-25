import { useState } from 'react';
import { useAuthenticatedEffectAlways } from '../hooks/useAuthenticatedEffect';
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
  IconArchive,
  IconArchiveOff,
  IconFolder,
  IconFolders,
  IconCircleCheck,
  IconAlertCircle
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { todosService, Project } from '../services/todosService';
import { ActionMenu } from '../components/common/ActionMenu';
import { ModuleLayout } from '../components/common/ModuleLayout';
import { ModuleHeader } from '../components/common/ModuleHeader';
import { ModuleFilters, getModuleFilterConfig } from '../components/common/ModuleFilters';
import ViewMenu, { ViewMode } from '../components/common/ViewMenu';
import { DuplicationModal } from '../components/common/DuplicationModal';
import { duplicationService, ProjectDuplicateRequest } from '../services/duplicationService';
import { EmptyState } from '../components/common/EmptyState';

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  
  // Modular components state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filters, setFilters] = useState({
    sortBy: 'name',
    sortOrder: 'asc',
    favorites: false,
    showArchived: false
  });
  const [filtersOpened, setFiltersOpened] = useState(false);
  const filterConfig = getModuleFilterConfig('projects');
  
  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [duplicating, setDuplicating] = useState(false);
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#228be6'
  });

  useAuthenticatedEffectAlways(() => {
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
      await todosService.updateProject(selectedProject.uuid!, {
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
      await todosService.deleteProject(project.uuid!);
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
      await todosService.updateProject(project.uuid!, {
        ...project,
        isArchived: !project.isArchived
      });
      notifications.show({
        title: 'Success',
        message: `Project ${project.isArchived ? 'unarchived' : 'archived'}`,
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

  const handleDuplicate = (project: Project) => {
    setSelectedProject(project);
    setDuplicateModalOpen(true);
  };

  const handleDuplicateConfirm = async (data: any) => {
    if (!selectedProject) return;
    
    setDuplicating(true);
    try {
      const request: ProjectDuplicateRequest = {
        newProjectName: data.newName,
        description: data.description,
        duplicationMode: data.duplicationMode,
        includeTodos: data.includeTodos,
        includeNotes: data.includeNotes,
        includeDocuments: data.includeDocuments,
        itemRenames: data.itemRenames
      };

      const response = await duplicationService.duplicateProject(selectedProject.uuid, request);
      
      if (response.success) {
        notifications.show({
          title: 'Project Duplicated',
          message: `Created "${response.newProjectName}" with ${response.itemsCopied.todos} todos, ${response.itemsCopied.notes} notes, ${response.itemsCopied.documents} documents`,
          color: 'green'
        });
        
        // Reload projects to show the new one
        await loadProjects();
      }
    } catch (error) {
      console.error('Failed to duplicate project:', error);
      notifications.show({
        title: 'Duplication Failed',
        message: 'Failed to duplicate project. Please try again.',
        color: 'red'
      });
    } finally {
      setDuplicating(false);
    }
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
        {/* Modular Header */}
        <ModuleHeader
          title="📁 Projects"
          itemCount={filteredProjects.length}
          onRefresh={loadProjects}
          onCreate={() => setCreateModalOpen(true)}
          showFilters={true}
          showCreate={true}
          showRefresh={true}
          isLoading={loading}
        />

        {/* Modular Filters & View Controls */}
        <Group justify="space-between" align="center">
          <TextInput
            placeholder="Search projects..."
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, maxWidth: 400 }}
          />
          <Group gap="sm">
            <ViewMenu 
              currentView={viewMode}
              onChange={setViewMode}
              disabled={loading}
            />
            <Button
              variant="light"
              size="sm"
              leftSection={<IconSearch size={16} />}
              onClick={() => setFiltersOpened(true)}
            >
              Filters
            </Button>
          </Group>
        </Group>

        {/* Projects Grid */}
        <div style={{ position: 'relative', minHeight: 200 }}>
          <LoadingOverlay visible={loading} />
          
          {filteredProjects.length === 0 ? (
            <EmptyState
              icon={IconFolder}
              title={searchQuery ? 'No projects found' : showArchived ? 'No archived projects' : 'No projects yet'}
              description={searchQuery ? 'Try a different search term' : 'Create your first project to get started'}
              actionLabel={!searchQuery && !showArchived ? 'Create Project' : undefined}
              onAction={!searchQuery && !showArchived ? () => setCreateModalOpen(true) : undefined}
            />
          ) : (
            <Grid>
              {filteredProjects.map((project) => {
                const completionPct = getCompletionPercentage(project);
                
                return (
                  <Grid.Col key={project.uuid} span={{ base: 12, sm: 6, md: 4 }}>
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
                      onClick={() => navigate(`/projects/${project.uuid}`)}
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
                          <ActionMenu
                            onEdit={() => openEditModal(project)}
                            onDuplicate={() => handleDuplicate(project)}
                            onArchive={project.isArchived ? undefined : () => handleArchiveToggle(project)}
                            onUnarchive={project.isArchived ? () => handleArchiveToggle(project) : undefined}
                            onDelete={() => handleDelete(project)}
                            isArchived={project.isArchived}
                            variant="subtle"
                            color="gray"
                            size={16}
                          />
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

      {/* Modular Filter Modal */}
      <Modal 
        opened={filtersOpened} 
        onClose={() => setFiltersOpened(false)} 
        title="Project Filters & Sorting" 
        size="lg"
      >
        <ModuleFilters
          filters={filters}
          onFiltersChange={setFilters}
          activeFiltersCount={Object.values(filters).filter(v => Array.isArray(v) ? v.length > 0 : v !== false && v !== 'all' && v !== 'name' && v !== 'asc').length}
          showFavorites={filterConfig.showFavorites}
          showMimeTypes={filterConfig.showMimeTypes}
          showDateRange={filterConfig.showDateRange}
          showArchived={filterConfig.showArchived}
          showSorting={filterConfig.showSorting}
          customFilters={filterConfig.customFilters}
          sortOptions={filterConfig.sortOptions}
        />
      </Modal>

      {/* Duplication Modal */}
      <DuplicationModal
        opened={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        onConfirm={handleDuplicateConfirm}
        type="project"
        originalName={selectedProject?.name || ''}
        loading={duplicating}
      />
    </Container>
  );
}

