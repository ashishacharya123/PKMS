/**
 * TodosStore Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTodosStore } from '../todosStore';
import { mockTodo, mockProject } from '../../test/testUtils';
import { TodoStatus, TaskPriority } from '../../types/todo';

// Mock the todosService
vi.mock('../../services/todosService', () => ({
  todosService: {
    getAll: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    updateTodoStatus: vi.fn(),
    archiveTodo: vi.fn(),
    unarchiveTodo: vi.fn(),
    completeTodo: vi.fn()
  }
}));

describe('todosStore', () => {
  beforeEach(() => {
    // Reset store state
    useTodosStore.setState({
      todos: [],
      projects: [],
      isLoading: false,
      error: null,
      currentTodo: null,
      currentProject: null
    });
  });

  describe('loadTodos', () => {
    it('loads todos successfully', async () => {
      const mockTodos = [mockTodo];
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.getAll).mockResolvedValue(mockTodos);

      const { result } = renderHook(() => useTodosStore());

      await act(async () => {
        await result.current.loadTodos();
      });

      expect(result.current.todos).toEqual(mockTodos);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('handles loading error', async () => {
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.getAll).mockRejectedValue(new Error('Failed to load'));

      const { result } = renderHook(() => useTodosStore());

      await act(async () => {
        await result.current.loadTodos();
      });

      expect(result.current.todos).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('Failed to load');
    });
  });

  describe('loadProjects', () => {
    it('loads projects successfully', async () => {
      const mockProjects = [mockProject];
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.getProjects).mockResolvedValue(mockProjects);

      const { result } = renderHook(() => useTodosStore());

      await act(async () => {
        await result.current.loadProjects();
      });

      expect(result.current.projects).toEqual(mockProjects);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('createTodo', () => {
    it('creates todo successfully', async () => {
      const newTodo = { ...mockTodo, title: 'New Todo' };
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.create).mockResolvedValue(newTodo);

      const { result } = renderHook(() => useTodosStore());

      // Set initial todos
      act(() => {
        useTodosStore.setState({ todos: [mockTodo] });
      });

      let createdTodo;
      await act(async () => {
        createdTodo = await result.current.createTodo({
          title: 'New Todo',
          description: 'New description',
          status: TodoStatus.PENDING,
          priority: TaskPriority.MEDIUM
        });
      });

      expect(createdTodo).toEqual(newTodo);
      expect(result.current.todos).toHaveLength(2);
      expect(result.current.todos[1]).toEqual(newTodo);
    });

    it('handles creation error', async () => {
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.create).mockRejectedValue(new Error('Creation failed'));

      const { result } = renderHook(() => useTodosStore());

      let createdTodo;
      await act(async () => {
        createdTodo = await result.current.createTodo({
          title: 'New Todo',
          description: 'New description',
          status: TodoStatus.PENDING,
          priority: TaskPriority.MEDIUM
        });
      });

      expect(createdTodo).toBe(null);
      expect(result.current.error).toBe('Creation failed');
    });
  });

  describe('updateTodo', () => {
    it('updates todo successfully', async () => {
      const updatedTodo = { ...mockTodo, title: 'Updated Todo' };
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.update).mockResolvedValue(updatedTodo);

      const { result } = renderHook(() => useTodosStore());

      // Set initial todos
      act(() => {
        useTodosStore.setState({ todos: [mockTodo] });
      });

      let updated;
      await act(async () => {
        updated = await result.current.updateTodo(mockTodo.uuid, {
          title: 'Updated Todo'
        });
      });

      expect(updated).toEqual(updatedTodo);
      expect(result.current.todos[0]).toEqual(updatedTodo);
    });

    it('handles update error', async () => {
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.update).mockRejectedValue(new Error('Update failed'));

      const { result } = renderHook(() => useTodosStore());

      let updated;
      await act(async () => {
        updated = await result.current.updateTodo(mockTodo.uuid, {
          title: 'Updated Todo'
        });
      });

      expect(updated).toBe(null);
      expect(result.current.error).toBe('Update failed');
    });
  });

  describe('deleteTodo', () => {
    it('deletes todo successfully', async () => {
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.delete).mockResolvedValue(undefined);

      const { result } = renderHook(() => useTodosStore());

      // Set initial todos
      act(() => {
        useTodosStore.setState({ todos: [mockTodo] });
      });

      let deleted;
      await act(async () => {
        deleted = await result.current.deleteTodo(mockTodo.uuid);
      });

      expect(deleted).toBe(true);
      expect(result.current.todos).toHaveLength(0);
    });

    it('handles delete error', async () => {
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.delete).mockRejectedValue(new Error('Delete failed'));

      const { result } = renderHook(() => useTodosStore());

      let deleted;
      await act(async () => {
        deleted = await result.current.deleteTodo(mockTodo.uuid);
      });

      expect(deleted).toBe(false);
      expect(result.current.error).toBe('Delete failed');
    });
  });

  describe('completeTodo', () => {
    it('completes todo successfully', async () => {
      const completedTodo = { ...mockTodo, status: TodoStatus.DONE };
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.completeTodo).mockResolvedValue(completedTodo);

      const { result } = renderHook(() => useTodosStore());

      // Set initial todos
      act(() => {
        useTodosStore.setState({ todos: [mockTodo] });
      });

      let completed;
      await act(async () => {
        completed = await result.current.completeTodo(mockTodo.uuid);
      });

      expect(completed).toEqual(completedTodo);
      expect(result.current.todos[0].status).toBe(TodoStatus.DONE);
    });
  });

  describe('archiveTodo', () => {
    it('archives todo successfully', async () => {
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.archiveTodo).mockResolvedValue(undefined);

      const { result } = renderHook(() => useTodosStore());

      await act(async () => {
        await result.current.archiveTodo(mockTodo.uuid);
      });

      expect(todosService.archiveTodo).toHaveBeenCalledWith(mockTodo.uuid);
    });
  });

  describe('unarchiveTodo', () => {
    it('unarchives todo successfully', async () => {
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.unarchiveTodo).mockResolvedValue(undefined);

      const { result } = renderHook(() => useTodosStore());

      await act(async () => {
        await result.current.unarchiveTodo(mockTodo.uuid);
      });

      expect(todosService.unarchiveTodo).toHaveBeenCalledWith(mockTodo.uuid);
    });
  });

  describe('createProject', () => {
    it('creates project successfully', async () => {
      const newProject = { ...mockProject, name: 'New Project' };
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.createProject).mockResolvedValue(newProject);

      const { result } = renderHook(() => useTodosStore());

      // Set initial projects
      act(() => {
        useTodosStore.setState({ projects: [mockProject] });
      });

      let created;
      await act(async () => {
        created = await result.current.createProject({
          name: 'New Project',
          description: 'New project description',
          status: 'is_running' as any,
          priority: TaskPriority.MEDIUM
        });
      });

      expect(created).toEqual(newProject);
      expect(result.current.projects).toHaveLength(2);
      expect(result.current.projects[1]).toEqual(newProject);
    });
  });

  describe('state management', () => {
    it('sets loading state correctly', () => {
      const { result } = renderHook(() => useTodosStore());

      act(() => {
        useTodosStore.setState({ isLoading: true });
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('sets error state correctly', () => {
      const { result } = renderHook(() => useTodosStore());

      act(() => {
        useTodosStore.setState({ error: 'Test error' });
      });

      expect(result.current.error).toBe('Test error');
    });

    it('clears error when loading starts', async () => {
      const { result } = renderHook(() => useTodosStore());

      // Set error first
      act(() => {
        useTodosStore.setState({ error: 'Previous error' });
      });

      expect(result.current.error).toBe('Previous error');

      // Start loading
      const { todosService } = await import('../../services/todosService');
      vi.mocked(todosService.getAll).mockImplementation(() => {
        // Check that error is cleared when loading starts
        expect(useTodosStore.getState().error).toBe(null);
        return Promise.resolve([]);
      });

      await act(async () => {
        await result.current.loadTodos();
      });

      expect(result.current.error).toBe(null);
    });
  });
});
