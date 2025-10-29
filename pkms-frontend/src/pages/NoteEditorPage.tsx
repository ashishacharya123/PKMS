/**
 * NoteEditorPage - Simplified note editing using UnifiedContentModal
 * 
 * PURPOSE:
 * ========
 * Provides note editing functionality using the unified content modal architecture.
 * Handles both creating new notes and editing existing ones with optimistic UUID.
 * 
 * ARCHITECTURE:
 * =============
 * - Uses UnifiedContentModal for all editing operations
 * - Integrates with entityReserveService for optimistic UUID
 * - Handles auto-discard of empty notes on cancel
 * - Uses isEmptyNote helper for validation
 * 
 * @author AI Agent: Claude Sonnet 4.5
 * @date 2025-10-29
 */

import { useState } from 'react';
import { useAuthenticatedEffect } from '../hooks/useAuthenticatedEffect';
import { useNavigate, useParams } from 'react-router-dom';
import { Container, Skeleton, Alert } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notesService, Note } from '../services/notesService';
import { entityReserveService } from '../services/entityReserveService';
import { isEmptyNote } from '../utils/save_discard_verification';
import { UnifiedContentModal } from '../components/file/UnifiedContentModal';
import { UnifiedFileItem } from '../services/unifiedFileService';
import { transformNoteFiles } from '../utils/fileTransformers';

export function NoteEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id && id !== 'new');
  const queryClient = useQueryClient();

  // State
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservedUuid, setReservedUuid] = useState<string | null>(null);
  const [noteFiles, setNoteFiles] = useState<UnifiedFileItem[]>([]);

  // Load note for editing
  useAuthenticatedEffect(() => {
    if (!isEditing || !id) return;
    
    const loadNote = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const noteData = await notesService.getNote(id);
        setCurrentNote(noteData);
        
        // Load note files
        const files = await notesService.getNoteFiles(id);
        setNoteFiles(transformNoteFiles(files, id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load note');
        setCurrentNote(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadNote();
  }, [isEditing, id]);

  // Reserve UUID for new notes (optimistic UUID flow)
  useAuthenticatedEffect(() => {
    if (isEditing || reservedUuid) return;
    
    const reserveUuid = async () => {
      try {
        const { uuid } = await entityReserveService.reserve('notes');
        setReservedUuid(uuid);
        // Create a minimal note object for the reserved UUID
        setCurrentNote({
          uuid,
          name: '',
          title: '',
          content: '',
          description: '',
          fileCount: 0,
          isFavorite: false,
          isArchived: false,
          isProjectExclusive: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
          projects: []
        });
      } catch (err) {
        console.error('Failed to reserve UUID for note:', err);
        setError(err instanceof Error ? err.message : 'Failed to reserve UUID');
      }
    };

    reserveUuid();
  }, [isEditing, reservedUuid]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      content: string;
      tags: string[];
      projectIds: string[];
      isExclusive: boolean;
    }) => {
      if (!currentNote) throw new Error('No note to save');
      
      const noteData = {
        name: data.title,
        title: data.title,
        content: data.content,
        tags: data.tags,
        projects: data.projectIds.map(id => ({ uuid: id, name: '', color: '' })), // Convert to ProjectBadge format
        isProjectExclusive: data.isExclusive
      };

      if (isEditing && id) {
        return await notesService.updateNote(id, noteData);
      } else {
        return await notesService.createNote(noteData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      notifications.show({
        title: 'Success',
        message: isEditing ? 'Note updated successfully' : 'Note created successfully',
        color: 'green'
      });
      navigate('/notes');
    },
    onError: (error: Error) => {
      notifications.show({
        title: 'Error',
        message: `Failed to save note: ${error}`,
        color: 'red'
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No note ID to delete');
      return await notesService.deleteNote(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      queryClient.invalidateQueries({ queryKey: ['search'] });
      notifications.show({
        title: 'Success',
        message: 'Note deleted successfully',
        color: 'green'
      });
      navigate('/notes');
    },
    onError: (error: Error) => {
      notifications.show({
        title: 'Error',
        message: `Failed to delete note: ${error}`,
        color: 'red'
      });
    }
  });

  // Handle save
  const handleSave = async (data: any) => {
    await saveMutation.mutateAsync(data);
  };

  // Handle delete
  const handleDelete = async () => {
    if (isEditing && id) {
      await deleteMutation.mutateAsync();
    }
  };

  // Handle cancel with auto-discard
  const handleCancel = async () => {
    if (!isEditing && reservedUuid) {
      // Check if note is empty enough to auto-discard
      const noteForCheck = {
        title: currentNote?.title || '',
        content: currentNote?.content || '',
        files: noteFiles
      };
      
      if (isEmptyNote(noteForCheck)) {
        try {
          await entityReserveService.discard('notes', reservedUuid);
        } catch (err) {
          console.error('Failed to discard empty note:', err);
        }
      }
    }
    navigate('/notes');
  };

  // Handle files update
  const handleFilesUpdate = (files: UnifiedFileItem[]) => {
    setNoteFiles(files);
  };

  // Loading state
  if (isLoading) {
    return (
      <Container size="md" py="xl">
        <Skeleton height={400} />
      </Container>
    );
  }

  // Error state
  if (error) {
    return (
      <Container size="md" py="xl">
        <Alert color="red" title="Error">
          {error}
        </Alert>
      </Container>
    );
  }

  // No note loaded yet
  if (!currentNote) {
    return (
      <Container size="md" py="xl">
        <Alert color="yellow" title="Loading">
          Preparing note editor...
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <UnifiedContentModal
        opened={true}
        onClose={handleCancel}
        mode={isEditing ? 'edit' : 'create'}
        module="notes"
        entityId={reservedUuid || id || ''}
        initialData={{
          title: currentNote.title || '',
          content: currentNote.content || '',
          tags: currentNote.tags || [],
          projectIds: currentNote.projects?.map(p => p.uuid).filter((uuid): uuid is string => Boolean(uuid)) || [],
          isExclusive: currentNote.isProjectExclusive || false,
          createdAt: currentNote.createdAt,
          updatedAt: currentNote.updatedAt,
          isArchived: currentNote.isArchived || false
        }}
        files={noteFiles}
        onFilesUpdate={handleFilesUpdate}
        onSave={handleSave}
        onDelete={isEditing ? handleDelete : undefined}
        isSaving={saveMutation.isPending || deleteMutation.isPending}
        isLoading={isLoading}
        error={error}
        showProjects={true}
        showDiaryFields={false}
        showTemplateSelection={false}
        enableDragDrop={true}
      />
    </Container>
  );
}