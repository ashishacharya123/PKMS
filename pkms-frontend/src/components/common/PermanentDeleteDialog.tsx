import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Text,
  Button,
  Alert,
  Group,
  List,
  LoadingOverlay,
  Box,
  Badge
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconTrash,
  IconShield
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import deletionImpactService, { DeletionImpact, ItemType } from '../../services/deletionImpactService';

interface PermanentDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: ItemType;
  itemUuid: string;
  itemTitle: string;
  onDeleteSuccess: () => void;
}

export function PermanentDeleteDialog({
  isOpen,
  onClose,
  itemType,
  itemUuid,
  itemTitle,
  onDeleteSuccess
}: PermanentDeleteDialogProps) {
  const [loading, setLoading] = useState(false);
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load deletion impact when dialog opens
  useEffect(() => {
    if (isOpen && itemUuid) {
      loadDeletionImpact();
    }
  }, [isOpen, itemUuid]);

  const loadDeletionImpact = async () => {
    setLoading(true);
    try {
      const impactData = await deletionImpactService.analyzeDeletionImpact(
        itemType,
        itemUuid,
        'hard'
      );
      setImpact(impactData);
    } catch (error) {
      console.error('Error loading deletion impact:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to analyze deletion impact',
        color: 'red'
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!impact || !deletionImpactService.canDelete(impact)) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/v1/${itemType}s/${itemUuid}/permanent`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to permanently delete item');
      }

      notifications.show({
        title: 'Success',
        message: `${itemTitle} has been permanently deleted`,
        color: 'green'
      });

      onDeleteSuccess();
      onClose();
    } catch (error) {
      console.error('Error permanently deleting item:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to permanently delete item',
        color: 'red'
      });
    } finally {
      setDeleting(false);
    }
  };

  const renderImpactDetails = () => {
    if (!impact) return null;

    const details = deletionImpactService.getDetailedImpact(impact);
    
    return (
      <Stack gap="sm">
        {details.willBeDeleted.length > 0 && (
          <Alert icon={<IconTrash size={16} />} color="red" variant="light">
            <Text fw={500} size="sm">Will be permanently deleted:</Text>
            <List size="sm" mt="xs">
              {details.willBeDeleted.map((item, index) => (
                <List.Item key={index}>
                  <Group gap="xs" align="center">
                    <Text>{item.title}</Text>
                    <Badge size="xs" color="red" variant="light">
                      {item.type}
                    </Badge>
                  </Group>
                </List.Item>
              ))}
            </List>
          </Alert>
        )}
        
        {details.willBePreserved.length > 0 && (
          <Alert icon={<IconShield size={16} />} color="green" variant="light">
            <Text fw={500} size="sm">Will be preserved (shared items):</Text>
            <List size="sm" mt="xs">
              {details.willBePreserved.map((item, index) => (
                <List.Item key={index}>
                  <Group gap="xs" align="center">
                    <Text>{item.title}</Text>
                    <Badge size="xs" color="green" variant="light">
                      {item.type}
                    </Badge>
                  </Group>
                </List.Item>
              ))}
            </List>
          </Alert>
        )}
        
        {details.warnings.length > 0 && (
          <Alert icon={<IconAlertTriangle size={16} />} color="yellow" variant="light">
            <Text fw={500} size="sm">Warnings:</Text>
            <List size="sm" mt="xs">
              {details.warnings.map((warning, index) => (
                <List.Item key={index}>{warning}</List.Item>
              ))}
            </List>
          </Alert>
        )}
      </Stack>
    );
  };

  if (!isOpen) return null;

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={`Permanently Delete "${itemTitle}"`}
      centered
      size="lg"
    >
      <Box pos="relative">
        <LoadingOverlay visible={loading} />
        
        <Stack gap="md">
          <Alert icon={<IconAlertTriangle size={20} />} color="red" variant="filled">
            <Text fw={600} size="lg">⚠️ DANGER: This action cannot be undone!</Text>
            <Text size="sm" mt="xs">
              This will permanently delete the item and any orphaned children from your system.
            </Text>
          </Alert>

          <Text size="sm">
            {deletionImpactService.getModalDescription('hard', impact || {} as DeletionImpact)}
          </Text>

          {impact && renderImpactDetails()}

          {impact && impact.blockers.length > 0 && (
            <Alert icon={<IconInfoCircle size={16} />} color="blue">
              <Text fw={500}>Cannot delete:</Text>
              <List size="sm" mt="xs">
                {impact.blockers.map((blocker, index) => (
                  <List.Item key={index}>{blocker}</List.Item>
                ))}
              </List>
            </Alert>
          )}

          <Group justify="flex-end" gap="sm">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleting}
              disabled={!impact || !deletionImpactService.canDelete(impact)}
              onClick={handlePermanentDelete}
            >
              Delete Forever
            </Button>
          </Group>
        </Stack>
      </Box>
    </Modal>
  );
}
