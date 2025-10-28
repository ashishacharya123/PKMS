import { useEffect, useState, useCallback } from 'react';
import { Container, Stack, Group, Title, Select, NumberInput, Button, Skeleton, Card } from '@mantine/core';
import { ActivityTimeline } from '../components/dashboard/ActivityTimeline';
import { dashboardService, type RecentActivityTimeline } from '../services/dashboardService';

export default function ActivityTimelinePage() {
  const [days, setDays] = useState<string | null>('7');
  const [limit, setLimit] = useState<number | ''>(50);
  const [loading, setLoading] = useState<boolean>(true);
  const [timeline, setTimeline] = useState<RecentActivityTimeline>({ items: [], totalCount: 0, cutoffDays: 7 });

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const d = Number(days || '7');
      const l = typeof limit === 'number' && limit > 0 ? limit : 50;
      const data = await dashboardService.getRecentActivityTimeline(d, l);
      setTimeline(data);
    } finally {
      setLoading(false);
    }
  }, [days, limit]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

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
            <Button variant="light" onClick={loadTimeline}>Refresh</Button>
          </Group>
        </Group>

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


