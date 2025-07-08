import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { archiveService, ArchiveFolder, ArchiveItem, ArchiveItemSummary, FolderTree } from '../services/archiveService';
import { ViewMode, SortOrder, SortBy } from '../types/archive';

interface ErrorState {
  code: number;
  message: string;
  details?: string;
  timestamp: number;
}

interface ArchiveState {
  // Data
  folders: ArchiveFolder[];
  currentFolder: ArchiveFolder | null;
  folderTree: FolderTree[];
  items: ArchiveItemSummary[];
  currentItem: ArchiveItem | null;
  breadcrumb: ArchiveFolder[];
  
  // UI State
  isLoading: boolean;
  isUploadingItems: boolean;
  uploadProgress: number;
  error: ErrorState | null;
  
  // Filters and Search
  currentFolderUuid: string | null;
  currentSearch: string;
  currentMimeType: string | null;
  currentTag: string | null;
  showArchived: boolean;
  selectedItems: Set<string>;
  
  // View State
  viewMode: ViewMode;
  sortBy: SortBy;
  sortOrder: SortOrder;
  
  // Actions
  loadFolders: (parentUuid?: string) => Promise<void>;
  loadFolderTree: () => Promise<void>;
  createFolder: (name: string, description?: string, parentUuid?: string) => Promise<boolean>;
  updateFolder: (uuid: string, data: { name?: string; description?: string; is_archived?: boolean }) => Promise<boolean>;
  deleteFolder: (uuid: string, force?: boolean) => Promise<boolean>;
  
  loadFolderItems: (folderUuid?: string) => Promise<void>;
  uploadItems: (folderUuid: string, files: File[], tags?: string[]) => Promise<boolean>;
  updateItem: (uuid: string, data: any) => Promise<boolean>;
  deleteItem: (uuid: string) => Promise<boolean>;
  downloadItem: (uuid: string, filename: string) => Promise<void>;
  
  navigateToFolder: (folderUuid?: string) => Promise<void>;
  buildBreadcrumb: (folderUuid: string | null) => void;
  
  setCurrentSearch: (search: string) => void;
  setCurrentMimeType: (mimeType: string | null) => void;
  setCurrentTag: (tag: string | null) => void;
  setShowArchived: (show: boolean) => void;
  
  toggleItemSelection: (uuid: string) => void;
  selectAllItems: () => void;
  clearSelection: () => void;
  
  setViewMode: (mode: ViewMode) => void;
  setSortBy: (field: SortBy) => void;
  setSortOrder: (order: SortOrder) => void;
  
  clearError: () => void;
  reset: () => void;
  
  folderTreeCache: Map<string, FolderTree>;
  lastTreeUpdate: number;

  // Error handling
  setError: (code: number, message: string, details?: string) => void;
}

const initialState: Omit<ArchiveState, 'reset' | 'clearError' | 'setError' | 'setSortOrder' | 'setSortBy' | 'setViewMode' | 'clearSelection' | 'selectAllItems' | 'toggleItemSelection' | 'setShowArchived' | 'setCurrentTag' | 'setCurrentMimeType' | 'setCurrentSearch' | 'buildBreadcrumb' | 'navigateToFolder' | 'downloadItem' | 'deleteItem' | 'updateItem' | 'uploadItems' | 'loadFolderItems' | 'deleteFolder' | 'updateFolder' | 'createFolder' | 'loadFolderTree' | 'loadFolders'> = {
  folders: [],
  currentFolder: null,
  folderTree: [],
  items: [],
  currentItem: null,
  breadcrumb: [],
  isLoading: false,
  isUploadingItems: false,
  uploadProgress: 0,
  error: null,
  currentFolderUuid: null,
  currentSearch: '',
  currentMimeType: null,
  currentTag: null,
  showArchived: false,
  selectedItems: new Set(),
  viewMode: ViewMode.GRID,
  sortBy: SortBy.NAME,
  sortOrder: SortOrder.ASC,
  folderTreeCache: new Map(),
  lastTreeUpdate: 0,
};

