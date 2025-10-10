import { apiService } from './api';
import { coreDownloadService, DownloadProgress } from './shared/coreDownloadService';

// Types for todos
export interface ProjectBadge {
  id: number | null;  // null if project is deleted
  name: string;
  color: string;
  isExclusive: boolean;
  isDeleted: boolean;  // True if project was deleted (using snapshot name)
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  color: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  todo_count: number;
  completed_count: number;
}

export interface ProjectCreate {
  name: string;
  description?: string;
  color?: string;
}

export interface ProjectUpdate {
  name?: string;
  description?: string;
  color?: string;
  is_archived?: boolean;
}

export interface Todo {
  id: number;
  title: string;
  description?: string;
  project_id?: number;  // Legacy single project
  project_name?: string;  // Legacy single project name
  isExclusiveMode: boolean;
  start_date?: string;
  due_date?: string;
  priority: number;
  status: string;  // Now matches backend
  order_index: number;  // New field for Kanban ordering
  parent_id?: number;  // For subtasks
  subtasks?: Todo[];  // Nested subtasks
  completed_at?: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  days_until_due?: number;
  is_archived: boolean;
  is_favorite?: boolean;
  projects: ProjectBadge[];
}

export interface TodoCreate {
  title: string;
  description?: string;
  project_id?: number;  // Legacy single project
  projectIds?: number[];  // Multi-project support
  isExclusiveMode?: boolean;
  parent_id?: number;  // For creating subtasks
  start_date?: string;
  due_date?: string;
  priority?: number;
  status?: string;  // Allow setting initial status
  order_index?: number;  // Allow setting initial order
  tags?: string[];
  is_archived?: boolean;
}

export interface TodoUpdate {
  title?: string;
  description?: string;
  project_id?: number;  // Legacy single project
  projectIds?: number[];  // Multi-project support
  isExclusiveMode?: boolean;
  parent_id?: number;  // For moving subtasks
  start_date?: string;
  due_date?: string;
  priority?: number;
  status?: string;
  order_index?: number;  // Allow updating order
  tags?: string[];
  is_archived?: boolean;
  is_favorite?: boolean;
}

export interface TodoSummary {
  id: number;
  title: string;
  project_name?: string;  // Legacy single project name
  isExclusiveMode: boolean;
  start_date?: string;
  due_date?: string;
  priority: number;
  status: string;
  order_index: number;  // New field for ordering
  parent_id?: number;  // For subtasks
  subtasks?: TodoSummary[];  // Nested subtasks
  created_at: string;
  tags: string[];
  days_until_due?: number;
  is_archived: boolean;
  is_favorite?: boolean;
  projects: ProjectBadge[];
}

export interface TodoStats {
  total: number;
  pending: number;
  in_progress: number;
  blocked: number;
  done: number;
  cancelled: number;
  overdue: number;
  due_today: number;
  due_this_week: number;
}

export interface TodoListParams {
  status?: string;
  priority?: number;
  project_id?: number;
  due_date?: string;
  overdue?: boolean;
  tag?: string;
  search?: string;
  limit?: number;
  offset?: number;
  is_archived?: boolean;
  is_favorite?: boolean;
}

class TodosService {
  private baseUrl = '/todos';

  // Project methods
  async createProject(projectData: ProjectCreate): Promise<Project> {
    const response = await apiService.post<Project>(`${this.baseUrl}/projects`, projectData);
    return response.data;
  }

  async getProjects(archived: boolean = false): Promise<Project[]> {
    const url = `${this.baseUrl}/projects?archived=${archived}`;
    const response = await apiService.get<Project[]>(url);
    return response.data;
  }

  async getProject(projectId: number): Promise<Project> {
    const response = await apiService.get<Project>(`${this.baseUrl}/projects/${projectId}`);
    return response.data;
  }

  async updateProject(projectId: number, projectData: ProjectUpdate): Promise<Project> {
    const response = await apiService.put<Project>(`${this.baseUrl}/projects/${projectId}`, projectData);
    return response.data;
  }

  async deleteProject(projectId: number): Promise<void> {
    await apiService.delete(`${this.baseUrl}/projects/${projectId}`);
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

  async getTodo(todoId: number): Promise<Todo> {
    const response = await apiService.get<Todo>(`${this.baseUrl}/${todoId}`);
    return response.data;
  }

  async updateTodo(todoId: number, todoData: TodoUpdate): Promise<Todo> {
    const response = await apiService.put<Todo>(`${this.baseUrl}/${todoId}`, todoData);
    return response.data;
  }

  async completeTodo(todoId: number): Promise<Todo> {
    const response = await apiService.post<Todo>(`${this.baseUrl}/${todoId}/complete`);
    return response.data;
  }

  async updateTodoStatus(todoId: number, status: string): Promise<Todo> {
    const response = await apiService.patch<Todo>(`${this.baseUrl}/${todoId}/status?status=${status}`);
    return response.data;
  }

  async reorderTodo(todoId: number, orderIndex: number): Promise<Todo> {
    const response = await apiService.patch<Todo>(`${this.baseUrl}/${todoId}/reorder?order_index=${orderIndex}`);
    return response.data;
  }

  async deleteTodo(todoId: number): Promise<void> {
    await apiService.delete(`${this.baseUrl}/${todoId}`);
  }

  async archiveTodo(todoId: number, archive: boolean = true): Promise<Todo> {
    const response = await apiService.patch<Todo>(`${this.baseUrl}/${todoId}/archive?archive=${archive}`);
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
export const createSubtask = async (parentId: number, subtaskData: Omit<TodoCreate, 'parent_id'>): Promise<Todo> => {
  const response = await apiService.post(`/todos/${parentId}/subtasks`, {
    ...subtaskData,
    parent_id: parentId
  });
  return response.data as Todo;
};

export const getSubtasks = async (parentId: number): Promise<Todo[]> => {
  const response = await apiService.get(`/todos/${parentId}/subtasks`);
  return response.data as Todo[];
};

export const moveSubtask = async (subtaskId: number, newParentId: number | null): Promise<Todo> => {
  const response = await apiService.patch(`/todos/${subtaskId}/move`, {
    parent_id: newParentId
  });
  return response.data as Todo;
};

export const reorderSubtasks = async (parentId: number, subtaskIds: number[]): Promise<void> => {
  await apiService.patch(`/todos/${parentId}/subtasks/reorder`, {
    subtask_ids: subtaskIds
  });
}; 