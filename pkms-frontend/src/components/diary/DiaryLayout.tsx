/**
 * Specialized layout component for Diary module
 * Handles the unique calendar-based structure with date selection
 */

import React from 'react';
import { Box, Paper, Stack, Group, Title, Text, Button, Calendar, Badge, Center, Avatar } from '@mantine/core';
import { IconCalendar, IconPlus, IconRefresh, IconEye } from '@tabler/icons-react';
import ModuleHeader from '../common/ModuleHeader';
import ModuleLayout from '../common/ModuleLayout';
import { DiaryItem } from '../../types/common';

interface DiaryLayoutProps {
  // Current state
  selectedDate: Date | null;
  entries: DiaryItem[];
  isLoading: boolean;
  
  // Actions
  onDateSelect: (date: Date | null) => void;
  onCreateEntry: () => void;
  onRefresh: () => void;
  
  // View mode - using standard view modes
  viewMode: 'small-icons' | 'medium-icons' | 'list' | 'details';
  ViewMenu: React.ComponentType<any>;
  
  // Item actions
  onItemClick: (item: DiaryItem) => void;
  onToggleFavorite: (item: DiaryItem) => void;
  onToggleArchive: (item: DiaryItem) => void;
  onDelete: (item: DiaryItem) => void;
  onEdit: (item: DiaryItem) => void;
  onPreview: (item: DiaryItem) => void;
  
  // Render functions
  renderIcon: (item: DiaryItem) => React.ReactNode;
  renderContent: (item: DiaryItem) => React.ReactNode;
  
  // Calendar specific
  showCalendar?: boolean;
  calendarEntries?: Array<{ date: Date; count: number }>;
}

export function DiaryLayout({
  selectedDate,
  entries,
  isLoading,
  onDateSelect,
  onCreateEntry,
  onRefresh,
  viewMode,
  ViewMenu,
  onItemClick,
  onToggleFavorite,
  onToggleArchive,
  onDelete,
  onEdit,
  onPreview,
  renderIcon,
  renderContent,
  showCalendar = true,
  calendarEntries = [],
}: DiaryLayoutProps) {
  const getCalendarModifiers = () => {
    const modifiers: any = {};
    
    // Add entries count to dates
    calendarEntries.forEach(({ date, count }) => {
      const dateStr = date.toISOString().split('T')[0];
      modifiers[dateStr] = count > 0 ? `has-entries-${count}` : '';
    });
    
    return modifiers;
  };

  const getCalendarModifierStyles = () => {
    const styles: any = {};
    
    calendarEntries.forEach(({ date, count }) => {
      const dateStr = date.toISOString().split('T')[0];
      if (count > 0) {
        styles[`&[data-date="${dateStr}"]`] = {
          backgroundColor: 'var(--mantine-color-blue-1)',
          border: '1px solid var(--mantine-color-blue-3)',
        };
      }
    });
    
    return styles;
  };

  return (
    <Box style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Left Sidebar - Calendar */}
      {showCalendar && (
        <Paper 
          shadow="sm" 
          style={{ 
            width: 320, 
            minWidth: 320,
            borderRadius: 0,
            borderRight: '1px solid var(--mantine-color-dark-4)',
            backgroundColor: 'var(--mantine-color-dark-7)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%'
          }}
        >
          {/* Calendar Header */}
          <Box p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
            <Group justify="space-between" align="center">
              <Title order={4} c="gray.2">Diary</Title>
              <Group gap="xs">
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconPlus size={16} />}
                  onClick={onCreateEntry}
                  title="New Entry"
                >
                  New
                </Button>
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconRefresh size={16} />}
                  onClick={onRefresh}
                  loading={isLoading}
                  title="Refresh"
                >
                  Refresh
                </Button>
              </Group>
            </Group>
          </Box>

          {/* Calendar */}
          <Box p="md" style={{ flex: 1 }}>
            <Calendar
              value={selectedDate}
              onChange={onDateSelect}
              modifiers={getCalendarModifiers()}
              styles={{
                day: getCalendarModifierStyles(),
              }}
              size="sm"
            />
            
            {/* Selected Date Info */}
            {selectedDate && (
              <Box mt="md" p="sm" style={{ backgroundColor: 'var(--mantine-color-dark-6)', borderRadius: 8 }}>
                <Text size="sm" fw={500} c="blue.3">
                  {selectedDate.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </Text>
                <Text size="xs" c="dimmed">
                  {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                </Text>
              </Box>
            )}
          </Box>
        </Paper>
      )}

      {/* Main Content Area */}
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--mantine-color-dark-8)' }}>
        {/* Main Header */}
        <Paper p="md" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)', backgroundColor: 'var(--mantine-color-dark-7)' }}>
          <ModuleHeader
            title={selectedDate ? `Diary Entries - ${selectedDate.toLocaleDateString()}` : 'Select a Date'}
            itemCount={entries.length}
            onRefresh={onRefresh}
            onCreate={onCreateEntry}
            showFilters={false}
            showCreate={true}
            showRefresh={true}
            isLoading={isLoading}
            customActions={
              <ViewMenu 
                currentView={viewMode}
                onChange={(mode: any) => {
                  // This will be handled by parent
                }}
                disabled={isLoading}
              />
            }
          />
        </Paper>

        {/* Content Area */}
        <Box style={{ flex: 1, overflow: 'hidden' }}>
          {!selectedDate ? (
            // Show calendar selection prompt
            <Box p="md">
              <Center style={{ height: '400px' }}>
                <Stack align="center" gap="md">
                  <Avatar size="xl" color="blue" variant="light">
                    <IconCalendar size={32} />
                  </Avatar>
                  <Text size="lg" fw={500} c="dimmed">Select a Date</Text>
                  <Text size="sm" c="dimmed" ta="center">
                    Choose a date from the calendar to view or create diary entries.
                  </Text>
                </Stack>
              </Center>
            </Box>
          ) : entries.length === 0 ? (
            // Show empty state for selected date
            <Box p="md">
              <Center style={{ height: '400px' }}>
                <Stack align="center" gap="md">
                  <Avatar size="xl" color="blue" variant="light">
                    <IconEye size={32} />
                  </Avatar>
                  <Text size="lg" fw={500} c="dimmed">No Entries for This Date</Text>
                  <Text size="sm" c="dimmed" ta="center">
                    Create your first diary entry for {selectedDate.toLocaleDateString()}.
                  </Text>
                  <Button
                    leftSection={<IconPlus size={16} />}
                    variant="filled"
                    color="blue"
                    onClick={onCreateEntry}
                    size="md"
                  >
                    Create Entry
                  </Button>
                </Stack>
              </Center>
            </Box>
          ) : (
            // Show entries for selected date
            <Box p="md">
              <ModuleLayout
                items={entries}
                viewMode={viewMode}
                onItemClick={onItemClick}
                onToggleFavorite={onToggleFavorite}
                onToggleArchive={onToggleArchive}
                onDelete={onDelete}
                onEdit={onEdit}
                onDownload={undefined}
                onPreview={onPreview}
                renderIcon={renderIcon}
                renderContent={renderContent}
                isLoading={isLoading}
                emptyMessage="No entries found for this date."
                showFavorite={true}
                showArchive={true}
                showDelete={true}
                showEdit={true}
                showPreview={true}
              />
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default DiaryLayout;
