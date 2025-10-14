import { useEffect, useState } from 'react';
import {
  Accordion,
  Card,
  Stack,
  Text,
  Group,
  Badge,
  Loader,
  Alert,
  SimpleGrid,
  Tooltip,
  ActionIcon
} from '@mantine/core';
import { IconCalendar, IconMoodSmile, IconMapPin, IconEye, IconAlertCircle } from '@tabler/icons-react';
import { useDiaryStore } from '../../stores/diaryStore';
import { DiaryEntrySummary } from '../../types/diary';
import { format, parseISO, subDays, subWeeks, subMonths, subYears } from 'date-fns';

interface HistoricalPeriod {
  key: string;
  label: string;
  getDate: () => Date;
  icon: string;
}

const historicalPeriods: HistoricalPeriod[] = [
  {
    key: 'yesterday',
    label: 'Yesterday',
    getDate: () => subDays(new Date(), 1),
    icon: '📅'
  },
  {
    key: 'last-week',
    label: 'Last Week (Same Day)',
    getDate: () => subWeeks(new Date(), 1),
    icon: '📆'
  },
  {
    key: 'last-month',
    label: 'Last Month (Same Day)',
    getDate: () => subMonths(new Date(), 1),
    icon: '🗓️'
  },
  {
    key: 'last-year',
    label: 'Last Year (Same Day)',
    getDate: () => subYears(new Date(), 1),
    icon: '📜'
  }
];

const moodEmojis: Record<number, string> = {
  1: '😢',
  2: '😕',
  3: '😐',
  4: '😊',
  5: '😄'
};

const moodLabels: Record<number, string> = {
  1: 'Very Bad',
  2: 'Bad',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent'
};

const moodColors: Record<number, string> = {
  1: 'red',
  2: 'orange',
  3: 'yellow',
  4: 'green',
  5: 'blue'
};

export function HistoricalEntries({ onViewEntry }: { onViewEntry: (entry: DiaryEntrySummary) => void }) {
  const { entries, isUnlocked } = useDiaryStore();
  const [historicalEntries, setHistoricalEntries] = useState<Record<string, DiaryEntrySummary | null>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isUnlocked || !entries.length) return;

    setIsLoading(true);
    const historical: Record<string, DiaryEntrySummary | null> = {};

    historicalPeriods.forEach(period => {
      const targetDate = period.getDate();
      const dateStr = format(targetDate, 'yyyy-MM-dd');
      
      // Find entry for this specific date
      const entry = entries.find(e => {
        const entryDate = format(parseISO(e.date), 'yyyy-MM-dd');
        return entryDate === dateStr;
      });

      historical[period.key] = entry || null;
    });

    setHistoricalEntries(historical);
    setIsLoading(false);
  }, [entries, isUnlocked]);

  if (!isUnlocked) {
    return null;
  }

  const renderEntry = (entry: DiaryEntrySummary | null, period: HistoricalPeriod) => {
    const targetDate = period.getDate();
    const dateStr = format(targetDate, 'MMMM d, yyyy');

    if (!entry) {
      return (
        <Card withBorder p="md" style={{ opacity: 0.6 }}>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500} c="dimmed">
                {dateStr}
              </Text>
              <Badge color="gray" variant="light" size="sm">
                No Entry
              </Badge>
            </Group>
            <Text size="xs" c="dimmed" ta="center" py="md">
              No diary entry for this date
            </Text>
          </Stack>
        </Card>
      );
    }

    return (
      <Card 
        withBorder 
        p="md" 
        style={{ cursor: 'pointer', transition: 'all 0.2s' }}
        onClick={() => onViewEntry(entry)}
        className="historical-entry-card"
      >
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" fw={500}>
              {dateStr}
            </Text>
            <Group gap="xs">
              {entry.mood && (
                <Tooltip label={moodLabels[entry.mood as keyof typeof moodLabels]} withArrow>
                  <Badge 
                    color={moodColors[entry.mood as keyof typeof moodColors]} 
                    variant="light"
                    leftSection={<Text size="xs">{moodEmojis[entry.mood as keyof typeof moodEmojis]}</Text>}
                  >
                    {moodLabels[entry.mood as keyof typeof moodLabels]}
                  </Badge>
                </Tooltip>
              )}
              <ActionIcon 
                variant="subtle" 
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewEntry(entry);
                }}
              >
                <IconEye size={16} />
              </ActionIcon>
            </Group>
          </Group>

          {entry.title && (
            <Text size="sm" fw={500} lineClamp={1}>
              {entry.title}
            </Text>
          )}

          <Group gap="xs" wrap="wrap">
            {entry.weather_label && (
              <Badge size="xs" variant="dot" color="blue">
                {entry.weather_label}
              </Badge>
            )}
            {entry.location && (
              <Badge size="xs" variant="dot" color="green" leftSection={<IconMapPin size={10} />}>
                {entry.location}
              </Badge>
            )}
            {entry.tags && entry.tags.length > 0 && (
              entry.tags.slice(0, 2).map(tag => (
                <Badge key={tag} size="xs" variant="outline" color="gray">
                  {tag}
                </Badge>
              ))
            )}
            {entry.tags && entry.tags.length > 2 && (
              <Badge size="xs" variant="outline" color="gray">
                +{entry.tags.length - 2}
              </Badge>
            )}
          </Group>

          <Text size="xs" c="dimmed">
            {entry.content_length ? `${entry.content_length} characters` : 'No content'}
          </Text>
        </Stack>
      </Card>
    );
  };

  return (
    <Accordion variant="contained" defaultValue="">
      <Accordion.Item value="historical">
        <Accordion.Control>
          <Group>
            <IconCalendar size={20} />
            <div>
              <Text fw={600} size="md">🕰️ Historical Entries</Text>
              <Text size="xs" c="dimmed">
                View entries from the past
              </Text>
            </div>
          </Group>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="md">
            {isLoading ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
              </Group>
            ) : (
              <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
                {historicalPeriods.map(period => (
                  <Stack key={period.key} gap="xs">
                    <Group gap="xs">
                      <Text size="xs">{period.icon}</Text>
                      <Text size="xs" fw={500} c="dimmed">
                        {period.label}
                      </Text>
                    </Group>
                    {renderEntry(historicalEntries[period.key] || null, period)}
                  </Stack>
                ))}
              </SimpleGrid>
            )}

            {!isLoading && entries.length === 0 && (
              <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
                No diary entries yet. Start writing to see your historical entries here!
              </Alert>
            )}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}

