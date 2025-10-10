import { useState, useEffect } from 'react';
import {
  Paper,
  Stack,
  Group,
  Select,
  ActionIcon,
  SimpleGrid,
  Card,
  Text,
  Badge,
  Alert,
  Loader,
  Center,
} from '@mantine/core';
import { IconRefresh, IconSparkles, IconAlertCircle } from '@tabler/icons-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { diaryService } from '../../services/diaryService';
import { WellnessStats } from '../../types/diary';
import { useDiaryStore } from '../../stores/diaryStore';

type ChartType = 
  | 'mood-trend'
  | 'sleep-analysis'
  | 'exercise-frequency'
  | 'screen-time'
  | 'energy-stress'
  | 'hydration'
  | 'mood-sleep-correlation'
  | 'wellness-score';

const CHART_OPTIONS = [
  { value: 'mood-trend', label: '📊 Mood Trend' },
  { value: 'sleep-analysis', label: '😴 Sleep Analysis' },
  { value: 'exercise-frequency', label: '🏃 Exercise Frequency' },
  { value: 'screen-time', label: '📱 Screen Time Trend' },
  { value: 'energy-stress', label: '⚡ Energy & Stress Levels' },
  { value: 'hydration', label: '💧 Hydration Tracking' },
  { value: 'mood-sleep-correlation', label: '🔗 Mood vs Sleep Correlation' },
  { value: 'wellness-score', label: '📈 Wellness Score Breakdown' },
];

const PERIOD_OPTIONS = [
  { value: '7', label: '1 Week' },
  { value: '30', label: '1 Month' },
  { value: '90', label: '3 Months' },
  { value: '180', label: '6 Months' },
  { value: '365', label: '1 Year' },
];

const COLORS = {
  mood: '#339af0',
  sleep: '#5c7cfa',
  exercise: '#51cf66',
  screenTime: '#ff6b6b',
  energy: '#ffd43b',
  stress: '#ff8787',
  hydration: '#4dabf7',
};

