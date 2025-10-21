import { useState, useEffect } from 'react';
import {
  Stack, Group, Select, Card, Title, Text, SimpleGrid, Progress, 
  Badge, Alert, Loader, Center, Divider, Tabs, Button, ActionIcon
} from '@mantine/core';
import { IconRefresh, IconTrendingUp, IconTrendingDown, IconBrain, IconChartBar } from '@tabler/icons-react';
import { diaryService } from '../../services/diaryService';

// Analysis Types
const ANALYSIS_TYPES = [
  { value: 'work_life', label: 'Work/Life Balance' },
  { value: 'financial', label: 'Financial Wellness' },
  { value: 'weekly', label: 'Weekly Patterns' },
  { value: 'temperature', label: 'Temperature Impact' },
  { value: 'writing', label: 'Writing Therapy' }
];

// Chart Types
const CHART_TYPES = [
  { value: 'overview', label: 'Overview Cards' },
  { value: 'comparison', label: 'Comparison' },
  { value: 'trends', label: 'Trends' },
  { value: 'correlation', label: 'Correlations' }
];

// Time Periods
const TIME_PERIODS = [
  { value: '7', label: '1 Week' },
  { value: '30', label: '1 Month' },
  { value: '60', label: '2 Months' },
  { value: '90', label: '3 Months' },
  { value: '180', label: '6 Months' }
];

interface AdvancedAnalyticsProps {
  selectedDate: Date;
}

