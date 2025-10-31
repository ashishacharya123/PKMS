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
    filename: file.filename,
    originalName: file.originalName,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    description: file.description,
    createdAt: file.createdAt,
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