export function WellnessAnalytics() {
  const { isUnlocked } = useDiaryStore();
  const [selectedChart, setSelectedChart] = useState<ChartType>('mood-trend');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30');
  const [wellnessData, setWellnessData] = useState<WellnessStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadWellnessData = async () => {
    if (!isUnlocked) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const data = await diaryService.getWellnessStats(parseInt(selectedPeriod));
      setWellnessData(data);
    } catch (err: any) {
      console.error('Failed to load wellness stats:', err);
      setError(err.message || 'Failed to load wellness data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWellnessData();
  }, [selectedPeriod, isUnlocked]);

  if (!isUnlocked) {
    return (
      <Paper p="md" withBorder>
        <Text c="dimmed" ta="center">Unlock your diary to view wellness analytics</Text>
      </Paper>
    );
  }

  if (isLoading && !wellnessData) {
    return (
      <Paper p="xl" withBorder>
        <Center>
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text c="dimmed">Loading wellness analytics...</Text>
          </Stack>
        </Center>
      </Paper>
    );
  }

  if (error) {
    return (
      <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
        {error}
      </Alert>
    );
  }

  const hasData = wellnessData && wellnessData.daysWithData > 0;

  // Get the current insight for the selected chart
  const getCurrentInsight = () => {
    if (!wellnessData || !wellnessData.insights.length) return null;
    
    const metricMap: Record<ChartType, string> = {
      'mood-trend': 'mood',
      'sleep-analysis': 'sleep',
      'exercise-frequency': 'exercise',
      'screen-time': 'habits',
      'energy-stress': 'mental',
      'hydration': 'habits',
      'mood-sleep-correlation': 'correlation',
      'wellness-score': 'overall',
    };
    
    const relevantMetric = metricMap[selectedChart];
    const insight = wellnessData.insights.find(i => i.metric === relevantMetric) 
                    || wellnessData.insights[0];
    
    return insight;
  };

  const renderChart = () => {
    switch (selectedChart) {
      case 'mood-trend':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={wellnessData.moodTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} />
              <Tooltip 
                labelFormatter={(date) => new Date(date).toLocaleDateString()}
                formatter={(value: any) => [value != null ? value.toFixed(1) : 'No data', 'Mood']}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={COLORS.mood} 
                strokeWidth={2}
                name="Mood"
                connectNulls
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'sleep-analysis':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={wellnessData.sleepTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                labelFormatter={(date) => new Date(date).toLocaleDateString()}
                formatter={(value: any) => [value != null ? `${value} hrs` : 'No data', 'Sleep']}
              />
              <Legend />
              <Bar dataKey="value" fill={COLORS.sleep} name="Sleep Duration">
                {wellnessData.sleepTrend.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.value && entry.value >= 7 ? COLORS.sleep : '#ff8787'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'exercise-frequency':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={wellnessData.exerciseTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                labelFormatter={(date) => new Date(date).toLocaleDateString()}
                formatter={(value: any) => [value != null ? `${value} min` : 'No exercise', 'Duration']}
              />
              <Legend />
              <Bar dataKey="value" fill={COLORS.exercise} name="Exercise Minutes" />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'screen-time':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={wellnessData.screenTimeTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                labelFormatter={(date) => new Date(date).toLocaleDateString()}
                formatter={(value: any) => [value != null ? `${value} hrs` : 'No data', 'Screen Time']}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={COLORS.screenTime} 
                strokeWidth={2}
                name="Screen Time"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'energy-stress':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={wellnessData.energyTrend.map((e, idx) => ({
              date: e.date,
              energy: e.value,
              stress: wellnessData.stressTrend[idx]?.value,
            }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} />
              <Tooltip labelFormatter={(date) => new Date(date).toLocaleDateString()} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="energy" 
                stroke={COLORS.energy} 
                strokeWidth={2}
                name="Energy"
                connectNulls
              />
              <Line 
                type="monotone" 
                dataKey="stress" 
                stroke={COLORS.stress} 
                strokeWidth={2}
                name="Stress"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'hydration':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={wellnessData.hydrationTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis label={{ value: 'Glasses', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                labelFormatter={(date) => new Date(date).toLocaleDateString()}
                formatter={(value: any) => [value != null ? `${value} glasses` : 'No data', 'Water']}
              />
              <Legend />
              <Bar dataKey="value" fill={COLORS.hydration} name="Water Intake">
                {wellnessData.hydrationTrend.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.value && entry.value >= 8 ? COLORS.hydration : '#ffd43b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'mood-sleep-correlation': {
        const validPoints = wellnessData.moodSleepCorrelation.filter(p => p.mood !== null && p.sleep !== null);
        return (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                type="number" 
                dataKey="sleep" 
                name="Sleep (hrs)" 
                label={{ value: 'Sleep Hours', position: 'insideBottom', offset: -5 }}
              />
              <YAxis 
                type="number" 
                dataKey="mood" 
                name="Mood" 
                domain={[0, 5]}
                label={{ value: 'Mood', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value: any, name: string) => [
                  name === 'sleep' ? `${value} hrs` : value,
                  name === 'sleep' ? 'Sleep' : 'Mood'
                ]}
              />
              <Legend />
              <Scatter 
                name="Mood vs Sleep" 
                data={validPoints} 
                fill={COLORS.mood}
              />
            </ScatterChart>
          </ResponsiveContainer>
        );
      }

      case 'wellness-score': {
        const radarData = Object.entries(wellnessData.wellnessComponents).map(([key, value]) => ({
          metric: key.replace(/([A-Z])/g, ' $1').trim(),
          score: value,
        }));
        return (
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} />
              <Tooltip formatter={(value: any) => [`${value.toFixed(1)}`, 'Score']} />
              <Radar 
                name="Wellness Components" 
                dataKey="score" 
                stroke="#339af0" 
                fill="#339af0" 
                fillOpacity={0.6}
              />
            </RadarChart>
          </ResponsiveContainer>
        );
      }

      default:
        return null;
    }
  };

  const insight = getCurrentInsight();

  return (
    <Stack gap="md">
      {/* Controls */}
      <Group justify="space-between" wrap="wrap">
        <Group>
          <Select
            label="Chart Type"
            data={CHART_OPTIONS}
            value={selectedChart}
            onChange={(value) => setSelectedChart(value as ChartType)}
            style={{ minWidth: 200 }}
            size="sm"
          />
          <Select
            label="Period"
            data={PERIOD_OPTIONS}
            value={selectedPeriod}
            onChange={(value) => setSelectedPeriod(value || '30')}
            size="sm"
          />
        </Group>
        <ActionIcon 
          variant="light" 
          size="lg" 
          onClick={loadWellnessData}
          loading={isLoading}
          title="Refresh data"
        >
          <IconRefresh size={18} />
        </ActionIcon>
      </Group>

      {/* Summary Cards */}
      {hasData && (
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Card withBorder padding="md">
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase">Wellness Score</Text>
              <Group gap="xs" align="baseline">
                <Text size="xl" fw={700}>
                  {wellnessData.wellnessScore?.toFixed(0) || 'N/A'}
                </Text>
                {wellnessData.wellnessScore != null && (
                  <Badge 
                    color={
                      wellnessData.wellnessScore >= 75 ? 'green' : 
                      wellnessData.wellnessScore >= 60 ? 'yellow' : 'red'
                    }
                    size="sm"
                  >
                    {wellnessData.wellnessScore >= 75 ? 'Good' : 
                     wellnessData.wellnessScore >= 60 ? 'Fair' : 'Needs Work'}
                  </Badge>
                )}
              </Group>
            </Stack>
          </Card>

          <Card withBorder padding="md">
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase">Average Mood</Text>
              <Group gap="xs" align="baseline">
                <Text size="xl" fw={700}>
                  {wellnessData.averageMood?.toFixed(1) || 'N/A'}
                </Text>
                {wellnessData.averageMood != null && (
                  <Text size="sm" c="dimmed">/ 5 ⭐</Text>
                )}
              </Group>
            </Stack>
          </Card>

          <Card withBorder padding="md">
            <Stack gap={4}>
              <Text size="xs" c="dimmed" tt="uppercase">Average Sleep</Text>
              <Group gap="xs" align="baseline">
                <Text size="xl" fw={700}>
                  {wellnessData.averageSleep?.toFixed(1) || 'N/A'}
                </Text>
                {wellnessData.averageSleep != null && (
                  <Text size="sm" c="dimmed">hrs 😴</Text>
                )}
              </Group>
            </Stack>
          </Card>
        </SimpleGrid>
      )}

      {/* Chart or Empty State */}
      <Paper p="md" withBorder>
        {hasData ? (
          renderChart()
        ) : (
          <Stack align="center" gap="md" py="xl">
            <Text size="xl">📊</Text>
            <Text fw={500} ta="center">No wellness data yet</Text>
            <Text size="sm" c="dimmed" ta="center" maw={400}>
              Start tracking your daily wellness metrics to see insights and analytics!
            </Text>
            <Text size="xs" c="dimmed" ta="center">
              Go to "Daily Wellness Tracker" above and fill in your metrics for today.
            </Text>
          </Stack>
        )}
      </Paper>

      {/* Insight */}
      {hasData && insight && (
        <Alert 
          icon={<IconSparkles size={16} />} 
          title="Insight" 
          color={
            insight.type === 'positive' ? 'green' : 
            insight.type === 'negative' ? 'red' : 'blue'
          }
        >
          {insight.message}
        </Alert>
      )}

      {/* Data Summary */}
      {hasData && wellnessData && (
        <Text size="xs" c="dimmed" ta="center">
          Showing {wellnessData.daysWithData} days with data out of {wellnessData.totalDays} days analyzed
          ({wellnessData.periodStart} to {wellnessData.periodEnd})
        </Text>
      )}
    </Stack>
  );
}

