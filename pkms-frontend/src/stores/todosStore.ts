import { create } from 'zustand';
import { 
  todosService, 
  type Todo, 
  type TodoSummary, 
  type Project, 
  type TodoCreate, 
  type TodoUpdate, 
  type ProjectCreate, 
  type ProjectUpdate, 
  type TodoStats,
  type TodoListParams 
} from '../services/todosService';

interface TodosState {
  // Data
  todos: TodoSummary[];
  currentTodo: Todo | null;
  projects: Project[];
  currentProject: Project | null;
  stats: TodoStats | null;
  
  // UI State
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  error: string | null;
  
  // Filters
  currentStatus: string | null;
  currentPriority: number | null;
  currentProjectId: number | null;
  currentTag: string | null;
  searchQuery: string;
  showOverdue: boolean;
  
  // Pagination
  limit: number;
  offset: number;
  hasMore: boolean;
  
  // Actions - Todos
  loadTodos: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadTodo: (id: number) => Promise<void>;
  createTodo: (data: TodoCreate) => Promise<Todo | null>;
  updateTodo: (id: number, data: TodoUpdate) => Promise<Todo | null>;
  completeTodo: (id: number) => Promise<Todo | null>;
  deleteTodo: (id: number) => Promise<boolean>;
  
  // Actions - Projects
  loadProjects: () => Promise<void>;
  loadProject: (id: number) => Promise<void>;
  createProject: (data: ProjectCreate) => Promise<Project | null>;
  updateProject: (id: number, data: ProjectUpdate) => Promise<Project | null>;
  deleteProject: (id: number) => Promise<boolean>;
  
  // Actions - Stats
  loadStats: () => Promise<void>;
  
  // Filters
  setStatus: (status: string | null) => void;
  setPriority: (priority: number | null) => void;
  setProjectFilter: (projectId: number | null) => void;
  setTag: (tag: string | null) => void;
  setSearch: (query: string) => void;
  setShowOverdue: (show: boolean) => void;
  
  // UI Actions
  clearError: () => void;
  clearCurrentTodo: () => void;
  clearCurrentProject: () => void;
  reset: () => void;
}

