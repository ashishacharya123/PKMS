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
  currentProjectId: string | null;
  currentTag: string | null;
  searchQuery: string;
  showOverdue: boolean;
  isArchivedFilter: boolean | null;
  
  // Pagination
  limit: number;
  offset: number;
  hasMore: boolean;
  
  // Actions - Todos
  loadTodos: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadTodo: (uuid: string) => Promise<void>;
  createTodo: (data: TodoCreate) => Promise<Todo | null>;
  updateTodo: (uuid: string, data: TodoUpdate) => Promise<Todo | null>;
  updateTodoWithSubtasks: (todoUuid: string, updater: (todo: TodoSummary) => TodoSummary) => void;
  completeTodo: (uuid: string) => Promise<Todo | null>;
  deleteTodo: (uuid: string) => Promise<boolean>;
  archiveTodo: (uuid: string) => Promise<void>;
  unarchiveTodo: (uuid: string) => Promise<void>;
  
  // Actions - Projects
  loadProjects: () => Promise<void>;
  loadProject: (uuid: string) => Promise<void>;
  createProject: (data: ProjectCreate) => Promise<Project | null>;
  updateProject: (uuid: string, data: ProjectUpdate) => Promise<Project | null>;
  deleteProject: (uuid: string) => Promise<boolean>;
  
  // Actions - Stats
  loadStats: () => Promise<void>;
  
  // Filters
  setStatus: (status: string | null) => void;
  setPriority: (priority: number | null) => void;
  setProjectFilter: (projectId: string | null) => void;
  setTag: (tag: string | null) => void;
  setSearch: (query: string) => void;
  setShowOverdue: (show: boolean) => void;
  setArchivedFilter: (archived: boolean | null) => void;
  
  // UI Actions
  clearError: () => void;
  clearCurrentTodo: () => void;
  clearCurrentProject: () => void;
  reset: () => void;
}

const initialState: Omit<TodosState, 'reset' | 'clearCurrentProject' | 'clearCurrentTodo' | 'clearError' | 'setShowOverdue' | 'setSearch' | 'setTag' | 'setProjectFilter' | 'setPriority' | 'setStatus' | 'loadStats' | 'deleteProject' | 'updateProject' | 'createProject' | 'loadProject' | 'loadProjects' | 'deleteTodo' | 'completeTodo' | 'updateTodo' | 'updateTodoWithSubtasks' | 'createTodo' | 'loadTodo' | 'loadMore' | 'loadTodos' | 'archiveTodo' | 'unarchiveTodo' | 'setArchivedFilter'> = {
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
  isArchivedFilter: null,
  limit: 20,
  offset: 0,
  hasMore: true,
};

