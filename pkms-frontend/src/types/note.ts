/**
 * Note TypeScript interfaces matching backend schemas exactly
 */

import { BaseEntity, BaseCreateRequest, BaseUpdateRequest, BaseSummary } from './common';
import { ProjectBadge } from './project';

export interface Note extends BaseEntity {
  title: string;
  content: string;
  description?: string; // NEW - for FTS5
  fileCount: number;
  isArchived: boolean;
  isProjectExclusive: boolean;
  projects: ProjectBadge[];
  version?: number;
}

export interface NoteSummary extends BaseSummary {
  content: string;
  description?: string;
  fileCount: number;
  isArchived: boolean;
  isProjectExclusive: boolean;
  projects: ProjectBadge[];
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
  content: string;
  description?: string;
  projectIds?: string[]; // Multi-project support (UUIDs)
  isProjectExclusive?: boolean;
  isArchived?: boolean;
}

export interface UpdateNoteRequest extends BaseUpdateRequest {
  content?: string;
  description?: string;
  projectIds?: string[]; // Multi-project support (UUIDs)
  isProjectExclusive?: boolean;
  isArchived?: boolean;
  version?: number;
}

export interface CommitNoteFileRequest {
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  orderIndex?: number;
}
