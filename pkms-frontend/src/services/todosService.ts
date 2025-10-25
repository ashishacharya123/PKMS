import { apiService } from './api';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';
import { 
  Todo, 
  CreateTodoRequest as TodoCreate, 
  UpdateTodoRequest as TodoUpdate, 
  TodoSummary, 
  TodoStats, 
  TodoListParams,
  BlockingTodoSummary
} from '../types/todo';
import { ChecklistItem } from '../types/common';
import { ProjectBadge } from '../types/project';
import { TodoStatus, TaskPriority, TodoType } from '../types/enums';

// Re-export types from centralized location
export type { TodoCreate, TodoUpdate, TodoSummary, TodoStats, TodoListParams, ChecklistItem };

// Project interfaces for todo management - JSON payloads use camelCase, URL query parameters use snake_case
export interface Project {
  uuid: string;
  name: string;
  description?: string;
  // color field removed - backend removed for professional management
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  todoCount: number;
  completedCount: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  progressPercentage?: number;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  // color field removed - backend removed for professional management
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  // color field removed - backend removed for professional management
  isArchived?: boolean;
}

class TodosService {
  private baseUrl = '/todos';

  // Project methods (legacy - will be moved to projectsService)
  async createProject(projectData: ProjectCreate): Promise<Project> {
    const response = await apiService.post<Project>(`${this.baseUrl}/projects`, projectData);
    return response.data;
  }

  async getProjects(archived: boolean = false): Promise<Project[]> {
    // URL query parameter - remains snake_case
    const url = `${this.baseUrl}/projects?archived=${archived}`;
    const response = await apiService.get<Project[]>(url);
    return response.data;
  }

  async getProject(projectUuid: string): Promise<Project> {
    const response = await apiService.get<Project>(`${this.baseUrl}/projects/${projectUuid}`);
    return response.data;
  }

  async updateProject(projectUuid: string, projectData: ProjectUpdate): Promise<Project> {
    const response = await apiService.put<Project>(`${this.baseUrl}/projects/${projectUuid}`, projectData);
    return response.data;
  }

  async deleteProject(projectUuid: string): Promise<void> {
    await apiService.delete(`${this.baseUrl}/projects/${projectUuid}`);
  }

  // Todo methods
  async createTodo(todoData: TodoCreate): Promise<Todo> {
    const response = await apiService.post<Todo>(`${this.baseUrl}/`, todoData);
    return response.data;
  }

