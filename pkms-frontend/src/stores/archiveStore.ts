import { create } from 'zustand';
import { archiveService, ArchiveFolder, ArchiveItem, ArchiveItemSummary, FolderTree } from '../services/archiveService';

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
  error: string | null;
  
  // Filters and Search
  currentFolderUuid: string | null;
  currentSearch: string;
  currentMimeType: string | null;
  currentTag: string | null;
  showArchived: boolean;
  selectedItems: Set<string>;
  
  // View State
  viewMode: 'list' | 'grid' | 'tree';
  sortBy: 'name' | 'updated_at' | 'file_size' | 'created_at';
  sortOrder: 'asc' | 'desc';
  
  // Actions
  loadFolders: (parentUuid?: string) => Promise<void>;
  loadFolderTree: (rootUuid?: string) => Promise<void>;
  createFolder: (name: string, description?: string, parentUuid?: string) => Promise<boolean>;
  updateFolder: (uuid: string, data: { name?: string; description?: string; is_archived?: boolean }) => Promise<boolean>;
  deleteFolder: (uuid: string, force?: boolean) => Promise<boolean>;
  
  loadFolderItems: (folderUuid: string) => Promise<void>;
  uploadItems: (folderUuid: string, files: File[], tags?: string[]) => Promise<boolean>;
  updateItem: (uuid: string, data: any) => Promise<boolean>;
  deleteItem: (uuid: string) => Promise<boolean>;
  downloadItem: (uuid: string, filename: string) => Promise<void>;
  
  navigateToFolder: (folderUuid: string) => Promise<void>;
  buildBreadcrumb: (folder: ArchiveFolder) => void;
  
  setCurrentSearch: (search: string) => void;
  setCurrentMimeType: (mimeType: string | null) => void;
  setCurrentTag: (tag: string | null) => void;
  setShowArchived: (show: boolean) => void;
  
  toggleItemSelection: (uuid: string) => void;
  selectAllItems: () => void;
  clearSelection: () => void;
  
  setViewMode: (mode: 'list' | 'grid' | 'tree') => void;
  setSortBy: (field: 'name' | 'updated_at' | 'file_size' | 'created_at') => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  
  clearError: () => void;
  reset: () => void;
}

export const useArchiveStore = create<ArchiveState>((set, get) => ({
  // Initial state
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
  
  viewMode: 'list',
  sortBy: 'updated_at',
  sortOrder: 'desc',

  // Folder management actions
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
        error: error.response?.data?.detail || 'Failed to load folders',
        isLoading: false 
      });
    }
  },

  loadFolderTree: async (rootUuid?: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const folderTree = await archiveService.getFolderTree(rootUuid, get().showArchived);
      set({ folderTree, isLoading: false });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Failed to load folder tree',
        isLoading: false 
      });
    }
  },

  createFolder: async (name: string, description?: string, parentUuid?: string) => {
    set({ isLoading: true, error: null });
    
    try {
      // Validate folder name
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
      
      // Add to folders list
      const { folders } = get();
      set({ 
        folders: [...folders, newFolder],
        isLoading: false 
      });
      
      return true;
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Failed to create folder',
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
        error: error.response?.data?.detail || 'Failed to update folder'
      });
      return false;
    }
  },

  deleteFolder: async (uuid: string, force = false) => {
    set({ error: null });
    
    try {
      await archiveService.deleteFolder(uuid, force);
      
      // Remove from folders list
      const { folders } = get();
      const newFolders = folders.filter(folder => folder.uuid !== uuid);
      set({ folders: newFolders });
      
      return true;
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Failed to delete folder'
      });
      return false;
    }
  },

  // Item management actions
  loadFolderItems: async (folderUuid: string) => {
    set({ isLoading: true, error: null, currentFolderUuid: folderUuid });
    
    try {
      // Load folder details
      const folder = await archiveService.getFolder(folderUuid);
      
      // Load items with current filters
      const { currentSearch, currentMimeType, currentTag, showArchived } = get();
      const items = await archiveService.getFolderItems(folderUuid, {
        search: currentSearch || undefined,
        mime_type: currentMimeType || undefined,
        tag: currentTag || undefined,
        archived: showArchived
      });
      
      // Build breadcrumb
      get().buildBreadcrumb(folder);
      
      set({ 
        currentFolder: folder,
        items,
        isLoading: false 
      });
    } catch (error: any) {
      set({ 
        error: error.response?.data?.detail || 'Failed to load folder items',
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
        error: error.response?.data?.detail || 'Failed to upload files',
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
        error: error.response?.data?.detail || 'Failed to update item'
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
        error: error.response?.data?.detail || 'Failed to delete item'
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
        error: error.response?.data?.detail || 'Failed to download item'
      });
    }
  },

  // Navigation actions
  navigateToFolder: async (folderUuid: string) => {
    await get().loadFolderItems(folderUuid);
  },

  buildBreadcrumb: (folder: ArchiveFolder) => {
    const pathParts = archiveService.getBreadcrumbPath(folder);
    const breadcrumb: ArchiveFolder[] = [];
    
    // For now, just add the current folder
    // In a full implementation, you'd build the full path
    breadcrumb.push(folder);
    
    set({ breadcrumb });
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
  setViewMode: (mode: 'list' | 'grid' | 'tree') => {
    set({ viewMode: mode });
  },

  setSortBy: (field: 'name' | 'updated_at' | 'file_size' | 'created_at') => {
    const { sortBy, sortOrder } = get();
    
    if (sortBy === field) {
      // Toggle order if same field
      set({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      // Set new field with descending order
      set({ sortBy: field, sortOrder: 'desc' });
    }
  },

  setSortOrder: (order: 'asc' | 'desc') => {
    set({ sortOrder: order });
  },

  // Utility actions
  clearError: () => {
    set({ error: null });
  },

  reset: () => {
    set({
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
      viewMode: 'list',
      sortBy: 'updated_at',
      sortOrder: 'desc'
    });
  }
})); 