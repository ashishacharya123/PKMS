/**
 * Duplication Service - Frontend service for project and todo duplication
 * Handles API calls to backend duplication endpoints
 */

import { apiService } from './api';

export interface ProjectDuplicateRequest {
  newProjectName: string;
  description?: string;
  duplicationMode: 'shallow_link' | 'deep_copy';
  includeTodos: boolean;
  includeNotes: boolean;
  includeDocuments: boolean;
  itemRenames?: Record<string, string>;
}

export interface ProjectDuplicateResponse {
  success: boolean;
  newProjectUuid: string;
  newProjectName: string;
  itemsCopied: {
    todos: number;
    notes: number;
    documents: number;
  };
  errors: string[];
}

export interface TodoDuplicateRequest {
  newTitle?: string;
}

export interface TodoDuplicateResponse {
  success: boolean;
  newTodoUuid: string;
  newTodoTitle: string;
}

class DuplicationService {
  /**
   * Duplicate a project with advanced options
   */
  async duplicateProject(
    projectUuid: string,
    request: ProjectDuplicateRequest
  ): Promise<ProjectDuplicateResponse> {
    try {
      const response = await apiService.post<ProjectDuplicateResponse>(
        `/projects/${projectUuid}/duplicate`,
        request
      );
      return response.data;
    } catch (error) {
      console.error('Failed to duplicate project:', error);
      throw error;
    }
  }

  /**
   * Duplicate a todo
   */
  async duplicateTodo(
    todoUuid: string,
    request: TodoDuplicateRequest
  ): Promise<TodoDuplicateResponse> {
    try {
      const response = await apiService.post<TodoDuplicateResponse>(
        `/todos/${todoUuid}/duplicate`,
        request
      );
      return response.data;
    } catch (error) {
      console.error('Failed to duplicate todo:', error);
      throw error;
    }
  }

  /**
   * Get project items summary for duplication preview
   */
  async getProjectItemsSummary(projectUuid: string) {
    try {
      const response = await apiService.get(`/projects/${projectUuid}/items-summary`);
      return response.data;
    } catch (error) {
      console.error('Failed to get project items summary:', error);
      throw error;
    }
  }
}

export const duplicationService = new DuplicationService();
