/**
 * ConfirmDialog - Reusable confirmation dialog component
 * Provides consistent confirmation dialogs across the app
 */

import { Modal, Stack, Text, Group, Button } from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';

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
  // Unified configuration object for type mappings
  const typeConfig = {
    danger: {
      icon: <IconAlertTriangle size={20} color="var(--mantine-color-red-6)" />,
      color: 'red'
    },
    warning: {
      icon: <IconAlertTriangle size={20} color="var(--mantine-color-yellow-6)" />,
      color: 'yellow'
    },
    info: {
      icon: <IconCheck size={20} color="var(--mantine-color-blue-6)" />,
      color: 'blue'
    }
  } as const;

  const config = typeConfig[type] || typeConfig.danger;

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
          {config.icon}
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
            color={config.color}
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