export function AdvancedAnalytics({ selectedDate }: AdvancedAnalyticsProps) {
  const [selectedAnalysis, setSelectedAnalysis] = useState<string>('work_life');
  const [selectedChart, setSelectedChart] = useState<string>('overview');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30');
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      let data;
      const days = parseInt(selectedPeriod);
      
      switch (selectedAnalysis) {
        case 'work_life':
          data = await diaryService.getWorkLifeBalance(days);
          break;
        case 'financial':
          data = await diaryService.getFinancialWellness(days);
          break;
        case 'weekly':
          data = await diaryService.getWeeklyPatterns(days);
          break;
        case 'temperature':
          data = await diaryService.getTemperatureMood(days);
          break;
        case 'writing':
          data = await diaryService.getWritingTherapy(days);
          break;
        default:
          data = null;
      }
      
      setAnalyticsData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [selectedAnalysis, selectedPeriod]);

  const renderWorkLifeBalance = () => {
    if (!analyticsData?.office_days || !analyticsData?.home_days) return null;

    return (
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Card withBorder p="md">
            <Title order={5} mb="md">Office Days</Title>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm">Total Days</Text>
                <Badge color="blue">{analyticsData.office_days.total_days}</Badge>
              </Group>
              <Group justify="space-between">
                <Text size="sm">Avg Mood</Text>
                <Badge color={analyticsData.office_days.avg_mood > 3.5 ? 'green' : 'orange'}>
                  {analyticsData.office_days.avg_mood.toFixed(1)}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text size="sm">Avg Income</Text>
                <Text size="sm" fw={600}>Rs. {analyticsData.office_days.avg_income.toFixed(0)}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm">Avg Expense</Text>
                <Text size="sm" fw={600}>Rs. {analyticsData.office_days.avg_expense.toFixed(0)}</Text>
              </Group>
            </Stack>
          </Card>

          <Card withBorder p="md">
            <Title order={5} mb="md">Home Days</Title>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="sm">Total Days</Text>
                <Badge color="green">{analyticsData.home_days.total_days}</Badge>
              </Group>
              <Group justify="space-between">
                <Text size="sm">Avg Mood</Text>
                <Badge color={analyticsData.home_days.avg_mood > 3.5 ? 'green' : 'orange'}>
                  {analyticsData.home_days.avg_mood.toFixed(1)}
                </Badge>
              </Group>
              <Group justify="space-between">
                <Text size="sm">Avg Income</Text>
                <Text size="sm" fw={600}>Rs. {analyticsData.home_days.avg_income.toFixed(0)}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm">Avg Expense</Text>
                <Text size="sm" fw={600}>Rs. {analyticsData.home_days.avg_expense.toFixed(0)}</Text>
              </Group>
            </Stack>
          </Card>
        </SimpleGrid>

        {analyticsData.insights && analyticsData.insights.length > 0 && (
          <Card withBorder p="md">
            <Title order={5} mb="md">Insights</Title>
            <Stack gap="sm">
              {analyticsData.insights.map((insight: string, index: number) => (
                <Alert key={index} color="blue" icon={<IconBrain size={16} />}>
                  {insight}
                </Alert>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  };

  const renderFinancialWellness = () => {
    if (!analyticsData) return null;

    return (
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
          <Card withBorder p="md">
            <Title order={6} mb="sm">Salary Days Mood</Title>
            <Text size="xl" fw={700} c="green">
              {analyticsData.salary_days_mood.toFixed(1)}
            </Text>
          </Card>
          <Card withBorder p="md">
            <Title order={6} mb="sm">No Income Days Mood</Title>
            <Text size="xl" fw={700} c="blue">
              {analyticsData.no_income_days_mood.toFixed(1)}
            </Text>
          </Card>
          <Card withBorder p="md">
            <Title order={6} mb="sm">High Expense Mood</Title>
            <Text size="xl" fw={700} c="red">
              {analyticsData.high_expense_mood.toFixed(1)}
            </Text>
          </Card>
          <Card withBorder p="md">
            <Title order={6} mb="sm">Normal Expense Mood</Title>
            <Text size="xl" fw={700} c="orange">
              {analyticsData.normal_expense_mood.toFixed(1)}
            </Text>
          </Card>
        </SimpleGrid>

        {analyticsData.insights && analyticsData.insights.length > 0 && (
          <Card withBorder p="md">
            <Title order={5} mb="md">Financial Insights</Title>
            <Stack gap="sm">
              {analyticsData.insights.map((insight: string, index: number) => (
                <Alert key={index} color="yellow" icon={<IconTrendingUp size={16} />}>
                  {insight}
                </Alert>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  };

  const renderWeeklyPatterns = () => {
    if (!analyticsData?.weekly_patterns) return null;

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    return (
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {dayNames.map(day => {
            const data = analyticsData.weekly_patterns[day];
            if (!data) return null;
            
            return (
              <Card key={day} withBorder p="md">
                <Title order={6} mb="sm">{day}</Title>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="sm">Mood</Text>
                    <Badge color={data.avg_mood > 3.5 ? 'green' : 'orange'}>
                      {data.avg_mood.toFixed(1)}
                    </Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Income</Text>
                    <Text size="sm">Rs. {data.avg_income.toFixed(0)}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Expense</Text>
                    <Text size="sm">Rs. {data.avg_expense.toFixed(0)}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm">Entries</Text>
                    <Badge size="sm">{data.total_entries}</Badge>
                  </Group>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>

        {analyticsData.insights && analyticsData.insights.length > 0 && (
          <Card withBorder p="md">
            <Title order={5} mb="md">Weekly Insights</Title>
            <Stack gap="sm">
              {analyticsData.insights.map((insight: string, index: number) => (
                <Alert key={index} color="purple" icon={<IconChartBar size={16} />}>
                  {insight}
                </Alert>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  };

  const renderTemperatureMood = () => {
    if (!analyticsData?.temperature_mood) return null;

    return (
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {Object.entries(analyticsData.temperature_mood).map(([temp, data]: [string, any]) => (
            <Card key={temp} withBorder p="md">
              <Title order={6} mb="sm">{temp}</Title>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm">Avg Mood</Text>
                  <Badge color={data.avg_mood > 3.5 ? 'green' : 'orange'}>
                    {data.avg_mood.toFixed(1)}
                  </Badge>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Entries</Text>
                  <Badge size="sm">{data.entry_count}</Badge>
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>

        {analyticsData.insights && analyticsData.insights.length > 0 && (
          <Card withBorder p="md">
            <Title order={5} mb="md">Temperature Insights</Title>
            <Stack gap="sm">
              {analyticsData.insights.map((insight: string, index: number) => (
                <Alert key={index} color="cyan" icon={<IconTrendingDown size={16} />}>
                  {insight}
                </Alert>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  };

  const renderWritingTherapy = () => {
    if (!analyticsData?.mood_writing) return null;

    return (
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {Object.entries(analyticsData.mood_writing).map(([mood, data]: [string, any]) => (
            <Card key={mood} withBorder p="md">
              <Title order={6} mb="sm">{mood}</Title>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm">Avg Content Length</Text>
                  <Text size="sm" fw={600}>{data.avg_content_length} chars</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="sm">Entries</Text>
                  <Badge size="sm">{data.entry_count}</Badge>
                </Group>
                <Progress 
                  value={(data.avg_content_length / 500) * 100} 
                  size="sm" 
                  color="blue"
                />
              </Stack>
            </Card>
          ))}
        </SimpleGrid>

        {analyticsData.insights && analyticsData.insights.length > 0 && (
          <Card withBorder p="md">
            <Title order={5} mb="md">Writing Insights</Title>
            <Stack gap="sm">
              {analyticsData.insights.map((insight: string, index: number) => (
                <Alert key={index} color="teal" icon={<IconBrain size={16} />}>
                  {insight}
                </Alert>
              ))}
            </Stack>
          </Card>
        )}
      </Stack>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <Center py="xl">
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text c="dimmed">Loading analytics...</Text>
          </Stack>
        </Center>
      );
    }

    if (error) {
      return (
        <Alert color="red" icon={<IconTrendingDown size={16} />}>
          {error}
        </Alert>
      );
    }

    if (!analyticsData) {
      return (
        <Alert color="blue" icon={<IconBrain size={16} />}>
          Select an analysis type to get started
        </Alert>
      );
    }

    switch (selectedAnalysis) {
      case 'work_life':
        return renderWorkLifeBalance();
      case 'financial':
        return renderFinancialWellness();
      case 'weekly':
        return renderWeeklyPatterns();
      case 'temperature':
        return renderTemperatureMood();
      case 'writing':
        return renderWritingTherapy();
      default:
        return null;
    }
  };

  return (
    <Stack gap="md">
      {/* Multi-Level Controls */}
      <Card withBorder p="md">
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={4}>Advanced Analytics</Title>
            <ActionIcon
              variant="light"
              size="lg"
              onClick={loadAnalytics}
              loading={isLoading}
              title="Refresh analytics"
            >
              <IconRefresh size={18} />
            </ActionIcon>
          </Group>

          <Divider />

          <Group gap="md" wrap="wrap">
            <Select
              label="Analysis Type"
              data={ANALYSIS_TYPES}
              value={selectedAnalysis}
              onChange={(value) => setSelectedAnalysis(value || 'work_life')}
              style={{ minWidth: 200 }}
            />
            <Select
              label="Chart Type"
              data={CHART_TYPES}
              value={selectedChart}
              onChange={(value) => setSelectedChart(value || 'overview')}
              style={{ minWidth: 150 }}
            />
            <Select
              label="Time Period"
              data={TIME_PERIODS}
              value={selectedPeriod}
              onChange={(value) => setSelectedPeriod(value || '30')}
              style={{ minWidth: 120 }}
            />
          </Group>
        </Stack>
      </Card>

      {/* Main Content */}
      <Card withBorder p="md">
        {renderContent()}
      </Card>

      {/* Data Summary */}
      {analyticsData && (
        <Text size="xs" c="dimmed" ta="center">
          Analysis period: {analyticsData.analysis_period || selectedPeriod} days
        </Text>
      )}
    </Stack>
  );
}
