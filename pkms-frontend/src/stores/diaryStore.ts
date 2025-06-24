import { create } from 'zustand';
import { 
  diaryService, 
  type DiaryEntry, 
  type DiaryEntryCreate, 
  type DiaryEntryUpdate, 
  type DiaryEntrySummary, 
  type DiaryMedia, 
  type DiaryCalendarData, 
  type MoodStats,
  type DiaryListParams,
  type MediaUploadData,
  type EncryptedContent 
} from '../services/diaryService';

interface DiaryState {
  // Data
  entries: DiaryEntrySummary[];
  currentEntry: DiaryEntry | null;
  currentEntryMedia: DiaryMedia[];
  calendarData: DiaryCalendarData[];
  templates: DiaryEntry[];
  moodStats: MoodStats | null;
  
  // Encryption
  encryptionKey: CryptoKey | null;
  isEncryptionSetup: boolean;
  
  // UI State
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isUploadingMedia: boolean;
  mediaUploadProgress: number;
  error: string | null;
  
  // Filters
  currentYear: number | null;
  currentMonth: number | null;
  currentMood: number | null;
  showTemplates: boolean;
  
  // Pagination
  limit: number;
  offset: number;
  hasMore: boolean;
  
  // Actions - Encryption
  setupEncryption: (password: string) => Promise<boolean>;
  clearEncryption: () => void;
  
  // Actions - Entries
  loadEntries: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadEntryByDate: (date: string) => Promise<void>;
  loadEntryById: (id: number) => Promise<void>;
  createEntry: (data: DiaryEntryCreate) => Promise<DiaryEntry | null>;
  updateEntry: (date: string, data: DiaryEntryUpdate) => Promise<DiaryEntry | null>;
  deleteEntry: (date: string) => Promise<boolean>;
  
  // Actions - Media
  loadEntryMedia: (entryId: number) => Promise<void>;
  uploadMedia: (entryId: number, mediaData: MediaUploadData) => Promise<DiaryMedia | null>;
  downloadMedia: (mediaUuid: string) => Promise<Blob | null>;
  deleteMedia: (mediaUuid: string) => Promise<boolean>;
  
  // Actions - Calendar & Stats
  loadCalendarData: (year: number, month: number) => Promise<void>;
  loadMoodStats: (startDate?: string, endDate?: string) => Promise<void>;
  loadTemplates: () => Promise<void>;
  
  // Actions - Content Encryption/Decryption
  encryptContent: (content: string) => Promise<EncryptedContent | null>;
  decryptContent: (encryptedContent: EncryptedContent) => Promise<string | null>;
  
  // Filters
  setYear: (year: number | null) => void;
  setMonth: (month: number | null) => void;
  setMood: (mood: number | null) => void;
  setShowTemplates: (show: boolean) => void;
  
  // UI Actions
  clearError: () => void;
  clearCurrentEntry: () => void;
  setMediaUploadProgress: (progress: number) => void;
  reset: () => void;
}

