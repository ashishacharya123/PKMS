/**
 * TodoViewPage - Simplified todo viewing using ContentViewer
 * 
 * PURPOSE:
 * ========
 * Provides todo viewing functionality using the unified content viewer architecture.
 * Displays todos with all metadata, projects, subtasks, and dependencies.
 * 
 * ARCHITECTURE:
 * =============
 * - Uses ContentViewer for all viewing operations
 * - Displays projects, tags, subtasks, and dependencies
 * - Handles archive/unarchive operations
 * - Integrates with todos service
 * 
 * @author AI Agent: Composer
 * @date 2025-01-15
 */

import { useNavigate, useParams } from 'react-router-dom';
import { ContentViewerPage } from '../components/common/ContentViewerPage';
import { todosService } from '../services/todosService';

export default function TodoViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return null;

  return (
    <ContentViewerPage
      id={id}
      config={{
        service: {
          getItem: todosService.getTodo,
          getItemFiles: async () => [], // Todos don't have files
          toggleArchive: async (todoId: string, isArchived: boolean) => {
            return await todosService.archiveTodo(todoId, isArchived);
          },
          deleteItem: todosService.deleteTodo,
        },
        itemToContentProps: (todo: any) => ({
          title: todo.title || 'Untitled Todo',
          content: todo.description || '',
          tags: todo.tags || [],
          createdAt: todo.createdAt,
          updatedAt: todo.updatedAt,
          isArchived: todo.isArchived,
          projectBadges: todo.projects || [],
          files: [], // Todos don't have files
          module: 'todos',
          entityId: todo.uuid,
          showProjects: true,
          showDiaryFields: false,
          enableDragDrop: false,
          onFilesUpdate: () => {}
        }),
        editPath: (todoId: string) => `/todos`, // Navigate back to todos page, edit modal can be opened from there
        listPath: '/todos',
        module: 'todos',
        itemTypeName: 'Todo',
      }}
    />
  );
}

