import { useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Paper,
  ActionIcon,
  Tooltip,
  Divider,
  Badge,
} from '@mantine/core';
import { IconKeyboard, IconInfoCircle } from '@tabler/icons-react';

interface ShortcutItem {
  keys: string;
  description: string;
  category: string;
}

const diaryShortcuts: ShortcutItem[] = [
  { keys: 'Ctrl + N', description: 'Create new diary entry', category: 'Entry Management' },
  { keys: 'Ctrl + S', description: 'Save current entry', category: 'Entry Management' },
  { keys: 'Ctrl + E', description: 'Edit selected entry', category: 'Entry Management' },
  { keys: 'Delete', description: 'Delete selected entry', category: 'Entry Management' },
  { keys: 'Ctrl + F', description: 'Focus search bar', category: 'Navigation' },
  { keys: 'Ctrl + L', description: 'Lock diary', category: 'Security' },
  { keys: 'Ctrl + U', description: 'Unlock diary', category: 'Security' },
  { keys: 'Escape', description: 'Close modals/Cancel actions', category: 'General' },
  { keys: 'Ctrl + ?', description: 'Show keyboard shortcuts', category: 'Help' },
  { keys: '1-5', description: 'Set mood rating (when editing)', category: 'Entry Editing' },
  { keys: 'Ctrl + Enter', description: 'Save entry (when editing)', category: 'Entry Editing' },
  { keys: 'Tab', description: 'Navigate between form fields', category: 'Navigation' },
];

interface KeyboardShortcutsHelpProps {
  opened: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ opened, onClose }: KeyboardShortcutsHelpProps) {
  const shortcutsByCategory = diaryShortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, ShortcutItem[]>);

  const renderKeys = (keys: string) => {
    return keys.split(' + ').map((key, index, array) => (
      <Group key={index} gap={4} wrap="nowrap">
        <Badge 
          variant="light" 
          size="sm"
          style={{ 
            fontFamily: 'monospace',
            backgroundColor: 'var(--mantine-color-gray-1)',
            color: 'var(--mantine-color-dark-7)'
          }}
        >
          {key}
        </Badge>
        {index < array.length - 1 && (
          <Text size="xs" c="dimmed">+</Text>
        )}
      </Group>
    ));
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconKeyboard size={20} />
          <Text fw={600}>Keyboard Shortcuts</Text>
        </Group>
      }
      size="lg"
      centered
    >
      <Stack gap="lg">
        <Group gap="xs">
          <IconInfoCircle size={16} />
          <Text size="sm" c="dimmed">
            Use these keyboard shortcuts to navigate and manage your diary more efficiently
          </Text>
        </Group>

        {Object.entries(shortcutsByCategory).map(([category, shortcuts]) => (
          <div key={category}>
            <Text fw={600} size="sm" mb="xs" c="blue">
              {category}
            </Text>
            <Paper p="md" withBorder>
              <Stack gap="md">
                {shortcuts.map((shortcut, index) => (
                  <Group key={index} justify="space-between" wrap="nowrap">
                    <Text size="sm" style={{ flex: 1 }}>
                      {shortcut.description}
                    </Text>
                    <Group gap="xs" wrap="nowrap">
                      {renderKeys(shortcut.keys)}
                    </Group>
                  </Group>
                ))}
              </Stack>
            </Paper>
          </div>
        ))}

        <Divider />
        
        <Group gap="xs" justify="center">
          <Text size="xs" c="dimmed">
            💡 Tip: Most shortcuts work globally, but some are context-specific when editing entries
          </Text>
        </Group>
      </Stack>
    </Modal>
  );
}

interface KeyboardShortcutsButtonProps {
  onOpenHelp: () => void;
}

export function KeyboardShortcutsButton({ onOpenHelp }: KeyboardShortcutsButtonProps) {
  return (
    <Tooltip label="Keyboard Shortcuts (Ctrl + ?)">
      <ActionIcon
        variant="subtle"
        size="sm"
        onClick={onOpenHelp}
      >
        <IconKeyboard size={16} />
      </ActionIcon>
    </Tooltip>
  );
}
