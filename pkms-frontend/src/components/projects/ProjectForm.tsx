/**
 * ProjectForm Component
 * Form for creating and editing projects with validation
 */

import React from 'react';
import { 
  Modal, 
  Stack, 
  TextInput, 
  Textarea, 
  Select, 
  Group, 
  Button,
  Alert,
  Progress
} from '@mantine/core';
import { DateRangePicker } from '../common/DateRangePicker';
import { Project, ProjectStatus } from '../../types/project';

interface ProjectFormProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Project>) => Promise<void>;
  initialData?: Partial<Project>;
  loading?: boolean;
  title: string;
}

export function ProjectForm({
  opened,
  onClose,
  onSubmit,
  initialData,
  loading = false,
  title
}: ProjectFormProps) {
  const [formData, setFormData] = React.useState<Partial<Project>>({
    name: '',
    description: '',
    status: ProjectStatus.IS_RUNNING,
    dueDate: null,
    completionDate: null,
    ...initialData
  });

  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData });
    } else {
      setFormData({
        name: '',
        description: '',
        status: ProjectStatus.IS_RUNNING,
        dueDate: null,
        completionDate: null
      });
    }
    setErrors({});
  }, [initialData, opened]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = 'Project name is required';
    }

    if (formData.dueDate && formData.completionDate) {
      const due = new Date(formData.dueDate);
      const completion = new Date(formData.completionDate);
      if (completion > due) {
        newErrors.completionDate = 'Completion date cannot be after due date';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error('Error submitting project form:', error);
    }
  };

  const handleFieldChange = (field: keyof Project, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const statusOptions = [
    { value: ProjectStatus.IS_RUNNING, label: 'Running' },
    { value: ProjectStatus.ON_HOLD, label: 'On Hold' },
    { value: ProjectStatus.COMPLETED, label: 'Completed' },
    { value: ProjectStatus.CANCELLED, label: 'Cancelled' }
  ];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size="md"
      centered
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          {loading && (
            <Progress value={100} animated />
          )}

          <TextInput
            label="Project Name"
            placeholder="Enter project name"
            value={formData.name || ''}
            onChange={(e) => handleFieldChange('name', e.target.value)}
            error={errors.name}
            required
          />

          <Textarea
            label="Description"
            placeholder="Enter project description (optional)"
            value={formData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            minRows={3}
            maxRows={6}
          />

          <Select
            label="Status"
            value={formData.status}
            onChange={(value) => handleFieldChange('status', value)}
            data={statusOptions}
          />

          <DateRangePicker
            startDate={formData.dueDate ? new Date(formData.dueDate) : null}
            dueDate={formData.completionDate ? new Date(formData.completionDate) : null}
            onStartDateChange={(date) => handleFieldChange('dueDate', date ? date.toISOString().split('T')[0] : null)}
            onDueDateChange={(date) => handleFieldChange('completionDate', date ? date.toISOString().split('T')[0] : null)}
          />

          {Object.keys(errors).length > 0 && (
            <Alert color="red" title="Please fix the following errors:">
              <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                {Object.values(errors).map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="light" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              {initialData ? 'Update Project' : 'Create Project'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
