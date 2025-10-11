import React, { useState, useMemo } from 'react';
import { Box, Group, Text, Paper, Stack, Badge, ActionIcon, Menu, Button, Select } from '@mantine/core';
import { IconDots, IconEdit, IconTrash, IconArchive } from '@tabler/icons-react';
import { Todo } from '../../services/todosService';

interface TimelineViewProps {
  todos: Todo[];
  onTodoEdit: (todo: Todo) => void;
  onTodoDelete?: (todoId: number, title: string) => void;
  onTodoArchive?: (todoId: number) => void;
}

interface TimelineTodo extends Todo {
  startDate: Date;
  endDate: Date;
  duration: number;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  todos,
  onTodoEdit,
  onTodoDelete,
  onTodoArchive
}) => {
  const [zoomLevel, setZoomLevel] = useState<'week' | 'month' | 'quarter'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  const timelineTodos = useMemo(() => {
    return todos
      .filter(todo => todo.start_date && todo.due_date)
      .map(todo => {
        const startDate = new Date(todo.start_date!); // Filtered above
        const endDate = new Date(todo.due_date!); // Filtered above
        const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          ...todo,
          startDate,
          endDate,
          duration
        };
      })
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }, [todos]);

  const timelineData = useMemo(() => {
    const startDate = new Date(currentDate);
    const endDate = new Date(currentDate);
    
    switch (zoomLevel) {
      case 'week':
        startDate.setDate(startDate.getDate() - startDate.getDay());
        endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
        break;
      case 'month':
        startDate.setDate(1);
        endDate.setMonth(endDate.getMonth() + 1, 0);
        break;
      case 'quarter':
        const quarter = Math.floor(startDate.getMonth() / 3);
        startDate.setMonth(quarter * 3, 1);
        endDate.setMonth((quarter + 1) * 3, 0);
        break;
    }
    
    return { startDate, endDate };
  }, [currentDate, zoomLevel]);

  const getTimelinePosition = (todo: TimelineTodo) => {
    const totalDuration = timelineData.endDate.getTime() - timelineData.startDate.getTime();
    const todoStart = todo.startDate.getTime() - timelineData.startDate.getTime();
    const position = (todoStart / totalDuration) * 100;
    const width = (todo.duration / (totalDuration / (1000 * 60 * 60 * 24))) * 100;
    
    return { left: `${Math.max(0, position)}%`, width: `${Math.min(100, width)}%` };
  };

  const getPriorityColor = (priority: number): string => {
    const colors = {
      1: '#4CAF50', // Green for low
      2: '#FF9800', // Orange for medium
      3: '#F44336', // Red for high
      4: '#9C27B0'  // Purple for urgent
    };
    return colors[priority as keyof typeof colors] || '#757575';
  };

  const getStatusColor = (status: string): string => {
    const colors = {
      pending: '#757575',
      in_progress: '#2196F3',
      blocked: '#FF9800',
      done: '#4CAF50',
      cancelled: '#F44336'
    };
    return colors[status as keyof typeof colors] || '#757575';
  };

  const navigateTimeline = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      switch (zoomLevel) {
        case 'week':
          newDate.setDate(prev.getDate() + (direction === 'next' ? 7 : -7));
          break;
        case 'month':
          newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
          break;
        case 'quarter':
          newDate.setMonth(prev.getMonth() + (direction === 'next' ? 3 : -3));
          break;
      }
      return newDate;
    });
  };

  const formatDate = (date: Date) => {
    switch (zoomLevel) {
      case 'week':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'month':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'quarter':
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      default:
        return date.toLocaleDateString();
    }
  };

  const generateTimelineHeaders = () => {
    const headers = [];
    const current = new Date(timelineData.startDate);
    
    while (current <= timelineData.endDate) {
      headers.push({
        date: new Date(current),
        label: formatDate(current)
      });
      
      switch (zoomLevel) {
        case 'week':
          current.setDate(current.getDate() + 1);
          break;
        case 'month':
          current.setDate(current.getDate() + 1);
          break;
        case 'quarter':
          current.setMonth(current.getMonth() + 1);
          break;
      }
    }
    
    return headers;
  };

  return (
    <Box p="md">
      {/* Timeline Controls */}
      <Group justify="space-between" mb="lg">
        <Group>
          <Button
            variant="subtle"
            onClick={() => navigateTimeline('prev')}
          >
            Previous
          </Button>
          
          <Select
            value={zoomLevel}
            onChange={(value) => setZoomLevel(value as 'week' | 'month' | 'quarter')}
            data={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'quarter', label: 'Quarter' }
            ]}
            style={{ minWidth: 120 }}
          />
          
          <Button
            variant="subtle"
            onClick={() => navigateTimeline('next')}
          >
            Next
          </Button>
        </Group>
        
        <Text fw={600} size="lg">
          {timelineData.startDate.toLocaleDateString()} - {timelineData.endDate.toLocaleDateString()}
        </Text>
      </Group>

      {/* Timeline Headers */}
      <Box style={{ position: 'relative', marginBottom: '20px' }}>
        <Box style={{ display: 'flex', borderBottom: '2px solid #e0e0e0' }}>
          {generateTimelineHeaders().map((header, index) => (
            <Box
              key={index}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '8px',
                borderRight: '1px solid #e0e0e0',
                fontSize: '12px',
                fontWeight: 500
              }}
            >
              {header.label}
            </Box>
          ))}
        </Box>
      </Box>

      {/* Timeline Content */}
      <Box style={{ position: 'relative', minHeight: '400px' }}>
        {timelineTodos.map((todo) => {
          const position = getTimelinePosition(todo);
          
          return (
            <Box
              key={todo.id}
              style={{
                position: 'absolute',
                left: position.left,
                width: position.width,
                top: `${(timelineTodos.indexOf(todo) * 60) + 20}px`,
                height: '50px'
              }}
            >
              <Paper
                shadow="xs"
                p="xs"
                style={{
                  height: '100%',
                  borderLeft: `4px solid ${getPriorityColor(todo.priority)}`,
                  backgroundColor: getStatusColor(todo.status) + '10',
                  cursor: 'pointer'
                }}
              >
                <Stack gap={2} style={{ height: '100%' }}>
                  <Text
                    size="xs"
                    fw={500}
                    lineClamp={1}
                    style={{ fontSize: '10px' }}
                  >
                    {todo.title}
                  </Text>
                  
                  <Group gap={4}>
                    <Badge
                      size="xs"
                      variant="light"
                      style={{
                        backgroundColor: getStatusColor(todo.status) + '20',
                        color: getStatusColor(todo.status),
                        fontSize: '8px'
                      }}
                    >
                      {todo.status}
                    </Badge>
                    
                    {todo.project_name && (
                      <Badge
                        variant="outline"
                        style={{ fontSize: '8px' }}
                      >
                        {todo.project_name}
                      </Badge>
                    )}
                  </Group>

                  <Menu>
                    <Menu.Target>
                      <ActionIcon size="xs" variant="subtle" style={{ alignSelf: 'flex-end' }}>
                        <IconDots size={8} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconEdit size={12} />}
                        onClick={() => onTodoEdit(todo)}
                      >
                        Edit
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconArchive size={12} />}
                        onClick={() => onTodoArchive && onTodoArchive(todo.id)}
                      >
                        Archive
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconTrash size={12} />}
                        color="red"
                        onClick={() => onTodoDelete && onTodoDelete(todo.id, todo.title)}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Stack>
              </Paper>
            </Box>
          );
        })}
      </Box>

      {/* Legend */}
      <Paper shadow="xs" p="md" mt="lg">
        <Text fw={600} mb="xs">Legend</Text>
        <Group gap="lg">
          <Group gap="xs">
            <Box style={{ width: '16px', height: '16px', backgroundColor: '#4CAF50' }} />
            <Text size="sm">Low Priority</Text>
          </Group>
          <Group gap="xs">
            <Box style={{ width: '16px', height: '16px', backgroundColor: '#FF9800' }} />
            <Text size="sm">Medium Priority</Text>
          </Group>
          <Group gap="xs">
            <Box style={{ width: '16px', height: '16px', backgroundColor: '#F44336' }} />
            <Text size="sm">High Priority</Text>
          </Group>
          <Group gap="xs">
            <Box style={{ width: '16px', height: '16px', backgroundColor: '#9C27B0' }} />
            <Text size="sm">Urgent Priority</Text>
          </Group>
        </Group>
      </Paper>
    </Box>
  );
};
