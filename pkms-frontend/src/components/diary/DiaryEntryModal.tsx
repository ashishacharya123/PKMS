/**
 * DiaryEntryModal - Simplified diary entry creation using ContentEditor
 * 
 * PURPOSE:
 * ========
 * Provides diary entry creation functionality using the unified content editor architecture.
 * Handles optimistic UUID reservation and auto-discard of empty entries.
 * 
 * ARCHITECTURE:
 * =============
 * - Uses ContentEditor for all editing operations
 * - Integrates with entityReserveService for optimistic UUID
 * - Handles auto-discard of empty entries on cancel
 * - Uses isEmptyDiaryEntry helper for validation
 * 
 * @author AI Agent: Claude Sonnet 4.5
 * @date 2025-10-29
 */

import { useState, useEffect } from 'react';
import { Modal, Alert } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDiaryStore } from '../../stores/diaryStore';
import { entityReserveService } from '../../services/entityReserveService';
import { isEmptyDiaryEntry } from '../../utils/save_discard_verification';
import { ContentEditor } from '../common/ContentEditor';
import { UnifiedFileItem } from '../../services/unifiedFileService';

interface DiaryEntryModalProps {
  opened: boolean;
  onClose: () => void;
  initialDate?: Date;
}

export function DiaryEntryModal({ opened, onClose, initialDate }: DiaryEntryModalProps) {
  const { createEntry, encryptionKey } = useDiaryStore();

  // State
  const [reservedUuid, setReservedUuid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryFiles, setEntryFiles] = useState<UnifiedFileItem[]>([]);
  
  // Entry form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [mood, setMood] = useState<number | undefined>(undefined);
  const [weatherCode, setWeatherCode] = useState<number | undefined>(undefined);
  const [location, setLocation] = useState('');
  const [entryDate, setEntryDate] = useState<Date>(initialDate || new Date());

  // Reserve UUID on modal open
  useEffect(() => {
    if (!opened || reservedUuid) return;

    const reserveUuid = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const date = initialDate || new Date();
        const dateStr = date.toISOString().split('T')[0];
        const { uuid } = await entityReserveService.reserve('diary', { date: dateStr });
        setReservedUuid(uuid);
      } catch (err) {
        console.error('Failed to reserve UUID for diary entry:', err);
        setError(err instanceof Error ? err.message : 'Failed to reserve UUID');
      } finally {
        setIsLoading(false);
      }
    };

    reserveUuid();
  }, [opened, reservedUuid, initialDate]);

  // Reset state when modal closes
  useEffect(() => {
    if (!opened) {
      setReservedUuid(null);
      setError(null);
      setEntryFiles([]);
    }
  }, [opened]);

  // Handle save
  const handleSave = async (data: {
    title: string;
    content: string;
    tags: string[];
    mood?: number;
    weatherCode?: number;
    location?: string;
  }) => {
    if (!reservedUuid) {
      throw new Error('No reserved UUID available');
    }

    try {
      const entryData = {
        title: data.title,
        content: data.content,
        tags: data.tags,
        mood: data.mood,
        weatherCode: data.weatherCode,
        location: data.location,
        date: entryDate
      };

      await createEntry(entryData);
      
      notifications.show({
        title: 'Success',
        message: 'Diary entry created successfully',
        color: 'green'
      });
      
      onClose();
    } catch (err) {
      console.error('Failed to create diary entry:', err);
      throw err;
    }
  };

  // Handle cancel with auto-discard
  const handleCancel = async () => {
    if (reservedUuid) {
      // Check if entry is empty enough to auto-discard
      const entryForCheck = {
        title,
        content,
        tags,
        mood,
        weatherCode,
        location,
        files: entryFiles
      };
      
      if (isEmptyDiaryEntry(entryForCheck)) {
        try {
          await entityReserveService.discard('diary', reservedUuid);
        } catch (err) {
          console.error('Failed to discard empty diary entry:', err);
        }
      }
    }
    
    // Reset form state
    setTitle('');
    setContent('');
    setTags([]);
    setMood(undefined);
    setWeatherCode(undefined);
    setLocation('');
    setEntryDate(initialDate || new Date());
    setEntryFiles([]);
    
    setReservedUuid(null);
    setIsLoading(false);
    setError(null);
    onClose();
  };

  // Handle files update
  const handleFilesUpdate = (files: UnifiedFileItem[]) => {
    setEntryFiles(files);
  };

  // Loading state
  if (isLoading) {
    return (
      <Modal opened={opened} onClose={onClose} title="Creating Entry" size="lg">
        <Alert color="blue" title="Preparing">
          Setting up your diary entry...
        </Alert>
      </Modal>
    );
  }

  // Error state
  if (error) {
    return (
      <Modal opened={opened} onClose={onClose} title="Error" size="lg">
        <Alert color="red" title="Error">
          {error}
        </Alert>
      </Modal>
    );
  }

  // No UUID reserved yet
  if (!reservedUuid) {
    return (
      <Modal opened={opened} onClose={onClose} title="Creating Entry" size="lg">
        <Alert color="yellow" title="Loading">
          Preparing diary entry...
        </Alert>
      </Modal>
    );
  }

  return (
    <Modal opened={opened} onClose={handleCancel} title="New Diary Entry" size="xl">
      <ContentEditor
        title={title}
        content={content}
        tags={tags}
        mood={mood}
        weatherCode={weatherCode}
        location={location}
        date={entryDate}
        files={entryFiles}
        module="diary"
        entityId={reservedUuid || ''}
        onTitleChange={setTitle}
        onContentChange={setContent}
        onTagsChange={setTags}
        onMoodChange={setMood}
        onWeatherCodeChange={setWeatherCode}
        onLocationChange={setLocation}
        onDateChange={setEntryDate}
        onSave={handleSave}
        onCancel={handleCancel}
        isSaving={isLoading}
        isLoading={isLoading}
        error={error}
        showDiaryFields={true}
        showProjects={false}
        showTemplateSelection={false}
        enableDragDrop={true}
        onFilesUpdate={handleFilesUpdate}
        encryptionKey={encryptionKey}
      />
    </Modal>
  );
}