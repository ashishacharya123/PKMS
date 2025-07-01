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

const ENCRYPTION_CHECK_STRING = 'pkms-encryption-check';

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
  isUnlocked: boolean;
  passwordHint: string | null;
  
  // UI State
  isLoading: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isUploadingMedia: boolean;
  mediaUploadProgress: number;
  error: string | null;
  
  // Filters
  currentYear: number;
  currentMonth: number;
  currentMood: number | null;
  showTemplates: boolean;
  
  // Pagination
  limit: number;
  offset: number;
  hasMore: boolean;
  
  // Actions - Encryption
  init: () => Promise<void>;
  setupEncryption: (password: string, hint?: string) => Promise<boolean>;
  unlockSession: (password: string) => Promise<boolean>;
  clearEncryption: () => void;
  
  // Actions - Entries
  loadEntries: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadEntryByDate: (date: string) => Promise<DiaryEntry | null>;
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
  loadCalendarData: () => Promise<void>;
  loadMoodStats: (startDate?: string, endDate?: string) => Promise<void>;
  loadTemplates: () => Promise<void>;
  
  // Actions - Content Encryption/Decryption
  encryptContent: (content: string) => Promise<EncryptedContent | null>;
  decryptContent: (encryptedContent: EncryptedContent) => Promise<string | null>;
  
  // Filters
  setYear: (year: number) => void;
  setMonth: (month: number) => void;
  setMood: (mood: number | null) => void;
  setShowTemplates: (show: boolean) => void;
  
  // UI Actions
  clearError: () => void;
  setError: (error: string | null) => void;
  clearCurrentEntry: () => void;
  setMediaUploadProgress: (progress: number) => void;
  reset: () => void;
}