export const useArchiveStore = create<ArchiveState>()(
  devtools(
    (set, get) => ({
      ...initialState,
      
      loadFolders: async (parentUuid?: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const folders = await archiveService.getFolders({
            parent_uuid: parentUuid,
            archived: get().showArchived
          });
          
          set({ folders, isLoading: false });
        } catch (error: any) {
          set({ 
            error: {
              code: error.response?.status || 500,
              message: error.response?.data?.detail || 'Failed to load folders',
              details: error.message,
              timestamp: Date.now()
            },
            isLoading: false 
          });
        }
      },

      loadFolderTree: async () => {
        const now = Date.now();
        const cacheTimeout = 5000; // 5 seconds cache timeout
        
        try {
          // Check cache freshness
          if (now - get().lastTreeUpdate < cacheTimeout) {
            return;
          }
          
          const folderTree = await archiveService.getFolderTree(undefined, get().showArchived);
          
          // Update cache
          const newCache = new Map(get().folderTreeCache);
          folderTree.forEach(tree => {
            newCache.set(tree.folder.uuid, tree);
          });
          
          set({ 
            folderTree, 
            folderTreeCache: newCache,
            lastTreeUpdate: now,
            isLoading: false 
          });
        } catch (error: any) {
          set({ 
            error: {
              code: error.response?.status || 500,
              message: error.response?.data?.detail || 'Failed to load folder tree',
              details: error.message,
              timestamp: Date.now()
            },
            isLoading: false 
          });
        }
      },

      createFolder: async (name: string, description?: string, parentUuid?: string) => {
        set({ isLoading: true, error: null });
        
        try {
          const validation = archiveService.validateFolderName(name);
          if (!validation.isValid) {
            set({ error: validation.error!, isLoading: false });
            return false;
          }

          const newFolder = await archiveService.createFolder({
            name,
            description,
            parent_uuid: parentUuid
          });
          
          // Update folders list
          const { folders } = get();
          set({ folders: [...folders, newFolder] });
          
          // Incrementally update tree
          const parentTree = parentUuid ? get().folderTreeCache.get(parentUuid) : null;
          if (parentTree) {
            const updatedTree = {
              ...parentTree,
              children: [...parentTree.children, { folder: newFolder, children: [], items: [] }]
            };
            const newCache = new Map(get().folderTreeCache);
            newCache.set(parentUuid, updatedTree);
            set({ folderTreeCache: newCache });
            
            // Only reload full tree if we're at root or the cache is old
            const timeSinceLastUpdate = Date.now() - get().lastTreeUpdate;
            if (!parentUuid || timeSinceLastUpdate > 30000) {
              await get().loadFolderTree();
            }
          } else {
            // If parent not in cache, reload full tree
            await get().loadFolderTree();
          }
          
          set({ isLoading: false });
          return true;
        } catch (error: any) {
          set({ 
            error: {
              code: error.response?.status || 500,
              message: error.response?.data?.detail || 'Failed to create folder',
              details: error.message,
              timestamp: Date.now()
            },
            isLoading: false 
          });
          return false;
        }
      },

      updateFolder: async (uuid: string, data: { name?: string; description?: string; is_archived?: boolean }) => {
        set({ error: null });
        
        try {
          // Validate folder name if provided
          if (data.name) {
            const validation = archiveService.validateFolderName(data.name);
            if (!validation.isValid) {
              set({ error: validation.error! });
              return false;
            }
          }

          const updatedFolder = await archiveService.updateFolder(uuid, data);
          
          // Update in folders list
          const { folders, currentFolder } = get();
          const newFolders = folders.map(folder => 
            folder.uuid === uuid ? updatedFolder : folder
          );
          
          set({ 
            folders: newFolders,
            currentFolder: currentFolder?.uuid === uuid ? updatedFolder : currentFolder
          });
          
          return true;
        } catch (error: any) {
          set({ 
            error: {
              code: error.response?.status || 500,
              message: error.response?.data?.detail || 'Failed to update folder',
              details: error.message,
              timestamp: Date.now()
            }
          });
          return false;
        }
      },

      deleteFolder: async (uuid: string, force = false) => {
        set({ error: null });
        
        try {
          await archiveService.deleteFolder(uuid, force);
          
          // Update folders list
          const { folders } = get();
          const newFolders = folders.filter(folder => folder.uuid !== uuid);
          
          // Update tree cache
          const newCache = new Map(get().folderTreeCache);
          newCache.delete(uuid);
          
          // Find and update parent in cache
          const deletedFolder = folders.find(f => f.uuid === uuid);
          if (deletedFolder?.parent_uuid) {
            const parentTree = newCache.get(deletedFolder.parent_uuid);
            if (parentTree) {
              const updatedParent = {
                ...parentTree,
                children: parentTree.children.filter(child => child.folder.uuid !== uuid)
              };
              newCache.set(deletedFolder.parent_uuid, updatedParent);
            }
          }
          
          set({ 
            folders: newFolders,
            folderTreeCache: newCache
          });
          
          // Reload tree only if necessary
          const timeSinceLastUpdate = Date.now() - get().lastTreeUpdate;
          if (timeSinceLastUpdate > 30000) {
            await get().loadFolderTree();
          }
          
          return true;
        } catch (error: any) {
          set({ 
            error: {
              code: error.response?.status || 500,
              message: error.response?.data?.detail || 'Failed to delete folder',
              details: error.message,
              timestamp: Date.now()
            },
            isLoading: false 
          });
          return false;
        }
      },

      // Item management actions
      loadFolderItems: async (folderUuid?: string) => {
        set({ isLoading: true, error: null, currentFolderUuid: folderUuid || null });
        
        try {
          if (!folderUuid) {
            // This is the root view, load only root folders and no items.
            await get().loadFolders(undefined);
            set({ items: [], currentFolder: null, breadcrumb: [] });
            return;
          }

          // Load folder details
          const folder = await archiveService.getFolder(folderUuid);
          
          // Load subfolders
          const subFolders = await archiveService.getFolders({
            parent_uuid: folderUuid,
            archived: get().showArchived
          });

          // Load items with current filters
          const { currentSearch, currentMimeType, currentTag, showArchived } = get();
          const items = await archiveService.getFolderItems(folderUuid, {
            search: currentSearch || undefined,
            mime_type: currentMimeType || undefined,
            tag: currentTag || undefined,
            archived: showArchived
          });
          
          // Build breadcrumb
          await get().buildBreadcrumb(folderUuid);
          
          set({ 
            currentFolder: folder,
            folders: subFolders,
            items,
            isLoading: false 
          });
        } catch (error: any) {
          set({ 
            error: {
              code: error.response?.status || 500,
              message: error.response?.data?.detail || 'Failed to load folder items',
              details: error.message,
              timestamp: Date.now()
            },
            isLoading: false 
          });
        }
      },

      uploadItems: async (folderUuid: string, files: File[], tags: string[] = []) => {
        set({ isUploadingItems: true, uploadProgress: 0, error: null });
        
        try {
          let completed = 0;
          const newItems: ArchiveItem[] = [];
          
          for (const file of files) {
            try {
              // Check file type support
              if (!archiveService.isFileTypeSupported(file.name)) {
                console.warn(`Skipping unsupported file type: ${file.name}`);
                completed++;
                continue;
              }
              
              const uploadData = {
                file,
                name: file.name.split('.')[0], // Remove extension for default name
                tags
              };
              
              const newItem = await archiveService.uploadItem(folderUuid, uploadData);
              newItems.push(newItem);
              
              completed++;
              const progress = Math.round((completed / files.length) * 100);
              set({ uploadProgress: progress });
            } catch (fileError) {
              console.error(`Failed to upload ${file.name}:`, fileError);
              completed++;
              // Continue with other files
            }
          }
          
          // Convert to summaries and add to items list
          const { items } = get();
          const newSummaries = newItems.map(item => ({
            uuid: item.uuid,
            name: item.name,
            folder_uuid: item.folder_uuid,
            original_filename: item.original_filename,
            mime_type: item.mime_type,
            file_size: item.file_size,
            is_archived: item.is_archived,
            is_favorite: item.is_favorite,
            created_at: item.created_at,
            updated_at: item.updated_at,
            tags: item.tags,
            preview: item.extracted_text?.substring(0, 200) + '...' || ''
          }));
          
          set({ 
            items: [...newSummaries, ...items],
            isUploadingItems: false,
            uploadProgress: 100 
          });
          
          // Reset progress after a short delay
          setTimeout(() => set({ uploadProgress: 0 }), 1000);
          
          return true;
        } catch (error: any) {
          set({ 
            error: {
              code: error.response?.status || 500,
              message: error.response?.data?.detail || 'Failed to upload files',
              details: error.message,
              timestamp: Date.now()
            },
            isUploadingItems: false,
            uploadProgress: 0 
          });
          return false;
        }
      },

      updateItem: async (uuid: string, data: any) => {
        set({ error: null });
        
        try {
          const updatedItem = await archiveService.updateItem(uuid, data);
          
          // Update in items list
          const { items } = get();
          const newItems = items.map(item => 
            item.uuid === uuid ? {
              ...item,
              name: updatedItem.name,
              description: updatedItem.description,
              is_archived: updatedItem.is_archived,
              is_favorite: updatedItem.is_favorite,
              tags: updatedItem.tags,
              updated_at: updatedItem.updated_at
            } : item
          );
          
          set({ items: newItems });
          return true;
        } catch (error: any) {
          set({ 
            error: {
              code: error.response?.status || 500,
              message: error.response?.data?.detail || 'Failed to update item',
              details: error.message,
              timestamp: Date.now()
            }
          });
          return false;
        }
      },

      deleteItem: async (uuid: string) => {
        set({ error: null });
        
        try {
          await archiveService.deleteItem(uuid);
          
          // Remove from items list
          const { items, selectedItems } = get();
          const newItems = items.filter(item => item.uuid !== uuid);
          const newSelectedItems = new Set(selectedItems);
          newSelectedItems.delete(uuid);
          
          set({ 
            items: newItems,
            selectedItems: newSelectedItems 
          });
          
          return true;
        } catch (error: any) {
          set({ 
            error: {
              code: error.response?.status || 500,
              message: error.response?.data?.detail || 'Failed to delete item',
              details: error.message,
              timestamp: Date.now()
            }
          });
          return false;
        }
      },

      downloadItem: async (uuid: string, filename: string) => {
        set({ error: null });
        
        try {
          const blob = await archiveService.downloadItem(uuid);
          
          // Create download link
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.click();
          window.URL.revokeObjectURL(url);
        } catch (error: any) {
          set({ 
            error: {
              code: error.response?.status || 500,
              message: error.response?.data?.detail || 'Failed to download item',
              details: error.message,
              timestamp: Date.now()
            }
          });
        }
      },

      // Navigation actions
      navigateToFolder: async (folderUuid?: string) => {
        // We just need to load the items, which also builds the breadcrumb
        await get().loadFolderItems(folderUuid);
      },

      buildBreadcrumb: async (folderUuid: string | null) => {
        if (!folderUuid) {
          set({ breadcrumb: [] });
          return;
        }
        
        try {
          const breadcrumb = await archiveService.getBreadcrumb(folderUuid);
          set({ breadcrumb });
        } catch (error) {
          console.error('Failed to build breadcrumb:', error);
          // Don't set a store error, as the main content might have loaded
        }
      },

      // Filter and search actions
      setCurrentSearch: (search: string) => {
        set({ currentSearch: search });
        
        // Reload items if we're in a folder
        const { currentFolderUuid } = get();
        if (currentFolderUuid) {
          get().loadFolderItems(currentFolderUuid);
        }
      },

      setCurrentMimeType: (mimeType: string | null) => {
        set({ currentMimeType: mimeType });
        
        // Reload items if we're in a folder
        const { currentFolderUuid } = get();
        if (currentFolderUuid) {
          get().loadFolderItems(currentFolderUuid);
        }
      },

      setCurrentTag: (tag: string | null) => {
        set({ currentTag: tag });
        
        // Reload items if we're in a folder
        const { currentFolderUuid } = get();
        if (currentFolderUuid) {
          get().loadFolderItems(currentFolderUuid);
        }
      },

      setShowArchived: (show: boolean) => {
        set({ showArchived: show });
        
        // Reload current data
        const { currentFolderUuid } = get();
        if (currentFolderUuid) {
          get().loadFolderItems(currentFolderUuid);
        } else {
          get().loadFolders();
        }
      },

      // Selection actions
      toggleItemSelection: (uuid: string) => {
        const { selectedItems } = get();
        const newSelectedItems = new Set(selectedItems);
        
        if (newSelectedItems.has(uuid)) {
          newSelectedItems.delete(uuid);
        } else {
          newSelectedItems.add(uuid);
        }
        
        set({ selectedItems: newSelectedItems });
      },

      selectAllItems: () => {
        const { items } = get();
        const allUuids = new Set(items.map(item => item.uuid));
        set({ selectedItems: allUuids });
      },

      clearSelection: () => {
        set({ selectedItems: new Set() });
      },

      // View actions
      setViewMode: (mode: ViewMode) => {
        set({ viewMode: mode });
      },

      setSortBy: (field: SortBy) => {
        const { sortBy, sortOrder } = get();
        
        if (sortBy === field) {
          // Toggle order if same field
          set({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' });
        } else {
          // Set new field with descending order
          set({ sortBy: field, sortOrder: 'desc' });
        }
      },

      setSortOrder: (order: SortOrder) => {
        set({ sortOrder: order });
      },

      // Utility actions
      clearError: () => {
        set({ error: null });
      },

      // Error handling
      setError: (code: number, message: string, details?: string) => set({
        error: {
          code,
          message,
          details,
          timestamp: Date.now()
        }
      }),

      // Reset state
      reset: () => set(initialState),
    }),
    { name: 'archive-store' }
  )
); 