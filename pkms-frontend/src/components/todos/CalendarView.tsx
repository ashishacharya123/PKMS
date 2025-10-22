import React, { useState, useMemo } from 'react';
import { Box, Group, Text, Paper, Stack, Badge, ActionIcon, Menu, Button } from '@mantine/core';
import { IconDots, IconEdit, IconTrash, IconArchive, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { TodoSummary } from '../../services/todosService';

interface CalendarViewProps {
  todos: TodoSummary[];
  onTodoEdit: (todo: TodoSummary) => void;
  onTodoDelete?: (todoUuid: string, title: string) => void;
  onTodoArchive?: (todoUuid: string) => void;
}

interface CalendarDay {
  date: Date;
  todos: TodoSummary[];
  isCurrentMonth: boolean;
  isToday: boolean;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  todos,
  onTodoEdit,
  onTodoDelete,
  onTodoArchive
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Get first day of month and last day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Get first day to display (including previous month's days)
    const firstDisplayDay = new Date(firstDay);
    firstDisplayDay.setDate(firstDay.getDate() - firstDay.getDay());
    
    // Get last day to display (including next month's days)
    const lastDisplayDay = new Date(lastDay);
    lastDisplayDay.setDate(lastDay.getDate() + (6 - lastDay.getDay()));
    
    const days: CalendarDay[] = [];
    const currentDateIter = new Date(firstDisplayDay);
    
    while (currentDateIter <= lastDisplayDay) {
      const dayTodos = todos.filter(todo => {
        if (!todo.dueDate) return false;
        const todoDate = new Date(todo.dueDate);
        return todoDate.getDate() === currentDateIter.getDate() &&
               todoDate.getMonth() === currentDateIter.getMonth() &&
               todoDate.getFullYear() === currentDateIter.getFullYear();
      });
      
      days.push({
        date: new Date(currentDateIter),
        todos: dayTodos,
        isCurrentMonth: currentDateIter.getMonth() === month,
        isToday: currentDateIter.toDateString() === new Date().toDateString()
      });
      
      currentDateIter.setDate(currentDateIter.getDate() + 1);
    }
    
    return days;
  }, [currentDate, todos]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
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

  return (
    <Box p="md">
      {/* Calendar Header */}
      <Group justify="space-between" mb="lg">
        <Button
          variant="subtle"
          leftSection={<IconChevronLeft size={16} />}
          onClick={() => navigateMonth('prev')}
        >
          Previous
        </Button>
        
        <Text fw={600} size="xl">
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </Text>
        
        <Button
          variant="subtle"
          rightSection={<IconChevronRight size={16} />}
          onClick={() => navigateMonth('next')}
        >
          Next
        </Button>
      </Group>

      {/* Day Names Header */}
      <Group gap={0} mb="xs">
        {dayNames.map(day => (
          <Box
            key={day}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '8px',
              fontWeight: 600,
              color: '#666'
            }}
          >
            {day}
          </Box>
        ))}
      </Group>

      {/* Calendar Grid */}
      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' }}>
        {calendarData.map((day, index) => (
          <Paper
            key={index}
            shadow="xs"
            p="xs"
            style={{
              minHeight: 120,
              backgroundColor: day.isToday ? '#f0f8ff' : 'white',
              border: day.isToday ? '2px solid #2196F3' : '1px solid #e0e0e0',
              opacity: day.isCurrentMonth ? 1 : 0.6
            }}
          >
            {/* Date Header */}
            <Text
              size="sm"
              fw={day.isToday ? 700 : 500}
              c={day.isToday ? '#2196F3' : day.isCurrentMonth ? 'inherit' : 'dimmed'}
              mb="xs"
            >
              {day.date.getDate()}
            </Text>

            {/* Todos for this day */}
            <Stack gap="xs">
              {day.todos.slice(0, 3).map(todo => (
                <Paper
                  key={todo.uuid}
                  shadow="xs"
                  p="xs"
                  style={{
                    fontSize: '11px',
                    borderLeft: `3px solid ${getPriorityColor(todo.priority)}`
                  }}
                >
                  <Text size="xs" fw={500} lineClamp={1} mb={2}>
                    {todo.title}
                  </Text>
                  
                  <Group gap={4} mb={2}>
                    <Badge
                      size="xs"
                      variant="light"
                      style={{ backgroundColor: getStatusColor(todo.status) + '20', color: getStatusColor(todo.status) }}
                    >
                      {todo.status}
                    </Badge>
                    
                    {todo.project_name && (
                      <Badge size="xs" variant="outline">
                        {todo.project_name}
                      </Badge>
                    )}
                  </Group>

                  <Menu>
                    <Menu.Target>
                      <ActionIcon size="xs" variant="subtle">
                        <IconDots size={10} />
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
                        onClick={() => onTodoArchive && onTodoArchive(todo.uuid)}
                      >
                        Archive
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<IconTrash size={12} />}
                        color="red"
                        onClick={() => onTodoDelete && onTodoDelete(todo.uuid, todo.title)}
                      >
                        Delete
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Paper>
              ))}
              
              {day.todos.length > 3 && (
                <Text size="xs" c="dimmed" ta="center">
                  +{day.todos.length - 3} more
                </Text>
              )}
            </Stack>
          </Paper>
        ))}
      </Box>
    </Box>
  );
};