export const useTodosStore = create<TodosState>((set, get) => ({
  ...initialState,

  loadTodos: async () => {
    const state = get();
    set({ isLoading: true, error: null, offset: 0 });
    
    try {
      const params: TodoListParams = {
        status: state.currentStatus || undefined,
        priority: state.currentPriority || undefined,
        project_uuid: state.currentProjectId || undefined,
        tag: state.currentTag || undefined,
        search: state.searchQuery || undefined,
        overdue: state.showOverdue || undefined,
        is_archived: state.isArchivedFilter !== null ? state.isArchivedFilter : undefined,
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
        project_uuid: state.currentProjectId || undefined,
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
  
  loadTodo: async (uuid: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const todo = await todosService.getTodo(uuid);
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
        uuid: todo.uuid,
        title: todo.title,
        project_name: todo.project_name,
        isExclusiveMode: todo.isExclusiveMode,
        due_date: todo.due_date,
        priority: todo.priority,
        status: todo.status,
        order_index: todo.order_index || 0,
        created_at: todo.created_at,
        tags: todo.tags,
        days_until_due: todo.days_until_due,
        is_archived: todo.is_archived,
        projects: todo.projects || []
      };
      
      // Add to todos list if it matches current filters
      const state = get();
      const shouldAdd = (!state.currentStatus || todo.status === state.currentStatus) &&
                       (!state.currentPriority || todo.priority === state.currentPriority) &&
                       (!state.currentProjectId || (todo.projects || []).some(pb => pb.uuid === state.currentProjectId)) &&
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
  
  updateTodo: async (uuid: string, data: TodoUpdate) => {
    set({ isUpdating: true, error: null });
    
    try {
      const updatedTodo = await todosService.updateTodo(uuid, data);
      
      // Update in todos list
      if (updatedTodo) {
        set(state => ({
          todos: state.todos.map(todo => 
            todo.uuid === updatedTodo.uuid ? { ...todo, ...updatedTodo } : todo
          ),
          currentTodo: state.currentTodo?.uuid === updatedTodo.uuid ? updatedTodo : state.currentTodo,
          isUpdating: false
        }));
      } else {
        set({ isUpdating: false });
      }
      
      return updatedTodo;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update todo', 
        isUpdating: false 
      });
      return null;
    }
  },

  // Subtask management
  updateTodoWithSubtasks: (todoUuid: string, updater: (todo: TodoSummary) => TodoSummary) => {
    set(state => ({
      todos: state.todos.map(todo => 
        todo.uuid === todoUuid ? updater(todo) : todo
      )
    }));
  },
  
  completeTodo: async (uuid: string) => {
    set({ isUpdating: true, error: null });
    
    try {
      const completedTodo = await todosService.completeTodo(uuid);
      
      // Convert Todo to TodoSummary for the list
      const todoSummary: TodoSummary = {
        id: completedTodo.id,
        uuid: completedTodo.uuid,
        title: completedTodo.title,
        project_name: completedTodo.project_name,
        isExclusiveMode: completedTodo.isExclusiveMode,
        due_date: completedTodo.due_date,
        priority: completedTodo.priority,
        status: completedTodo.status,
        order_index: completedTodo.order_index || 0,
        created_at: completedTodo.created_at,
        tags: completedTodo.tags,
        days_until_due: completedTodo.days_until_due,
        is_archived: completedTodo.is_archived,
        projects: completedTodo.projects || []
      };
      
      // Update in todos list
      set(state => ({
        todos: state.todos.map(todo => 
          todo.uuid === completedTodo?.uuid ? todoSummary : todo
        ),
        currentTodo: state.currentTodo?.uuid === completedTodo?.uuid ? completedTodo : state.currentTodo,
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
  
  deleteTodo: async (uuid: string) => {
    set({ error: null });
    
    try {
      await todosService.deleteTodo(uuid);
      
      // Remove from todos list
      set(state => ({
        todos: state.todos.filter(todo => todo.uuid !== uuid),
        currentTodo: state.currentTodo?.uuid === uuid ? null : state.currentTodo
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

  archiveTodo: async (uuid: string) => {
    set({ isUpdating: true, error: null });
    try {
      await todosService.archiveTodo(uuid, true);
      set(state => ({
        todos: state.todos.map(todo => todo.uuid === uuid ? { ...todo, is_archived: true } : todo),
        isUpdating: false
      }));
      get().loadStats();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to archive todo', isUpdating: false });
    }
  },
  unarchiveTodo: async (uuid: string) => {
    set({ isUpdating: true, error: null });
    try {
      await todosService.archiveTodo(uuid, false);
      set(state => ({
        todos: state.todos.map(todo => todo.uuid === uuid ? { ...todo, is_archived: false } : todo),
        isUpdating: false
      }));
      get().loadStats();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to unarchive todo', isUpdating: false });
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
  
  loadProject: async (uuid: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const project = await todosService.getProject(uuid);
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
  
  updateProject: async (uuid: string, data: ProjectUpdate) => {
    set({ isUpdating: true, error: null });
    
    try {
      const updatedProject = await todosService.updateProject(uuid, data);
      
      // Update in projects list
      set(state => ({
        projects: state.projects.map(project => 
          project.uuid === uuid ? updatedProject : project
        ),
        currentProject: state.currentProject?.uuid === uuid ? updatedProject : state.currentProject,
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
  
  deleteProject: async (uuid: string) => {
    set({ error: null });
    
    try {
      await todosService.deleteProject(uuid);
      
      // Find the project to get its id for the filter comparison
      const state = get();
      const project = state.projects.find(p => p.uuid === uuid);
      
      // Remove from projects list
      set(state => ({
        projects: state.projects.filter(project => project.uuid !== uuid),
        currentProject: state.currentProject?.uuid === uuid ? null : state.currentProject
      }));
      
      // If this was the current project filter, clear it
      const current = get().currentProjectId;
      if (project && current === project.uuid) {
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
  
  setProjectFilter: (projectId: string | null) => {
    const prev = get().currentProjectId;
    if (prev === projectId) return;
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

  setArchivedFilter: (archived: boolean | null) => {
    set({ isArchivedFilter: archived });
    get().loadTodos();
  },
  
  // UI actions
  clearError: () => set({ error: null }),
  
  clearCurrentTodo: () => set({ currentTodo: null }),
  
  clearCurrentProject: () => set({ currentProject: null }),
  
  reset: () => {
    set(initialState);
  }
})); 