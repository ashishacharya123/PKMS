import { create } from 'zustand';
import { diaryService } from '../services/diaryService';
import { apiService } from '../services/api';
import { DiaryEntry, DiaryEntrySummary, DiaryEntryCreatePayload, DiaryCalendarData, MoodStats, DiaryDailyMetadata } from '../types/diary';
import { logger } from '../utils/logger';

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
  dailyMetadataCache: Record<string, DiaryDailyMetadata>;
  unlockStatusInterval: ReturnType<typeof setInterval> | null;
  filters: {
    year?: number;
    month?: number;
    mood?: number;
    searchTitle?: string;
    dayOfWeek?: number;
    hasMedia?: boolean;
  };
  
  
  init: () => Promise<void>;
  setupEncryption: (password: string, hint?: string) => Promise<boolean>;
  unlockSession: (password: string) => Promise<boolean>;
  lockSession: () => void;
  setEncryptionKey: (key: CryptoKey) => void;
  clearEncryptionKey: () => void;
  loadEntries: (opts?: { templates?: boolean }) => Promise<void>;
  loadEntry: (uuid: string) => Promise<void>;
  createEntry: (payload: DiaryEntryCreatePayload) => Promise<boolean>;
  updateEntry: (uuid: string, payload: DiaryEntryCreatePayload) => Promise<boolean>;
  deleteEntry: (uuid: string) => Promise<boolean>;
  loadCalendarData: (year: number, month: number) => Promise<void>;
  loadMoodStats: () => Promise<void>;
  checkUnlockStatus: () => Promise<boolean>;
  startUnlockStatusMonitoring: () => void;
  stopUnlockStatusMonitoring: () => void;
  setFilter: (filter: Partial<DiaryState['filters']>) => void;
  clearFilters: () => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  setYear: (year: number) => void;
  setMonth: (month: number) => void;
  setSearchQuery: (query: string) => void;
  setDayOfWeek: (dayOfWeek: number | null) => void;
  setHasMedia: (hasMedia: boolean | null) => void;
  setDailyMetadata: (snapshot: DiaryDailyMetadata) => void;
}