  async getTodos(params: TodoListParams = {}): Promise<TodoSummary[]> {
    // URL parameters must use snake_case (not converted by CamelCaseModel)
    const queryParams = new URLSearchParams();
    
    // Convert camelCase to snake_case for URL parameters
    if (params.status !== undefined) queryParams.append('status', params.status);
    if (params.priority !== undefined) queryParams.append('priority', params.priority);
    if (params.projectId !== undefined) queryParams.append('project_id', params.projectId);
    if (params.projectIds !== undefined) queryParams.append('project_ids', params.projectIds.join(','));
    if (params.isArchived !== undefined) queryParams.append('is_archived', String(params.isArchived));
    if (params.isFavorite !== undefined) queryParams.append('is_favorite', String(params.isFavorite));
    if (params.startDate !== undefined) queryParams.append('start_date', params.startDate);
    if (params.endDate !== undefined) queryParams.append('end_date', params.endDate);
    if (params.search !== undefined) queryParams.append('search', params.search);
    if (params.sortBy !== undefined) queryParams.append('sort_by', params.sortBy);
    if (params.sortOrder !== undefined) queryParams.append('sort_order', params.sortOrder);
    if (params.page !== undefined) queryParams.append('page', params.page.toString());
    if (params.limit !== undefined) queryParams.append('limit', params.limit.toString());
    
    const url = `${this.baseUrl}/${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiService.get<TodoSummary[]>(url);
    return response.data;
  }

  async getTodo(todoUuid: string): Promise<Todo> {
    const response = await apiService.get<Todo>(`${this.baseUrl}/${todoUuid}`);
    return response.data;
  }

  async updateTodo(todoUuid: string, todoData: TodoUpdate): Promise<Todo> {
    const response = await apiService.put<Todo>(`${this.baseUrl}/${todoUuid}`, todoData);
    return response.data;
  }

  async completeTodo(todoUuid: string): Promise<Todo> {
    const response = await apiService.post<Todo>(`${this.baseUrl}/${todoUuid}/complete`);
    return response.data;
  }

  async updateTodoStatus(todoUuid: string, status: TodoStatus): Promise<Todo> {
    // URL query parameter - remains snake_case
    const response = await apiService.patch<Todo>(`${this.baseUrl}/${todoUuid}/status?status=${status}`);
    return response.data;
  }

  async reorderTodo(todoUuid: string, orderIndex: number): Promise<Todo> {
    // URL query parameter - remains snake_case
    const response = await apiService.patch<Todo>(`${this.baseUrl}/${todoUuid}/reorder?order_index=${orderIndex}`);
    return response.data;
  }

  async deleteTodo(todoUuid: string): Promise<void> {
    await apiService.delete(`${this.baseUrl}/${todoUuid}`);
  }
  async archiveTodo(todoUuid: string, archive: boolean = true): Promise<Todo> {
    const response = await apiService.patch<Todo>(
      `${this.baseUrl}/${todoUuid}/archive?archive=${archive}`
    );
    return response.data;
  }
  
  /* ---------------------------------------------------------------------- */
  /*                               DOWNLOADS                                */
  /* ---------------------------------------------------------------------- */
  getExportUrl(todoId: number, format: 'pdf' | 'markdown' | 'txt' = 'pdf'): string {
    return `${this.baseUrl}/${todoId}/export?format=${format}`;
  }

  async downloadTodoExport(
    todoId: number,
    format: 'pdf' | 'markdown' | 'txt' = 'pdf',
    onProgress?: (p: DownloadProgress) => void,
  ): Promise<Blob> {
    return coreDownloadService.downloadFile(this.getExportUrl(todoId, format), {
      fileId: `${todoId}-${format}`,
      onProgress,
    });
  }

  // Statistics
  async getTodoStats(): Promise<TodoStats> {
    const response = await apiService.get<TodoStats>(`${this.baseUrl}/stats/overview`);
    return response.data;
  }

  // Utility methods
  getPriorityLabel(priority: number): string {
    const labels = {
      1: 'Low',
      2: 'Medium',
      3: 'High'
    };
    return labels[priority as keyof typeof labels] || 'Unknown';
  }

  getStatusLabel(status: string): string {
    const labels = {
      pending: 'Pending',
      in_progress: 'In Progress',
      blocked: 'Blocked',
      done: 'Done',
      cancelled: 'Cancelled'
    };
    return labels[status as keyof typeof labels] || status;
  }

  getDaysUntilDue(dueDate: string): number | null {
    if (!dueDate) return null;
    
    try {
      const due = new Date(dueDate);
      if (isNaN(due.getTime())) return null;
      
      const now = new Date();
      const diffTime = due.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return diffDays;
    } catch (error) {
      console.warn('Invalid due date format:', dueDate, error);
      return null;
    }
  }

  isOverdue(dueDate: string): boolean {
    if (!dueDate) return false;
    
    try {
      const due = new Date(dueDate);
      if (isNaN(due.getTime())) return false;
      
      const now = new Date();
      return due < now;
    } catch (error) {
      console.warn('Invalid due date format:', dueDate, error);
      return false;
    }
  }

  getPriorityColor(priority: number): string {
    const colors = {
      1: '#4CAF50', // Green for low
      2: '#FF9800', // Orange for medium
      3: '#F44336'  // Red for high
    };
    return colors[priority as keyof typeof colors] || '#757575';
  }

  getStatusColor(status: string): string {
    const colors = {
      pending: '#757575',
      in_progress: '#2196F3',
      blocked: '#FF9800',
      done: '#4CAF50',
      cancelled: '#F44336'
    };
    return colors[status as keyof typeof colors] || '#757575';
  }

  // NEW: Dependency Management Methods
  
  /**
   * Add a dependency: blocker_uuid must complete before todo_uuid can proceed
   */
  async addDependency(todoUuid: string, blockerUuid: string): Promise<void> {
    await apiService.post(`${this.baseUrl}/${todoUuid}/dependencies/${blockerUuid}`);
  }

  /**
   * Remove a dependency between todos
   */
  async removeDependency(todoUuid: string, blockerUuid: string): Promise<void> {
    await apiService.delete(`${this.baseUrl}/${todoUuid}/dependencies/${blockerUuid}`);
  }

  /**
   * Get todos that this todo is blocking (others waiting on this one)
   */
  async getBlockingTodos(todoUuid: string): Promise<BlockingTodoSummary[]> {
    const response = await apiService.get(`${this.baseUrl}/${todoUuid}/blocking`);
    return (response.data as any).blocking_todos;
  }

  /**
   * Get todos that are blocking this one (this todo is waiting on these)
   */
  async getBlockedByTodos(todoUuid: string): Promise<BlockingTodoSummary[]> {
    const response = await apiService.get(`${this.baseUrl}/${todoUuid}/blocked-by`);
    return (response.data as any).blocked_by_todos;
  }
}

export const todosService = new TodosService();

// Export individual methods for convenience
export const {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
  createTodo,
  getTodos,
  getTodo,
  updateTodo,
  completeTodo,
  updateTodoStatus,
  reorderTodo,
  deleteTodo,
  archiveTodo,
  getExportUrl,
  downloadTodoExport,
  getTodoStats,
  getPriorityLabel,
  getStatusLabel,
  getDaysUntilDue,
  isOverdue,
  getPriorityColor,
  getStatusColor,
  // NEW: Dependency management methods
  addDependency,
  removeDependency,
  getBlockingTodos,
  getBlockedByTodos
} = todosService; 

// Subtask management functions
export const createSubtask = async (parentUuid: string, subtaskData: Omit<TodoCreate, 'parentUuid'>): Promise<Todo> => {
  const response = await apiService.post(`/todos`, {
    ...subtaskData,
    parentUuid: parentUuid  // camelCase for JSON body
  });
  return response.data as Todo;
};

export const getSubtasks = async (parentUuid: string): Promise<Todo[]> => {
  // Backend should support parent_uuid filter parameter
  const response = await apiService.get(`/todos?parent_uuid=${encodeURIComponent(parentUuid)}`);
  return response.data as Todo[];
};

export const moveSubtask = async (subtaskUuid: string, newParentUuid: string | null): Promise<Todo> => {
  // JSON payload - uses camelCase
  const response = await apiService.put(`/todos/${subtaskUuid}`, {
    parentUuid: newParentUuid
  });
  return response.data as Todo;
};

export const reorderSubtasks = async (parentUuid: string, subtaskUuids: string[]): Promise<void> => {
  // Backend endpoint: PATCH /todos/{parentUuid}/subtasks/reorder
  // Uses todos.order_index field for subtask ordering
  // JSON payload - uses camelCase
  await apiService.patch(`/todos/${parentUuid}/subtasks/reorder`, {
    subtask_uuids: subtaskUuids
  });
}; 