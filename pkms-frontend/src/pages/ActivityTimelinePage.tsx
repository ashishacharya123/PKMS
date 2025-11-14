import { useState, useCallback } from 'react';
import { Container, Stack, Group, Title, Select, NumberInput, Button, Skeleton, Card, Alert } from '@mantine/core';
import { ActivityTimeline } from '../components/dashboard/ActivityTimeline';
import { dashboardService, type RecentActivityTimeline } from '../services/dashboardService';
import { useDataLoader } from '../hooks/useDataLoader';

export default function ActivityTimelinePage() {
  const [days, setDays] = useState<string | null>('7');
  const [limit, setLimit] = useState<number | ''>(50);

  // Memoize the load function to prevent unnecessary re-renders
  const loadTimeline = useCallback(async () => {
    const d = Number(days || '7');
    const l = typeof limit === 'number' && limit > 0 ? limit : 50;
    return await dashboardService.getRecentActivityTimeline(d, l);
  }, [days, limit]);

  // Use the established useDataLoader pattern instead of manual state management
  const { data: timeline, loading, isRefreshing, error, refetch } = useDataLoader(
    loadTimeline,
    {
      initialData: { items: [], totalCount: 0, cutoffDays: 7 },
      dependencies: [days, limit],
      autoLoad: true,
      keepDataWhileLoading: true // Prevent flickering during refresh
    }
  );

  return (
    <Container size="xl" pt="md" pb="xl">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Activity Timeline</Title>
          <Group gap="sm">
            <Select
              label="Days"
              placeholder="Select range"
              data={[
                { value: '3', label: 'Last 3 days' },
                { value: '7', label: 'Last 7 days' },
                { value: '14', label: 'Last 14 days' },
                { value: '30', label: 'Last 30 days' },
              ]}
              value={days}
              onChange={setDays}
              allowDeselect={false}
              withinPortal
            />
            <NumberInput
              label="Limit"
              placeholder="Items"
              value={limit}
              onChange={setLimit}
              min={10}
              max={200}
              step={10}
            />
            <Button variant="light" onClick={refetch} loading={isRefreshing}>Refresh</Button>
          </Group>
        </Group>

        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}

        {loading ? (
          <Card withBorder>
            <Skeleton height={28} mb="md" />
            <Stack gap="sm">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} height={56} />
              ))}
            </Stack>
          </Card>
        ) : (
          <ActivityTimeline
            items={timeline.items}
            totalCount={timeline.totalCount}
            cutoffDays={timeline.cutoffDays}
          />
        )}
      </Stack>
    </Container>
  );
}


