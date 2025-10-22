import { apiService } from './api';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';
import { 
  Todo, 
  TodoCreate, 
  TodoUpdate, 
  TodoSummary, 
  TodoStats, 
  TodoListParams,
  ChecklistItem 
} from '../types/todo';
import { ProjectBadge } from '../types/project';
import { TodoStatus, TaskPriority, TodoType } from '../types/enums';

// Re-export types from centralized location
export type { TodoCreate, TodoUpdate, TodoSummary, TodoStats, TodoListParams, ChecklistItem };

// Legacy interfaces for backward compatibility - will be removed
export interface LegacyProject {
  uuid: string;
  name: string;
  description?: string;
  // color field removed - backend removed for professional management
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  todo_count: number;
  completed_count: number;
  status?: string;
  start_date?: string;
  end_date?: string;
  progress_percentage?: number;
}

export interface LegacyProjectCreate {
  name: string;
  description?: string;
  // color field removed - backend removed for professional management
}

export interface LegacyProjectUpdate {
  name?: string;
  description?: string;
  // color field removed - backend removed for professional management
  is_archived?: boolean;
}

class TodosService {
  private baseUrl = '/todos';

  // Project methods (legacy - will be moved to projectsService)
  async createProject(projectData: LegacyProjectCreate): Promise<LegacyProject> {
    const response = await apiService.post<LegacyProject>(`${this.baseUrl}/projects`, projectData);
    return response.data;
  }

  async getProjects(archived: boolean = false): Promise<LegacyProject[]> {
    const url = `${this.baseUrl}/projects?archived=${archived}`;
    const response = await apiService.get<LegacyProject[]>(url);
    return response.data;
  }

  async getProject(projectUuid: string): Promise<LegacyProject> {
    const response = await apiService.get<LegacyProject>(`${this.baseUrl}/projects/${projectUuid}`);
    return response.data;
  }

  async updateProject(projectUuid: string, projectData: LegacyProjectUpdate): Promise<LegacyProject> {
    const response = await apiService.put<LegacyProject>(`${this.baseUrl}/projects/${projectUuid}`, projectData);
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
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });
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
    const response = await apiService.patch<Todo>(`${this.baseUrl}/${todoUuid}/status?status=${status}`);
    return response.data;
  }

  async reorderTodo(todoUuid: string, orderIndex: number): Promise<Todo> {
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
  getStatusColor
} = todosService; 

// Subtask management functions
export const createSubtask = async (parentUuid: string, subtaskData: Omit<TodoCreate, 'parent_id'>): Promise<Todo> => {
  const response = await apiService.post(`/todos/${parentUuid}/subtasks`, {
    ...subtaskData
  });
  return response.data as Todo;
};

export const getSubtasks = async (parentUuid: string): Promise<Todo[]> => {
  const response = await apiService.get(`/todos/${parentUuid}/subtasks`);
  return response.data as Todo[];
};

export const moveSubtask = async (subtaskUuid: string, newParentUuid: string | null): Promise<Todo> => {
  const response = await apiService.patch(`/todos/${subtaskUuid}/move`, {
    parent_uuid: newParentUuid
  });
  return response.data as Todo;
};

export const reorderSubtasks = async (parentUuid: string, subtaskUuids: string[]): Promise<void> => {
  await apiService.patch(`/todos/${parentUuid}/subtasks/reorder`, {
    subtask_uuids: subtaskUuids
  });
}; 