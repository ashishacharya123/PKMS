import React, { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Text,
  Button,
  Alert,
  Group,
  Badge,
  List,
  LoadingOverlay,
  Box
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconTrash,
  IconRestore
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import deletionImpactService, { DeletionImpact, ItemType, DeletionMode } from '../../services/deletionImpactService';

interface DeletionImpactDialogProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: ItemType;
  itemUuid: string;
  itemTitle: string;
  onDeleteSuccess: () => void;
  mode?: DeletionMode;
}

export function DeletionImpactDialog({
  isOpen,
  onClose,
  itemType,
  itemUuid,
  itemTitle,
  onDeleteSuccess,
  mode = 'soft'
}: DeletionImpactDialogProps) {
  const [loading, setLoading] = useState(false);
  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load deletion impact when dialog opens
  useEffect(() => {
    if (isOpen && itemUuid) {
      loadDeletionImpact();
    }
  }, [isOpen, itemUuid, mode]);

  const loadDeletionImpact = async () => {
    setLoading(true);
    try {
      const impactData = await deletionImpactService.analyzeDeletionImpact(
        itemType,
        itemUuid,
        mode
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

  const handleDelete = async () => {
    if (!impact || !deletionImpactService.canDelete(impact)) {
      return;
    }

    setDeleting(true);
    try {
      // Call the appropriate delete endpoint based on mode
      const endpoint = mode === 'soft' 
        ? `/api/v1/${itemType}s/${itemUuid}`
        : `/api/v1/${itemType}s/${itemUuid}/permanent`;
      
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete item');
      }

      notifications.show({
        title: 'Success',
        message: mode === 'soft' 
          ? `${itemTitle} has been moved to the Recycle Bin`
          : `${itemTitle} has been permanently deleted`,
        color: 'green'
      });

      onDeleteSuccess();
      onClose();
    } catch (error) {
      console.error('Error deleting item:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to delete item',
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
            <Text fw={500} size="sm">Will be deleted:</Text>
            <List size="sm" mt="xs">
              {details.willBeDeleted.map((item, index) => (
                <List.Item key={index}>
                  {item.title} ({item.type})
                </List.Item>
              ))}
            </List>
          </Alert>
        )}
        
        {details.willBePreserved.length > 0 && (
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
            <Text fw={500} size="sm">Will be preserved:</Text>
            <List size="sm" mt="xs">
              {details.willBePreserved.map((item, index) => (
                <List.Item key={index}>
                  {item.title} ({item.type})
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
      title={deletionImpactService.getModalTitle(mode, itemTitle)}
      centered
      size="md"
    >
      <Box pos="relative">
        <LoadingOverlay visible={loading} />
        
        <Stack gap="md">
          <Text size="sm">
            {deletionImpactService.getModalDescription(mode, impact || {} as DeletionImpact)}
          </Text>

          {impact && renderImpactDetails()}

          {impact && impact.blockers.length > 0 && (
            <Alert icon={<IconAlertTriangle size={16} />} color="red">
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
              color={deletionImpactService.getActionButtonColor(mode, impact || {} as DeletionImpact)}
              loading={deleting}
              disabled={!impact || !deletionImpactService.canDelete(impact)}
              onClick={handleDelete}
            >
              {deletionImpactService.getActionButtonText(mode, impact || {} as DeletionImpact)}
            </Button>
          </Group>
        </Stack>
      </Box>
    </Modal>
  );
}
