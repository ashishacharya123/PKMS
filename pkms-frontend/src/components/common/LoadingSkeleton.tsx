/**
 * Loading skeleton components for all loading scenarios
 * Replaces generic "Loading..." text with proper skeleton components
 */

import { Skeleton, Stack, Group, Box } from '@mantine/core';

interface LoadingSkeletonProps {
  variant?: 'card' | 'list' | 'grid' | 'table' | 'form';
  count?: number;
  height?: number;
}

export function LoadingSkeleton({ 
  variant = 'card', 
  count = 3, 
  height = 120 
}: LoadingSkeletonProps) {
  const renderSkeleton = () => {
    switch (variant) {
      case 'card':
        return (
          <Box p="md" style={{ border: '1px solid #e9ecef', borderRadius: '8px' }}>
            <Stack gap="sm">
              <Skeleton height={20} width="60%" />
              <Skeleton height={16} width="100%" />
              <Skeleton height={16} width="80%" />
              <Group justify="space-between" mt="sm">
                <Skeleton height={24} width={80} />
                <Skeleton height={24} width={60} />
              </Group>
            </Stack>
          </Box>
        );
        
      case 'list':
        return (
          <Group p="md" style={{ border: '1px solid #e9ecef', borderRadius: '8px' }}>
            <Skeleton height={40} width={40} radius="md" />
            <Stack gap="xs" style={{ flex: 1 }}>
              <Skeleton height={16} width="70%" />
              <Skeleton height={14} width="50%" />
            </Stack>
            <Skeleton height={24} width={60} />
          </Group>
        );
        
      case 'grid':
        return (
          <Box p="md" style={{ border: '1px solid #e9ecef', borderRadius: '8px' }}>
            <Skeleton height={120} width="100%" radius="md" mb="sm" />
            <Stack gap="xs">
              <Skeleton height={16} width="80%" />
              <Skeleton height={14} width="60%" />
            </Stack>
          </Box>
        );
        
      case 'table':
        return (
          <Group p="md" style={{ borderBottom: '1px solid #e9ecef' }}>
            <Skeleton height={16} width="30%" />
            <Skeleton height={16} width="25%" />
            <Skeleton height={16} width="20%" />
            <Skeleton height={16} width="15%" />
            <Skeleton height={16} width="10%" />
          </Group>
        );
        
      case 'form':
        return (
          <Stack gap="md" p="md">
            <Skeleton height={20} width="40%" />
            <Skeleton height={36} width="100%" />
            <Skeleton height={20} width="35%" />
            <Skeleton height={36} width="100%" />
            <Skeleton height={20} width="30%" />
            <Skeleton height={80} width="100%" />
            <Group justify="flex-end" mt="md">
              <Skeleton height={36} width={80} />
              <Skeleton height={36} width={100} />
            </Group>
          </Stack>
        );
        
      default:
        return <Skeleton height={height} width="100%" />;
    }
  };

  return (
    <Stack gap="md">
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>
          {renderSkeleton()}
        </div>
      ))}
    </Stack>
  );
}

// Specific skeleton components for common use cases
export function CardSkeleton({ count = 3 }: { count?: number }) {
  return <LoadingSkeleton variant="card" count={count} />;
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return <LoadingSkeleton variant="list" count={count} />;
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return <LoadingSkeleton variant="grid" count={count} />;
}

export function TableSkeleton({ count = 10 }: { count?: number }) {
  return <LoadingSkeleton variant="table" count={count} />;
}

export function FormSkeleton() {
  return <LoadingSkeleton variant="form" count={1} />;
}
