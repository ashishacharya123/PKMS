import { create } from 'zustand';
import { notesService } from '../services/notesService';
import { Note, NoteSummary, CreateNoteRequest, UpdateNoteRequest } from '../types/note';

interface NotesState {
  // Data
  notes: NoteSummary[];
  currentNote: Note | null;
  
  // UI State
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  error: string | null;
  
  // Filters
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
  loadNote: (uuid: string) => Promise<void>;
  createNote: (data: CreateNoteRequest) => Promise<Note | null>;
  updateNote: (id: string, data: UpdateNoteRequest) => Promise<Note | null>;
  deleteNote: (id: string) => Promise<boolean>;
  
  // Filters
  setTag: (tag: string | null) => void;
  setSearch: (query: string) => void;
  setShowArchived: (show: boolean) => void;
  
  // UI Actions
  clearError: () => void;
  clearCurrentNote: () => void;
  reset: () => void;
}

const initialState: Omit<NotesState, 'reset' | 'clearCurrentNote' | 'clearError' | 'setShowArchived' | 'setSearch' | 'setTag' | 'deleteNote' | 'updateNote' | 'createNote' | 'loadNote' | 'loadMore' | 'loadNotes'> = {
  notes: [],
  currentNote: null,
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  error: null,
  currentTag: null,
  searchQuery: '',
  showArchived: false,
  limit: 20,
  offset: 0,
  hasMore: true,
};

export const useNotesStore = create<NotesState>((set, get) => ({
  ...initialState,
  
  // Actions
  loadNotes: async () => {
    const state = get();
    set({ isLoading: true, error: null, offset: 0 });
    
    try {
      const notes = await notesService.listNotes({
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
  
  loadNote: async (uuid: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const note = await notesService.getNote(uuid);
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
        uuid: note.uuid,
        title: note.title,
        file_count: note.file_count,
        is_favorite: note.is_favorite,
        is_archived: note.is_archived,
        isExclusiveMode: (note as any).isExclusiveMode ?? false,
        created_at: note.created_at,
        updated_at: note.updated_at,
        tags: note.tags,
        preview: note.content.substring(0, 200) + (note.content.length > 200 ? '...' : ''),
        projects: (note as any).projects ?? []
      };
      
      // Add to notes list if it matches current filters
      const state = get();
      const shouldAdd = (!state.currentTag || note.tags.includes(state.currentTag)) &&
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
  
  updateNote: async (uuid: string, data: UpdateNoteRequest) => {
    set({ isUpdating: true, error: null });
    
    try {
      const updatedNote = await notesService.updateNote(uuid, data);
      
      // Convert Note to NoteSummary for the list
      const noteSummary: NoteSummary = {
        uuid: updatedNote.uuid,
        title: updatedNote.title,
        file_count: updatedNote.file_count,
        is_favorite: updatedNote.is_favorite,
        is_archived: updatedNote.is_archived,
        isExclusiveMode: updatedNote.isExclusiveMode ?? false,
        created_at: updatedNote.created_at,
        updated_at: updatedNote.updated_at,
        tags: updatedNote.tags,
        preview: updatedNote.content ? updatedNote.content.substring(0, 200) + (updatedNote.content.length > 200 ? '...' : '') : '',
        projects: updatedNote.projects ?? []
      };
      
      // Update in notes list
      set(state => ({
        notes: state.notes.map(note => 
          note.uuid === noteSummary.uuid ? noteSummary : note
        ),
        currentNote: state.currentNote?.uuid === updatedNote.uuid ? updatedNote : state.currentNote,
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
  
  deleteNote: async (uuid: string) => {
    set({ error: null });
    
    try {
      await notesService.deleteNote(uuid);
      
      // Remove from notes list
      set(state => ({
        notes: state.notes.filter(note => note.uuid !== uuid),
        currentNote: state.currentNote?.uuid === uuid ? null : state.currentNote
      }));
      
      return true;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete note'
      });
      return false;
    }
  },
  
  // Filter actions
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
  
  reset: () => {
    set(initialState);
  }
})); 