export const useDiaryStore = create<DiaryState>((set, get) => {
  // Set up logout listener
  window.addEventListener('auth:logout', () => {
    // Stop monitoring unlock status
    get().stopUnlockStatusMonitoring();
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
      dailyMetadataCache: {},
      unlockStatusInterval: null,
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
    dailyMetadataCache: {},
    unlockStatusInterval: null,
    filters: {},

    init: async () => {
      try {
        set({ error: null, isLoading: true });
        logger.info('Initializing...');
        
        // Check actual encryption status from backend
        const isSetup = await diaryService.isEncryptionSetup();
        logger.info('Encryption setup status:', isSetup);
        
        // Check if session is already unlocked (for returning users)
        let isUnlocked = false;
        if (isSetup) {
          try {
            // Try to get encryption status to see if already unlocked
            const response = await apiService.get<{ is_setup: boolean; is_unlocked: boolean }>('/diary/encryption/status');
            isUnlocked = response.data.is_unlocked || false;
            logger.info('Session unlock status:', isUnlocked);
          } catch (error) {
            // If status check fails, assume locked
            logger.warn('Could not check unlock status, assuming locked');
            isUnlocked = false;
          }
        }
        
        set({ 
          isEncryptionSetup: isSetup, 
          isUnlocked: isUnlocked, 
          error: null, 
          isLoading: false 
        });
        
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
          // Note: Auto-lock is now handled by DiaryPage component (5 min after leaving page)
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
      // Stop monitoring unlock status
      get().stopUnlockStatusMonitoring();
      
      // Clear all diary-related cache and sensitive data
      set({ 
        encryptionKey: null, 
        isUnlocked: false,
        entries: [],
        currentEntry: null,
        calendarData: [],
        moodStats: null,
        dailyMetadataCache: {},
        searchQuery: '',
        currentDayOfWeek: null,
        currentHasMedia: null,
        error: null
      });
      
      // Clear any cached Nepali dates
      if (typeof window !== 'undefined' && window.nepaliDateCache) {
        window.nepaliDateCache.clear();
      }
    },

    setEncryptionKey: (key: CryptoKey) => {
      set({ encryptionKey: key });
    },

    clearEncryptionKey: () => {
      set({ encryptionKey: null });
    },

    loadEntries: async (opts?: { templates?: boolean }) => {
      try {
        const stateAtStart = get();
        if (!stateAtStart.isUnlocked) {
          // Avoid loading entries while locked to prevent spurious errors
          return;
        }
        
        // Check if diary is still unlocked on backend
        const isStillUnlocked = await get().checkUnlockStatus();
        if (!isStillUnlocked) return;
        
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
        
        // Add additional filters from the filters object if available
        if (state.filters?.mood) {
          filters.mood = state.filters.mood;
        }
        if (state.filters?.year) {
          filters.year = state.filters.year;
        }
        if (state.filters?.month) {
          filters.month = state.filters.month;
        }
        
        console.log('[DIARY STORE] Using filters:', filters);
        
        // Only pass filters if there are any, otherwise let backend return all entries
        const entries = Object.keys(filters).length > 0 
          ? await diaryService.getEntries({ ...filters, templates: opts?.templates ?? false })
          : await diaryService.getEntries({ templates: opts?.templates ?? false });
          
        console.log('[DIARY STORE] Loaded entries:', entries?.length, 'entries');
        
        // Ensure tags is properly structured for each entry
        const processedEntries = entries.map(entry => ({
          ...entry,
          tags: entry.tags || []
        }));
          
        set({ entries: processedEntries, error: null });
      } catch (error) {
        console.error('[DIARY STORE] Failed to load entries:', error);
        // Only surface the error if unlocked; otherwise keep the locked view clean
        if (get().isUnlocked) {
          set({ error: 'Failed to load entries' });
        }
      } finally {
        set({ isLoading: false });
      }
    },

    loadEntry: async (uuid: string) => {
      const state = get();
      if (!state.encryptionKey) return;
      
      try {
        set({ error: null, isLoading: true });
        // Fetch entry by UUID using the proper API endpoint
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
        // Check if diary is still unlocked on backend
        const isStillUnlocked = await get().checkUnlockStatus();
        if (!isStillUnlocked) return false;
        
        set({ error: null, isLoading: true });
        await diaryService.createEntry(payload);
        await get().loadEntries();
        // Refresh derived data so widgets reflect latest state
        await get().loadMoodStats();
        await get().loadCalendarData(get().currentYear, get().currentMonth);
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
        // Check if diary is still unlocked on backend
        const isStillUnlocked = await get().checkUnlockStatus();
        if (!isStillUnlocked) return false;
        
        set({ error: null, isLoading: true });
        await diaryService.updateEntry(uuid, payload);
        await get().loadEntries();
        // Refresh derived data so widgets reflect latest state
        await get().loadMoodStats();
        await get().loadCalendarData(get().currentYear, get().currentMonth);
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
        // Check if diary is still unlocked on backend
        const isStillUnlocked = await get().checkUnlockStatus();
        if (!isStillUnlocked) return false;
        
        set({ error: null, isLoading: true });
        await diaryService.deleteEntry(uuid);
        await get().loadEntries();
        // Refresh derived data so widgets reflect latest state
        await get().loadMoodStats();
        await get().loadCalendarData(get().currentYear, get().currentMonth);
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
        if (!get().isUnlocked) return;
        
        // Check if diary is still unlocked on backend
        const isStillUnlocked = await get().checkUnlockStatus();
        if (!isStillUnlocked) return;
        
        set({ isLoading: true });
        const data = await diaryService.getCalendarData(year, month);
        set({ calendarData: data });
      } catch (error) {
        console.error('Failed to load calendar data:', error);
        if (get().isUnlocked) set({ error: 'Failed to load calendar data' });
      } finally {
        set({ isLoading: false });
      }
    },

    loadMoodStats: async () => {
      try {
        if (!get().isUnlocked) return;
        
        // Check if diary is still unlocked on backend
        const isStillUnlocked = await get().checkUnlockStatus();
        if (!isStillUnlocked) return;
        
        set({ isLoading: true });
        const stats = await diaryService.getMoodStats();
        set({ moodStats: stats });
      } catch (error) {
        console.error('Failed to load mood stats:', error);
        if (get().isUnlocked) set({ error: 'Failed to load mood stats' });
      } finally {
        set({ isLoading: false });
      }
    },

    checkUnlockStatus: async () => {
      try {
        // Try to make a simple request to check if diary is still unlocked
        await diaryService.getPasswordHint();
        return true;
      } catch (error: any) {
        if (error.response?.status === 403) {
          // Diary is locked, update frontend state
          set({ 
            isUnlocked: false, 
            encryptionKey: null,
            error: 'Diary session expired. Please unlock again.'
          });
          return false;
        }
        return true; // Other errors don't necessarily mean locked
      }
    },

    startUnlockStatusMonitoring: () => {
      // Check unlock status every 5 minutes
      const interval = setInterval(async () => {
        if (get().isUnlocked) {
          const isStillUnlocked = await get().checkUnlockStatus();
          if (!isStillUnlocked) {
            console.log('[DIARY STORE] Diary session expired during monitoring');
          }
        }
      }, 5 * 60 * 1000); // 5 minutes
      
      // Store the interval ID for cleanup
      set({ unlockStatusInterval: interval });
    },

    stopUnlockStatusMonitoring: () => {
      const state = get();
      if (state.unlockStatusInterval) {
        clearInterval(state.unlockStatusInterval);
        set({ unlockStatusInterval: null });
      }
    },

    setFilter: (filter: Partial<DiaryState['filters']>) => {
      set((state) => ({
        filters: { ...state.filters, ...filter },
      }));
    },

    clearFilters: () => {
      set({ 
        filters: {},
        searchQuery: '',
        currentDayOfWeek: null,
        currentHasMedia: null
      });
    },

    setError: (error: string | null) => set({ error }),
    clearError: () => set({ error: null }),
    setYear: (year: number) => set({ currentYear: year }),
    setMonth: (month: number) => set({ currentMonth: month }),
    setSearchQuery: (query: string) => set({ searchQuery: query }),
    setDayOfWeek: (dayOfWeek: number | null) => set({ currentDayOfWeek: dayOfWeek }),
    setHasMedia: (hasMedia: boolean | null) => set({ currentHasMedia: hasMedia }),
    
    setDailyMetadata: (snapshot: DiaryDailyMetadata) => {
      const dateKey = snapshot.date.split('T')[0];
      set((state) => ({
        dailyMetadataCache: { ...state.dailyMetadataCache, [dateKey]: snapshot },
      }));
    },
  };
});

export default useDiaryStore;
