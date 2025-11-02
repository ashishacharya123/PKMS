import { UnifiedFileItem } from '../services/unifiedFileService';

export function transformFilesToUnifiedItems(
  files: any[],
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects',
  entityId: string,
  options: {
    isEncrypted?: boolean;
    defaultMediaType?: 'document' | 'image' | 'video' | 'audio';
  } = {}
): UnifiedFileItem[] {
  const { isEncrypted = false, defaultMediaType = 'document' } = options;

  return files.map((file: any) => ({
    uuid: file.uuid,
    name: file.name || file.originalName,
    filename: file.filename,
    originalName: file.originalName,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    description: file.description,
    isFavorite: file.isFavorite || false,
    isArchived: file.isArchived || false,
    createdBy: file.createdBy || 'unknown',
    createdAt: file.createdAt,
    updatedAt: file.updatedAt || file.createdAt,
    mediaType: (file.mediaType || defaultMediaType) as UnifiedFileItem['mediaType'],
    isEncrypted,
    module,
    entityId,
  }));
}

export const transformDiaryFiles = (files: any[], entryId: string, encrypted = true) =>
  transformFilesToUnifiedItems(files, 'diary', entryId, { isEncrypted: encrypted });

export const transformNoteFiles = (files: any[], noteId: string) =>
  transformFilesToUnifiedItems(files, 'notes', noteId);

export const transformDocumentFiles = (files: any[], folderId: string) =>
  transformFilesToUnifiedItems(files, 'documents', folderId);


