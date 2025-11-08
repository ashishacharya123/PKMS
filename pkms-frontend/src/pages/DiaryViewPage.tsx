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

/**
 * Robust validation helpers with edge case handling
 */
const isValidBase64 = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;

  // Remove whitespace (base64 can have spaces/newlines)
  const cleaned = str.trim().replace(/\s/g, '');
  if (!cleaned.length) return false;

  // Base64 regex: A-Z, a-z, 0-9, +, /, and = for padding (0-2 characters)
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(cleaned)) return false;

  try {
    atob(cleaned);
    return true;
  } catch {
    return false;
  }
};

const isValidHex = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;

  // Remove whitespace and 0x prefix if present
  const cleaned = str.trim().replace(/^0x/i, '').replace(/\s/g, '');
  if (!cleaned.length) return false;

  const hexRegex = /^[0-9a-fA-F]+$/;
  return hexRegex.test(cleaned);
};

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
        
        // Get and decrypt content from document
        const content = await diaryService.getEntryContent(
          entry.uuid,
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