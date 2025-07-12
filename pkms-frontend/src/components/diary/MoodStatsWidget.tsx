import { useEffect, useState } from 'react';
import {
  Paper,
  Title,
  Text,
  Group,
  Stack,
  Progress,
  Badge,
  Grid,
  Card,
  Tooltip,
  ActionIcon
} from '@mantine/core';
import { IconMoodHappy, IconTrendingUp, IconCalendarStats, IconRefresh } from '@tabler/icons-react';
import { useDiaryStore } from '../../stores/diaryStore';

const moodColors = {
  1: '#fa5252', // red
  2: '#fd7e14', // orange  
  3: '#fab005', // yellow
  4: '#51cf66', // green
  5: '#339af0'  // blue
};

const moodLabels = {
  1: 'Very Low',
  2: 'Low', 
  3: 'Neutral',
  4: 'Good',
  5: 'Excellent'
};

const moodEmojis = {
  1: '😢',
  2: '😕',
  3: '😐', 
  4: '😊',
  5: '😄'
};

export function MoodStatsWidget() {
  const { moodStats, loadMoodStats, error, isLoading } = useDiaryStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadMoodStats();
  }, [loadMoodStats]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadMoodStats();
    setIsRefreshing(false);
  };

  if (isLoading || !moodStats) {
    return (
      <Paper p="md" withBorder>
        <Group>
          <IconMoodHappy size={20} />
          <Text c="dimmed">{isLoading ? "Loading mood statistics..." : "No mood data available yet"}</Text>
        </Group>
      </Paper>
    );
  }

  const { average_mood, mood_distribution, total_entries } = moodStats;
  
  // If no entries with mood data, show encouraging message
  if (total_entries === 0) {
    return (
      <Paper p="lg" withBorder>
        <Stack gap="md" align="center" py="xl">
          <Text size="xl">😊</Text>
          <Text fw={500} ta="center">Start tracking your mood!</Text>
          <Text size="sm" c="dimmed" ta="center" maw={400}>
            Add mood ratings to your diary entries to see insights about your emotional patterns and trends over time.
          </Text>
        </Stack>
      </Paper>
    );
  }
  
  // Calculate percentage for each mood
  const moodPercentages = Object.entries(mood_distribution).map(([mood, count]) => ({
    mood: parseInt(mood),
    count,
    percentage: total_entries > 0 ? (count / total_entries) * 100 : 0
  }));

  // Get dominant mood
  const dominantMood = moodPercentages.reduce((prev, current) => 
    current.count > prev.count ? current : prev
  );

  // Calculate trend (simple interpretation)
  const getTrendMessage = () => {
    if (!average_mood) return "No mood data yet";
    
    if (average_mood >= 4) {
      return "You're doing great! 🌟";
    } else if (average_mood >= 3) {
      return "Balanced overall 👍";
    } else if (average_mood >= 2) {
      return "Some tough days lately 💙";
    } else {
      return "Take care of yourself 💚";
    }
  };

  const getProgressColor = () => {
    if (!average_mood) return 'gray';
    if (average_mood >= 4) return 'green';
    if (average_mood >= 3) return 'yellow';
    if (average_mood >= 2) return 'orange';
    return 'red';
  };

  return (
    <Paper p="lg" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={3} size="h4">
            <Group gap="xs">
              <IconMoodHappy size={20} />
              Mood Insights
            </Group>
          </Title>
          <Group gap="xs">
            <Badge variant="light" leftSection={<IconCalendarStats size={14} />}>
              {total_entries} entries
            </Badge>
            <ActionIcon
              variant="light"
              size="sm"
              onClick={handleRefresh}
              loading={isRefreshing}
              disabled={isLoading}
            >
              <IconRefresh size={14} />
            </ActionIcon>
          </Group>
        </Group>

        <Grid>
          {/* Average Mood */}
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Card withBorder p="md">
              <Stack gap="xs">
                <Text size="sm" c="dimmed">Average Mood</Text>
                <Group justify="space-between">
                  <Text size="xl" fw={600}>
                    {average_mood ? average_mood.toFixed(1) : '—'}/5
                  </Text>
                  <Text size="lg">
                    {average_mood ? moodEmojis[Math.round(average_mood) as keyof typeof moodEmojis] : '😐'}
                  </Text>
                </Group>
                <Progress 
                  value={average_mood ? (average_mood / 5) * 100 : 0} 
                  color={getProgressColor()}
                  size="sm"
                />
                <Text size="xs" c="dimmed">
                  {getTrendMessage()}
                </Text>
              </Stack>
            </Card>
          </Grid.Col>

          {/* Dominant Mood */}
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Card withBorder p="md">
              <Stack gap="xs">
                <Text size="sm" c="dimmed">Most Common Mood</Text>
                <Group justify="space-between">
                  <Text size="lg" fw={500}>
                    {moodLabels[dominantMood.mood as keyof typeof moodLabels]}
                  </Text>
                  <Text size="lg">
                    {moodEmojis[dominantMood.mood as keyof typeof moodEmojis]}
                  </Text>
                </Group>
                <Progress 
                  value={dominantMood.percentage} 
                  color={moodColors[dominantMood.mood as keyof typeof moodColors]}
                  size="sm"
                />
                <Text size="xs" c="dimmed">
                  {dominantMood.percentage.toFixed(1)}% of your entries
                </Text>
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>

        {/* Mood Distribution */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Text size="sm" fw={500}>Mood Distribution</Text>
            
            <Grid>
              {[5, 4, 3, 2, 1].map((mood) => {
                const data = moodPercentages.find(m => m.mood === mood);
                const count = data?.count || 0;
                const percentage = data?.percentage || 0;
                
                return (
                  <Grid.Col span={{ base: 12, xs: 6, sm: 2.4 }} key={mood}>
                    <Tooltip label={`${count} entries (${percentage.toFixed(1)}%)`}>
                      <Card withBorder p="xs" style={{ textAlign: 'center', cursor: 'help' }}>
                        <Stack gap={4}>
                          <Text size="lg">{moodEmojis[mood as keyof typeof moodEmojis]}</Text>
                          <Text size="xs" c="dimmed">{moodLabels[mood as keyof typeof moodLabels]}</Text>
                          <Progress
                            value={percentage}
                            color={moodColors[mood as keyof typeof moodColors]}
                            size="xs"
                          />
                          <Text size="xs" fw={500}>{count}</Text>
                        </Stack>
                      </Card>
                    </Tooltip>
                  </Grid.Col>
                );
              })}
            </Grid>
          </Stack>
        </Card>

        {/* Encouraging Message */}
        <Card withBorder p="md" style={{ backgroundColor: 'var(--mantine-color-blue-0)' }}>
          <Group>
            <IconTrendingUp size={16} color="var(--mantine-color-blue-6)" />
            <Text size="sm" c="blue.7">
              <strong>Remember:</strong> Every day is different, and tracking your mood can help you identify patterns and celebrate your good days. Take care of yourself! 💙
            </Text>
          </Group>
        </Card>

        {error && (
          <Text size="sm" c="red">
            Failed to load mood statistics: {error}
          </Text>
        )}
      </Stack>
    </Paper>
  );
} 