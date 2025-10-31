/**
 * Clean ProjectsPage using existing patterns
 *
 * Refactored from 583-line component to pattern-based implementation:
 * - Uses useDataLoader for data management
 * - Uses useModal for modal state management
 * - Maintains UUID reservation functionality
 * - Uses existing ModuleFilters and LoadingState patterns
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import {
  Container,
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
  Alert,
  LoadingOverlay
} from '@mantine/core';
import {
  IconSearch,
  IconFolder,
  IconCircleCheck,
  IconAlertCircle
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { todosService, Project } from '../services/todosService';
import { ActionMenu } from '../components/common/ActionMenu';
import { ModuleHeader } from '../components/common/ModuleHeader';
import { ModuleFilters, getModuleFilterConfig } from '../components/common/ModuleFilters';
import ViewMenu, { ViewMode } from '../components/common/ViewMenu';
import { DuplicationModal } from '../components/common/DuplicationModal';
import { duplicationService, ProjectDuplicateRequest } from '../services/duplicationService';
import { EmptyState } from '../components/common/EmptyState';
import { entityReserveService } from '../services/entityReserveService';
import { isEmptyProject } from '../utils/save_discard_verification';
import { useDataLoader } from '../hooks/useDataLoader';
import { useModal } from '../hooks/useModal';

export function ProjectsPage() {
  const navigate = useNavigate();

  // Data loading with useDataLoader hook
  const {
    data: projects = [],
    loading,
    error,
    refetch
  } = useDataLoader(
    () => todosService.getProjects(false),
    {
      onError: (error) => {
        console.error('Failed to load projects:', error);
      }
    }
  );

  // Modal management with useModal hook
  const createModal = useModal<Project>();
  const editModal = useModal<Project>();
  const duplicateModal = useModal<Project>();
  const filterModal = useModal();

  // Modular components state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    sortBy: 'name' as const,
    sortOrder: 'asc' as const,
    favorites: false,
    showArchived: false
  });
  const filterConfig = getModuleFilterConfig('projects');

  // Optimistic UUID state for create modal
  const [reservedProjectUuid, setReservedProjectUuid] = useState<string | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Form states (kept separate for UUID reservation logic)
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  // Error handling
  if (error) {
    return <ErrorState message={error} onRetry={refetch} />;
  }
  // Reserve UUID for new project
  const reserveProjectUuid = async () => {
    try {
      const { uuid } = await entityReserveService.reserve('projects');
      setReservedProjectUuid(uuid);
      return uuid;
    } catch (error) {
      console.error('Failed to reserve UUID for project:', error);
      throw error;
    }
  };

  // Handle create modal open with UUID reservation
  const handleCreateModalOpen = useCallback(async () => {
    try {
      setIsCreatingProject(true);
      const uuid = await reserveProjectUuid();
      createModal.openModal();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to prepare project creation',
        color: 'red'
      });
    } finally {
      setIsCreatingProject(false);
    }
  }, [createModal]);

  // Handle create modal close with auto-discard
  const handleCreateModalClose = useCallback(async () => {
    if (reservedProjectUuid) {
      // Check if project is empty enough to auto-discard
      const projectForCheck = {
        name: formData.name,
        description: formData.description || '',
        files: [] // Projects don't have files in this context
      };

      if (isEmptyProject(projectForCheck)) {
        try {
          await entityReserveService.discard('projects', reservedProjectUuid);
        } catch (err) {
          console.error('Failed to discard empty project:', err);
        }
      }
    }

    createModal.closeModal();
    setReservedProjectUuid(null);
    setFormData({ name: '', description: '' });
  }, [createModal, formData, reservedProjectUuid]);

  const handleCreate = useCallback(async () => {
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
        description: formData.description.trim()
      });

      notifications.show({
        title: 'Success',
        message: 'Project created successfully',
        color: 'green'
      });

      handleCreateModalClose();
      refetch();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to create project',
        color: 'red'
      });
    }
  }, [formData, handleCreateModalClose, refetch]);

  const handleEdit = useCallback((project: Project) => {
    setFormData({
      name: project.name,
      description: project.description || ''
    });
    editModal.openModal(project);
  }, [editModal]);

  const handleUpdate = useCallback(async () => {
    if (!editModal.selectedItem || !formData.name.trim()) return;

    try {
      await todosService.updateProject(editModal.selectedItem.uuid!, {
        name: formData.name.trim(),
        description: formData.description.trim()
      });

      notifications.show({
        title: 'Success',
        message: 'Project updated successfully',
        color: 'green'
      });

      editModal.closeModal();
      setFormData({ name: '', description: '' });
      refetch();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update project',
        color: 'red'
      });
    }
  }, [editModal, formData, refetch]);
  const handleDelete = useCallback(async (project: Project) => {
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
      refetch();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete project',
        color: 'red'
      });
    }
  }, [refetch]);

  const handleArchiveToggle = useCallback(async (project: Project) => {
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
      refetch();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to update project',
        color: 'red'
      });
    }
  }, [refetch]);


  const handleDuplicate = useCallback((project: Project) => {
    duplicateModal.openModal(project);
  }, [duplicateModal]);

  const handleDuplicateConfirm = useCallback(async (data: any) => {
    if (!duplicateModal.selectedItem) return;

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

      const response = await duplicationService.duplicateProject(duplicateModal.selectedItem.uuid, request);

      if (response.success) {
        notifications.show({
          title: 'Project Duplicated',
          message: `Created "${response.newProjectName}" with ${response.itemsCopied.todos} todos, ${response.itemsCopied.notes} notes, ${response.itemsCopied.documents} documents`,
          color: 'green'
        });

        // Reload projects to show the new one
        await refetch();
        duplicateModal.closeModal();
      }
    } catch (error) {
      console.error('Failed to duplicate project:', error);
      notifications.show({
        title: 'Duplication Failed',
        message: 'Failed to duplicate project. Please try again.',
        color: 'red'
      });
    }
  }, [duplicateModal, refetch]);

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getCompletionPercentage = (project: Project) => {
    if (project.todoCount === 0) return 0;
    return Math.round((project.completedCount / project.todoCount) * 100);
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Modular Header */}
        <ModuleHeader
          title="📁 Projects"
          itemCount={filteredProjects.length}
          onRefresh={refetch}
          onCreate={handleCreateModalOpen}
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
              onClick={() => filterModal.openModal()}
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
              title={'No projects yet'}
              description={'Create your first project to get started'}
              actionLabel={'Create Project'}
              onAction={handleCreateModalOpen}
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
                                backgroundColor: '#228be6',
                                flexShrink: 0
                              }}
                            />
                            <Text fw={600} size="lg" truncate style={{ flex: 1 }}>
                              {project.name}
                            </Text>
                          </Group>
                          <ActionMenu
                            onEdit={() => handleEdit(project)}
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
                          <Badge size="sm" variant="light" color="blue">
                            {project.todoCount} tasks
                          </Badge>
                          {project.completedCount > 0 && (
                            <Badge size="sm" variant="light" color="green" leftSection={<IconCircleCheck size={12} />}>
                              {project.completedCount} done
                            </Badge>
                          )}
                        </Group>

                        {/* Progress */}
                        {project.todoCount > 0 && (
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
                                background: '#228be6',
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
        {filteredProjects.length > 0 && (
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
        opened={createModal.isOpen}
        onClose={handleCreateModalClose}
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
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={handleCreateModalClose}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={isCreatingProject}>
              Create Project
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        opened={editModal.isOpen}
        onClose={() => {
          editModal.closeModal();
          setFormData({ name: '', description: '' });
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
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => editModal.closeModal()}>
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
        opened={filterModal.isOpen}
        onClose={() => filterModal.closeModal()}
        title="Project Filters & Sorting"
        size="lg"
      >
        <ModuleFilters
          filters={filters as any}
          onFiltersChange={(newFilters) => setFilters(newFilters as any)}
          activeFiltersCount={Object.values(filters).filter(v => Array.isArray(v) ? v.length > 0 : v !== false && v !== 'asc').length}
          showFavorites={filterConfig.showFavorites}
          showMimeTypes={false}
          showDateRange={filterConfig.showDateRange}
          showArchived={filterConfig.showArchived}
          showSorting={filterConfig.showSorting}
          customFilters={filterConfig.customFilters}
          sortOptions={filterConfig.sortOptions}
        />
      </Modal>

      {/* Duplication Modal */}
      <DuplicationModal
        opened={duplicateModal.isOpen}
        onClose={() => duplicateModal.closeModal()}
        onConfirm={handleDuplicateConfirm}
        type="project"
        originalName={duplicateModal.selectedItem?.name || ''}
        loading={false}
      />
    </Container>
  );
}

