/**
 * DiaryViewPage - Simplified diary entry viewing using ContentViewer
 * 
 * PURPOSE:
 * ========
 * Provides diary entry viewing functionality using the unified content viewer architecture.
 * Handles decryption and displays diary entries with all metadata and files.
 * 
 * ARCHITECTURE:
 * =============
 * - Uses ContentViewer for all viewing operations
 * - Handles decryption of encrypted diary content
 * - Displays mood, weather, location, and files
 * - Integrates with diary store for session management
 * 
 * @author AI Agent: Claude Sonnet 4.5
 * @date 2025-10-29
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { useNavigate, useParams } from 'react-router-dom';
import { Container } from '@mantine/core';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { useDiaryStore } from '../stores/diaryStore';
import { diaryService } from '../services/diaryService';
import { ContentViewer } from '../components/common/ContentViewer';
import { UnifiedFileItem } from '../services/unifiedFileService';
import { transformDiaryFiles } from '../utils/fileTransformers';

export default function DiaryViewPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const store = useDiaryStore();

  // State
  const [decryptedContent, setDecryptedContent] = useState<string>('');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [diaryFiles, setDiaryFiles] = useState<UnifiedFileItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Track when user is on diary page for session management
  useEffect(() => {
    store.setOnDiaryPage(true);
    
    // Cleanup when component unmounts
    return () => {
      store.setOnDiaryPage(false);
    };
  }, [store]);

  // Ensure entries are loaded
  useAuthenticatedEffect(() => {
    if (!store.entries || store.entries.length === 0) {
      store.loadEntries();
    }
  }, []);

  // Find the entry
  const entry = useMemo(() => {
    return store.entries.find((e) => e.uuid === id);
  }, [store.entries, id]);

  // Decrypt content and load files
  useEffect(() => {
    const run = async () => {
      if (!entry) return;
      if (!store.encryptionKey) return;
      
      try {
        setIsDecrypting(true);
        setError(null);
        
        // Validate encrypted fields format before decryption
        if (!isValidBase64(entry.encryptedBlob)) {
          throw new Error('Invalid encrypted content format');
        }
        if (!isValidHex(entry.encryptionIv)) {
          throw new Error('Invalid encryption IV format');
        }

        // Decrypt content
        const content = await diaryService.decryptContent(
          entry.encryptedBlob,
          entry.encryptionIv,
          store.encryptionKey
        );
        setDecryptedContent(content);

        // Load files
        const full = await diaryService.getEntry(entry.uuid);
        const mediaList = await diaryService.getEntryFiles(full.uuid);
        setDiaryFiles(transformDiaryFiles(mediaList, entry.uuid, true));
      } catch (err) {
        console.error('Failed to load diary entry:', err);
        setError(err instanceof Error ? err.message : 'Failed to load diary entry');
        notifications.show({ 
          title: 'Error', 
          message: 'Failed to decrypt entry', 
          color: 'red' 
        });
      } finally {
        setIsDecrypting(false);
      }
    };
    
    run();
  }, [entry, store.encryptionKey]);

  // Handle edit
  const handleEdit = () => {
    if (entry) {
      navigate(`/diary/edit/${entry.uuid}`);
    }
  };

  // Handle delete
  const handleDelete = () => {
    if (!entry) return;
    
    modals.openConfirmModal({
      title: 'Delete Diary Entry',
      children: `Are you sure you want to delete "${entry.title || 'Untitled'}"? This action cannot be undone.`,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await store.deleteEntry(entry.uuid);
          notifications.show({
            title: 'Success',
            message: 'Diary entry deleted successfully',
            color: 'green'
          });
          navigate('/diary');
        } catch (err) {
          notifications.show({
            title: 'Error',
            message: 'Failed to delete diary entry',
            color: 'red'
          });
        }
      }
    });
  };

  // Handle back
  const handleBack = () => {
    navigate('/diary');
  };

  // Handle files update
  const handleFilesUpdate = (files: UnifiedFileItem[]) => {
    setDiaryFiles(files);
  };

  // Loading state
  if (isDecrypting) {
    return <LoadingState message="Decrypting diary entry..." />;
  }

  // Error state
  if (error) {
    return <ErrorState message={error} />;
  }

  // No entry found
  if (!entry) {
    return <ErrorState message="The requested diary entry could not be found." />;
  }

  return (
    <Container size="md" py="xl">
      <ContentViewer
        title={entry.title || 'Untitled'}
        content={decryptedContent}
        tags={entry.tags || []}
        createdAt={entry.createdAt}
        updatedAt={entry.createdAt}
        isArchived={false}
        mood={entry.mood}
        weatherCode={entry.weatherCode}
        location={entry.location}
        date={entry.date}
        files={diaryFiles}
        module="diary"
        entityId={entry.uuid}
        onEdit={handleEdit}
        onBack={handleBack}
        onDelete={handleDelete}
        isLoading={isDecrypting}
        error={error}
        showDiaryFields={true}
        showProjects={false}
        enableDragDrop={false}
        onFilesUpdate={handleFilesUpdate}
      />
    </Container>
  );
}