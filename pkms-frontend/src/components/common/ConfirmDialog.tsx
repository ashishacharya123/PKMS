/**
 * ConfirmDialog - Reusable confirmation dialog component
 * Provides consistent confirmation dialogs across the app
 */

import React from 'react';
import { Modal, Stack, Text, Group, Button } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconX } from '@tabler/icons-react';

interface ConfirmDialogProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export function ConfirmDialog({
  opened,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  type = 'danger',
  loading = false
}: ConfirmDialogProps) {
  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <IconAlertTriangle size={20} color="var(--mantine-color-red-6)" />;
      case 'warning':
        return <IconAlertTriangle size={20} color="var(--mantine-color-yellow-6)" />;
      case 'info':
        return <IconCheck size={20} color="var(--mantine-color-blue-6)" />;
      default:
        return <IconAlertTriangle size={20} color="var(--mantine-color-red-6)" />;
    }
  };

  const getConfirmColor = () => {
    switch (type) {
      case 'danger':
        return 'red';
      case 'warning':
        return 'yellow';
      case 'info':
        return 'blue';
      default:
        return 'red';
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size="sm"
      centered
    >
      <Stack gap="md">
        <Group gap="sm">
          {getIcon()}
          <Text size="sm">{message}</Text>
        </Group>
        
        <Group justify="flex-end" gap="sm">
          <Button
            variant="subtle"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            color={getConfirmColor()}
            onClick={onConfirm}
            loading={loading}
            leftSection={!loading ? <IconCheck size={16} /> : undefined}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
