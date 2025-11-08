/**
 * Note TypeScript interfaces matching backend schemas exactly
 */

import { BaseEntity, BaseCreateRequest, BaseUpdateRequest, BaseItem } from './common';
import { ProjectBadge } from './project';

export interface Note extends BaseEntity {
  title: string;
  content?: string; // Backend allows null for file-backed notes
  contentFilePath?: string;
  thumbnailPath?: string;
  isTemplate?: boolean;
  fromTemplateId?: string;
  description?: string; // Brief description for FTS5 search (max 500 chars)
  fileCount: number;
  isFavorite: boolean;
  isArchived: boolean;
  isExclusiveMode?: boolean;
  isProjectExclusive?: boolean;
  projects: ProjectBadge[];
  createdBy: string;
  tags: string[];
  version?: number;
}

export interface NoteSummary extends BaseItem {
  uuid: string;
  name: string; // BaseItem requires 'name'
  title: string;
  preview: string;
  content?: string; // Optional full content
  description?: string;
  fileCount: number;
  isFavorite: boolean;
  isArchived: boolean;
  isExclusiveMode?: boolean;
  isProjectExclusive?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags: string[];
  isTemplate?: boolean;
  fromTemplateId?: string;
  projects: ProjectBadge[];
  version?: number;
}

export interface NoteFile {
  uuid: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  orderIndex: number; // For drag-and-drop reordering
}

export interface CreateNoteRequest extends BaseCreateRequest {
  title: string;
  content: string;
  description?: string; // Brief description for FTS5 search (max 500 chars)
  tags?: string[];
  projectUuids?: string[]; // List of project UUIDs to link this note to (max 10)
  areProjectsExclusive?: boolean; // Apply exclusive flag to all project associations
  forceFileStorage?: boolean; // Force content to be saved as file even if small
  isTemplate?: boolean; // Mark this note as a template
  fromTemplateId?: string; // UUID of the template this note was created from
}

export interface UpdateNoteRequest extends BaseUpdateRequest {
  title?: string;
  content?: string;
  description?: string; // Brief description for FTS5 search (max 500 chars)
  tags?: string[];
  forceFileStorage?: boolean; // Force content to be saved as file even if small
  isArchived?: boolean;
  isFavorite?: boolean;
  isTemplate?: boolean;
  fromTemplateId?: string;
  projectUuids?: string[]; // List of project UUIDs to link this note to (max 10)
  areProjectsExclusive?: boolean; // Apply exclusive flag to all project associations
}

export interface CommitNoteFileRequest {
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  orderIndex?: number;
}
