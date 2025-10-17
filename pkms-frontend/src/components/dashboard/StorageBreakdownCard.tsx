import { useState } from 'react';
import { Card, Group, Stack, Text, Progress, Badge, Collapse, ActionIcon } from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';

interface StorageBreakdownProps {
  total: number;
  byModule?: Record<string, number>;
}

const labels: Record<string, string> = {
  documents_mb: 'Documents',
  archive_mb: 'Archive',
  notes_mb: 'Notes',
  diary_media_mb: 'Diary Media',
  diary_text_mb: 'Diary Text',
};

export function StorageBreakdownCard({ total, byModule }: StorageBreakdownProps) {
  const [expanded, setExpanded] = useState(false);
  if (!byModule) return null;
  const entries = Object.entries(byModule);
  return (
    <Card withBorder shadow="sm">
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <Text fw={600}>Storage Usage</Text>
            <Badge color="blue" variant="light">
              Total {total.toFixed(1)} MB
            </Badge>
          </Group>
          <ActionIcon
            variant="subtle"
            onClick={() => setExpanded((prev) => !prev)}
            aria-label="Toggle storage breakdown"
          >
            {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </ActionIcon>
        </Group>
        <Collapse in={expanded}>
          <Stack gap="sm">
            {entries.map(([key, value]) => (
              <div key={key}>
                <Group justify="space-between">
                  <Text size="sm">{labels[key] ?? key}</Text>
                  <Text size="sm" fw={500}>{value.toFixed(2)} MB</Text>
                </Group>
                <Progress value={total ? Math.min(100, (value / total) * 100) : 0} mt="xs" radius="xl" />
              </div>
            ))}
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  );
}

export default StorageBreakdownCard;

