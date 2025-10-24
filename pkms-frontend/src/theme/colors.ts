/**
 * Theme color system using enums for type safety
 * Replaces all hardcoded colors with theme functions
 */

import { MantineTheme } from '@mantine/core';
import { TodoStatus, TaskPriority, ProjectStatus } from '../types/enums';

/**
 * Get color for todo/project status using theme
 */
export const getStatusColor = (theme: MantineTheme, status: TodoStatus | ProjectStatus): string => {
  const todoColors = {
    [TodoStatus.PENDING]: theme.colors.gray[6],
    [TodoStatus.IN_PROGRESS]: theme.colors.blue[6],
    [TodoStatus.DONE]: theme.colors.green[6],
    [TodoStatus.BLOCKED]: theme.colors.red[6],
    [TodoStatus.CANCELLED]: theme.colors.gray[5],
  };
  
  const projectColors = {
    [ProjectStatus.IS_RUNNING]: theme.colors.blue[6],
    [ProjectStatus.ON_HOLD]: theme.colors.yellow[6],
    [ProjectStatus.COMPLETED]: theme.colors.green[6],
    [ProjectStatus.CANCELLED]: theme.colors.gray[5],
  };
  
  return todoColors[status as TodoStatus] || projectColors[status as ProjectStatus] || theme.colors.gray[6];
};

/**
 * Get color for task priority using theme
 */
export const getPriorityColor = (theme: MantineTheme, priority: TaskPriority): string => {
  const colors = {
    [TaskPriority.LOW]: theme.colors.green[6],
    [TaskPriority.MEDIUM]: theme.colors.yellow[6],
    [TaskPriority.HIGH]: theme.colors.orange[6],
    [TaskPriority.URGENT]: theme.colors.red[6],
  };
  
  return colors[priority] || theme.colors.gray[6];
};

/**
 * Get background color for status badges
 */
export const getStatusBackgroundColor = (theme: MantineTheme, status: TodoStatus | ProjectStatus): string => {
  const todoColors = {
    [TodoStatus.PENDING]: theme.colors.gray[1],
    [TodoStatus.IN_PROGRESS]: theme.colors.blue[1],
    [TodoStatus.DONE]: theme.colors.green[1],
    [TodoStatus.BLOCKED]: theme.colors.red[1],
    [TodoStatus.CANCELLED]: theme.colors.gray[0],
  };
  
  const projectColors = {
    [ProjectStatus.IS_RUNNING]: theme.colors.blue[1],
    [ProjectStatus.ON_HOLD]: theme.colors.yellow[1],
    [ProjectStatus.COMPLETED]: theme.colors.green[1],
    [ProjectStatus.CANCELLED]: theme.colors.gray[0],
  };
  
  return todoColors[status as TodoStatus] || projectColors[status as ProjectStatus] || theme.colors.gray[1];
};

/**
 * Get background color for priority badges
 */
export const getPriorityBackgroundColor = (theme: MantineTheme, priority: TaskPriority): string => {
  const colors = {
    [TaskPriority.LOW]: theme.colors.green[1],
    [TaskPriority.MEDIUM]: theme.colors.yellow[1],
    [TaskPriority.HIGH]: theme.colors.orange[1],
    [TaskPriority.URGENT]: theme.colors.red[1],
  };
  
  return colors[priority] || theme.colors.gray[1];
};

/**
 * Get border color for status indicators
 */
export const getStatusBorderColor = (theme: MantineTheme, status: TodoStatus | ProjectStatus): string => {
  const todoColors = {
    [TodoStatus.PENDING]: theme.colors.gray[3],
    [TodoStatus.IN_PROGRESS]: theme.colors.blue[3],
    [TodoStatus.DONE]: theme.colors.green[3],
    [TodoStatus.BLOCKED]: theme.colors.red[3],
    [TodoStatus.CANCELLED]: theme.colors.gray[2],
  };
  
  const projectColors = {
    [ProjectStatus.IS_RUNNING]: theme.colors.blue[3],
    [ProjectStatus.ON_HOLD]: theme.colors.yellow[3],
    [ProjectStatus.COMPLETED]: theme.colors.green[3],
    [ProjectStatus.CANCELLED]: theme.colors.gray[2],
  };
  
  return todoColors[status as TodoStatus] || projectColors[status as ProjectStatus] || theme.colors.gray[3];
};
