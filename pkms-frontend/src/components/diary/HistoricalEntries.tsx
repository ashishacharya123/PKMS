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
import { IconCalendar, IconMapPin, IconEye, IconAlertCircle } from '@tabler/icons-react';
import { DiaryEntrySummary } from '../../types/diary';
import { format, subDays, subWeeks, subMonths, subYears } from 'date-fns';
import { diaryService } from '../../services/diaryService';

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

export function HistoricalEntries({ onViewEntry, selectedDate }: { onViewEntry: (entry: DiaryEntrySummary) => void; selectedDate?: Date }) {
  const [historicalEntries, setHistoricalEntries] = useState<Record<string, DiaryEntrySummary | null>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const dateToId = (d: Date) => `hist-${format(d, 'yyyy-MM-dd')}`;

  useEffect(() => {
    loadHistoricalEntries();
  }, []);

  const loadHistoricalEntries = async () => {
    setIsLoading(true);
    try {
      // Get the specific dates we need
      const dates = historicalPeriods.map(period => format(period.getDate(), 'yyyy-MM-dd'));
      
      // Make efficient API call for specific dates only
      const entries = await diaryService.getHistoricalEntries(dates);
      
      const historical: Record<string, DiaryEntrySummary | null> = {};
      historicalPeriods.forEach(period => {
        const dateStr = format(period.getDate(), 'yyyy-MM-dd');
        const entry = entries.find(e => e.date === dateStr);
        historical[period.key] = entry || null;
      });

      setHistoricalEntries(historical);
      setIsUnlocked(true);
    } catch (error) {
      console.error('Failed to load historical entries:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-scroll to selected date’s card if present
  useEffect(() => {
    if (!selectedDate) return;
    const id = dateToId(selectedDate);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selectedDate]);

  if (!isUnlocked) {
    return null;
  }

  const renderEntry = (entry: DiaryEntrySummary | null, period: HistoricalPeriod) => {
    const targetDate = period.getDate();
    const dateStr = format(targetDate, 'MMMM d, yyyy');

    if (!entry) {
      return (
        <Card withBorder p="md" style={{ opacity: 0.6 }} id={dateToId(targetDate)}>
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
        id={dateToId(targetDate)}
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

