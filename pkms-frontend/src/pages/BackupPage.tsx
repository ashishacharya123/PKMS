/**
 * BackupPage - Database backup and restore management
 */

import { useEffect, useState } from 'react';
import { 
  Container, 
  Title, 
  Stack, 
  Group, 
  Button, 
  Card, 
  Text, 
  Alert, 
  Progress,
  Table,
  ActionIcon,
  Badge,
  Modal,
  TextInput
} from '@mantine/core';
import { 
  IconDownload, 
  IconTrash, 
  IconDatabase, 
  IconRestore,
  IconAlertTriangle,
  IconCheck
} from '@tabler/icons-react';
import { useBackupStore } from '../stores/backupStore';
import { notifications } from '@mantine/notifications';
import { useDisclosure } from '@mantine/hooks';

export function BackupPage() {
  const {
    isLoading,
    isBackingUp,
    isRestoring,
    error,
    lastBackupDate,
    availableBackups,
    createBackup,
    restoreBackup,
    listBackups,
    deleteBackup,
    downloadBackup,
    clearError
  } = useBackupStore();

  const [restoreModalOpened, { open: openRestoreModal, close: closeRestoreModal }] = useDisclosure(false);
  const [selectedBackup, setSelectedBackup] = useState<string>('');

  useEffect(() => {
    listBackups();
  }, [listBackups]);

  const handleCreateBackup = async () => {
    const success = await createBackup();
    if (success) {
      notifications.show({
        title: 'Backup Created',
        message: 'Database backup created successfully',
        color: 'green',
        icon: <IconCheck size={16} />
      });
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return;
    
    const success = await restoreBackup(selectedBackup);
    if (success) {
      notifications.show({
        title: 'Backup Restored',
        message: 'Database restored successfully',
        color: 'green',
        icon: <IconCheck size={16} />
      });
      closeRestoreModal();
    }
  };

  const handleDeleteBackup = async (backupPath: string) => {
    const success = await deleteBackup(backupPath);
    if (success) {
      notifications.show({
        title: 'Backup Deleted',
        message: 'Backup deleted successfully',
        color: 'green',
        icon: <IconCheck size={16} />
      });
    }
  };

  const handleDownloadBackup = async (backupPath: string) => {
    await downloadBackup(backupPath);
    notifications.show({
      title: 'Download Started',
      message: 'Backup download has started',
      color: 'blue',
      icon: <IconDownload size={16} />
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={2}>Database Backup & Restore</Title>
          <Button
            leftSection={<IconDatabase size={16} />}
            onClick={handleCreateBackup}
            loading={isBackingUp}
            disabled={isLoading}
          >
            Create Backup
          </Button>
        </Group>

        {error && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} />}
            title="Error"
            onClose={clearError}
            withCloseButton
          >
            {error}
          </Alert>
        )}

        {isBackingUp && (
          <Card withBorder>
            <Stack gap="sm">
              <Text size="sm" fw={500}>Creating Backup...</Text>
              <Progress value={100} animated />
            </Stack>
          </Card>
        )}

        {isRestoring && (
          <Card withBorder>
            <Stack gap="sm">
              <Text size="sm" fw={500}>Restoring Database...</Text>
              <Progress value={100} animated />
            </Stack>
          </Card>
        )}

        {lastBackupDate && (
          <Card withBorder>
            <Group justify="space-between" align="center">
              <div>
                <Text size="sm" fw={500}>Last Backup</Text>
                <Text size="xs" c="dimmed">{formatDate(lastBackupDate)}</Text>
              </div>
              <Badge color="green" variant="light">
                Available
              </Badge>
            </Group>
          </Card>
        )}

        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={4}>Available Backups</Title>
              <Button
                variant="light"
                size="sm"
                onClick={() => listBackups()}
                loading={isLoading}
              >
                Refresh
              </Button>
            </Group>

            {availableBackups.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No backups available
              </Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Backup File</Table.Th>
                    <Table.Th>Size</Table.Th>
                    <Table.Th>Created</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {availableBackups.map((backup, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {backup.split('/').pop() || backup}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {formatFileSize(1024 * 1024)} {/* Mock size */}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {formatDate(new Date().toISOString())} {/* Mock date */}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <ActionIcon
                            variant="light"
                            color="blue"
                            size="sm"
                            onClick={() => handleDownloadBackup(backup)}
                            title="Download"
                          >
                            <IconDownload size={14} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            color="green"
                            size="sm"
                            onClick={() => {
                              setSelectedBackup(backup);
                              openRestoreModal();
                            }}
                            title="Restore"
                          >
                            <IconRestore size={14} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            color="red"
                            size="sm"
                            onClick={() => handleDeleteBackup(backup)}
                            title="Delete"
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Card>
      </Stack>

      {/* Restore Confirmation Modal */}
      <Modal
        opened={restoreModalOpened}
        onClose={closeRestoreModal}
        title="Restore Database"
        centered
      >
        <Stack gap="md">
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            title="Warning"
          >
            This will replace your current database with the selected backup. 
            This action cannot be undone. Make sure you have a recent backup 
            before proceeding.
          </Alert>
          
          <TextInput
            label="Backup File"
            value={selectedBackup}
            readOnly
          />

          <Group justify="flex-end">
            <Button variant="light" onClick={closeRestoreModal}>
              Cancel
            </Button>
            <Button 
              color="red" 
              onClick={handleRestoreBackup}
              loading={isRestoring}
            >
              Restore Database
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
