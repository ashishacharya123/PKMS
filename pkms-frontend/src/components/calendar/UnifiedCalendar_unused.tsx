import React, { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Stack,
  Title,
  Group,
  Text,
  Paper,
  Button,
  ActionIcon,
  Badge,
  Divider,
  Grid,
  Card,
  Modal,
  Drawer,
  Select,
  MultiSelect,
  Switch,
  Box,
  ScrollArea,
  Tooltip,
  Menu,
  Alert
} from '@mantine/core';
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconToday,
  IconFilter,
  IconDownload,
  IconRefresh,
  IconX,
  IconPlus,
  IconClock,
  IconAlertCircle,
  IconCheck,
  IconSettings,
  IconList
} from '@tabler/icons-react';
import { useUnifiedCalendar, CalendarEvent, CalendarViewOptions, CalendarStats } from '../../services/unifiedCalendar';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';

interface UnifiedCalendarProps {
  initialView?: 'month' | 'week' | 'day';
  initialDate?: Date;
  onEventClick?: (event: CalendarEvent) => void;
  onDateChange?: (date: Date) => void;
  height?: string;
  showStats?: boolean;
  showFilters?: boolean;
  compact?: boolean;
}

const UnifiedCalendar: React.FC<UnifiedCalendarProps> = ({
  initialView = 'month',
  initialDate = new Date(),
  onEventClick,
  onDateChange,
  height = '600px',
  showStats = true,
  showFilters = true,
  compact = false
}) => {
  const [currentDate, setCurrentDate] = useState<Date>(initialDate);
  const [view, setView] = useState<'month' | 'week' | 'day'>(initialView);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

  const {
    events,
    getMonthEvents,
    getWeekEvents,
    getDayEvents,
    getStats,
    getUpcomingEvents,
    getOverdueItems,
    clearEvents,
    exportToICal
  } = useUnifiedCalendar();

  const [filters, setFilters] = useState({
    types: [] as string[],
    modules: [] as string[],
    tags: [] as string[],
    status: [] as string[],
    priorities: [] as string[]
  });

  const typeOptions = [
    { value: 'note', label: 'Notes' },
    { value: 'todo', label: 'Todos' },
    { value: 'diary', label: 'Diary' },
    { value: 'project', label: 'Projects' },
    { value: 'document', label: 'Documents' }
  ];

  const moduleOptions = [
    { value: 'notes', label: 'Notes' },
    { value: 'todos', label: 'Todos' },
    { value: 'diary', label: 'Diary' },
    { value: 'documents', label: 'Documents' }
  ];

  const statusOptions = [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' }
  ];

  const priorityOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'urgent', label: 'Urgent' }
  ];

  const getFilteredEvents = useCallback(() => {
    switch (view) {
      case 'month':
        return getMonthEvents(currentDate, filters);
      case 'week':
        return getWeekEvents(currentDate, filters);
      case 'day':
        return getDayEvents(currentDate, filters);
      default:
        return [];
    }
  }, [view, currentDate, filters, getMonthEvents, getWeekEvents, getDayEvents]);

  const navigateDate = (direction: 'prev' | 'next' | 'today') => {
    const newDate = new Date(currentDate);
    switch (direction) {
      case 'prev':
        if (view === 'month') {
          newDate.setMonth(newDate.getMonth() - 1);
        } else if (view === 'week') {
          newDate.setDate(newDate.getDate() - 7);
        } else {
          newDate.setDate(newDate.getDate() - 1);
        }
        break;
      case 'next':
        if (view === 'month') {
          newDate.setMonth(newDate.getMonth() + 1);
        } else if (view === 'week') {
          newDate.setDate(newDate.getDate() + 7);
        } else {
          newDate.setDate(newDate.getDate() + 1);
        }
        break;
      case 'today':
        newDate.setTime(Date.now());
        break;
    }
    setCurrentDate(newDate);
    onDateChange?.(newDate);
  };

  const exportCalendar = () => {
    try {
      const iCalData = exportToICal();
      const blob = new Blob([iCalData], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pkms-calendar-${new Date().toISOString().split('T')[0]}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      notifications.show({
        title: 'Calendar Exported',
        message: 'Calendar has been exported successfully',
        color: 'green'
      });
    } catch (error) {
      notifications.show({
        title: 'Export Failed',
        message: 'Failed to export calendar',
        color: 'red'
      });
    }
  };

  const renderCalendar = () => {
    if (viewMode === 'list') {
      return renderListView();
    }

    switch (view) {
      case 'month':
        return renderMonthView();
      case 'week':
        return renderWeekView();
      case 'day':
        return renderDayView();
      default:
        return renderMonthView();
    }
  };

  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const weeks = [];
    let currentWeek: JSX.Element[] = [];

    for (let date = new Date(startDate); date <= lastDay; date.setDate(date.getDate() + 1)) {
      const dayEvents = getDayEvents(new Date(date), filters);
      const isCurrentMonth = date.getMonth() === month;
      const isToday = date.toDateString() === new Date().toDateString();

      currentWeek.push(
        <Paper
          key={date.toISOString()}
          p="xs"
          withBorder
          style={{
            height: '100px',
            minHeight: '100px',
            backgroundColor: isCurrentMonth ? 'white' : '#f8f9fa',
            borderColor: isToday ? '#228be6' : undefined,
            borderWidth: isToday ? '2px' : '1px',
            cursor: 'pointer'
          }}
          onClick={() => {
            setView('day');
            setCurrentDate(new Date(date));
          }}
        >
          <Text size="xs" fw={isCurrentMonth ? 600 : 400} c={isCurrentMonth ? 'black' : '#666'}>
            {date.getDate()}
            {isToday && <Badge size="xs" ml="xs" color="blue">Today</Badge>}
          </Text>
          <Box mt="xs" style={{ maxHeight: '70px', overflowY: 'auto' }}>
            {dayEvents.slice(0, 3).map(event => (
              <Tooltip key={event.id} label={event.title} position="top" withArrow>
                <Badge
                  size="xs"
                  color={event.color || 'gray'}
                  variant="filled"
                  style={{
                    display: 'block',
                    marginBottom: '2px',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedEvent(event);
                    onEventClick?.(event);
                  }}
                >
                  {event.icon} {event.title.length > 15 ? event.title.substring(0, 15) + '...' : event.title}
                </Badge>
              </Tooltip>
            ))}
            {dayEvents.length > 3 && (
              <Text size="xs" c="dimmed">+{dayEvents.length - 3} more</Text>
            )}
          </Box>
        </Paper>
      );

      if (date.getDay() === 6) {
        weeks.push(
          <Grid key={date.toISOString()} gutter={2}>
            {currentWeek}
          </Grid>
        );
        currentWeek = [];
      }
    }

    return (
      <Box>
        <Grid gutter={2}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <Grid.Col key={day} span={12 / 7}>
              <Text size="xs" fw={600} ta="center" c="dimmed">
                {day}
              </Text>
            </Grid.Col>
          ))}
        </Grid>
        <ScrollArea h={height}>
          <Stack gap={2}>
            {weeks}
          </Stack>
        </ScrollArea>
      </Box>
    );
  };

  const renderWeekView = () => {
    const events = getWeekEvents(currentDate, filters);
    const weekDays = [];
    const startDate = new Date(currentDate);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dayEvents = events.filter(event =>
        new Date(event.date).toDateString() === date.toDateString()
      );

      weekDays.push(
        <Grid.Col key={i} span={12 / 7}>
          <Paper p="xs" withBorder>
            <Text size="xs" fw={600}>
              {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <Box mt="xs" style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {dayEvents.map(event => (
                <Card
                  key={event.id}
                  p="xs"
                  mb="xs"
                  withBorder
                  style={{
                    borderLeft: `4px solid ${event.color || '#666'}`,
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setSelectedEvent(event);
                    onEventClick?.(event);
                  }}
                >
                  <Group gap="xs">
                    <Text size="xs">{event.icon}</Text>
                    <Text size="xs" fw={600} style={{ flex: 1 }}>
                      {event.title}
                    </Text>
                    {event.priority && (
                      <Badge size="xs" variant="outline">
                        {event.priority}
                      </Badge>
                    )}
                  </Group>
                  {event.description && (
                    <Text size="xs" c="dimmed" mt="xs" lineClamp={2}>
                      {event.description}
                    </Text>
                  )}
                </Card>
              ))}
              {dayEvents.length === 0 && (
                <Text size="xs" c="dimmed" ta="center" py="xs">
                  No events
                </Text>
              )}
            </Box>
          </Paper>
        </Grid.Col>
      );
    }

    return (
      <Grid gutter={2}>
        {weekDays}
      </Grid>
    );
  };

  const renderDayView = () => {
    const events = getDayEvents(currentDate, filters);

    return (
      <Stack gap="md">
        <Text size="lg" fw={600} ta="center">
          {currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </Text>
        <ScrollArea h={height}>
          {events.length > 0 ? (
            <Stack gap="sm">
              {events.map(event => (
                <Card
                  key={event.id}
                  p="md"
                  withBorder
                  style={{
                    borderLeft: `4px solid ${event.color || '#666'}`,
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setSelectedEvent(event);
                    onEventClick?.(event);
                  }}
                >
                  <Group justify="space-between" align="start">
                    <Box style={{ flex: 1 }}>
                      <Group gap="xs" mb="xs">
                        <Text size="md" fw={600}>{event.icon} {event.title}</Text>
                        <Badge color={event.color || 'gray'}>{event.type}</Badge>
                        {event.priority && (
                          <Badge variant="outline">{event.priority}</Badge>
                        )}
                        {event.status && (
                          <Badge variant="light">{event.status}</Badge>
                        )}
                      </Group>
                      {event.description && (
                        <Text size="sm" c="dimmed" mb="xs">
                          {event.description}
                        </Text>
                      )}
                      {event.tags && event.tags.length > 0 && (
                        <Group gap={4}>
                          {event.tags.slice(0, 5).map(tag => (
                            <Badge key={tag} size="xs" variant="outline">
                              {tag}
                            </Badge>
                          ))}
                          {event.tags.length > 5 && (
                            <Badge size="xs" variant="outline">
                              +{event.tags.length - 5}
                            </Badge>
                          )}
                        </Group>
                      )}
                    </Box>
                    {event.metadata?.dueDate && (
                      <Box>
                        <Text size="xs" c="dimmed">Due:</Text>
                        <Text size="xs" fw={600}>
                          {new Date(event.metadata.dueDate).toLocaleDateString()}
                        </Text>
                      </Box>
                    )}
                  </Group>
                </Card>
              ))}
            </Stack>
          ) : (
            <Alert icon={<IconCalendar size={16} />} color="blue">
              No events scheduled for this day
            </Alert>
          )}
        </ScrollArea>
      </Stack>
    );
  };

  const renderListView = () => {
    const allEvents = getEvents(
      new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0),
      filters
    );

    return (
      <ScrollArea h={height}>
        <Stack gap="sm">
          {allEvents.map(event => (
            <Card
              key={event.id}
              p="md"
              withBorder
              style={{
                borderLeft: `4px solid ${event.color || '#666'}`,
                cursor: 'pointer'
              }}
              onClick={() => {
                setSelectedEvent(event);
                onEventClick?.(event);
              }}
            >
              <Group justify="space-between" align="start">
                <Box style={{ flex: 1 }}>
                  <Group gap="xs" mb="xs">
                    <Text size="md" fw={600}>{event.icon} {event.title}</Text>
                    <Badge color={event.color || 'gray'}>{event.type}</Badge>
                    {event.priority && (
                      <Badge variant="outline">{event.priority}</Badge>
                    )}
                    {event.status && (
                      <Badge variant="light">{event.status}</Badge>
                    )}
                    {event.isFavorite && (
                      <Badge color="yellow" variant="light">⭐ Favorite</Badge>
                    )}
                  </Group>
                  <Text size="sm" c="dimmed" mb="xs">
                    {new Date(event.date).toLocaleDateString()}
                  </Text>
                  {event.description && (
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {event.description}
                    </Text>
                  )}
                  {event.tags && event.tags.length > 0 && (
                    <Group gap={4}>
                      {event.tags.slice(0, 5).map(tag => (
                        <Badge key={tag} size="xs" variant="outline">
                          {tag}
                        </Badge>
                      ))}
                      {event.tags.length > 5 && (
                        <Badge size="xs" variant="outline">
                          +{event.tags.length - 5}
                        </Badge>
                      )}
                    </Group>
                  )}
                </Box>
                {event.metadata?.dueDate && (
                  <Box>
                    <Text size="xs" c="dimmed">Due:</Text>
                    <Text size="xs" fw={600}>
                      {new Date(event.metadata.dueDate).toLocaleDateString()}
                    </Text>
                  </Box>
                )}
              </Group>
            </Card>
          ))}
          {allEvents.length === 0 && (
            <Alert icon={<IconCalendar size={16} />} color="blue">
              No events found for the selected filters
            </Alert>
          )}
        </Stack>
      </ScrollArea>
    );
  };

  const stats = getStats();

  return (
    <Container fluid>
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Title order={3}>
            <Group gap="xs">
              <IconCalendar size={20} />
              Unified Calendar
            </Group>
          </Title>

          <Group gap="xs">
            <Select
              value={view}
              onChange={(value) => setView(value as 'month' | 'week' | 'day')}
              data={[
                { value: 'month', label: 'Month' },
                { value: 'week', label: 'Week' },
                { value: 'day', label: 'Day' }
              ]}
              style={{ width: '120px' }}
            />

            <Button
              variant={viewMode === 'calendar' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('calendar')}
            >
              <IconCalendar size={16} />
            </Button>

            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <IconList size={16} />
            </Button>

            <ActionIcon onClick={() => navigateDate('prev')} size="lg">
              <IconChevronLeft size={20} />
            </ActionIcon>

            <Button onClick={() => navigateDate('today')} size="sm" variant="outline">
              <IconToday size={16} />
              Today
            </Button>

            <ActionIcon onClick={() => navigateDate('next')} size="lg">
              <IconChevronRight size={20} />
            </ActionIcon>

            {showFilters && (
              <ActionIcon onClick={() => setFiltersOpen(true)} size="lg">
                <IconFilter size={20} />
              </ActionIcon>
            )}

            {showStats && (
              <ActionIcon onClick={() => setStatsOpen(true)} size="lg">
                <IconSettings size={20} />
              </ActionIcon>
            )}

            <ActionIcon onClick={exportCalendar} size="lg">
              <IconDownload size={20} />
            </ActionIcon>

            <ActionIcon onClick={() => clearEvents()} size="lg" color="red">
              <IconRefresh size={20} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Current Date Display */}
        <Text size="lg" fw={600} ta="center">
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>

        {/* Quick Stats */}
        {showStats && !compact && (
          <Group grow>
            <Card p="md" withBorder>
              <Text size="xs" c="dimmed">Total Events</Text>
              <Text size="lg" fw={600}>{stats.totalEvents}</Text>
            </Card>
            <Card p="md" withBorder>
              <Text size="xs" c="dimmed">Completion Rate</Text>
              <Text size="lg" fw={600}>{stats.completionRate.toFixed(1)}%</Text>
            </Card>
            <Card p="md" withBorder>
              <Text size="xs" c="dimmed">Upcoming</Text>
              <Text size="lg" fw={600}>{stats.upcomingDeadlines}</Text>
            </Card>
            <Card p="md" withBorder>
              <Text size="xs" c="dimmed">Overdue</Text>
              <Text size="lg" fw={600} color="red">{stats.overdueItems}</Text>
            </Card>
          </Group>
        )}

        {/* Calendar Content */}
        <Box style={{ height, minHeight: height }}>
          {renderCalendar()}
        </Box>
      </Stack>

      {/* Filters Drawer */}
      <Drawer
        opened={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Calendar Filters"
        position="right"
        size="sm"
      >
        <Stack gap="md">
          <MultiSelect
            label="Event Types"
            placeholder="Select types"
            data={typeOptions}
            value={filters.types}
            onChange={(value) => setFilters(prev => ({ ...prev, types: value }))}
          />

          <MultiSelect
            label="Modules"
            placeholder="Select modules"
            data={moduleOptions}
            value={filters.modules}
            onChange={(value) => setFilters(prev => ({ ...prev, modules: value }))}
          />

          <MultiSelect
            label="Status"
            placeholder="Select status"
            data={statusOptions}
            value={filters.status}
            onChange={(value) => setFilters(prev => ({ ...prev, status: value }))}
          />

          <MultiSelect
            label="Priority"
            placeholder="Select priorities"
            data={priorityOptions}
            value={filters.priorities}
            onChange={(value) => setFilters(prev => ({ ...prev, priorities: value }))}
          />

          <Button onClick={() => setFiltersOpen(false)} fullWidth>
            Apply Filters
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              setFilters({
                types: [],
                modules: [],
                tags: [],
                status: [],
                priorities: []
              });
              setFiltersOpen(false);
            }}
            fullWidth
          >
            Clear All
          </Button>
        </Stack>
      </Drawer>

      {/* Event Details Modal */}
      <Modal
        opened={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent?.title || 'Event Details'}
        size="lg"
      >
        {selectedEvent && (
          <Stack gap="md">
            <Group>
              <Badge color={selectedEvent.color || 'gray'}>{selectedEvent.type}</Badge>
              {selectedEvent.priority && (
                <Badge variant="outline">{selectedEvent.priority}</Badge>
              )}
              {selectedEvent.status && (
                <Badge variant="light">{selectedEvent.status}</Badge>
              )}
              {selectedEvent.isFavorite && (
                <Badge color="yellow" variant="light">⭐ Favorite</Badge>
              )}
            </Group>

            <Divider />

            <Box>
              <Text size="sm" fw={600} mb="xs">Date</Text>
              <Text size="sm">{new Date(selectedEvent.date).toLocaleDateString()}</Text>
            </Box>

            {selectedEvent.description && (
              <Box>
                <Text size="sm" fw={600} mb="xs">Description</Text>
                <Text size="sm">{selectedEvent.description}</Text>
              </Box>
            )}

            {selectedEvent.tags && selectedEvent.tags.length > 0 && (
              <Box>
                <Text size="sm" fw={600} mb="xs">Tags</Text>
                <Group gap={4}>
                  {selectedEvent.tags.map(tag => (
                    <Badge key={tag} size="sm" variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </Group>
              </Box>
            )}

            {selectedEvent.metadata?.dueDate && (
              <Box>
                <Text size="sm" fw={600} mb="xs">Due Date</Text>
                <Text size="sm">{new Date(selectedEvent.metadata.dueDate).toLocaleDateString()}</Text>
              </Box>
            )}

            {selectedEvent.metadata?.mood && (
              <Box>
                <Text size="sm" fw={600} mb="xs">Mood</Text>
                <Text size="sm">Rating: {selectedEvent.metadata.mood}/10</Text>
              </Box>
            )}

            <Divider />

            <Group>
              <Button onClick={() => {
                onEventClick?.(selectedEvent);
                setSelectedEvent(null);
              }}>
                View Details
              </Button>
              <Button variant="outline" onClick={() => setSelectedEvent(null)}>
                Close
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
};

export default UnifiedCalendar;