export const useDiaryStore = create<DiaryState>((set, get) => ({
  // Initial state
  entries: [],
  currentEntry: null,
  currentEntryMedia: [],
  calendarData: [],
  templates: [],
  moodStats: null,
  encryptionKey: null,
  isEncryptionSetup: false,
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  isUploadingMedia: false,
  mediaUploadProgress: 0,
  error: null,
  currentYear: null,
  currentMonth: null,
  currentMood: null,
  showTemplates: false,
  limit: 20,
  offset: 0,
  hasMore: true,
  
  // Encryption Actions
  setupEncryption: async (password: string) => {
    try {
      const key = await diaryService.generateEncryptionKey(password);
      set({ 
        encryptionKey: key, 
        isEncryptionSetup: true,
        error: null 
      });
      return true;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to setup encryption',
        isEncryptionSetup: false
      });
      return false;
    }
  },
  
  clearEncryption: () => {
    set({ 
      encryptionKey: null, 
      isEncryptionSetup: false,
      currentEntry: null,
      entries: [],
      templates: []
    });
  },
  
  // Entry Actions
  loadEntries: async () => {
    const state = get();
    if (!state.encryptionKey) {
      set({ error: 'Encryption not setup. Please provide your master password.' });
      return;
    }
    
    set({ isLoading: true, error: null, offset: 0 });
    
    try {
      const params: DiaryListParams = {
        year: state.currentYear || undefined,
        month: state.currentMonth || undefined,
        mood: state.currentMood || undefined,
        templates: state.showTemplates,
        limit: state.limit,
        offset: 0
      };
      
      const entries = await diaryService.getEntries(params);
      
      set({ 
        entries, 
        isLoading: false, 
        hasMore: entries.length === state.limit,
        offset: entries.length 
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load diary entries', 
        isLoading: false 
      });
    }
  },
  
  loadMore: async () => {
    const state = get();
    if (state.isLoading || !state.hasMore || !state.encryptionKey) return;
    
    set({ isLoading: true, error: null });
    
    try {
      const params: DiaryListParams = {
        year: state.currentYear || undefined,
        month: state.currentMonth || undefined,
        mood: state.currentMood || undefined,
        templates: state.showTemplates,
        limit: state.limit,
        offset: state.offset
      };
      
      const newEntries = await diaryService.getEntries(params);
      
      set({ 
        entries: [...state.entries, ...newEntries],
        isLoading: false,
        hasMore: newEntries.length === state.limit,
        offset: state.offset + newEntries.length
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load more entries', 
        isLoading: false 
      });
    }
  },
  
  loadEntryByDate: async (date: string) => {
    const state = get();
    if (!state.encryptionKey) {
      set({ error: 'Encryption not setup. Please provide your master password.' });
      return;
    }
    
    set({ isLoading: true, error: null });
    
    try {
      const entry = await diaryService.getEntryByDate(date);
      set({ currentEntry: entry, isLoading: false });
      
      // Load media for this entry
      get().loadEntryMedia(entry.id);
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load diary entry', 
        isLoading: false 
      });
    }
  },
  
  loadEntryById: async (id: number) => {
    const state = get();
    if (!state.encryptionKey) {
      set({ error: 'Encryption not setup. Please provide your master password.' });
      return;
    }
    
    set({ isLoading: true, error: null });
    
    try {
      const entry = await diaryService.getEntryById(id);
      set({ currentEntry: entry, isLoading: false });
      
      // Load media for this entry
      get().loadEntryMedia(entry.id);
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load diary entry', 
        isLoading: false 
      });
    }
  },
  
  createEntry: async (data: DiaryEntryCreate) => {
    const state = get();
    if (!state.encryptionKey) {
      set({ error: 'Encryption not setup. Please provide your master password.' });
      return null;
    }
    
    set({ isCreating: true, error: null });
    
    try {
      const entry = await diaryService.createEntry(data);
      
      // Convert DiaryEntry to DiaryEntrySummary for the list
      const entrySummary: DiaryEntrySummary = {
        id: entry.id,
        date: entry.date,
        mood: entry.mood,
        weather: entry.weather,
        is_template: entry.is_template,
        created_at: entry.created_at,
        media_count: entry.media_count
      };
      
      // Add to entries list if it matches current filters
      const shouldAdd = (!state.currentMood || entry.mood === state.currentMood) &&
                       (state.showTemplates === entry.is_template);
      
      if (shouldAdd) {
        set({ 
          entries: [entrySummary, ...state.entries],
          isCreating: false 
        });
      } else {
        set({ isCreating: false });
      }
      
      return entry;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to create diary entry', 
        isCreating: false 
      });
      return null;
    }
  },
  
  updateEntry: async (date: string, data: DiaryEntryUpdate) => {
    const state = get();
    if (!state.encryptionKey) {
      set({ error: 'Encryption not setup. Please provide your master password.' });
      return null;
    }
    
    set({ isUpdating: true, error: null });
    
    try {
      const updatedEntry = await diaryService.updateEntry(date, data);
      
      // Convert DiaryEntry to DiaryEntrySummary for the list
      const entrySummary: DiaryEntrySummary = {
        id: updatedEntry.id,
        date: updatedEntry.date,
        mood: updatedEntry.mood,
        weather: updatedEntry.weather,
        is_template: updatedEntry.is_template,
        created_at: updatedEntry.created_at,
        media_count: updatedEntry.media_count
      };
      
      // Update in entries list
      set(state => ({
        entries: state.entries.map(entry => 
          entry.id === updatedEntry.id ? entrySummary : entry
        ),
        currentEntry: state.currentEntry?.id === updatedEntry.id ? updatedEntry : state.currentEntry,
        isUpdating: false
      }));
      
      return updatedEntry;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update diary entry', 
        isUpdating: false 
      });
      return null;
    }
  },
  
  deleteEntry: async (date: string) => {
    const state = get();
    if (!state.encryptionKey) {
      set({ error: 'Encryption not setup. Please provide your master password.' });
      return false;
    }
    
    set({ error: null });
    
    try {
      await diaryService.deleteEntry(date);
      
      // Remove from entries list (find by date)
      set(state => ({
        entries: state.entries.filter(entry => entry.date !== date),
        currentEntry: state.currentEntry?.date === date ? null : state.currentEntry
      }));
      
      return true;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete diary entry'
      });
      return false;
    }
  },
  
  // Media Actions
  loadEntryMedia: async (entryId: number) => {
    try {
      const media = await diaryService.getEntryMedia(entryId);
      set({ currentEntryMedia: media });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load entry media'
      });
    }
  },
  
  uploadMedia: async (entryId: number, mediaData: MediaUploadData) => {
    set({ isUploadingMedia: true, error: null, mediaUploadProgress: 0 });
    
    try {
      const media = await diaryService.uploadMedia(entryId, mediaData);
      
      // Add to current entry media
      set(state => ({ 
        currentEntryMedia: [media, ...state.currentEntryMedia],
        isUploadingMedia: false,
        mediaUploadProgress: 0
      }));
      
      return media;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to upload media', 
        isUploadingMedia: false,
        mediaUploadProgress: 0
      });
      return null;
    }
  },
  
  downloadMedia: async (mediaUuid: string) => {
    try {
      const blob = await diaryService.downloadMedia(mediaUuid);
      return blob;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to download media'
      });
      return null;
    }
  },
  
  deleteMedia: async (mediaUuid: string) => {
    try {
      await diaryService.deleteMedia(mediaUuid);
      
      // Remove from current entry media
      set(state => ({
        currentEntryMedia: state.currentEntryMedia.filter(media => media.uuid !== mediaUuid)
      }));
      
      return true;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete media'
      });
      return false;
    }
  },
  
  // Calendar & Stats Actions
  loadCalendarData: async (year: number, month: number) => {
    try {
      const calendarData = await diaryService.getCalendarData(year, month);
      set({ calendarData });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load calendar data'
      });
    }
  },
  
  loadMoodStats: async (startDate?: string, endDate?: string) => {
    try {
      const moodStats = await diaryService.getMoodStats(startDate, endDate);
      set({ moodStats });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load mood statistics'
      });
    }
  },
  
  loadTemplates: async () => {
    const state = get();
    if (!state.encryptionKey) {
      set({ error: 'Encryption not setup. Please provide your master password.' });
      return;
    }
    
    try {
      const templates = await diaryService.getTemplates();
      set({ templates });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load templates'
      });
    }
  },
  
  // Content Encryption/Decryption
  encryptContent: async (content: string) => {
    const state = get();
    if (!state.encryptionKey) {
      set({ error: 'Encryption not setup. Please provide your master password.' });
      return null;
    }
    
    try {
      const encryptedContent = await diaryService.encryptContent(content, state.encryptionKey);
      return encryptedContent;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to encrypt content'
      });
      return null;
    }
  },
  
  decryptContent: async (encryptedContent: EncryptedContent) => {
    const state = get();
    if (!state.encryptionKey) {
      set({ error: 'Encryption not setup. Please provide your master password.' });
      return null;
    }
    
    try {
      const content = await diaryService.decryptContent(encryptedContent, state.encryptionKey);
      return content;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to decrypt content'
      });
      return null;
    }
  },
  
  // Filter actions
  setYear: (year: number | null) => {
    set({ currentYear: year });
    get().loadEntries();
  },
  
  setMonth: (month: number | null) => {
    set({ currentMonth: month });
    get().loadEntries();
  },
  
  setMood: (mood: number | null) => {
    set({ currentMood: mood });
    get().loadEntries();
  },
  
  setShowTemplates: (show: boolean) => {
    set({ showTemplates: show });
    get().loadEntries();
  },
  
  // UI actions
  clearError: () => set({ error: null }),
  
  clearCurrentEntry: () => set({ 
    currentEntry: null, 
    currentEntryMedia: [] 
  }),
  
  setMediaUploadProgress: (progress: number) => set({ mediaUploadProgress: progress }),
  
  reset: () => set({
    entries: [],
    currentEntry: null,
    currentEntryMedia: [],
    calendarData: [],
    templates: [],
    moodStats: null,
    encryptionKey: null,
    isEncryptionSetup: false,
    isLoading: false,
    isCreating: false,
    isUpdating: false,
    isUploadingMedia: false,
    mediaUploadProgress: 0,
    error: null,
    currentYear: null,
    currentMonth: null,
    currentMood: null,
    showTemplates: false,
    offset: 0,
    hasMore: true
  })
}));
