import { create } from 'zustand';
import { notifications } from '@mantine/notifications';
import { diaryService } from '../services/diaryService';
import { DiaryEntry, DiaryEntrySummary, DiaryMetadata, DiaryEntryCreatePayload } from '../types/diary';

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
  
  // Actions
  init: () => Promise<void>;
  setupEncryption: (password: string, hint?: string) => Promise<boolean>;
  unlockSession: (password: string) => Promise<boolean>;
  lockSession: () => void;
  setEncryptionKey: (key: CryptoKey) => void;
  clearEncryptionKey: () => void;
  loadEntries: () => Promise<void>;
  loadEntry: (id: number) => Promise<void>;
  createEntry: (payload: DiaryEntryCreatePayload) => Promise<boolean>;
  updateEntry: (id: number, payload: DiaryEntryCreatePayload) => Promise<boolean>;
  deleteEntry: (id: number) => Promise<boolean>;
  loadCalendarData: (year: number, month: number) => Promise<void>;
  loadMoodStats: () => Promise<void>;
  setFilter: (filter: Partial<DiaryState['filters']>) => void;
  clearFilters: () => void;
  setError: (error: string | null) => void;
  setYear: (year: number) => void;
  setMonth: (month: number) => void;
  setSearchQuery: (query: string) => void;
  setDayOfWeek: (dayOfWeek: number | null) => void;
  setHasMedia: (hasMedia: boolean | null) => void;
}

export const useDiaryStore = create<DiaryState>((set, get) => ({
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
      const isSetup = await diaryService.isEncryptionSetup();
      set({ isEncryptionSetup: isSetup });
    } catch (error) {
      console.error('Failed to initialize diary:', error);
      set({ error: 'Failed to initialize diary' });
    }
  },

  setupEncryption: async (password: string, hint?: string) => {
    try {
      set({ isLoading: true });
      const { key, success } = await diaryService.setupEncryption(password, hint);
      if (success) {
        set({ encryptionKey: key, isEncryptionSetup: true, isUnlocked: true });
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
      set({ isLoading: true });
      const { key, success } = await diaryService.unlockSession(password);
      if (success) {
        set({ encryptionKey: key, isUnlocked: true });
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
      const entries = await diaryService.getEntries();
      set({ entries });
    } catch (error) {
      console.error('Failed to load entries:', error);
      set({ error: 'Failed to load entries' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadEntry: async (id: number) => {
    try {
      set({ isLoading: true });
      const entry = await diaryService.getEntryById(id);
      set({ currentEntry: entry });
    } catch (error) {
      console.error('Failed to load entry:', error);
      set({ error: 'Failed to load entry' });
    } finally {
      set({ isLoading: false });
    }
  },

  createEntry: async (payload: DiaryEntryCreatePayload) => {
    try {
      set({ isLoading: true });
      const entry = await diaryService.createEntry(payload);
      set((state) => ({ entries: [...state.entries, entry] }));
      return true;
    } catch (error) {
      console.error('Failed to create entry:', error);
      set({ error: 'Failed to create entry' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  updateEntry: async (id: number, payload: DiaryEntryCreatePayload) => {
    try {
      set({ isLoading: true });
      const entry = await diaryService.updateEntry(id, payload);
      set((state) => ({
        entries: state.entries.map((e) => (e.id === id ? entry : e)),
      }));
      return true;
    } catch (error) {
      console.error('Failed to update entry:', error);
      set({ error: 'Failed to update entry' });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteEntry: async (id: number) => {
    try {
      set({ isLoading: true });
      await diaryService.deleteEntry(id);
      set((state) => ({
        entries: state.entries.filter((e) => e.id !== id),
      }));
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
  setYear: (year: number) => set({ currentYear: year }),
  setMonth: (month: number) => set({ currentMonth: month }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setDayOfWeek: (dayOfWeek: number | null) => set({ currentDayOfWeek: dayOfWeek }),
  setHasMedia: (hasMedia: boolean | null) => set({ currentHasMedia: hasMedia }),
}));

export default useDiaryStore;
