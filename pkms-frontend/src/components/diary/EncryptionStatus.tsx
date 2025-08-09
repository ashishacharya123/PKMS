import { Group, ThemeIcon, Button, Tooltip } from '@mantine/core';
import { IconLock, IconLockOpen } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface EncryptionStatusProps {
  isUnlocked: boolean;
  onLock: () => void;
  onUnlock: () => void;
}

export default function EncryptionStatus({ isUnlocked, onLock, onUnlock }: EncryptionStatusProps) {
  const handleLock = () => {
    onLock();
    notifications.show({
      title: 'Diary Locked',
      message: 'Your diary has been locked for security',
      color: 'blue',
    });
  };

  return (
    <Group gap="xs">
      {isUnlocked ? (
        <>
          <Tooltip label="Diary is unlocked">
            <ThemeIcon variant="light" color="green" size="sm">
              <IconLockOpen size={14} />
            </ThemeIcon>
          </Tooltip>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconLock size={14} />}
            onClick={handleLock}
          >
            Lock
          </Button>
        </>
      ) : (
        <>
          <Tooltip label="Diary is locked">
            <ThemeIcon variant="light" color="orange" size="sm">
              <IconLock size={14} />
            </ThemeIcon>
          </Tooltip>
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconLockOpen size={14} />}
            onClick={onUnlock}
          >
            Unlock
          </Button>
        </>
      )}
    </Group>
  );
}
