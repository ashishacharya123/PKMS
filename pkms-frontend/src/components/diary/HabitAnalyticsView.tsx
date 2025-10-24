/**
 * HabitAnalyticsView - Main orchestrator for habit analytics with two-step dropdown
 * 
 * This component provides the master analytics UI with cascading dropdowns and
 * comprehensive habit analytics. It uses useReducer for complex state management
 * and integrates with the new backend analytics endpoints.
 * 
 * Features:
 * - Two-step dropdown (Type → Analysis options)
 * - Time period selector (7/30/90/180/365 days)
 * - Missing-today banner with warnings
 * - Integration with HabitCharts for visualization
 * - useReducer pattern for complex state management
 * - Support for default habits, defined habits, and comprehensive analytics
 */

import { useReducer, useEffect, useCallback } from 'react';
import {
  Paper,
  Stack,
  Group,
  Select,
  Button,
  Alert,
  Text,
  Card,
  SimpleGrid,
  Loader,
  Center,
} from '@mantine/core';
import {
  IconChartLine,
  IconAlertCircle,
  IconRefresh,
  IconTrendingUp,
  IconTarget,
} from '@tabler/icons-react';
import HabitCharts from './HabitCharts';
import { diaryService } from '../../services/diaryService';

// State type for useReducer
type AnalyticsState = {
  selectedType: 'default' | 'defined' | 'comprehensive';
  selectedAnalysis: string;
  selectedPeriod: number;
  isLoading: boolean;
  error: string | null;
  analyticsData: any;
  missingToday: string[];
  dashboardSummary: any;
};

// Actions for useReducer
type AnalyticsAction =
  | { type: 'SET_TYPE'; payload: 'default' | 'defined' | 'comprehensive' }
  | { type: 'SET_ANALYSIS'; payload: string }
  | { type: 'SET_PERIOD'; payload: number }
  | { type: 'LOADING' }
  | { type: 'ERROR'; payload: string }
  | { type: 'DATA_LOADED'; payload: any }
  | { type: 'DASHBOARD_LOADED'; payload: any }
  | { type: 'MISSING_TODAY_LOADED'; payload: string[] };

// Initial state
const initialState: AnalyticsState = {
  selectedType: 'default',
  selectedAnalysis: 'sleep',
  selectedPeriod: 30,
  isLoading: false,
  error: null,
  analyticsData: null,
  missingToday: [],
  dashboardSummary: null,
};

// Dropdown options based on type
const DROPDOWN_OPTIONS = {
  default: [
    { value: 'sleep', label: 'Sleep Analysis' },
    { value: 'stress', label: 'Stress Tracking' },
    { value: 'exercise', label: 'Exercise Frequency' },
    { value: 'meditation', label: 'Meditation Progress' },
    { value: 'screen_time', label: 'Screen Time Analysis' },
    { value: 'steps', label: 'Steps Tracking' },
    { value: 'learning', label: 'Learning Progress' },
    { value: 'outdoor', label: 'Outdoor Time' },
    { value: 'social', label: 'Social Connection' },
    { value: 'correlations', label: 'Habit Correlations' },
  ],
  defined: [
    { value: 'correlations', label: 'Custom Habit Correlations' },
  ],
  comprehensive: [
    { value: 'overview', label: 'Overview Dashboard' },
    { value: 'financial', label: 'Financial Analysis' },
    { value: 'all_metrics', label: 'All Metrics' },
    { value: 'insights', label: 'AI Insights' },
  ],
};

// Time period options
const PERIOD_OPTIONS = [
  { value: '7', label: '1 Week' },
  { value: '30', label: '1 Month' },
  { value: '90', label: '3 Months' },
  { value: '180', label: '6 Months' },
  { value: '365', label: '1 Year' },
];

