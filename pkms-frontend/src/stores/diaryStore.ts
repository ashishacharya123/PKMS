import { create } from 'zustand';
import { notifications } from '@mantine/notifications';
import { diaryService, DiaryEntry, DiaryEntrySummary, DiaryMetadata, DiaryCalendarData, MoodStats } from '../services/diaryService';

interface DiaryState {
  entries: DiaryEntrySummary[];
  currentEntry: DiaryEntry | null;
  isLoading: boolean;
  isEncrypted: boolean;
  encryptionKey: CryptoKey | null;
  calendarData: DiaryCalendarData[];
  moodStats: MoodStats | null;
  filters: {
    year?: number;
    month?: number;
    mood?: number;
    searchTitle?: string;
    dayOfWeek?: number;
    hasMedia?: boolean;
  };
  
  // Actions
  setEncryptionKey: (key: CryptoKey) => void;
  clearEncryptionKey: () => void;
  loadEntries: () => Promise<void>;
  loadEntry: (id: number) => Promise<void>;
  createEntry: (date: Date, content: string, title?: string, mood?: number, metadata?: DiaryMetadata) => Promise<boolean>;
  updateEntry: (id: number, content: string, title?: string, mood?: number, metadata?: DiaryMetadata) => Promise<boolean>;
  deleteEntry: (id: number) => Promise<boolean>;
  loadCalendarData: (year: number, month: number) => Promise<void>;
  loadMoodStats: () => Promise<void>;
  setFilter: (filter: Partial<DiaryState['filters']>) => void;
  clearFilters: () => void;
}

export const useDiaryStore = create<DiaryState>((set, get) => ({
  entries: [],
  currentEntry: null,
  isLoading: false,
  isEncrypted: true,
  encryptionKey: null,
  calendarData: [],
  moodStats: null,
  filters: {},

  setEncryptionKey: (key: CryptoKey) => set({ encryptionKey: key }),
  
  clearEncryptionKey: () => set({ encryptionKey: null }),

  loadEntries: async () => {
    const { filters } = get();
    set({ isLoading: true });
    try {
      const entries = await diaryService.listEntries({
        year: filters.year,
        month: filters.month,
        mood: filters.mood,
        search_title: filters.searchTitle,
        day_of_week: filters.dayOfWeek,
        has_media: filters.hasMedia,
      });
      set({ entries, isLoading: false });
    } catch (error) {
      console.error('Failed to load diary entries:', error);
      set({ isLoading: false });
      notifications.show({
        title: 'Error',
        message: 'Failed to load diary entries',
        color: 'red',
      });
    }
  },

  loadEntry: async (id: number) => {
    const { encryptionKey } = get();
    if (!encryptionKey) {
      notifications.show({
        title: 'Error',
        message: 'Encryption key not available',
        color: 'red',
      });
      return;
    }

    set({ isLoading: true });
    try {
      const entry = await diaryService.getEntryById(id);
      set({ currentEntry: entry, isLoading: false });
    } catch (error) {
      console.error('Failed to load diary entry:', error);
      set({ isLoading: false });
      notifications.show({
        title: 'Error',
        message: 'Failed to load diary entry',
        color: 'red',
      });
    }
  },

  createEntry: async (date: Date, content: string, title?: string, mood?: number, metadata?: DiaryMetadata) => {
    const { encryptionKey } = get();
    if (!encryptionKey) {
      notifications.show({
        title: 'Error',
        message: 'Encryption key not available',
        color: 'red',
      });
      return false;
    }

    set({ isLoading: true });
    try {
      const { encrypted_blob, iv, tag } = await diaryService.encryptContent(content, encryptionKey);
      
      const entry = await diaryService.createEntry({
        date: date.toISOString().split('T')[0],
        title,
        encrypted_blob,
        encryption_iv: iv,
        encryption_tag: tag,
        mood,
        metadata,
      });

      set(state => ({
        entries: [entry, ...state.entries],
        isLoading: false,
      }));

      notifications.show({
        title: 'Success',
        message: 'Diary entry created',
        color: 'green',
      });

      return true;
    } catch (error) {
      console.error('Failed to create diary entry:', error);
      set({ isLoading: false });
      notifications.show({
        title: 'Error',
        message: 'Failed to create diary entry',
        color: 'red',
      });
      return false;
    }
  },

  updateEntry: async (id: number, content: string, title?: string, mood?: number, metadata?: DiaryMetadata) => {
    const { encryptionKey } = get();
    if (!encryptionKey) {
      notifications.show({
        title: 'Error',
        message: 'Encryption key not available',
        color: 'red',
      });
      return false;
    }

    set({ isLoading: true });
    try {
      const { encrypted_blob, iv, tag } = await diaryService.encryptContent(content, encryptionKey);
      
      const entry = await diaryService.updateEntry(id, {
        date: new Date().toISOString().split('T')[0], // Use current date as fallback
        title,
        encrypted_blob,
        encryption_iv: iv,
        encryption_tag: tag,
        mood,
        metadata,
      });

      set(state => ({
        entries: state.entries.map(e => e.id === id ? entry : e),
        currentEntry: entry,
        isLoading: false,
      }));

      notifications.show({
        title: 'Success',
        message: 'Diary entry updated',
        color: 'green',
      });

      return true;
    } catch (error) {
      console.error('Failed to update diary entry:', error);
      set({ isLoading: false });
      notifications.show({
        title: 'Error',
        message: 'Failed to update diary entry',
        color: 'red',
      });
      return false;
    }
  },

  deleteEntry: async (id: number) => {
    set({ isLoading: true });
    try {
      await diaryService.deleteEntry(id);
      
      set(state => ({
        entries: state.entries.filter(e => e.id !== id),
        currentEntry: state.currentEntry?.id === id ? null : state.currentEntry,
        isLoading: false,
      }));

      notifications.show({
        title: 'Success',
        message: 'Diary entry deleted',
        color: 'green',
      });

      return true;
    } catch (error) {
      console.error('Failed to delete diary entry:', error);
      set({ isLoading: false });
      notifications.show({
        title: 'Error',
        message: 'Failed to delete diary entry',
        color: 'red',
      });
      return false;
    }
  },

  loadCalendarData: async (year: number, month: number) => {
    set({ isLoading: true });
    try {
      const calendarData = await diaryService.getCalendarData(year, month);
      set({ calendarData, isLoading: false });
    } catch (error) {
      console.error('Failed to load calendar data:', error);
      set({ isLoading: false });
      notifications.show({
        title: 'Error',
        message: 'Failed to load calendar data',
        color: 'red',
      });
    }
  },

  loadMoodStats: async () => {
    set({ isLoading: true });
    try {
      const moodStats = await diaryService.getMoodStats();
      set({ moodStats, isLoading: false });
    } catch (error) {
      console.error('Failed to load mood stats:', error);
      set({ isLoading: false });
      notifications.show({
        title: 'Error',
        message: 'Failed to load mood statistics',
        color: 'red',
      });
    }
  },

  setFilter: (filter: Partial<DiaryState['filters']>) => {
    set(state => ({
      filters: { ...state.filters, ...filter },
    }));
  },

  clearFilters: () => {
    set({ filters: {} });
  },
}));

export default useDiaryStore;
