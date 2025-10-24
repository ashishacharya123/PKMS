/**
 * Reusable header component for all modules
 * Provides consistent header with title, counts, and action buttons
 */

import React from 'react';
import { Group, Title, Text, Button, Stack, Skeleton } from '@mantine/core';
import { IconRefresh, IconPlus, IconFilter } from '@tabler/icons-react';
import { ModuleHeaderProps } from '../../types/common';

export function ModuleHeader({
  title,
  itemCount,
  onRefresh,
  onCreate,
  onFilter,
  showFilters = true,
  showCreate = true,
  showRefresh = true,
  customActions,
  isLoading = false,
}: ModuleHeaderProps) {
  return (
    <Stack gap="md">
      {/* Title and Count */}
      <Group justify="space-between" align="center">
        <div>
          <Title order={2}>{title}</Title>
          <Text size="sm" c="dimmed">
            {isLoading ? (
              <Skeleton height={16} width={100} />
            ) : (
              `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`
            )}
          </Text>
        </div>
        
        {/* Action Buttons */}
        <Group gap="xs">
          {customActions}
          
          {showRefresh && (
            <Button
              variant="light"
              size="sm"
              leftSection={<IconRefresh size={14} />}
              onClick={onRefresh}
              loading={isLoading}
            >
              Refresh
            </Button>
          )}
          
          {showFilters && onFilter && (
            <Button
              variant="light"
              size="sm"
              leftSection={<IconFilter size={14} />}
              onClick={onFilter}
            >
              Filters
            </Button>
          )}
          
          {showCreate && onCreate && (
            <Button
              size="sm"
              leftSection={<IconPlus size={14} />}
              onClick={onCreate}
            >
              Create
            </Button>
          )}
        </Group>
      </Group>
    </Stack>
  );
}

export default ModuleHeader;