// Utility function to format dates for API calls
const formatDateForApi = (date: string) => {
  return date.split('T')[0]; // Extract YYYY-MM-DD from ISO string
};

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
  isUnlocked: false,
  passwordHint: null,
  isLoading: false,
  isCreating: false,
  isUpdating: false,
  isUploadingMedia: false,
  mediaUploadProgress: 0,
  error: null,
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  currentMood: null,
  showTemplates: false,
  limit: 20,
  offset: 0,
  hasMore: true,
  
  // Encryption Actions
  init: async () => {
    try {
      const checkValue = localStorage.getItem('pkms-diary-check');
      const hint = localStorage.getItem('pkms-diary-hint');
      set({ 
        isEncryptionSetup: !!checkValue,
        passwordHint: hint
      });
    } catch (e) {
      console.error('Error checking encryption setup:', e);
    }
  },

  setupEncryption: async (password: string, hint?: string) => {
    set({ isLoading: true, error: null });
    try {
      console.log('Setting up encryption...');
      // Generate encryption key
      const key = await diaryService.generateEncryptionKey(password);
      
      // Create and encrypt check string
      const encryptedCheck = await diaryService.encryptContent(ENCRYPTION_CHECK_STRING, key);
      console.log('Check string encrypted successfully');
      
      // Store check value and hint
      localStorage.setItem('pkms-diary-check', JSON.stringify(encryptedCheck));
      if (hint) {
        localStorage.setItem('pkms-diary-hint', hint);
      } else {
        localStorage.removeItem('pkms-diary-hint');
      }
      
      // Update state
      set({ 
        encryptionKey: key, 
        isEncryptionSetup: true,
        isUnlocked: true,
        passwordHint: hint || null,
        isLoading: false,
        error: null 
      });
      
      // Load initial data
      get().loadCalendarData();
      get().loadEntries();
      
      console.log('Encryption setup completed successfully');
      return true;
    } catch (error) {
      console.error('Error in setupEncryption:', error);
      set({ 
        error: error instanceof Error ? error.message : 'Failed to setup encryption',
        isEncryptionSetup: false,
        isUnlocked: false,
        encryptionKey: null,
        isLoading: false
      });
      return false;
    }
  },

  unlockSession: async (password: string) => {
    set({ isLoading: true, error: null });
    try {
      console.log('Unlocking session...');
      // Generate key from password
      const key = await diaryService.generateEncryptionKey(password);
      
      // Get stored check value
      const storedCheck = localStorage.getItem('pkms-diary-check');
      if (!storedCheck) {
        throw new Error('Encryption setup not found');
      }

      // Verify password by decrypting check string
      try {
        console.log('Verifying password...');
        const encryptedCheck = JSON.parse(storedCheck);
        const decryptedCheck = await diaryService.decryptContent({
          content: encryptedCheck.content,
          iv: encryptedCheck.iv,
          tag: encryptedCheck.tag
        }, key);

        if (decryptedCheck !== ENCRYPTION_CHECK_STRING) {
          console.error('Password verification failed - check string mismatch');
          throw new Error('Invalid password');
        }
        console.log('Password verified successfully');
      } catch (e) {
        console.error('Password verification failed:', e);
        throw new Error('Invalid password');
      }
      
      // Update state on successful unlock
      set({
        encryptionKey: key,
        isUnlocked: true,
        isLoading: false,
        error: null
      });
      
      // Load initial data
      get().loadCalendarData();
      get().loadEntries();
      
      console.log('Session unlocked successfully');
      return true;
    } catch (error) {
      console.error('Error in unlockSession:', error);
      set({
        error: error instanceof Error ? error.message : 'Failed to unlock diary',
        isUnlocked: false,
        encryptionKey: null,
        isLoading: false
      });
      return false;
    }
  },
  
  clearEncryption: () => {
    try {
        localStorage.removeItem('pkms-diary-check');
        localStorage.removeItem('pkms-diary-hint');
    } catch (e) {
        console.error("Could not access localStorage", e);
    }
    set({ 
      encryptionKey: null, 
      isEncryptionSetup: false,
      isUnlocked: false,
      passwordHint: null,
      currentEntry: null,
      entries: [],
      templates: []
    });
  },
  
  // Entry Actions
  loadEntries: async () => {
    const state = get();
    if (!state.isUnlocked || !state.encryptionKey) return;
    
    set({ isLoading: true, error: null, offset: 0 });
    
    try {
      const params: DiaryListParams = {
        year: state.currentYear,
        month: state.currentMonth,
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
    if (state.isLoading || !state.hasMore || !state.isUnlocked) return;
    
    set({ isLoading: true, error: null });
    
    try {
      const params: DiaryListParams = {
        year: state.currentYear,
        month: state.currentMonth,
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
  
  loadEntryByDate: async (date: string): Promise<DiaryEntry | null> => {
    const state = get();
    if (!state.isUnlocked) return null;
    
    set({ isLoading: true, error: null });
    
    try {
      // Format date to YYYY-MM-DD before sending to backend
      const formattedDate = date.split('T')[0];
      const entry = await diaryService.getEntryByDate(formattedDate);
      set({ currentEntry: entry, isLoading: false });
      get().loadEntryMedia(entry.id);
      return entry;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load diary entry', 
        isLoading: false 
      });
      return null;
    }
  },
  
  loadEntryById: async (id: number) => {
    const state = get();
    if (!state.isUnlocked) return;
    
    set({ isLoading: true, error: null });
    
    try {
      const entry = await diaryService.getEntryById(id);
      set({ currentEntry: entry, isLoading: false });
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
    if (!state.isUnlocked) return null;
    
    set({ isCreating: true, error: null });
    
    try {
      const entry = await diaryService.createEntry(data);
      get().loadEntries(); // Refresh entries
      get().loadCalendarData(); // Refresh calendar
      set({ isCreating: false });
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
    if (!state.isUnlocked) return null;
    
    set({ isUpdating: true, error: null });
    
    try {
      const updatedEntry = await diaryService.updateEntry(formatDateForApi(date), data);
      get().loadEntries(); // Refresh entries
      get().loadCalendarData(); // Refresh calendar
      set({ 
        currentEntry: updatedEntry,
        isUpdating: false
      });
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
    if (!state.isUnlocked) return false;
    
    set({ error: null });
    
    try {
      await diaryService.deleteEntry(formatDateForApi(date));
      get().loadEntries(); // Refresh entries
      get().loadCalendarData(); // Refresh calendar
      set({ currentEntry: null });
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
    if (!get().isUnlocked) return;
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
    if (!get().isUnlocked) return null;
    set({ isUploadingMedia: true, error: null, mediaUploadProgress: 0 });
    
    try {
      const media = await diaryService.uploadMedia(entryId, mediaData);
      get().loadEntryMedia(entryId); // Refresh media
      set({ isUploadingMedia: false });
      return media;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to upload media', 
        isUploadingMedia: false
      });
      return null;
    }
  },
  
  downloadMedia: async (mediaUuid: string) => {
    if (!get().isUnlocked) return null;
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
    if (!get().isUnlocked) return false;
    try {
      await diaryService.deleteMedia(mediaUuid);
      get().loadEntryMedia(get().currentEntry!.id); // Refresh media
      return true;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete media'
      });
      return false;
    }
  },
  
  // Calendar & Stats Actions
  loadCalendarData: async () => {
    const state = get();
    if (!state.isUnlocked) return;

    try {
      const data = await diaryService.getCalendarData(
        state.currentYear,
        state.currentMonth
      );
      set({ calendarData: data || [] });
    } catch (error) {
      console.error('Error loading calendar data:', error);
      set({ error: error instanceof Error ? error.message : 'Failed to load calendar data' });
    }
  },
  
  loadMoodStats: async (startDate?: string, endDate?: string) => {
    if (!get().isUnlocked) return;
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
    if (!state.isUnlocked) return;
    
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
    if (!state.encryptionKey) return null;
    
    try {
      return await diaryService.encryptContent(content, state.encryptionKey);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to encrypt content' });
      return null;
    }
  },
  
  decryptContent: async (encryptedContent: EncryptedContent) => {
    const state = get();
    if (!state.encryptionKey) return null;
    
    try {
      return await diaryService.decryptContent(encryptedContent, state.encryptionKey);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to decrypt content' });
      return null;
    }
  },
  
  // Filter actions
  setYear: (year: number) => {
    set({ currentYear: year });
    get().loadCalendarData();
    get().loadEntries();
  },
  
  setMonth: (month: number) => {
    set({ currentMonth: month });
    get().loadCalendarData();
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
  setError: (error: string | null) => set({ error }),
  clearCurrentEntry: () => set({ 
    currentEntry: null, 
    currentEntryMedia: [] 
  }),
  setMediaUploadProgress: (progress: number) => set({ mediaUploadProgress: progress }),
  reset: () => {
    get().clearEncryption();
    set({
        entries: [],
        currentEntry: null,
        currentEntryMedia: [],
        calendarData: [],
        templates: [],
        moodStats: null,
        isLoading: false,
        isCreating: false,
        isUpdating: false,
        isUploadingMedia: false,
        mediaUploadProgress: 0,
        error: null,
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth() + 1,
        currentMood: null,
        showTemplates: false,
        offset: 0,
        hasMore: true
    });
  }
}));
