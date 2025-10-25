/**
 * DuplicationModal - Reusable duplication modal component
 * Handles both project and todo duplication with advanced options
 */

import React, { useState } from 'react';
import { Modal, Stack, Text, Group, Button, TextInput, Textarea, Switch, Divider, Alert, LoadingOverlay } from '@mantine/core';
import { IconCopy, IconAlertTriangle, IconCheck, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface DuplicationModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: (data: DuplicationData) => Promise<void>;
  type: 'project' | 'todo';
  originalName: string;
  loading?: boolean;
}

interface DuplicationData {
  newName: string;
  description?: string;
  duplicationMode: 'shallow_link' | 'deep_copy';
  includeTodos?: boolean;
  includeNotes?: boolean;
  includeDocuments?: boolean;
  itemRenames?: Record<string, string>;
}

export function DuplicationModal({
  opened,
  onClose,
  onConfirm,
  type,
  originalName,
  loading = false
}: DuplicationModalProps) {
  const [formData, setFormData] = useState<DuplicationData>({
    newName: `${originalName} - Copy`,
    description: '',
    duplicationMode: 'deep_copy',
    includeTodos: true,
    includeNotes: true,
    includeDocuments: true,
    itemRenames: {}
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};

    if (!formData.newName.trim()) {
      newErrors.newName = 'Name is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      await onConfirm(formData);
      notifications.show({
        title: 'Success',
        message: `${type === 'project' ? 'Project' : 'Todo'} duplicated successfully`,
        color: 'green'
      });
      onClose();
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: `Failed to duplicate ${type}`,
        color: 'red'
      });
    }
  };

  const handleClose = () => {
    setFormData({
      newName: `${originalName} - Copy`,
      description: '',
      duplicationMode: 'deep_copy',
      includeTodos: true,
      includeNotes: true,
      includeDocuments: true,
      itemRenames: {}
    });
    setErrors({});
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={`Duplicate ${type === 'project' ? 'Project' : 'Todo'}`}
      size="md"
      centered
    >
      <Stack gap="md">
        <LoadingOverlay visible={loading} />
        
        {/* Basic Information */}
        <Stack gap="sm">
          <Text fw={500} size="sm">Basic Information</Text>
          <TextInput
            label="New Name"
            placeholder={`Enter name for duplicated ${type}`}
            value={formData.newName}
            onChange={(e) => setFormData(prev => ({ ...prev, newName: e.target.value }))}
            error={errors.newName}
            required
          />
          <Textarea
            label="Description (Optional)"
            placeholder={`Enter description for duplicated ${type}`}
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            rows={3}
          />
        </Stack>

        {type === 'project' && (
          <>
            <Divider />
            
            {/* Duplication Mode */}
            <Stack gap="sm">
              <Text fw={500} size="sm">Duplication Mode</Text>
              <Alert
                icon={<IconAlertTriangle size={16} />}
                title="Choose duplication method"
                color="blue"
                variant="light"
              >
                <Text size="sm">
                  <strong>Deep Copy:</strong> Creates new, independent copies of all items<br/>
                  <strong>Shallow Link:</strong> Links existing items to the new project (faster)
                </Text>
              </Alert>
              
              <Group gap="sm">
                <Button
                  variant={formData.duplicationMode === 'deep_copy' ? 'filled' : 'light'}
                  size="sm"
                  onClick={() => setFormData(prev => ({ ...prev, duplicationMode: 'deep_copy' }))}
                >
                  Deep Copy
                </Button>
                <Button
                  variant={formData.duplicationMode === 'shallow_link' ? 'filled' : 'light'}
                  size="sm"
                  onClick={() => setFormData(prev => ({ ...prev, duplicationMode: 'shallow_link' }))}
                >
                  Shallow Link
                </Button>
              </Group>
            </Stack>

            <Divider />
            
            {/* Item Selection */}
            <Stack gap="sm">
              <Text fw={500} size="sm">Include Items</Text>
              <Switch
                label="Include Todos"
                checked={formData.includeTodos}
                onChange={(e) => setFormData(prev => ({ ...prev, includeTodos: e.currentTarget.checked }))}
              />
              <Switch
                label="Include Notes"
                checked={formData.includeNotes}
                onChange={(e) => setFormData(prev => ({ ...prev, includeNotes: e.currentTarget.checked }))}
              />
              <Switch
                label="Include Documents"
                checked={formData.includeDocuments}
                onChange={(e) => setFormData(prev => ({ ...prev, includeDocuments: e.currentTarget.checked }))}
              />
            </Stack>
          </>
        )}

        <Divider />
        
        {/* Actions */}
        <Group justify="flex-end" gap="sm">
          <Button
            variant="subtle"
            onClick={handleClose}
            disabled={loading}
            leftSection={<IconX size={16} />}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={loading}
            leftSection={!loading ? <IconCopy size={16} /> : undefined}
          >
            Duplicate {type === 'project' ? 'Project' : 'Todo'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
