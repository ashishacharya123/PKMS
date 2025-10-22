/**
 * Date range picker component for start/due/completion dates
 * Reusable across all modules with consistent date handling
 */

import { Group, Text, Stack } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';

interface DateRangePickerProps {
  startDate?: Date | null;
  dueDate?: Date | null;
  completionDate?: Date | null;
  onStartDateChange?: (date: Date | null) => void;
  onDueDateChange?: (date: Date | null) => void;
  onCompletionDateChange?: (date: Date | null) => void;
  disabled?: boolean;
  showCompletionDate?: boolean;
  label?: string;
  description?: string;
  error?: string;
}

export function DateRangePicker({
  startDate,
  dueDate,
  completionDate,
  onStartDateChange,
  onDueDateChange,
  onCompletionDateChange,
  disabled = false,
  showCompletionDate = false,
  label = "Date Range",
  description,
  error
}: DateRangePickerProps) {
  const validateDateRange = (start: Date | null, end: Date | null) => {
    if (start && end && start > end) {
      return "Start date cannot be after end date";
    }
    return null;
  };

  const startDateError = validateDateRange(startDate ?? null, dueDate ?? null);
  const dueDateError = validateDateRange(startDate ?? null, dueDate ?? null);

  return (
    <Stack gap="sm">
      {label && (
        <Text size="sm" fw={500}>
          {label}
        </Text>
      )}
      
      {description && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}

      <Group gap="md" align="flex-start">
        <DateInput
          label="Start Date"
          placeholder="Select start date"
          value={startDate}
          onChange={onStartDateChange}
          disabled={disabled}
          error={startDateError}
          leftSection={<IconCalendar size={16} />}
          clearable
          style={{ flex: 1 }}
        />
        
        <DateInput
          label="Due Date"
          placeholder="Select due date"
          value={dueDate}
          onChange={onDueDateChange}
          disabled={disabled}
          error={dueDateError}
          leftSection={<IconCalendar size={16} />}
          clearable
          style={{ flex: 1 }}
        />
        
        {showCompletionDate && (
          <DateInput
            label="Completion Date"
            placeholder="Select completion date"
            value={completionDate}
            onChange={onCompletionDateChange}
            disabled={disabled}
            leftSection={<IconCalendar size={16} />}
            clearable
            style={{ flex: 1 }}
          />
        )}
      </Group>

      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}

      {/* Date range info */}
      {startDate && dueDate && (
        <Text size="xs" c="dimmed">
          Duration: {Math.ceil((dueDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))} days
        </Text>
      )}
    </Stack>
  );
}