// Reducer function
function analyticsReducer(state: AnalyticsState, action: AnalyticsAction): AnalyticsState {
  switch (action.type) {
    case 'SET_TYPE':
      return {
        ...state,
        selectedType: action.payload,
        selectedAnalysis: getDefaultAnalysis(action.payload),
        isLoading: false,
        error: null,
        analyticsData: null,
      };
    case 'SET_ANALYSIS':
      return { ...state, selectedAnalysis: action.payload };
    case 'SET_PERIOD':
      return { ...state, selectedPeriod: action.payload };
    case 'LOADING':
      return { ...state, isLoading: true, error: null };
    case 'ERROR':
      return { ...state, isLoading: false, error: action.payload };
    case 'DATA_LOADED':
      return { ...state, isLoading: false, error: null, analyticsData: action.payload };
    case 'DASHBOARD_LOADED':
      return { ...state, dashboardSummary: action.payload };
    case 'MISSING_TODAY_LOADED':
      return { ...state, missingToday: action.payload };
    default:
      return state;
  }
}

// Helper function to get default analysis for a type
function getDefaultAnalysis(type: string): string {
  return DROPDOWN_OPTIONS[type as keyof typeof DROPDOWN_OPTIONS][0].value;
}

export default function HabitAnalyticsView() {
  const [state, dispatch] = useReducer(analyticsReducer, initialState);

  // Load dashboard summary and missing today data
  const loadDashboardData = useCallback(async () => {
    try {
      const dashboard = await diaryService.getHabitsDashboardSummary();
      dispatch({ type: 'DASHBOARD_LOADED', payload: dashboard });
      dispatch({ type: 'MISSING_TODAY_LOADED', payload: dashboard.missing_today || [] });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    }
  }, []);

  // Load analytics data based on current selections
  const loadAnalyticsData = useCallback(async () => {
    dispatch({ type: 'LOADING' });
    
    try {
      let data;
      
      switch (state.selectedType) {
        case 'default':
          data = await diaryService.getDefaultHabitsAnalytics(
            state.selectedPeriod,
            true, // include SMA
            [7, 14, 30] // SMA windows
          );
          break;
        case 'defined':
          data = await diaryService.getDefinedHabitsAnalytics(
            state.selectedPeriod,
            true // normalize
          );
          break;
        case 'comprehensive':
          data = await diaryService.getComprehensiveAnalytics(state.selectedPeriod);
          break;
        default:
          throw new Error('Invalid analytics type');
      }
      
      dispatch({ type: 'DATA_LOADED', payload: data });
    } catch (error) {
      dispatch({ 
        type: 'ERROR', 
        payload: error instanceof Error ? error.message : 'Failed to load analytics data' 
      });
    }
  }, [state.selectedType, state.selectedAnalysis, state.selectedPeriod]);

  // Load data on component mount and when selections change
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    loadAnalyticsData();
  }, [loadAnalyticsData]);

  // Handle type change
  const handleTypeChange = (value: string) => {
    dispatch({ type: 'SET_TYPE', payload: value as 'default' | 'defined' | 'comprehensive' });
  };

  // Handle analysis change
  const handleAnalysisChange = (value: string) => {
    dispatch({ type: 'SET_ANALYSIS', payload: value });
  };

  // Handle period change
  const handlePeriodChange = (value: string) => {
    dispatch({ type: 'SET_PERIOD', payload: parseInt(value) });
  };

  // Refresh data
  const handleRefresh = () => {
    loadAnalyticsData();
  };

  // Render missing today banner
  const renderMissingTodayBanner = () => {
    if (state.missingToday.length === 0) return null;

    return (
      <Alert
        icon={<IconAlertCircle size={16} />}
        title="Missing Today's Data"
        color="orange"
        mb="md"
      >
        <Text size="sm">
          You haven't filled in today's data for: {state.missingToday.join(', ')}
        </Text>
        <Button size="xs" variant="light" mt="xs">
          Fill Today's Data
        </Button>
      </Alert>
    );
  };

  // Render chart based on current selection
  const renderChart = () => {
    if (state.isLoading) {
      return (
        <Center style={{ height: 400 }}>
          <Stack align="center" gap="sm">
            <Loader size="md" />
            <Text size="sm" color="dimmed">Loading analytics data...</Text>
          </Stack>
        </Center>
      );
    }

    if (state.error) {
      return (
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Error Loading Data"
          color="red"
        >
          {state.error}
        </Alert>
      );
    }

    if (!state.analyticsData) {
      return (
        <Center style={{ height: 400 }}>
          <Text color="dimmed">No data available</Text>
        </Center>
      );
    }

    // Render different chart types based on selection
    switch (state.selectedType) {
      case 'default':
        return renderDefaultHabitsChart();
      case 'defined':
        return renderDefinedHabitsChart();
      case 'comprehensive':
        return renderComprehensiveChart();
      default:
        return null;
    }
  };

  // Render default habits chart
  const renderDefaultHabitsChart = () => {
    const habitData = state.analyticsData?.habits?.[state.selectedAnalysis];
    if (!habitData) return null;

    // Fix SMA data mapping - backend provides sma_overlays separately
    const chartData = habitData.trend?.map((point: any) => ({
      date: point.date,
      value: point.value,
      // SMA data comes from sma_overlays, not from trend points
      sma_7: habitData.sma_overlays?.["7"]?.find((sma: any) => sma.date === point.date)?.value,
      sma_14: habitData.sma_overlays?.["14"]?.find((sma: any) => sma.date === point.date)?.value,
      sma_30: habitData.sma_overlays?.["30"]?.find((sma: any) => sma.date === point.date)?.value,
    })) || [];

    return (
      <HabitCharts
        chartType="line"
        data={chartData}
        title={`${state.selectedAnalysis.replace('_', ' ').toUpperCase()} Analysis`}
        color="#4CAF50"
        height={400}
        showSMA={true}
        smaWindows={[7, 14, 30]}
        goalLine={getGoalForHabit(state.selectedAnalysis)}
        goalLabel={`Goal: ${getGoalForHabit(state.selectedAnalysis)}`}
        unit={getUnitForHabit(state.selectedAnalysis)}
      />
    );
  };

  // Render defined habits chart
  const renderDefinedHabitsChart = () => {
    // This `habitData` object is correct
    const habitData = state.analyticsData?.habits?.[state.selectedAnalysis];
    if (!habitData) return null;

    // --- START FIX ---
    // We must transform the data for the "pure" chart component
    const chartData = habitData.trend?.map((point: any) => ({
      date: point.date,
      value: point.value,
      // You can also add SMA data here if your backend provides it
    })) || [];
    // --- END FIX ---

    return (
      <HabitCharts
        // --- START FIX ---
        chartType="line" // or "bar"
        data={chartData}
        title={habitData.name || "Custom Habit Analysis"}
        unit={habitData.unit || 'units'}
        // --- END FIX ---

        // These props are still correct
        goalLine={getGoalForHabit(state.selectedAnalysis)} // This helper might need updating
        showSMA={true} // You'll need to pass the SMA data above
      />
    );
  };

  // Render comprehensive chart
  const renderComprehensiveChart = () => {
    const comprehensiveData = state.analyticsData;
    if (!comprehensiveData) return null;

    return (
      <Stack gap="md">
        <Text size="lg" fw={600}>Comprehensive Analytics</Text>
        
        {/* Default Habits Section */}
        <Card withBorder>
          <Text size="md" fw={500} mb="sm">Default Habits</Text>
          <SimpleGrid cols={3}>
            {Object.entries(comprehensiveData.default_habits || {}).map(([habit, data]) => (
              <Card key={habit} withBorder p="sm">
                <Text size="sm" fw={500}>{habit.replace('_', ' ').toUpperCase()}</Text>
                <Text size="xs" c="dimmed">Avg: {data.average}</Text>
                <Text size="xs" c="dimmed">Days: {data.days_with_data}</Text>
              </Card>
            ))}
          </SimpleGrid>
        </Card>

        {/* Defined Habits Section */}
        <Card withBorder>
          <Text size="md" fw={500} mb="sm">Custom Habits</Text>
          <SimpleGrid cols={3}>
            {Object.entries(comprehensiveData.defined_habits || {}).map(([habit, data]) => (
              <Card key={habit} withBorder p="sm">
                <Text size="sm" fw={500}>{habit.replace('_', ' ').toUpperCase()}</Text>
                <Text size="xs" c="dimmed">Avg: {data.average}</Text>
                <Text size="xs" c="dimmed">Streak: {data.streak}</Text>
              </Card>
            ))}
          </SimpleGrid>
        </Card>

        {/* Mood & Financial Section */}
        <SimpleGrid cols={2}>
          <Card withBorder>
            <Text size="md" fw={500} mb="sm">Mood Analysis</Text>
            <Text size="sm">Average: {comprehensiveData.mood?.average || 'N/A'}</Text>
            <Text size="sm">Days with data: {comprehensiveData.mood?.days_with_data || 0}</Text>
          </Card>
          
          <Card withBorder>
            <Text size="md" fw={500} mb="sm">Financial Wellness</Text>
            <Text size="sm">Avg Income: {comprehensiveData.financial?.average_income || 'N/A'}</Text>
            <Text size="sm">Avg Expense: {comprehensiveData.financial?.average_expense || 'N/A'}</Text>
          </Card>
        </SimpleGrid>
      </Stack>
    );
  };

  // Helper functions
  const getGoalForHabit = (habit: string): number => {
    const goals: Record<string, number> = {
      sleep: 8,
      exercise: 30,
      meditation: 15,
      screen_time: 2,
      steps: 8000,
      learning: 60,
      outdoor: 60,
      social: 3,
    };
    return goals[habit] || 0;
  };

  const getUnitForHabit = (habit: string): string => {
    const units: Record<string, string> = {
      sleep: 'h',
      exercise: 'min',
      meditation: 'min',
      screen_time: 'h',
      steps: ' steps',
      learning: 'min',
      outdoor: 'min',
      social: '/5',
    };
    return units[habit] || '';
  };

  return (
    <Paper p="md">
      <Stack gap="md">
        {/* Header */}
        <Group position="apart">
          <div>
            <Text size="xl" fw={700}>
              Habit Analytics
            </Text>
            <Text size="sm" color="dimmed">
              Comprehensive habit tracking and trend analysis
            </Text>
          </div>
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            onClick={handleRefresh}
            loading={state.isLoading}
          >
            Refresh
          </Button>
        </Group>

        {/* Missing today banner */}
        {renderMissingTodayBanner()}

        {/* Controls */}
        <Card withBorder p="md">
          <SimpleGrid cols={{ base: 1, md: 3 }} gap="md">
            {/* Type selector */}
            <Select
              label="Analytics Type"
              placeholder="Select type"
              value={state.selectedType}
              onChange={handleTypeChange}
              data={[
                { value: 'default', label: 'Default Habits (9 core habits)' },
                { value: 'defined', label: 'Custom Habits' },
                { value: 'comprehensive', label: 'Comprehensive View' },
              ]}
              icon={<IconChartLine size={16} />}
            />

            {/* Analysis selector */}
            <Select
              label="Analysis"
              placeholder="Select analysis"
              value={state.selectedAnalysis}
              onChange={handleAnalysisChange}
              data={DROPDOWN_OPTIONS[state.selectedType]}
              icon={<IconTarget size={16} />}
            />

            {/* Period selector */}
            <Select
              label="Time Period"
              placeholder="Select period"
              value={state.selectedPeriod.toString()}
              onChange={handlePeriodChange}
              data={PERIOD_OPTIONS}
              icon={<IconTrendingUp size={16} />}
            />
          </SimpleGrid>
        </Card>

        {/* Chart */}
        {renderChart()}

        {/* Additional info */}
        {state.analyticsData && (
          <Card withBorder p="md">
            <Text size="sm" color="dimmed">
              Data period: {state.analyticsData.period_start} to {state.analyticsData.period_end} 
              ({state.analyticsData.total_days} days, {state.analyticsData.days_with_data} with data)
            </Text>
          </Card>
        )}
      </Stack>
    </Paper>
  );
}
