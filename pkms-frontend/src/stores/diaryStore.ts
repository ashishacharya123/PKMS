import { create } from 'zustand';
import { diaryService } from '../services/diaryService';
import { DiaryEntry, DiaryEntrySummary, DiaryMetadata, DiaryEntryCreatePayload, DiaryCalendarData, MoodStats } from '../types/diary';

interface DiaryState {
  entries: DiaryEntrySummary[];
  currentEntry: DiaryEntry | null;
  isLoading: boolean;
  isEncrypted: boolean;
  isEncryptionSetup: boolean;
  isUnlocked: boolean;
  encryptionKey: CryptoKey | null;
  calendarData: DiaryCalendarData[];
  moodStats: MoodStats | null;
  error: string | null;
  currentYear: number;
  currentMonth: number;
  searchQuery: string;
  currentDayOfWeek: number | null;
  currentHasMedia: boolean | null;
  filters: {
    year?: number;
    month?: number;
    mood?: number;
    searchTitle?: string;
    dayOfWeek?: number;
    hasMedia?: boolean;
  };
  
  
  setupEncryption: (password: string, hint?: string) => Promise<boolean>;
  unlockSession: (password: string) => Promise<boolean>;
  lockSession: () => void;
  setEncryptionKey: (key: CryptoKey) => void;
  clearEncryptionKey: () => void;
  loadEntries: () => Promise<void>;
  loadEntry: (uuid: string) => Promise<void>;
  createEntry: (payload: DiaryEntryCreatePayload) => Promise<boolean>;
  updateEntry: (uuid: string, payload: DiaryEntryCreatePayload) => Promise<boolean>;
  deleteEntry: (uuid: string) => Promise<boolean>;
  loadCalendarData: (year: number, month: number) => Promise<void>;
  loadMoodStats: () => Promise<void>;
  setFilter: (filter: Partial<DiaryState['filters']>) => void;
  clearFilters: () => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  setYear: (year: number) => void;
  setMonth: (month: number) => void;
  setSearchQuery: (query: string) => void;
  setDayOfWeek: (dayOfWeek: number | null) => void;
  setHasMedia: (hasMedia: boolean | null) => void;
}

