/**
 * HabitCharts - Pure presentation component for habit analytics visualization
 * 
 * This component provides reusable chart components for habit analytics without
 * any API calls or state management. It receives data as props and renders
 * various chart types including line charts, bar charts, scatter plots, and radar charts.
 * 
 * Features:
 * - Line charts with SMA overlays for trend analysis
 * - Scatter charts for correlation visualization
 * - Bar charts for distribution analysis
 * - Radar charts for multi-dimensional wellness overview
 * - Responsive design with proper loading and error states
 * - Configurable colors and styling
 */

import React from 'react';
import {
  Paper,
  Stack,
  Card,
  Text,
  Badge,
  Alert,
  Center,
  Loader,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
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
  ReferenceLine,
} from 'recharts';

interface ChartDataPoint {
  date: string;
  value: number;
  sma_7?: number;
  sma_14?: number;
  sma_30?: number;
}

interface CorrelationDataPoint {
  x: number;
  y: number;
  date: string;
}

interface RadarDataPoint {
  metric: string;
  value: number;
  fullMark: number;
}

interface HabitChartsProps {
  chartType: 'line' | 'bar' | 'scatter' | 'radar';
  data: ChartDataPoint[] | CorrelationDataPoint[] | RadarDataPoint[];
  title: string;
  color?: string;
  height?: number;
  showSMA?: boolean;
  smaWindows?: number[];
  goalLine?: number;
  goalLabel?: string;
  loading?: boolean;
  error?: string;
  className?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  unit?: string;
}

export default function HabitCharts({
  chartType,
  data,
  title,
  color = '#4CAF50',
  height = 300,
  showSMA = false,
  smaWindows = [7, 14, 30],
  goalLine,
  goalLabel,
  loading = false,
  error,
  className,
  xAxisLabel = 'Date',
  yAxisLabel = 'Value',
  unit = ''
}: HabitChartsProps) {
  if (loading) {
    return (
      <Paper p="md" className={className}>
        <Center style={{ height }}>
          <Stack align="center" spacing="sm">
            <Loader size="md" />
            <Text size="sm" color="dimmed">Loading chart data...</Text>
          </Stack>
        </Center>
      </Paper>
    );
  }

  if (error) {
    return (
      <Paper p="md" className={className}>
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Chart Error"
          color="red"
        >
          {error}
        </Alert>
      </Paper>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Paper p="md" className={className}>
        <Center style={{ height }}>
          <Text color="dimmed">No data available for this chart</Text>
        </Center>
      </Paper>
    );
  }

  const renderLineChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data as ChartDataPoint[]}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => new Date(value).toLocaleDateString()}
        />
        <YAxis 
          tick={{ fontSize: 12 }}
          label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }}
        />
        <Tooltip 
          labelFormatter={(value) => new Date(value).toLocaleDateString()}
          formatter={(value: number, name: string) => [
            `${value}${unit}`, 
            name === 'value' ? 'Value' : name.replace('sma_', 'SMA ')
          ]}
        />
        <Legend />
        
        {/* Main data line */}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={{ fill: color, strokeWidth: 2, r: 4 }}
          name="Value"
        />
        
        {/* SMA overlays */}
        {showSMA && smaWindows.map((window, index) => (
          <Line
            key={`sma_${window}`}
            type="monotone"
            dataKey={`sma_${window}`}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="5 5"
            strokeOpacity={0.7}
            dot={false}
            name={`SMA ${window}`}
          />
        ))}
        
        {/* Goal line */}
        {goalLine && (
          <ReferenceLine 
            y={goalLine} 
            stroke="#ff6b6b" 
            strokeDasharray="3 3"
            label={{ value: goalLabel || `Goal: ${goalLine}${unit}`, position: 'topRight' }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );

  const renderBarChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data as ChartDataPoint[]}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => new Date(value).toLocaleDateString()}
        />
        <YAxis 
          tick={{ fontSize: 12 }}
          label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }}
        />
        <Tooltip 
          labelFormatter={(value) => new Date(value).toLocaleDateString()}
          formatter={(value: number) => [`${value}${unit}`, 'Value']}
        />
        <Bar 
          dataKey="value" 
          fill={color}
          name="Value"
        />
        {goalLine && (
          <ReferenceLine 
            y={goalLine} 
            stroke="#ff6b6b" 
            strokeDasharray="3 3"
            label={{ value: goalLabel || `Goal: ${goalLine}${unit}`, position: 'topRight' }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );

  const renderScatterChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart data={data as CorrelationDataPoint[]}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          type="number" 
          dataKey="x" 
          name="X"
          tick={{ fontSize: 12 }}
          label={{ value: xAxisLabel, position: 'insideBottom', offset: -5 }}
        />
        <YAxis 
          type="number" 
          dataKey="y" 
          name="Y"
          tick={{ fontSize: 12 }}
          label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }}
        />
        <Tooltip 
          cursor={{ strokeDasharray: '3 3' }}
          formatter={(value: number, name: string) => [
            `${value}${unit}`, 
            name === 'x' ? xAxisLabel : yAxisLabel
          ]}
        />
        <Scatter 
          dataKey="y" 
          fill={color}
          name="Correlation"
        />
      </ScatterChart>
    </ResponsiveContainer>
  );

  const renderRadarChart = () => (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data as RadarDataPoint[]}>
        <PolarGrid />
        <PolarAngleAxis dataKey="metric" />
        <PolarRadiusAxis 
          angle={90} 
          domain={[0, 100]} 
          tick={{ fontSize: 12 }}
        />
        <Radar
          name="Wellness"
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.3}
        />
        <Tooltip 
          formatter={(value: number) => [`${value}%`, 'Score']}
        />
        <Legend />
      </RadarChart>
    </ResponsiveContainer>
  );

  const renderChart = () => {
    switch (chartType) {
      case 'line':
        return renderLineChart();
      case 'bar':
        return renderBarChart();
      case 'scatter':
        return renderScatterChart();
      case 'radar':
        return renderRadarChart();
      default:
        return renderLineChart();
    }
  };

  return (
    <Paper p="md" className={className}>
      <Stack spacing="md">
        <div>
          <Text size="lg" weight={600} mb="xs">
            {title}
          </Text>
          {unit && (
            <Badge size="sm" variant="light" color="blue">
              Unit: {unit}
            </Badge>
          )}
        </div>
        
        <Card withBorder>
          {renderChart()}
        </Card>
        
        {showSMA && (
          <Text size="xs" color="dimmed">
            SMA: Simple Moving Average overlays for trend analysis
          </Text>
        )}
      </Stack>
    </Paper>
  );
}