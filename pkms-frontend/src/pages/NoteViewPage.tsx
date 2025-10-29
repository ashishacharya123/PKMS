/**
 * NoteViewPage - Simplified note viewing using ContentViewer
 * 
 * PURPOSE:
 * ========
 * Provides note viewing functionality using the unified content viewer architecture.
 * Displays notes with all metadata, projects, and files.
 * 
 * ARCHITECTURE:
 * =============
 * - Uses ContentViewer for all viewing operations
 * - Displays projects, tags, and files
 * - Handles archive/unarchive operations
 * - Integrates with notes service
 * 
 * @author AI Agent: Claude Sonnet 4.5
 * @date 2025-10-29
 */

import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ContentViewerPage } from '../components/common/ContentViewerPage';
import { notesService } from '../services/notesService';

export default function NoteViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <ContentViewerPage
      id={id}
      config={{
        service: {
          getItem: notesService.getNote,
          getItemFiles: notesService.getNoteFiles,
          toggleArchive: notesService.toggleArchive,
          deleteItem: notesService.deleteNote,
        },
        itemToContentProps: (note: any, files) => ({
          title: note.title || 'Untitled',
          content: note.content || '',
          tags: note.tags || [],
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          isArchived: note.isArchived,
          projectBadges: note.projects || [],
          files,
          module: 'notes',
          entityId: note.uuid,
          showProjects: true,
          showDiaryFields: false,
          enableDragDrop: false,
          onFilesUpdate: () => {},
        }),
        editPath: (noteId: string) => `/notes/edit/${noteId}`,
        listPath: '/notes',
        module: 'notes',
        itemTypeName: 'Note',
      }}
    />
  );
}