export const useDiaryStore = create<DiaryState>((set, get) => {
  // Set up logout listener
  window.addEventListener('auth:logout', () => {
    // Clear diary state on logout
    set({
      entries: [],
      currentEntry: null,
      isLoading: false,
      isEncrypted: true,
      isEncryptionSetup: false,
      isUnlocked: false,
      encryptionKey: null,
      calendarData: [],
      moodStats: null,
      error: null,
      filters: {}
    });
  });

  return {
    entries: [],
    currentEntry: null,
    isLoading: false,
    isEncrypted: true,
    isEncryptionSetup: false,
    isUnlocked: false,
    encryptionKey: null,
    calendarData: [],
    moodStats: null,
    error: null,
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    searchQuery: '',
    currentDayOfWeek: null,
    currentHasMedia: null,
    filters: {},

    init: async () => {
      try {
        set({ error: null, isLoading: true }); // Set loading while checking
        console.log('[DIARY STORE] Initializing...');
        // Since diary password is now mandatory, encryption is always set up.
        // We start in a locked state, requiring the user to unlock.
        set({ isEncryptionSetup: true, isUnlocked: false, error: null, isLoading: false });
      } catch (error: any) {
        console.error('Failed to initialize diary:', error);
        // Handle authentication errors gracefully
        if (error?.response?.status === 401 || error?.message?.includes('authentication')) {
          set({ error: null, isEncryptionSetup: true, isUnlocked: false, isLoading: false }); // Don't show error for auth issues
        } else {
          set({ error: 'Failed to initialize diary', isLoading: false });
        }
      }
    },

    setupEncryption: async (password: string, hint?: string) => {
      try {
        set({ isLoading: true, error: null });
        const { key, success } = await diaryService.setupEncryption(password, hint);
        if (success) {
          set({ encryptionKey: key, isEncryptionSetup: true, isUnlocked: true, error: null });
        }
        return success;
      } catch (error) {
        console.error('Failed to setup encryption:', error);
        set({ error: 'Failed to setup encryption' });
        return false;
      } finally {
        set({ isLoading: false });
      }
    },

    unlockSession: async (password: string) => {
      try {
        set({ isLoading: true, error: null });
        const { key, success } = await diaryService.unlockSession(password);
        if (success) {
          set({ encryptionKey: key, isUnlocked: true, error: null });
        }
        return success;
      } catch (error) {
        console.error('Failed to unlock session:', error);
        set({ error: 'Failed to unlock session' });
        return false;
      } finally {
        set({ isLoading: false });
      }
    },

    lockSession: () => {
      set({ encryptionKey: null, isUnlocked: false });
    },

    setEncryptionKey: (key: CryptoKey) => {
      set({ encryptionKey: key });
    },

    clearEncryptionKey: () => {
      set({ encryptionKey: null });
    },

    loadEntries: async () => {
      try {
        set({ isLoading: true });
        const state = get();
        
        console.log('[DIARY STORE] Loading entries, current state:', {
          isUnlocked: state.isUnlocked,
          searchQuery: state.searchQuery,
          currentDayOfWeek: state.currentDayOfWeek,
          currentHasMedia: state.currentHasMedia
        });
        
        // Build filter parameters from current state (only if they have meaningful values)
        const filters: any = {};
        
        // Only add filters if they are set to meaningful values
        if (state.searchQuery && state.searchQuery.trim()) {
          filters.search_title = state.searchQuery.trim();
        }
        if (state.currentDayOfWeek !== null && state.currentDayOfWeek !== undefined) {
          filters.day_of_week = state.currentDayOfWeek;
        }
        if (state.currentHasMedia !== null && state.currentHasMedia !== undefined) {
          filters.has_media = state.currentHasMedia;
        }
        
        console.log('[DIARY STORE] Using filters:', filters);
        
        // Only pass filters if there are any, otherwise let backend return all entries
        const entries = Object.keys(filters).length > 0 
          ? await diaryService.getEntries(filters)
          : await diaryService.getEntries();
          
        console.log('[DIARY STORE] Loaded entries:', entries?.length, 'entries');
        
        // Ensure metadata is properly structured for each entry
        const processedEntries = entries.map(entry => ({
          ...entry,
          metadata: entry.metadata || {},
          tags: entry.tags || []
        }));
          
        set({ entries: processedEntries, error: null });
      } catch (error) {
        console.error('[DIARY STORE] Failed to load entries:', error);
        set({ error: 'Failed to load entries' });
      } finally {
        set({ isLoading: false });
      }
    },

    loadEntry: async (uuid: string) => {
      const state = get();
      if (!state.encryptionKey) return;
      
      try {
        set({ error: null, isLoading: true });
        const entry = await diaryService.getEntry(uuid);
        if (entry) {
          set({ currentEntry: entry });
        }
      } catch (error) {
        console.error('Failed to load entry:', error);
        set({ error: 'Failed to load entry' });
      } finally {
        set({ isLoading: false });
      }
    },

    createEntry: async (payload: DiaryEntryCreatePayload) => {
      try {
        set({ error: null, isLoading: true });
        await diaryService.createEntry(payload);
        await get().loadEntries();
        return true;
      } catch (error) {
        console.error('Failed to create entry:', error);
        set({ error: 'Failed to create entry' });
        return false;
      } finally {
        set({ isLoading: false });
      }
    },

    updateEntry: async (uuid: string, payload: DiaryEntryCreatePayload) => {
      try {
        set({ error: null, isLoading: true });
        await diaryService.updateEntry(uuid, payload);
        await get().loadEntries();
        return true;
      } catch (error) {
        console.error('Failed to update entry:', error);
        set({ error: 'Failed to update entry' });
        return false;
      } finally {
        set({ isLoading: false });
      }
    },

    deleteEntry: async (uuid: string) => {
      try {
        set({ error: null, isLoading: true });
        await diaryService.deleteEntry(uuid);
        await get().loadEntries();
        return true;
      } catch (error) {
        console.error('Failed to delete entry:', error);
        set({ error: 'Failed to delete entry' });
        return false;
      } finally {
        set({ isLoading: false });
      }
    },

    loadCalendarData: async (year: number, month: number) => {
      try {
        set({ isLoading: true });
        const data = await diaryService.getCalendarData(year, month);
        set({ calendarData: data });
      } catch (error) {
        console.error('Failed to load calendar data:', error);
        set({ error: 'Failed to load calendar data' });
      } finally {
        set({ isLoading: false });
      }
    },

    loadMoodStats: async () => {
      try {
        set({ isLoading: true });
        const stats = await diaryService.getMoodStats();
        set({ moodStats: stats });
      } catch (error) {
        console.error('Failed to load mood stats:', error);
        set({ error: 'Failed to load mood stats' });
      } finally {
        set({ isLoading: false });
      }
    },

    setFilter: (filter: Partial<DiaryState['filters']>) => {
      set((state) => ({
        filters: { ...state.filters, ...filter },
      }));
    },

    clearFilters: () => {
      set({ filters: {} });
    },

    setError: (error: string | null) => set({ error }),
    clearError: () => set({ error: null }),
    setYear: (year: number) => set({ currentYear: year }),
    setMonth: (month: number) => set({ currentMonth: month }),
    setSearchQuery: (query: string) => set({ searchQuery: query }),
    setDayOfWeek: (dayOfWeek: number | null) => set({ currentDayOfWeek: dayOfWeek }),
    setHasMedia: (hasMedia: boolean | null) => set({ currentHasMedia: hasMedia }),
  };
});

export default useDiaryStore;
