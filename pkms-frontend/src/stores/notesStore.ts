import { create } from 'zustand';
import { notesService, type Note, type NoteSummary, type CreateNoteRequest, type UpdateNoteRequest, type Area } from '../services/notesService';

interface NotesState {
  // Data
  notes: NoteSummary[];
  currentNote: Note | null;
  areas: Area[];
  
  // UI State
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  error: string | null;
  
  // Filters
  currentArea: string | null;
  currentTag: string | null;
  searchQuery: string;
  showArchived: boolean;
  
  // Pagination
  limit: number;
  offset: number;
  hasMore: boolean;
  
  // Actions
  loadNotes: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadNote: (id: number) => Promise<void>;
  createNote: (data: CreateNoteRequest) => Promise<Note | null>;
  updateNote: (id: number, data: UpdateNoteRequest) => Promise<Note | null>;
  deleteNote: (id: number) => Promise<boolean>;
  loadAreas: () => Promise<void>;
  
  // Filters
  setArea: (area: string | null) => void;
  setTag: (tag: string | null) => void;
  setSearch: (query: string) => void;
  setShowArchived: (show: boolean) => void;
  
  // UI Actions
  clearError: () => void;
  clearCurrentNote: () => void;
  reset: () => void;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  // Initial state
  notes: [],
  currentNote: null,
  areas: [],
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  error: null,
  currentArea: null,
  currentTag: null,
  searchQuery: '',
  showArchived: false,
  limit: 20,
  offset: 0,
  hasMore: true,
  
  // Actions
  loadNotes: async () => {
    const state = get();
    set({ isLoading: true, error: null, offset: 0 });
    
    try {
      const notes = await notesService.listNotes({
        area: state.currentArea || undefined,
        tag: state.currentTag || undefined,
        search: state.searchQuery || undefined,
        archived: state.showArchived,
        limit: state.limit,
        offset: 0
      });
      
      set({ 
        notes, 
        isLoading: false, 
        hasMore: notes.length === state.limit,
        offset: notes.length 
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load notes', 
        isLoading: false 
      });
    }
  },
  
  loadMore: async () => {
    const state = get();
    if (state.isLoading || !state.hasMore) return;
    
    set({ isLoading: true, error: null });
    
    try {
      const newNotes = await notesService.listNotes({
        area: state.currentArea || undefined,
        tag: state.currentTag || undefined,
        search: state.searchQuery || undefined,
        archived: state.showArchived,
        limit: state.limit,
        offset: state.offset
      });
      
      set({ 
        notes: [...state.notes, ...newNotes],
        isLoading: false,
        hasMore: newNotes.length === state.limit,
        offset: state.offset + newNotes.length
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load more notes', 
        isLoading: false 
      });
    }
  },
  
  loadNote: async (id: number) => {
    set({ isLoading: true, error: null });
    
    try {
      const note = await notesService.getNote(id);
      set({ currentNote: note, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load note', 
        isLoading: false 
      });
    }
  },
  
  createNote: async (data: CreateNoteRequest) => {
    set({ isCreating: true, error: null });
    
    try {
      const note = await notesService.createNote(data);
      
      // Convert Note to NoteSummary for the list
      const noteSummary: NoteSummary = {
        id: note.id,
        title: note.title,
        area: note.area,
        year: note.year,
        is_archived: note.is_archived,
        created_at: note.created_at,
        updated_at: note.updated_at,
        tags: note.tags,
        preview: note.content.substring(0, 200) + (note.content.length > 200 ? '...' : '')
      };
      
      // Add to notes list if it matches current filters
      const state = get();
      const shouldAdd = (!state.currentArea || note.area === state.currentArea) &&
                       (!state.currentTag || note.tags.includes(state.currentTag)) &&
                       (!state.searchQuery || note.title.toLowerCase().includes(state.searchQuery.toLowerCase()));
      
      if (shouldAdd) {
        set({ 
          notes: [noteSummary, ...state.notes],
          isCreating: false 
        });
      } else {
        set({ isCreating: false });
      }
      
      return note;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to create note', 
        isCreating: false 
      });
      return null;
    }
  },
  
  updateNote: async (id: number, data: UpdateNoteRequest) => {
    set({ isUpdating: true, error: null });
    
    try {
      const updatedNote = await notesService.updateNote(id, data);
      
      // Convert Note to NoteSummary for the list
      const noteSummary: NoteSummary = {
        id: updatedNote.id,
        title: updatedNote.title,
        area: updatedNote.area,
        year: updatedNote.year,
        is_archived: updatedNote.is_archived,
        created_at: updatedNote.created_at,
        updated_at: updatedNote.updated_at,
        tags: updatedNote.tags,
        preview: updatedNote.content.substring(0, 200) + (updatedNote.content.length > 200 ? '...' : '')
      };
      
      // Update in notes list
      set(state => ({
        notes: state.notes.map(note => 
          note.id === id ? noteSummary : note
        ),
        currentNote: state.currentNote?.id === id ? updatedNote : state.currentNote,
        isUpdating: false
      }));
      
      return updatedNote;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update note', 
        isUpdating: false 
      });
      return null;
    }
  },
  
  deleteNote: async (id: number) => {
    set({ error: null });
    
    try {
      await notesService.deleteNote(id);
      
      // Remove from notes list
      set(state => ({
        notes: state.notes.filter(note => note.id !== id),
        currentNote: state.currentNote?.id === id ? null : state.currentNote
      }));
      
      return true;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete note'
      });
      return false;
    }
  },
  
  loadAreas: async () => {
    try {
      const response = await notesService.getAreas();
      set({ areas: response.areas });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load areas'
      });
    }
  },
  
  // Filter actions
  setArea: (area: string | null) => {
    set({ currentArea: area });
    get().loadNotes();
  },
  
  setTag: (tag: string | null) => {
    set({ currentTag: tag });
    get().loadNotes();
  },
  
  setSearch: (query: string) => {
    set({ searchQuery: query });
    // Debounce search in the component, not here
  },
  
  setShowArchived: (show: boolean) => {
    set({ showArchived: show });
    get().loadNotes();
  },
  
  // UI actions
  clearError: () => set({ error: null }),
  
  clearCurrentNote: () => set({ currentNote: null }),
  
  reset: () => set({
    notes: [],
    currentNote: null,
    areas: [],
    isLoading: false,
    isCreating: false,
    isUpdating: false,
    error: null,
    currentArea: null,
    currentTag: null,
    searchQuery: '',
    showArchived: false,
    offset: 0,
    hasMore: true
  })
})); 