import { useEffect, useRef, useState } from 'react';
import { Card, Group, Stack, Text, Badge, Loader, Collapse, ActionIcon } from '@mantine/core';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { diaryService } from '../../services/diaryService';
import { WeeklyHighlights } from '../../types/diary';

const isWeekend = (date: Date = new Date()) => {
  const day = date.getDay();
  return day === 6 || day === 0; // Saturday or Sunday
};

export function WeeklyHighlightsPanel() {
  const [data, setData] = useState<WeeklyHighlights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Long TTL cache for session (12h)
  const cacheRef = useRef<{ ts: number; data: WeeklyHighlights | null } | null>(null);
  const TTL_MS = 12 * 60 * 60 * 1000;

  useEffect(() => {
    let mounted = true;
    if (!isWeekend()) return;

    const now = Date.now();
    if (cacheRef.current && now - cacheRef.current.ts < TTL_MS) {
      setData(cacheRef.current.data);
      return;
    }

    setLoading(true);
    diaryService
      .getWeeklyHighlights()
      .then((res) => {
        if (!mounted) return;
        cacheRef.current = { ts: now, data: res };
        setData(res);
        setError(null);
      })
      .catch((err) => {
        console.error('Weekly highlights load error', err);
        if (mounted) setError('Failed to load weekly highlights');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!isWeekend()) {
    return null;
  }

  return (
    <Card withBorder shadow="sm">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <Text fw={600}>Weekly Highlights</Text>
          {data && (
            <Badge variant="light" color="blue">
              {data.periodStart} – {data.periodEnd}
            </Badge>
          )}
        </Group>
        <ActionIcon variant="subtle" onClick={() => setOpen((v) => !v)}>
          {open ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </ActionIcon>
      </Group>

      {loading ? (
        <Group justify="center" py="lg">
          <Loader size="sm" />
        </Group>
      ) : error ? (
        <Text size="sm" c="red">
          {error}
        </Text>
      ) : data ? (
        <Collapse in={open}>
          <Stack gap="xs">
            <Group gap="xs" wrap="wrap">
              <Badge color="blue" variant="light">Notes {data.notesCreated}</Badge>
              <Badge color="green" variant="light">Docs {data.documentsUploaded}</Badge>
              <Badge color="orange" variant="light">Todos {data.todosCompleted}</Badge>
              <Badge color="purple" variant="light">Diary {data.diaryEntries}</Badge>
              <Badge color="grape" variant="light">Archive {data.archiveItemsAdded}</Badge>
              <Badge color="teal" variant="light">Projects +{data.projectsCreated}</Badge>
              <Badge color="cyan" variant="light">Completed {data.projectsCompleted}</Badge>
            </Group>
            <Group gap="xs" wrap="wrap">
              <Badge color="indigo" variant="outline">
                Income NPR {data.totalIncome.toFixed(2)}
              </Badge>
              <Badge color="red" variant="outline">
                Expense NPR {data.totalExpense.toFixed(2)}
              </Badge>
              <Badge color={data.netSavings >= 0 ? 'teal' : 'red'} variant="filled">
                Net {data.netSavings.toFixed(2)}
              </Badge>
            </Group>
          </Stack>
        </Collapse>
      ) : (
        <Text size="sm" c="dimmed">
          No highlights yet.
        </Text>
      )}
    </Card>
  );
}

export default WeeklyHighlightsPanel;

