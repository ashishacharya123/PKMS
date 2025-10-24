import { create } from 'zustand';
import { archiveService } from '../services/archiveService';
import { ArchiveFolder, ArchiveItem } from '../types/archive';
import { UploadProgress } from '../services/shared/coreUploadService';
import { FolderTree } from '../types/archive';
import { archiveCacheAware } from '../services/cacheAwareService';
import { logger } from '../utils/logger';

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
  folderTree: FolderTree[];
  loadFolderSearchFTS: (query: string) => Promise<void>;
  clearFolderSearchResults: () => void;
  // Actions
  setCurrentFolder: (folderId: string | null) => Promise<void>;
  loadFolders: (rootUuid?: string) => Promise<void>;
  loadItems: (folderId: string) => Promise<void>;
  loadFolderItems: (folderId: string) => Promise<void>; // Alias for loadItems
  createFolder: (name: string, parentUuid?: string) => Promise<void>;
  updateFolder: (uuid: string, data: Partial<ArchiveFolder>) => Promise<void>;
  deleteFolder: (uuid: string, force?: boolean) => Promise<void>;
  uploadFile: (file: File, folderId: string, tags?: string[]) => Promise<void>;
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
  folderTree: [],

  setCurrentFolder: async (folderId) => {
    if (!folderId) {
      set({ currentFolder: null, items: [] });
      // Load root folders when clearing selection
      await get().loadFolders(undefined);
      return;
    }
    set({ isLoading: true });
    try {
      // 🎯 AUTOMATIC: Cache checking, API calls, and revalidation handled automatically
      const folderDetails = await archiveCacheAware.getFolder(folderId);
      set({ currentFolder: folderDetails });
      
      await Promise.all([
        get().loadItems(folderId),
        get().loadFolders(folderId), // load subfolders for this folder
      ]);
    } catch (e) {
      set({ error: 'Failed to select folder' });
    } finally {
      set({ isLoading: false });
    }
  },

  loadFolders: async (rootUuid) => {
    set({ isLoading: true, error: null });
    try {
      const [folders, tree] = await Promise.all([
        archiveService.listFolders(rootUuid),
        archiveService.getFolderTree(undefined)
      ]);
      set({ folders, folderTree: tree || [], isLoading: false });
    } catch (error) {
      set({ error: 'Failed to load folders', isLoading: false, folderTree: [] });
    }
  },

  loadItems: async (folderId) => {
    set({ isLoadingItems: true, error: null });
    try {
      // 🎯 AUTOMATIC: Cache checking, API calls, and revalidation handled automatically
      const items = await archiveCacheAware.getFolderItems(folderId);
      set({ items, isLoadingItems: false });
    } catch (error) {
      set({ error: 'Failed to load items', isLoadingItems: false });
    }
  },

  loadFolderItems: async (folderId) => {
    // Alias for loadItems for consistency
    return get().loadItems(folderId);
  },

  createFolder: async (name, parentUuid) => {
    set({ isLoading: true, error: null });
    try {
      // Support description from temporary state if present
      const description = (get() as any)._pendingFolderDescription as string | undefined;
      const newFolder = await archiveService.createFolder(name, parentUuid || undefined, description);
      // Clear temp description
      (get() as any)._pendingFolderDescription = undefined;
      
      // 🎯 AUTOMATIC: Smart cache invalidation
      await archiveCacheAware.invalidateAll();
      
      // OPTIMISTIC UPDATE: Add to state immediately instead of refetching
      set((state) => {
        const addNodeToTree = (tree: FolderTree[], newFolder: ArchiveFolder, parentUuid?: string): FolderTree[] => {
          if (!parentUuid) {
            // Add to root
            return [...tree, { folder: newFolder, children: [], items: [] }];
          }
          
          // Recursively find parent and add child
          return tree.map((node) => {
            if (node.folder.uuid === parentUuid) {
              return {
                ...node,
                children: [
                  ...(node.children || []),
                  { folder: newFolder, children: [], items: [] }
                ]
              };
            }
            if (node.children && node.children.length > 0) {
              return {
                ...node,
                children: addNodeToTree(node.children, newFolder, parentUuid)
              };
            }
            return node;
          });
        };
        
        return {
          isLoading: false,
          folderTree: addNodeToTree(state.folderTree, newFolder, parentUuid),
          folders: parentUuid === state.currentFolder?.uuid
            ? [...state.folders, newFolder]
            : state.folders
        };
      });
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

  deleteFolder: async (uuid, force = false) => {
    set({ isLoading: true, error: null });
    try {
      await archiveService.deleteFolder(uuid, force);
      await get().loadFolders();
      if(get().currentFolder?.uuid === uuid){
        set({ currentFolder: null, items: [] });
      }
    } catch (error) {
      set({ error: 'Failed to delete folder', isLoading: false });
      throw error; // allow UI to handle specific errors (e.g., prompt force-delete)
    }
  },

  uploadFile: async (file, folderId, tags = []) => {
    set({ isUploading: true, error: null, uploadProgress: null });
    try {
      const newItem = await archiveService.uploadFile(file, folderId, tags, (progress) => {
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