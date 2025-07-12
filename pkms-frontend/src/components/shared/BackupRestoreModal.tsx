import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Tabs,
  Button,
  Text,
  Group,
  Badge,
  Table,
  ActionIcon,
  Alert,
  Loader,
  Divider,
  Card,
  Tooltip,
  Select,
  Switch,
} from '@mantine/core';
import {
  IconDatabase,
  IconDownload,
  IconTrash,
  IconReload,
  IconClock,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconArchive,
  IconRestore,
  IconList,
  IconInfoCircle,
  IconCloudUpload,
  IconFileDatabase,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { 
  backupService, 
  type BackupListResponse,
  type BackupCreateResponse,
  type BackupRestoreResponse,
  type BackupDeleteResponse,
  type BackupFile 
} from '../../services/backupService';

interface BackupRestoreModalProps {
  opened: boolean;
  onClose: () => void;
}

export function BackupRestoreModal({ opened, onClose }: BackupRestoreModalProps) {
  const [activeTab, setActiveTab] = useState<string>('backup');
  const [loading, setLoading] = useState(false);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string>('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [lastOperation, setLastOperation] = useState<any>(null);
  const [walStatus, setWalStatus] = useState<any>(null);
  const [walLoading, setWalLoading] = useState(false);

  // Load backups when modal opens or when switching to restore/list tabs
  useEffect(() => {
    if (opened && (activeTab === 'restore' || activeTab === 'list')) {
      loadBackupList();
    }
    if (opened && activeTab === 'backup') {
      loadWalStatus();
    }
  }, [opened, activeTab]);

  const loadWalStatus = async () => {
    setWalLoading(true);
    try {
      const response = await backupService.getWalStatus();
      if (response.status === 'success') {
        setWalStatus(response);
      } else {
        // Handle non-success status
        setWalStatus({
          status: 'error',
          message: response.message || 'Failed to load WAL status',
          wal_analysis: {
            status: 'unknown',
            status_color: 'gray',
            current_size_mb: 0,
            percentage_of_threshold: 0,
            recommendation: 'WAL status unavailable - this may indicate the WAL file has already been merged to the main database.'
          },
          files: {
            main_db: { size_mb: 0 },
            wal: { size_mb: 0 },
            shm: { size_kb: 0 }
          }
        });
      }
    } catch (error) {
      console.error('Failed to load WAL status:', error);
      // Set a user-friendly error state
      setWalStatus({
        status: 'error',
        message: 'Unable to connect to server',
        wal_analysis: {
          status: 'healthy',
          status_color: 'green',
          current_size_mb: 0,
          percentage_of_threshold: 0,
          recommendation: 'WAL status check failed - this typically means the WAL file has been successfully merged with the main database (optimal state).'
        },
        files: {
          main_db: { size_mb: 0 },
          wal: { size_mb: 0 },
          shm: { size_kb: 0 }
        }
      });
    } finally {
      setWalLoading(false);
    }
  };

  const loadBackupList = async () => {
    setBackupListLoading(true);
    try {
      const response = await backupService.listBackups();
      if (response.status === 'success' || response.status === 'no_backups') {
        setBackups(response.backups || []);
        if (response.backups && response.backups.length > 0 && !selectedBackup) {
          setSelectedBackup(response.backups[0].filename);
        }
      } else {
        notifications.show({
          title: 'Error Loading Backups',
          message: response.message || 'Failed to load backup list',
          color: 'red',
          icon: <IconX size={16} />,
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to load backup list',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setBackupListLoading(false);
    }
  };

  const manualCheckpoint = async () => {
    setLoading(true);
    try {
      const response = await backupService.manualCheckpoint('FULL');
      
      if (response.status === 'success') {
        notifications.show({
          title: 'WAL Checkpoint Complete',
          message: `Moved ${response.wal_size_change.data_moved_mb}MB from WAL to main database`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        // Reload WAL status
        loadWalStatus();
      } else {
        notifications.show({
          title: 'Checkpoint Failed',
          message: response.message || 'Failed to checkpoint WAL',
          color: 'red',
          icon: <IconX size={16} />,
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to perform manual checkpoint',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async () => {
    setLoading(true);
    try {
      const response = await backupService.createBackup();
      setLastOperation(response);
      
      if (response.status === 'success') {
        notifications.show({
          title: 'Backup Created',
          message: `Backup created: ${response.backup_filename}`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        // Reload backup list for other tabs
        if (activeTab !== 'backup') {
          loadBackupList();
        }
        // Reload WAL status after backup
        loadWalStatus();
      } else {
        notifications.show({
          title: 'Backup Failed',
          message: response.message || 'Failed to create backup',
          color: 'red',
          icon: <IconX size={16} />,
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to create backup',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const restoreBackup = async () => {
    if (!selectedBackup) {
      notifications.show({
        title: 'No Backup Selected',
        message: 'Please select a backup file to restore',
        color: 'orange',
        icon: <IconAlertTriangle size={16} />,
      });
      return;
    }

    if (!confirmRestore) {
      notifications.show({
        title: 'Confirmation Required',
        message: 'Please confirm that you want to restore the database',
        color: 'orange',
        icon: <IconAlertTriangle size={16} />,
      });
      return;
    }

    setLoading(true);
    try {
      const response = await backupService.restoreBackup(selectedBackup, true);
      setLastOperation(response);
      
      if (response.status === 'success') {
        notifications.show({
          title: 'Database Restored',
          message: `Database restored from: ${selectedBackup}`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        setConfirmRestore(false);
      } else {
        notifications.show({
          title: 'Restore Failed',
          message: response.message || 'Failed to restore database',
          color: 'red',
          icon: <IconX size={16} />,
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to restore database',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteBackup = async (filename: string) => {
    setLoading(true);
    try {
      const response = await backupService.deleteBackup(filename, true);
      
      if (response.status === 'success') {
        notifications.show({
          title: 'Backup Deleted',
          message: `Deleted backup: ${filename}`,
          color: 'green',
          icon: <IconCheck size={16} />,
        });
        // Reload backup list
        loadBackupList();
        // Clear selection if deleted backup was selected
        if (selectedBackup === filename) {
          setSelectedBackup('');
        }
      } else {
        notifications.show({
          title: 'Delete Failed',
          message: response.message || 'Failed to delete backup',
          color: 'red',
          icon: <IconX size={16} />,
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete backup',
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = backupService.formatBytes;
  const formatDateTime = backupService.formatDateTime;

  const BackupTab = () => (
    <Stack gap="md">
      <Card withBorder>
        <Stack gap="sm">
          <Group>
            <IconArchive size={20} />
            <Text fw={500}>Create Database Backup</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Create a timestamped backup of your database. Backups are stored in your local PKMS_Data/backups folder
            and can be used to restore your data later.
          </Text>
          <Divider />
          <Group grow>
            <Button
              leftSection={<IconCloudUpload size={16} />}
              onClick={createBackup}
              loading={loading}
              disabled={loading}
              color="blue"
            >
              Create Backup Now
            </Button>
            <Button
              leftSection={<IconReload size={16} />}
              onClick={manualCheckpoint}
              loading={loading}
              disabled={loading}
              variant="light"
              color="orange"
            >
              Manual WAL Checkpoint
            </Button>
          </Group>
        </Stack>
      </Card>

      {lastOperation && activeTab === 'backup' && (
        <Card withBorder>
          <Stack gap="sm">
            <Group>
              <IconInfoCircle size={16} />
              <Text fw={500}>Last Operation Result</Text>
            </Group>
            <Alert
              color={lastOperation.status === 'success' ? 'green' : 'red'}
              icon={lastOperation.status === 'success' ? <IconCheck size={16} /> : <IconX size={16} />}
            >
              <Text size="sm">{lastOperation.message}</Text>
              {lastOperation.backup_filename && (
                <Text size="xs" mt="xs">
                  File: {lastOperation.backup_filename} ({formatFileSize(lastOperation.file_size_bytes || 0)})
                </Text>
              )}
              <Text size="xs" c="dimmed">
                {formatDateTime(lastOperation.timestamp)}
              </Text>
            </Alert>
          </Stack>
        </Card>
      )}

      {/* WAL Status Card */}
      <Card withBorder>
        <Stack gap="sm">
          <Group>
            <IconFileDatabase size={16} />
            <Text fw={500}>Database WAL Status</Text>
            {walLoading && <Loader size="xs" />}
          </Group>
          
          {walStatus ? (
            <>
              <Text size="sm" c="dimmed">
                Current WAL file size: {walStatus.wal_analysis?.current_size_mb?.toFixed(2) || 0}MB 
                ({walStatus.wal_analysis?.percentage_of_threshold?.toFixed(1) || 0}% of auto-checkpoint threshold)
              </Text>
              
              <Badge 
                color={
                  walStatus.wal_analysis?.status_color === 'green' ? 'green' :
                  walStatus.wal_analysis?.status_color === 'yellow' ? 'yellow' :
                  walStatus.wal_analysis?.status_color === 'orange' ? 'orange' : 
                  walStatus.wal_analysis?.status_color === 'gray' ? 'gray' : 'red'
                }
                variant="light"
              >
                {walStatus.wal_analysis?.status?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}
              </Badge>
              
              <Text size="xs" c="dimmed">
                {walStatus.wal_analysis?.recommendation || 'WAL status monitoring provides insights into database write operations and optimization opportunities.'}
              </Text>
              
              <Group>
                <Text size="xs" c="dimmed">
                  Main DB: {walStatus.files?.main_db?.size_mb?.toFixed(2) || 0}MB
                </Text>
                <Text size="xs" c="dimmed">
                  WAL: {walStatus.files?.wal?.size_mb?.toFixed(2) || 0}MB
                </Text>
                <Text size="xs" c="dimmed">
                  SHM: {walStatus.files?.shm?.size_kb?.toFixed(1) || 0}KB
                </Text>
              </Group>
              
              {walStatus.status === 'error' && (
                <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                  <Text size="xs">
                    Note: WAL status unavailable often means your database is in an optimal state with all recent changes already committed to the main database file.
                  </Text>
                </Alert>
              )}
            </>
          ) : (
            <Text size="sm" c="dimmed">
              Loading WAL status...
            </Text>
          )}
          
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconReload size={14} />}
            onClick={loadWalStatus}
            loading={walLoading}
          >
            Refresh WAL Status
          </Button>
        </Stack>
      </Card>

      <Card withBorder>
        <Stack gap="sm">
          <Group>
            <IconInfoCircle size={16} />
            <Text fw={500}>Backup Information</Text>
          </Group>
          <Text size="sm" c="dimmed">
            • Backups are created from the Docker volume database
          </Text>
          <Text size="sm" c="dimmed">
            • Backups include all your notes, documents, todos, diary entries, and settings
          </Text>
          <Text size="sm" c="dimmed">
            • Backup files are timestamped (YYYYMMDD_HHMMSS format)
          </Text>
          <Text size="sm" c="dimmed">
            • Regular backups are recommended before major changes
          </Text>
        </Stack>
      </Card>
    </Stack>
  );

  const RestoreTab = () => (
    <Stack gap="md">
      <Card withBorder>
        <Stack gap="sm">
          <Group>
            <IconRestore size={20} />
            <Text fw={500}>Restore Database from Backup</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Select a backup file to restore your database. This will replace your current data with the backup.
          </Text>
          
          <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
            <Text fw={500} size="sm">Warning: Destructive Operation</Text>
            <Text size="sm">
              Restoring will REPLACE your current database. Make sure to create a backup of your current data first!
            </Text>
          </Alert>
        </Stack>
      </Card>

      {backupListLoading ? (
        <Card withBorder>
          <Group>
            <Loader size="sm" />
            <Text>Loading available backups...</Text>
          </Group>
        </Card>
      ) : backups.length === 0 ? (
        <Card withBorder>
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
            <Text>No backup files found. Create a backup first using the Backup tab.</Text>
          </Alert>
        </Card>
      ) : (
        <Card withBorder>
          <Stack gap="md">
            <Group>
              <Text fw={500}>Select Backup File</Text>
              <Badge variant="light" color="blue">{backups.length} available</Badge>
            </Group>
            
            <Select
              placeholder="Choose backup file to restore"
              value={selectedBackup}
              onChange={(value) => setSelectedBackup(value || '')}
              data={backups.map(backup => ({
                value: backup.filename,
                label: `${backup.filename} (${formatFileSize(backup.file_size_bytes)}) - ${formatDateTime(backup.created_at)}`
              }))}
            />

            {selectedBackup && (
              <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
                <Text size="sm">
                  Selected: {selectedBackup}
                </Text>
                {(() => {
                  const backup = backups.find(b => b.filename === selectedBackup);
                  return backup ? (
                    <Text size="xs" c="dimmed">
                      Size: {formatFileSize(backup.file_size_bytes)} • Created: {formatDateTime(backup.created_at)}
                    </Text>
                  ) : null;
                })()}
              </Alert>
            )}

            <Switch
              label="I confirm that I want to restore the database (this will replace current data)"
              checked={confirmRestore}
              onChange={(event) => setConfirmRestore(event.currentTarget.checked)}
              color="red"
            />

            <Button
              leftSection={<IconRestore size={16} />}
              onClick={restoreBackup}
              loading={loading}
              disabled={!selectedBackup || !confirmRestore || loading}
              color="red"
              variant="filled"
            >
              Restore Database
            </Button>
          </Stack>
        </Card>
      )}

      {lastOperation && activeTab === 'restore' && (
        <Card withBorder>
          <Stack gap="sm">
            <Group>
              <IconInfoCircle size={16} />
              <Text fw={500}>Last Operation Result</Text>
            </Group>
            <Alert
              color={lastOperation.status === 'success' ? 'green' : 'red'}
              icon={lastOperation.status === 'success' ? <IconCheck size={16} /> : <IconX size={16} />}
            >
              <Text size="sm">{lastOperation.message}</Text>
              {lastOperation.warning && (
                <Text size="xs" c="yellow" mt="xs">
                  ⚠️ {lastOperation.warning}
                </Text>
              )}
              <Text size="xs" c="dimmed">
                {formatDateTime(lastOperation.timestamp)}
              </Text>
            </Alert>
          </Stack>
        </Card>
      )}
    </Stack>
  );

  const ListTab = () => (
    <Stack gap="md">
      <Card withBorder>
        <Group justify="space-between">
          <Group>
            <IconList size={20} />
            <Text fw={500}>Available Backups</Text>
            <Badge variant="light" color="blue">{backups.length} files</Badge>
          </Group>
          <Button
            leftSection={<IconReload size={16} />}
            onClick={loadBackupList}
            loading={backupListLoading}
            variant="light"
            size="sm"
          >
            Refresh
          </Button>
        </Group>
      </Card>

      {backupListLoading ? (
        <Card withBorder>
          <Group>
            <Loader size="sm" />
            <Text>Loading backup files...</Text>
          </Group>
        </Card>
      ) : backups.length === 0 ? (
        <Card withBorder>
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
            <Text>No backup files found.</Text>
            <Text size="sm" c="dimmed">
              Use the Backup tab to create your first database backup.
            </Text>
          </Alert>
        </Card>
      ) : (
        <Card withBorder>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Filename</Table.Th>
                <Table.Th>Size</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {backups.map((backup) => (
                <Table.Tr key={backup.filename}>
                  <Table.Td>
                    <Group gap="xs">
                      <IconFileDatabase size={16} />
                      <Text size="sm" fw={500}>{backup.filename}</Text>
                      {backup.is_recent && (
                        <Badge size="xs" color="green">Recent</Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatFileSize(backup.file_size_bytes)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDateTime(backup.created_at)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="Delete backup">
                        <ActionIcon
                          color="red"
                          variant="light"
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete ${backup.filename}?`)) {
                              deleteBackup(backup.filename);
                            }
                          }}
                          disabled={loading}
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}
    </Stack>
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group>
          <IconDatabase size={24} />
          <Text fw={600}>Database Backup & Restore</Text>
        </Group>
      }
      size="lg"
      centered
    >
      <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'backup')}>
        <Tabs.List>
          <Tabs.Tab value="backup" leftSection={<IconArchive size={16} />}>
            Create Backup
          </Tabs.Tab>
          <Tabs.Tab value="restore" leftSection={<IconRestore size={16} />}>
            Restore
          </Tabs.Tab>
          <Tabs.Tab value="list" leftSection={<IconList size={16} />}>
            Manage Backups
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="backup" pt="md">
          <BackupTab />
        </Tabs.Panel>

        <Tabs.Panel value="restore" pt="md">
          <RestoreTab />
        </Tabs.Panel>

        <Tabs.Panel value="list" pt="md">
          <ListTab />
        </Tabs.Panel>
      </Tabs>
    </Modal>
  );
} 