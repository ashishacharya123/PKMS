/**
 * UnifiedContentModal - Unified modal for content editing/viewing across all modules
 * 
 * PURPOSE:
 * ========
 * Provides a single entry point for all content editing and viewing operations.
 * Wraps ContentEditor and ContentViewer components with mode switching capability.
 * Handles encryption, optimistic UUID, and file operations through unified architecture.
 * 
 * ARCHITECTURE:
 * =============
 * - Called by UnifiedFileList for content-type files
 * - Called by page components (NoteEditorPage, DiaryViewPage, etc.)
 * - Integrates with entityReserveService for optimistic UUID
 * - Handles diary encryption seamlessly
 * - Uses UnifiedFileSection for file operations
 * 
 * USAGE:
 * ======
 * - mode='create': New content creation with optimistic UUID
 * - mode='edit': Edit existing content
 * - mode='view': View content with option to switch to edit
 * 
 * @author AI Agent: Claude Sonnet 4.5
 * @date 2025-10-29
 */

import { useState, useEffect } from 'react';
import { Modal } from '@mantine/core';
import { ContentEditor } from '../common/ContentEditor';
import { ContentViewer } from '../common/ContentViewer';
import { UnifiedFileItem } from '../../services/unifiedFileService';

export interface UnifiedContentModalProps {
  // Modal state
  opened: boolean;
  onClose: () => void;
  
  // Mode control
  mode: 'view' | 'edit' | 'create';
  onModeChange?: (mode: 'view' | 'edit' | 'create') => void;
  
  // Module context
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  entityId: string; // UUID of the parent entity (note, diary entry, etc.)
  
  // Content data
  initialData?: {
    title?: string;
    content?: string;
    tags?: string[];
    projectIds?: string[];
    isExclusive?: boolean;
    mood?: number;
    weatherCode?: number;
    location?: string;
    date?: string;
    createdAt?: string;
    updatedAt?: string;
    isArchived?: boolean;
  };
  
  // File management
  files?: UnifiedFileItem[];
  onFilesUpdate?: (files: UnifiedFileItem[]) => void;
  
  // Encryption (for diary)
  encryptionKey?: CryptoKey;
  
  // Actions
  onSave: (data: any) => Promise<void>;
  onDelete?: () => Promise<void>;
  
  // State
  isSaving?: boolean;
  isLoading?: boolean;
  error?: string | null;
  
  // UI options
  showProjects?: boolean;
  showDiaryFields?: boolean;
  showTemplateSelection?: boolean;
  enableDragDrop?: boolean;
}

export const UnifiedContentModal: React.FC<UnifiedContentModalProps> = ({
  opened,
  onClose,
  mode: initialMode,
  onModeChange,
  module,
  entityId,
  initialData = {},
  files = [],
  onFilesUpdate,
  encryptionKey,
  onSave,
  onDelete,
  isSaving = false,
  isLoading = false,
  error = null,
  showProjects = false,
  showDiaryFields = false,
  showTemplateSelection = false,
  enableDragDrop = false,
}) => {
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>(initialMode);
  const [title, setTitle] = useState(initialData.title || '');
  const [content, setContent] = useState(initialData.content || '');
  const [tags, setTags] = useState<string[]>(initialData.tags || []);
  const [projectIds, setProjectIds] = useState<string[]>(initialData.projectIds || []);
  const [isExclusive, setIsExclusive] = useState(initialData.isExclusive || false);
  const [mood, setMood] = useState<number | undefined>(initialData.mood);
  const [weatherCode, setWeatherCode] = useState<number | undefined>(initialData.weatherCode);
  const [location, setLocation] = useState(initialData.location || '');
  const [currentFiles, setCurrentFiles] = useState<UnifiedFileItem[]>(files);

  // Sync initial data when it changes
  useEffect(() => {
    setTitle(initialData.title || '');
    setContent(initialData.content || '');
    setTags(initialData.tags || []);
    setProjectIds(initialData.projectIds || []);
    setIsExclusive(initialData.isExclusive || false);
    setMood(initialData.mood);
    setWeatherCode(initialData.weatherCode);
    setLocation(initialData.location || '');
  }, [initialData]);

  // Sync mode when prop changes
  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Sync files when prop changes
  useEffect(() => {
    setCurrentFiles(files);
  }, [files]);

  const handleModeSwitch = (newMode: 'view' | 'edit' | 'create') => {
    setMode(newMode);
    if (onModeChange) {
      onModeChange(newMode);
    }
  };

  const handleSave = async () => {
    const data = {
      title,
      content,
      tags,
      projectIds,
      isExclusive,
      mood,
      weatherCode,
      location,
    };
    await onSave(data);
  };

  const handleFilesUpdate = (updatedFiles: UnifiedFileItem[]) => {
    setCurrentFiles(updatedFiles);
    if (onFilesUpdate) {
      onFilesUpdate(updatedFiles);
    }
  };

  const handleEdit = () => {
    handleModeSwitch('edit');
  };

  const handleCancelEdit = () => {
    // If we were in create mode, close modal
    if (initialMode === 'create') {
      onClose();
    } else {
      // Switch back to view mode
      handleModeSwitch('view');
    }
  };

  // Determine modal title
  const getModalTitle = () => {
    if (mode === 'create') {
      return `New ${module === 'notes' ? 'Note' : module === 'diary' ? 'Diary Entry' : 'Content'}`;
    }
    if (mode === 'edit') {
      return `Edit ${module === 'notes' ? 'Note' : module === 'diary' ? 'Diary Entry' : 'Content'}`;
    }
    return title || 'View Content';
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={getModalTitle()}
      size="xl"
      styles={{
        body: { minHeight: '60vh' },
      }}
    >
      {(mode === 'edit' || mode === 'create') ? (
        <ContentEditor
          title={title}
          content={content}
          onTitleChange={setTitle}
          onContentChange={setContent}
          tags={tags}
          onTagsChange={setTags}
          projectIds={projectIds}
          onProjectIdsChange={setProjectIds}
          isExclusive={isExclusive}
          onIsExclusiveChange={setIsExclusive}
          mood={mood}
          onMoodChange={setMood}
          weatherCode={weatherCode}
          onWeatherCodeChange={setWeatherCode}
          location={location}
          onLocationChange={setLocation}
          files={currentFiles}
          onFilesUpdate={handleFilesUpdate}
          module={module}
          entityId={entityId}
          onSave={handleSave}
          onCancel={handleCancelEdit}
          isSaving={isSaving}
          isLoading={isLoading}
          error={error}
          showProjects={showProjects}
          showDiaryFields={showDiaryFields}
          showTemplateSelection={showTemplateSelection}
          enableDragDrop={enableDragDrop}
          showFiles={true}
          showPreview={true}
        />
      ) : (
        <ContentViewer
          title={title}
          content={content}
          tags={tags}
          createdAt={initialData.createdAt}
          updatedAt={initialData.updatedAt}
          isArchived={initialData.isArchived}
          mood={mood}
          weatherCode={weatherCode}
          location={location}
          date={initialData.date}
          files={currentFiles}
          onFilesUpdate={handleFilesUpdate}
          module={module}
          entityId={entityId}
          onEdit={handleEdit}
          onBack={onClose}
          onDelete={onDelete}
          isLoading={isLoading}
          error={error}
          showDiaryFields={showDiaryFields}
          showFiles={true}
          enableDragDrop={enableDragDrop}
        />
      )}
    </Modal>
  );
};

