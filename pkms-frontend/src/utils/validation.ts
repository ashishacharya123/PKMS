/**
 * Runtime Validation Utilities with Zod
 *
 * Provides runtime type checking for API responses to ensure
 * frontend receives data in expected format from backend.
 */

import { z } from 'zod';
import type { Note, NoteSummary, Todo, Project, ProjectBadge } from '../types';
import type { AuthResponse, User } from '../types/auth';
import { TodoStatus, TaskPriority, TodoType, ProjectStatus } from '../types/enums';

// Base validation schemas
const UUIDSchema = z.string().uuid();
const DateTimeSchema = z.string().datetime();
const ProjectBadgeSchema: z.ZodType<ProjectBadge> = z.object({
  uuid: z.string().nullable(),
  name: z.string(),
  isProjectExclusive: z.boolean(),
  isDeleted: z.boolean(),
});

// Note Validation Schemas
export const NoteResponseSchema: z.ZodType<Note> = z.object({
  uuid: UUIDSchema,
  title: z.string(),
  content: z.string().optional(),
  contentFilePath: z.string().optional(),
  thumbnailPath: z.string().optional(),
  isTemplate: z.boolean().optional(),
  fromTemplateId: z.string().optional(),
  description: z.string().max(500).optional(),
  fileCount: z.number(),
  isFavorite: z.boolean(),
  isArchived: z.boolean(),
  isExclusiveMode: z.boolean().optional(),
  isProjectExclusive: z.boolean().optional(),
  projects: z.array(ProjectBadgeSchema),
  createdBy: z.string(),
  tags: z.array(z.string()),
  version: z.number().optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  // BaseItem fields
  name: z.string(),
  isDeleted: z.boolean().optional(),
});

export const NoteSummaryResponseSchema: z.ZodType<NoteSummary> = z.object({
  uuid: UUIDSchema,
  name: z.string(),
  title: z.string(),
  preview: z.string(),
  content: z.string().optional(),
  description: z.string().max(500).optional(),
  fileCount: z.number(),
  isFavorite: z.boolean(),
  isArchived: z.boolean(),
  isExclusiveMode: z.boolean().optional(),
  isProjectExclusive: z.boolean().optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  createdBy: z.string(),
  tags: z.array(z.string()),
  isTemplate: z.boolean().optional(),
  fromTemplateId: z.string().optional(),
  projects: z.array(ProjectBadgeSchema),
  version: z.number().optional(),
  // BaseItem fields
  isDeleted: z.boolean().optional(),
});

// TODO Validation Schemas
export const TodoResponseSchema: z.ZodType<Todo> = z.object({
  uuid: UUIDSchema,
  name: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.nativeEnum(TodoStatus),
  priority: z.nativeEnum(TaskPriority),
  isArchived: z.boolean(),
  isFavorite: z.boolean(),
  orderIndex: z.number(),
  parentUuid: z.string().optional(),
  subtasks: z.array(z.any()), // Recursive - will be validated separately if needed
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  createdBy: z.string(),
  tags: z.array(z.string()),
  projects: z.array(ProjectBadgeSchema),
  blockingTodos: z.array(z.any()).optional(), // Complex nested structure
  blockedByTodos: z.array(z.any()).optional(), // Complex nested structure
  blockerCount: z.number(),
  projectUuid: z.string().optional(),
  projectName: z.string().optional(),
  isDeleted: z.boolean().optional(),
});

// Project Validation Schemas
export const ProjectResponseSchema: z.ZodType<Project> = z.object({
  uuid: UUIDSchema,
  name: z.string(),
  description: z.string().optional(),
  status: z.nativeEnum(ProjectStatus),
  priority: z.nativeEnum(TaskPriority),
  sortOrder: z.number(),
  isArchived: z.boolean(),
  isFavorite: z.boolean(),
  isDeleted: z.boolean(),
  progressPercentage: z.number().min(0).max(100),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  completionDate: z.string().optional(),
  createdBy: z.string(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  // Computed fields
  todoCount: z.number(),
  completedCount: z.number(),
  documentCount: z.number(),
  noteCount: z.number(),
  tagCount: z.number(),
  actualProgress: z.number(),
  daysRemaining: z.number().optional(),
  // Relationships
  tags: z.array(z.string()),
});

// Authentication Validation Schemas
export const AuthResponseSchema: z.ZodType<AuthResponse> = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string(),
  expiresIn: z.number().positive(),
  userId: z.number().positive(),
  username: z.string().min(1),
  isFirstLogin: z.boolean().optional(),
});

export const UserSchema: z.ZodType<User> = z.object({
  id: z.number().positive(),
  username: z.string().min(1),
  email: z.string().email().optional(),
  isActive: z.boolean(),
  isFirstLogin: z.boolean(),
  settingsJson: z.string(),
  loginPasswordHint: z.string().optional(),
  diaryPasswordHint: z.string().optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  lastLogin: DateTimeSchema.optional(),
  settings: z.any(), // Complex nested object - will be validated separately if needed
  isAuthenticated: z.boolean().optional(),
});

// API Response Wrappers
export const PaginatedNotesResponseSchema = z.object({
  data: z.array(NoteSummaryResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export const PaginatedTodosResponseSchema = z.object({
  data: z.array(TodoResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

// Validation utility functions
export class ResponseValidator {
  /**
   * Validate a single note response
   */
  static validateNote(data: unknown): Note {
    return NoteResponseSchema.parse(data);
  }

  /**
   * Validate a note summary response
   */
  static validateNoteSummary(data: unknown): NoteSummary {
    return NoteSummaryResponseSchema.parse(data);
  }

  /**
   * Validate a paginated notes response
   */
  static validatePaginatedNotes(data: unknown) {
    return PaginatedNotesResponseSchema.parse(data);
  }

  /**
   * Validate a single todo response
   */
  static validateTodo(data: unknown): Todo {
    return TodoResponseSchema.parse(data);
  }

  /**
   * Validate a project response
   */
  static validateProject(data: unknown): Project {
    return ProjectResponseSchema.parse(data);
  }

  /**
   * Validate authentication response
   */
  static validateAuthResponse(data: unknown): AuthResponse {
    return AuthResponseSchema.parse(data);
  }

  /**
   * Validate user response
   */
  static validateUser(data: unknown): User {
    return UserSchema.parse(data);
  }

  /**
   * Safe validation with error handling
   */
  static safeValidate<T>(schema: z.ZodType<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
    try {
      const validated = schema.parse(data);
      return { success: true, data: validated };
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const message = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return { success: false, error: `Validation failed: ${message}` };
      }
      return { success: false, error: `Unknown validation error: ${error}` };
    }
  }
}

// Feature flag for runtime validation (matches backend config)
export const RUNTIME_VALIDATION_ENABLED = true; // Could be tied to backend config