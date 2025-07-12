import { create } from 'zustand';
import { archiveService } from '../services/archiveService';
import { ArchiveFolder, ArchiveItem } from '../types/archive';
import { UploadProgress } from '../services/shared/coreUploadService';
import { FolderTree } from '../types/archive';

interface ArchiveState {
  currentFolder: ArchiveFolder | null;
  folders: ArchiveFolder[];
  items: ArchiveItem[];
  isLoading: boolean;
  isLoadingItems: boolean;
  isUploading: boolean;
  uploadProgress: UploadProgress | null;
  error: string | null;
  folderSearchResults: FolderTree[];
  loadFolderSearchFTS: (query: string) => Promise<void>;
  clearFolderSearchResults: () => void;
  // Actions
  setCurrentFolder: (folderId: string | null) => Promise<void>;
  loadFolders: () => Promise<void>;
  loadItems: (folderId: string) => Promise<void>;
  createFolder: (name: string, parentUuid?: string) => Promise<void>;
  updateFolder: (uuid: string, data: Partial<ArchiveFolder>) => Promise<void>;
  deleteFolder: (uuid: string) => Promise<void>;
  uploadFile: (file: File, folderId: string) => Promise<void>;
  setError: (error: string | null) => void;
}

export const useArchiveStore = create<ArchiveState>((set, get) => ({
  currentFolder: null,
  folders: [],
  items: [],
  isLoading: false,
  isLoadingItems: false,
  isUploading: false,
  uploadProgress: null,
  error: null,
  folderSearchResults: [],

  setCurrentFolder: async (folderId) => {
    if (!folderId) {
      set({ currentFolder: null, items: [] });
      return;
    }
    set({ isLoading: true });
    try {
      const folderDetails = await archiveService.getFolder(folderId);
      set({ currentFolder: folderDetails });
      await get().loadItems(folderId);
    } catch (e) {
      set({ error: 'Failed to select folder' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadFolders: async () => {
    set({ isLoading: true, error: null });
    try {
      const folders = await archiveService.listFolders();
      set({ folders, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to load folders', isLoading: false });
    }
  },

  loadItems: async (folderId) => {
    set({ isLoadingItems: true, error: null });
    try {
      const items = await archiveService.getFolderItems(folderId);
      set({ items, isLoadingItems: false });
    } catch (error) {
      set({ error: 'Failed to load items', isLoadingItems: false });
    }
  },

  createFolder: async (name, parentUuid) => {
    set({ isLoading: true, error: null });
    try {
      await archiveService.createFolder(name, parentUuid);
      await get().loadFolders();
    } catch (error) {
      set({ error: 'Failed to create folder', isLoading: false });
    }
  },

  updateFolder: async (uuid, data) => {
    set({ isLoading: true, error: null });
    try {
      await archiveService.updateFolder(uuid, data);
      await get().loadFolders();
    } catch (error) {
      set({ error: 'Failed to update folder', isLoading: false });
    }
  },

  deleteFolder: async (uuid) => {
    set({ isLoading: true, error: null });
    try {
      await archiveService.deleteFolder(uuid);
      await get().loadFolders();
      if(get().currentFolder?.uuid === uuid){
        set({ currentFolder: null, items: [] });
      }
    } catch (error) {
      set({ error: 'Failed to delete folder', isLoading: false });
    }
  },

  uploadFile: async (file, folderId) => {
    set({ isUploading: true, error: null, uploadProgress: null });
    try {
      const newItem = await archiveService.uploadFile(file, folderId, (progress) => {
        set({ uploadProgress: progress });
      });
      // Optimistic update
      set((state) => ({ items: [newItem, ...state.items] }));
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to upload file',
      });
    } finally {
      set({ isUploading: false, uploadProgress: null });
    }
  },

  loadFolderSearchFTS: async (query) => {
    set({ isLoading: true, error: null });
    try {
      const results = await archiveService.searchFoldersFTS(query);
      set({ folderSearchResults: results, isLoading: false });
    } catch (error) {
      set({ error: 'Failed to search folders', isLoading: false });
    }
  },
  clearFolderSearchResults: () => set({ folderSearchResults: [] }),

  setError: (error) => set({ error }),
})); 