/**
 * Document TypeScript interfaces matching backend schemas exactly
 */

import { BaseEntity, BaseCreateRequest, BaseUpdateRequest, BaseSummary } from './common';
import { ProjectBadge } from './project';

export interface Document extends BaseEntity {
  title: string;
  originalName: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  isArchived: boolean;
  projects: ProjectBadge[];
  // NO uploadStatus (backend removed)
}

export interface DocumentSummary extends BaseSummary {
  originalName: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  isArchived: boolean;
  projects: ProjectBadge[];
  preview: string;
}

export interface UploadDocumentRequest extends BaseCreateRequest {
  originalName: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  description?: string;
  projectIds?: string[]; // Multi-project support (UUIDs)
  isProjectExclusive?: boolean;
  isArchived?: boolean;
}

export interface UpdateDocumentRequest extends BaseUpdateRequest {
  title?: string;
  originalName?: string;
  filename?: string;
  fileSize?: number;
  mimeType?: string;
  description?: string;
  projectIds?: string[]; // Multi-project support (UUIDs)
  isProjectExclusive?: boolean;
  isArchived?: boolean;
}

export interface CommitDocumentUploadRequest {
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  description?: string;
}

export interface ArchiveDocumentRequest {
  archiveFolderUuid: string;
  reason?: string;
}
