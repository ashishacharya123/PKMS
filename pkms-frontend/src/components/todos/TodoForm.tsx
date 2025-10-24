/**
 * TodoForm Component
 * Form for creating and editing todos with validation
 */

import React from 'react';
import { 
  Modal, 
  Stack, 
  TextInput, 
  Textarea, 
  Select, 
  NumberInput, 
  Group, 
  Button,
  Alert,
  Progress
} from '@mantine/core';
import { DateRangePicker } from '../common/DateRangePicker';
import { MultiProjectSelector } from '../common/MultiProjectSelector';
import { Todo, TodoStatus, TaskPriority, TodoType } from '../../types/todo';
import { Project } from '../../types/project';

interface TodoFormProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Todo>) => Promise<void>;
  initialData?: Partial<Todo>;
  projects: Project[]; // eslint-disable-line @typescript-eslint/no-unused-vars
  loading?: boolean;
  title: string;
}

export function TodoForm({
  opened,
  onClose,
  onSubmit,
  initialData,
  projects,
  loading = false,
  title
}: TodoFormProps) {
  const [formData, setFormData] = React.useState<Partial<Todo>>({
    title: '',
    description: '',
    status: TodoStatus.PENDING,
    priority: TaskPriority.MEDIUM,
    type: TodoType.TASK,
    startDate: '',
    dueDate: '',
    completionPercentage: 0,
    projectIds: [],
    isExclusiveMode: false,
    ...initialData
  });

  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (initialData) {
      setFormData({ ...initialData });
    } else {
      setFormData({
        title: '',
        description: '',
        status: TodoStatus.PENDING,
        priority: TaskPriority.MEDIUM,
        type: TodoType.TASK,
        startDate: '',
        dueDate: '',
        completionPercentage: 0,
        projectIds: [],
        isExclusiveMode: false
      });
    }
    setErrors({});
  }, [initialData, opened]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title?.trim()) {
      newErrors.title = 'Title is required';
    }

    if (formData.startDate && formData.dueDate) {
      const start = new Date(formData.startDate);
      const due = new Date(formData.dueDate);
      if (start > due) {
        newErrors.dueDate = 'Due date must be after start date';
      }
    }

    if (formData.completionPercentage !== undefined && 
        (formData.completionPercentage < 0 || formData.completionPercentage > 100)) {
      newErrors.completionPercentage = 'Completion percentage must be between 0 and 100';
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
      console.error('Error submitting todo form:', error);
    }
  };

  const handleFieldChange = (field: keyof Todo, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

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
            label="Title"
            placeholder="Enter todo title"
            value={formData.title || ''}
            onChange={(e) => handleFieldChange('title', e.target.value)}
            error={errors.title}
            required
          />

          <Textarea
            label="Description"
            placeholder="Enter todo description (optional)"
            value={formData.description || ''}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            minRows={3}
            maxRows={6}
          />

          <Group grow>
            <Select
              label="Status"
              value={formData.status}
              onChange={(value) => handleFieldChange('status', value)}
              data={[
                { value: TodoStatus.PENDING, label: 'Pending' },
                { value: TodoStatus.IN_PROGRESS, label: 'In Progress' },
                { value: TodoStatus.BLOCKED, label: 'Blocked' },
                { value: TodoStatus.DONE, label: 'Done' }
              ]}
            />

            <Select
              label="Priority"
              value={formData.priority}
              onChange={(value) => handleFieldChange('priority', value)}
              data={[
                { value: TaskPriority.LOW, label: 'Low' },
                { value: TaskPriority.MEDIUM, label: 'Medium' },
                { value: TaskPriority.HIGH, label: 'High' },
                { value: TaskPriority.URGENT, label: 'Urgent' }
              ]}
            />
          </Group>

          <Group grow>
            <Select
              label="Type"
              value={formData.type}
              onChange={(value) => handleFieldChange('type', value)}
              data={[
                { value: TodoType.TASK, label: 'Task' },
                { value: TodoType.CHECKLIST, label: 'Checklist' },
                { value: TodoType.SUBTASK, label: 'Subtask' }
              ]}
            />

            <NumberInput
              label="Completion %"
              value={formData.completionPercentage || 0}
              onChange={(value) => handleFieldChange('completionPercentage', value)}
              min={0}
              max={100}
              error={errors.completionPercentage}
            />
          </Group>

          <DateRangePicker
            startDate={formData.startDate ? new Date(formData.startDate) : null}
            dueDate={formData.dueDate ? new Date(formData.dueDate) : null}
            onStartDateChange={(date) => handleFieldChange('startDate', date ? date.toISOString().split('T')[0] : '')}
            onDueDateChange={(date) => handleFieldChange('dueDate', date ? date.toISOString().split('T')[0] : '')}
          />

          <MultiProjectSelector
            value={formData.projectIds || []}
            onChange={(ids) => handleFieldChange('projectIds', ids)}
            isExclusive={formData.isExclusiveMode || false}
            onExclusiveChange={(exclusive) => handleFieldChange('isExclusiveMode', exclusive)}
            description="Link this todo to one or more projects"
            disabled={loading}
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
              {initialData ? 'Update Todo' : 'Create Todo'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