export const useTodosStore = create<TodosState>((set, get) => ({
  // Initial state
  todos: [],
  currentTodo: null,
  projects: [],
  currentProject: null,
  stats: null,
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  error: null,
  currentStatus: null,
  currentPriority: null,
  currentProjectId: null,
  currentTag: null,
  searchQuery: '',
  showOverdue: false,
  limit: 20,
  offset: 0,
  hasMore: true,
  
  // Todo Actions
  loadTodos: async () => {
    const state = get();
    set({ isLoading: true, error: null, offset: 0 });
    
    try {
      const params: TodoListParams = {
        status: state.currentStatus || undefined,
        priority: state.currentPriority || undefined,
        project_id: state.currentProjectId || undefined,
        tag: state.currentTag || undefined,
        search: state.searchQuery || undefined,
        overdue: state.showOverdue || undefined,
        limit: state.limit,
        offset: 0
      };
      
      const todos = await todosService.getTodos(params);
      
      set({ 
        todos, 
        isLoading: false, 
        hasMore: todos.length === state.limit,
        offset: todos.length 
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load todos', 
        isLoading: false 
      });
    }
  },
  
  loadMore: async () => {
    const state = get();
    if (state.isLoading || !state.hasMore) return;
    
    set({ isLoading: true, error: null });
    
    try {
      const params: TodoListParams = {
        status: state.currentStatus || undefined,
        priority: state.currentPriority || undefined,
        project_id: state.currentProjectId || undefined,
        tag: state.currentTag || undefined,
        search: state.searchQuery || undefined,
        overdue: state.showOverdue || undefined,
        limit: state.limit,
        offset: state.offset
      };
      
      const newTodos = await todosService.getTodos(params);
      
      set({ 
        todos: [...state.todos, ...newTodos],
        isLoading: false,
        hasMore: newTodos.length === state.limit,
        offset: state.offset + newTodos.length
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load more todos', 
        isLoading: false 
      });
    }
  },
  
  loadTodo: async (id: number) => {
    set({ isLoading: true, error: null });
    
    try {
      const todo = await todosService.getTodo(id);
      set({ currentTodo: todo, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load todo', 
        isLoading: false 
      });
    }
  },
  
  createTodo: async (data: TodoCreate) => {
    set({ isCreating: true, error: null });
    
    try {
      const todo = await todosService.createTodo(data);
      
      // Convert Todo to TodoSummary for the list
      const todoSummary: TodoSummary = {
        id: todo.id,
        title: todo.title,
        project_name: todo.project_name,
        due_date: todo.due_date,
        priority: todo.priority,
        status: todo.status,
        created_at: todo.created_at,
        tags: todo.tags,
        days_until_due: todo.days_until_due
      };
      
      // Add to todos list if it matches current filters
      const state = get();
      const shouldAdd = (!state.currentStatus || todo.status === state.currentStatus) &&
                       (!state.currentPriority || todo.priority === state.currentPriority) &&
                       (!state.currentProjectId || todo.project_id === state.currentProjectId) &&
                       (!state.currentTag || todo.tags.includes(state.currentTag)) &&
                       (!state.searchQuery || todo.title.toLowerCase().includes(state.searchQuery.toLowerCase()));
      
      if (shouldAdd) {
        set({ 
          todos: [todoSummary, ...state.todos],
          isCreating: false 
        });
      } else {
        set({ isCreating: false });
      }
      
      // Reload stats to reflect new todo
      get().loadStats();
      
      return todo;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to create todo', 
        isCreating: false 
      });
      return null;
    }
  },
  
  updateTodo: async (id: number, data: TodoUpdate) => {
    set({ isUpdating: true, error: null });
    
    try {
      const updatedTodo = await todosService.updateTodo(id, data);
      
      // Convert Todo to TodoSummary for the list
      const todoSummary: TodoSummary = {
        id: updatedTodo.id,
        title: updatedTodo.title,
        project_name: updatedTodo.project_name,
        due_date: updatedTodo.due_date,
        priority: updatedTodo.priority,
        status: updatedTodo.status,
        created_at: updatedTodo.created_at,
        tags: updatedTodo.tags,
        days_until_due: updatedTodo.days_until_due
      };
      
      // Update in todos list
      set(state => ({
        todos: state.todos.map(todo => 
          todo.id === id ? todoSummary : todo
        ),
        currentTodo: state.currentTodo?.id === id ? updatedTodo : state.currentTodo,
        isUpdating: false
      }));
      
      // Reload stats to reflect updated todo
      get().loadStats();
      
      return updatedTodo;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update todo', 
        isUpdating: false 
      });
      return null;
    }
  },
  
  completeTodo: async (id: number) => {
    set({ isUpdating: true, error: null });
    
    try {
      const completedTodo = await todosService.completeTodo(id);
      
      // Convert Todo to TodoSummary for the list
      const todoSummary: TodoSummary = {
        id: completedTodo.id,
        title: completedTodo.title,
        project_name: completedTodo.project_name,
        due_date: completedTodo.due_date,
        priority: completedTodo.priority,
        status: completedTodo.status,
        created_at: completedTodo.created_at,
        tags: completedTodo.tags,
        days_until_due: completedTodo.days_until_due
      };
      
      // Update in todos list
      set(state => ({
        todos: state.todos.map(todo => 
          todo.id === id ? todoSummary : todo
        ),
        currentTodo: state.currentTodo?.id === id ? completedTodo : state.currentTodo,
        isUpdating: false
      }));
      
      // Reload stats to reflect completed todo
      get().loadStats();
      
      return completedTodo;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to complete todo', 
        isUpdating: false 
      });
      return null;
    }
  },
  
  deleteTodo: async (id: number) => {
    set({ error: null });
    
    try {
      await todosService.deleteTodo(id);
      
      // Remove from todos list
      set(state => ({
        todos: state.todos.filter(todo => todo.id !== id),
        currentTodo: state.currentTodo?.id === id ? null : state.currentTodo
      }));
      
      // Reload stats to reflect deleted todo
      get().loadStats();
      
      return true;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete todo'
      });
      return false;
    }
  },
  
  // Project Actions
  loadProjects: async () => {
    set({ isLoading: true, error: null });
    
    try {
      const projects = await todosService.getProjects();
      set({ projects, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load projects', 
        isLoading: false 
      });
    }
  },
  
  loadProject: async (id: number) => {
    set({ isLoading: true, error: null });
    
    try {
      const project = await todosService.getProject(id);
      set({ currentProject: project, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load project', 
        isLoading: false 
      });
    }
  },
  
  createProject: async (data: ProjectCreate) => {
    set({ isCreating: true, error: null });
    
    try {
      const project = await todosService.createProject(data);
      
      // Add to projects list
      set(state => ({ 
        projects: [project, ...state.projects],
        isCreating: false 
      }));
      
      return project;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to create project', 
        isCreating: false 
      });
      return null;
    }
  },
  
  updateProject: async (id: number, data: ProjectUpdate) => {
    set({ isUpdating: true, error: null });
    
    try {
      const updatedProject = await todosService.updateProject(id, data);
      
      // Update in projects list
      set(state => ({
        projects: state.projects.map(project => 
          project.id === id ? updatedProject : project
        ),
        currentProject: state.currentProject?.id === id ? updatedProject : state.currentProject,
        isUpdating: false
      }));
      
      return updatedProject;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update project', 
        isUpdating: false 
      });
      return null;
    }
  },
  
  deleteProject: async (id: number) => {
    set({ error: null });
    
    try {
      await todosService.deleteProject(id);
      
      // Remove from projects list
      set(state => ({
        projects: state.projects.filter(project => project.id !== id),
        currentProject: state.currentProject?.id === id ? null : state.currentProject
      }));
      
      // If this was the current project filter, clear it
      const state = get();
      if (state.currentProjectId === id) {
        set({ currentProjectId: null });
        get().loadTodos();
      }
      
      return true;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete project'
      });
      return false;
    }
  },
  
  // Stats Actions
  loadStats: async () => {
    try {
      const stats = await todosService.getTodoStats();
      set({ stats });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load stats'
      });
    }
  },
  
  // Filter actions
  setStatus: (status: string | null) => {
    set({ currentStatus: status });
    get().loadTodos();
  },
  
  setPriority: (priority: number | null) => {
    set({ currentPriority: priority });
    get().loadTodos();
  },
  
  setProjectFilter: (projectId: number | null) => {
    set({ currentProjectId: projectId });
    get().loadTodos();
  },
  
  setTag: (tag: string | null) => {
    set({ currentTag: tag });
    get().loadTodos();
  },
  
  setSearch: (query: string) => {
    set({ searchQuery: query });
    // Debounce search in the component, not here
  },
  
  setShowOverdue: (show: boolean) => {
    set({ showOverdue: show });
    get().loadTodos();
  },
  
  // UI actions
  clearError: () => set({ error: null }),
  
  clearCurrentTodo: () => set({ currentTodo: null }),
  
  clearCurrentProject: () => set({ currentProject: null }),
  
  reset: () => set({
    todos: [],
    currentTodo: null,
    projects: [],
    currentProject: null,
    stats: null,
    isLoading: false,
    isCreating: false,
    isUpdating: false,
    error: null,
    currentStatus: null,
    currentPriority: null,
    currentProjectId: null,
    currentTag: null,
    searchQuery: '',
    showOverdue: false,
    offset: 0,
    hasMore: true
  })
})); 