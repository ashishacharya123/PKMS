import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';
import { ContentViewer, type ContentViewerProps } from './ContentViewer';
import { useDataLoader } from '../../hooks/useDataLoader';
import { transformFilesToUnifiedItems } from '../../utils/fileTransformers';
import { UnifiedFileItem } from '../../services/unifiedFileService';

export interface ContentViewerPageService<T> {
  getItem: (id: string) => Promise<T>;
  getItemFiles: (id: string) => Promise<any[]>;
  updateItem?: (id: string, updates: any) => Promise<T>;
  toggleArchive?: (id: string, isArchived: boolean) => Promise<T>;
  deleteItem?: (id: string) => Promise<void>;
}

export interface ContentViewerPageConfig<T> {
  service: ContentViewerPageService<T>;
  itemToContentProps: (item: T, files: UnifiedFileItem[]) => Omit<ContentViewerProps, 'onEdit' | 'onBack' | 'onArchive' | 'onToggleArchive' | 'onDelete'>;
  editPath: (id: string) => string;
  listPath: string;
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  itemTypeName: string;
  fileTransformOptions?: {
    isEncrypted?: boolean;
    defaultMediaType?: 'document' | 'image' | 'video' | 'audio';
  };
}

export function ContentViewerPage<T>({ id, config }: { id: string; config: ContentViewerPageConfig<T> }) {
  const navigate = useNavigate();

  const { data: item, loading, error, refetch } = useDataLoader(async () => {
    const base = await config.service.getItem(id);
    return base;
  }, { dependencies: [id] });

  const { data: files } = useDataLoader(async () => {
    const raw = await config.service.getItemFiles(id);
    return transformFilesToUnifiedItems(raw, config.module, id, config.fileTransformOptions);
  }, { dependencies: [id] });

  const viewerProps = useMemo(() => {
    if (!item) return null;
    return config.itemToContentProps(item, files || []);
  }, [item, files, config]);

  const handleEdit = () => navigate(config.editPath(id));
  const handleBack = () => navigate(config.listPath);

  const handleArchive = async () => {
    if (!config.service.toggleArchive || !item) return;
    const current = (item as any).isArchived === true;
    await config.service.toggleArchive(id, !current);
    await refetch();
  };

  const handleDelete = async () => {
    if (!config.service.deleteItem) return;
    await config.service.deleteItem(id);
    navigate(config.listPath);
  };

  if (loading && !item) {
    return <LoadingState message={`Loading ${config.itemTypeName}...`} />;
  }

  if (error || !item || !viewerProps) {
    return <ErrorState message={error || `${config.itemTypeName} not found`} onRetry={refetch} />;
  }

  return (
    <ContentViewer
      {...viewerProps}
      onEdit={handleEdit}
      onBack={handleBack}
      onArchive={config.service.toggleArchive ? handleArchive : undefined}
      onDelete={config.service.deleteItem ? handleDelete : undefined}
    />
  );
}


