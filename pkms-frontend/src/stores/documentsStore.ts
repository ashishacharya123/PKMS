import { create } from 'zustand';
import { 
  documentsService, 
  type Document, 
  type DocumentSummary, 
  type UpdateDocumentRequest, 
  type SearchResult,
  type DocumentsListParams 
} from '../services/documentsService';

interface DocumentsState {
  // Data
  documents: DocumentSummary[];
  currentDocument: Document | null;
  searchResults: SearchResult[];
  
  // UI State
  isLoading: boolean;
  isUploading: boolean;
  isUpdating: boolean;
  isSearching: boolean;
  uploadProgress: number;
  error: string | null;
  
  // Filters
  currentMimeType: string | null;
  currentTag: string | null;
  searchQuery: string;
  showArchived: boolean;
  showFavoritesOnly: boolean;
  showProjectOnly: boolean;
  currentProjectId: string | null;
  
  // Pagination
  limit: number;
  offset: number;
  hasMore: boolean;
  
  // Actions - Documents
  loadDocuments: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadDocument: (uuid: string) => Promise<void>;
  uploadDocument: (file: File, tags?: string[], projectIds?: string[], isExclusive?: boolean) => Promise<Document | null>;
  updateDocument: (uuid: string, data: UpdateDocumentRequest) => Promise<Document | null>;
  deleteDocument: (uuid: string) => Promise<boolean>;
  toggleArchive: (uuid: string, archived: boolean) => Promise<Document | null>;
  
  // Actions - Search
  searchDocuments: (query: string) => Promise<void>;
  clearSearch: () => void;
  
  // Actions - Download/Preview
  downloadDocument: (uuid: string) => Promise<Blob | null>;
  getDownloadUrl: (uuid: string) => string;
  getPreviewUrl: (uuid: string) => string;
  previewDocument: (uuid: string) => void;
  
  // Filters
  setMimeType: (mimeType: string | null) => void;
  setTag: (tag: string | null) => void;
  setSearch: (query: string) => void;
  setShowArchived: (show: boolean) => void;
  setShowFavoritesOnly: (show: boolean) => void;
  setShowProjectOnly: (show: boolean) => void;
  setCurrentProjectId: (id: string | null) => void;
  
  // UI Actions
  clearError: () => void;
  clearCurrentDocument: () => void;
  setUploadProgress: (progress: number) => void;
  reset: () => void;
}

const initialState: Omit<DocumentsState, 'reset' | 'setUploadProgress' | 'clearCurrentDocument' | 'clearError' | 'setShowArchived' | 'setShowFavoritesOnly' | 'setShowProjectOnly' | 'setCurrentProjectId' | 'setSearch' | 'setTag' | 'setMimeType' | 'getPreviewUrl' | 'getDownloadUrl' | 'downloadDocument' | 'previewDocument' | 'clearSearch' | 'searchDocuments' | 'toggleArchive' | 'deleteDocument' | 'updateDocument' | 'uploadDocument' | 'loadDocument' | 'loadMore' | 'loadDocuments'> = {
  documents: [],
  currentDocument: null,
  searchResults: [],
  isLoading: false,
  isUploading: false,
  isUpdating: false,
  isSearching: false,
  uploadProgress: 0,
  error: null,
  currentMimeType: null,
  currentTag: null,
  searchQuery: '',
  showArchived: false,
  showFavoritesOnly: false,
  showProjectOnly: false,
  // Default view: non-project documents only
  // We achieve this by setting project_only=false and unassigned_only=true in requests
  currentProjectId: null,
  limit: 20,
  offset: 0,
  hasMore: true,
};

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  ...initialState,
  
  loadDocuments: async () => {
    const state = get();
    set({ isLoading: true, error: null, offset: 0 });
    
    try {
      const params: DocumentsListParams = {
        mime_type: state.currentMimeType || undefined,
        tag: state.currentTag || undefined,
        search: state.searchQuery || undefined,
        archived: state.showArchived,
        is_favorite: state.showFavoritesOnly || undefined,
        project_uuid: state.currentProjectId || undefined,
        // Fixed: Don't send conflicting filters
        // - If showProjectOnly is true: send project_only=true (show only docs WITH projects)
        // - If showProjectOnly is false: send nothing (show ALL docs, both with and without projects)
        project_only: state.showProjectOnly || undefined,
        // REMOVED: unassigned_only - was backwards logic causing uploaded docs to be hidden
        limit: state.limit,
        offset: 0
      };
      
      const documents = await documentsService.listDocuments(params);
      
      set({ 
        documents, 
        isLoading: false, 
        hasMore: documents.length === state.limit,
        offset: documents.length 
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load documents', 
        isLoading: false 
      });
    }
  },
  
  loadMore: async () => {
    const state = get();
    if (state.isLoading || !state.hasMore) return;
    
    set({ isLoading: true, error: null });
    
    try {
      const params: DocumentsListParams = {
        mime_type: state.currentMimeType || undefined,
        tag: state.currentTag || undefined,
        search: state.searchQuery || undefined,
        archived: state.showArchived,
        is_favorite: state.showFavoritesOnly || undefined,
        project_uuid: state.currentProjectId || undefined,
        project_only: state.showProjectOnly || undefined,
        // REMOVED: unassigned_only - was backwards logic causing uploaded docs to be hidden
        limit: state.limit,
        offset: state.offset
      };
      
      const newDocuments = await documentsService.listDocuments(params);
      
      set({ 
        documents: [...state.documents, ...newDocuments],
        isLoading: false,
        hasMore: newDocuments.length === state.limit,
        offset: state.offset + newDocuments.length
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load more documents', 
        isLoading: false 
      });
    }
  },
  
  loadDocument: async (uuid: string) => {
    set({ isLoading: true, error: null });
    
    try {
      const document = await documentsService.getDocument(uuid);
      set({ currentDocument: document, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load document', 
        isLoading: false 
      });
    }
  },
  
  uploadDocument: async (file: File, tags: string[] = [], projectIds: string[] = [], isExclusive: boolean = false) => {
    set({ isUploading: true, error: null, uploadProgress: 0 });
    
    try {
      const document = await documentsService.uploadDocument(
        file, 
        tags, 
        (progress) => set({ uploadProgress: progress }),
        projectIds,
        isExclusive
      );
      
      // Convert Document to DocumentSummary for the list
      const documentSummary: DocumentSummary = {
        uuid: document.uuid,
        title: document.original_name, // Use original_name as title
        filename: document.filename,
        original_name: document.original_name,
        file_path: document.file_path,
        file_size: document.file_size,
        mime_type: document.mime_type,
        isExclusiveMode: (document as any).isExclusiveMode ?? false,
        is_favorite: document.is_favorite ?? false,
        is_archived: document.is_archived,
        // upload_status field removed - backend no longer tracks upload status
        created_at: document.created_at,
        updated_at: document.updated_at,
        tags: document.tags,
        projects: (document as any).projects ?? []
      };
      
      // Add to documents list if it matches current filters
      const state = get();
      
      // Check if document matches current filters
      const matchesMimeType = !state.currentMimeType || document.mime_type === state.currentMimeType;
      const matchesTag = !state.currentTag || document.tags.includes(state.currentTag);
      const matchesSearch = !state.searchQuery || document.original_name.toLowerCase().includes(state.searchQuery.toLowerCase());
      const matchesArchived = state.showArchived || !document.is_archived;
      const matchesFavorite = !state.showFavoritesOnly || document.is_favorite;
      
      // Check project filter: if showProjectOnly is true, only show documents with project_id
      // For now, assume uploaded documents are unassigned (no project), so they should show when !showProjectOnly
      const matchesProjectFilter = !state.showProjectOnly;
      
      const shouldAdd = matchesMimeType && matchesTag && matchesSearch && matchesArchived && matchesFavorite && matchesProjectFilter;
      
      set({ 
        documents: shouldAdd ? [documentSummary, ...state.documents] : state.documents,
        isUploading: false,
        uploadProgress: 0
      });
      
      // If document was uploaded but doesn't match filters, user might be confused
      // Debug: Uploaded document does not match current filters
      if (!shouldAdd) {
        // Document filtered out based on current view settings
            mimeType: state.currentMimeType,
            tag: state.currentTag,
            search: state.searchQuery,
            showArchived: state.showArchived,
            showFavoritesOnly: state.showFavoritesOnly,
            showProjectOnly: state.showProjectOnly
          }
        });
      }
      
      return document;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to upload document', 
        isUploading: false,
        uploadProgress: 0
      });
      return null;
    }
  },
  
  updateDocument: async (uuid: string, data: UpdateDocumentRequest) => {
    set({ isUpdating: true, error: null });
    try {
      const state = get();
      // Resolve numeric id from uuid present in list state
      const existing = state.documents.find(d => d.uuid === uuid);
      if (!existing) {
        throw new Error('Document not found');
      }
      const updatedDocument = await documentsService.updateDocument(existing.uuid, data);

      // Build full summary with proper type safety
      const documentSummary: DocumentSummary = {
        uuid: updatedDocument.uuid,
        title: updatedDocument.title,
        original_name: updatedDocument.original_name,
        filename: updatedDocument.filename,
        file_path: updatedDocument.file_path,
        file_size: updatedDocument.file_size,
        mime_type: updatedDocument.mime_type,
        description: updatedDocument.description,
        is_favorite: updatedDocument.is_favorite,
        is_archived: updatedDocument.is_archived,
        // upload_status field removed - backend no longer tracks upload status
        created_at: updatedDocument.created_at,
        updated_at: updatedDocument.updated_at,
        tags: updatedDocument.tags,
        isExclusiveMode: updatedDocument.isExclusiveMode ?? false,
        projects: updatedDocument.projects ?? [],
      };

      set(state => ({
        documents: state.documents.map(doc => doc.uuid === updatedDocument.uuid ? documentSummary : doc),
        currentDocument: state.currentDocument?.uuid === updatedDocument.uuid ? updatedDocument : state.currentDocument,
        isUpdating: false
      }));

      return updatedDocument;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update document', 
        isUpdating: false 
      });
      return null;
    }
  },
  
  deleteDocument: async (uuid: string) => {
    set({ error: null });
    
    try {
      // Find the document to get its ID
      const state = get();
      const document = state.documents.find(doc => doc.uuid === uuid);
      if (!document) {
        throw new Error('Document not found');
      }
      
      await documentsService.deleteDocument(document.uuid);
      
      // Remove from documents list
      set(state => ({
        documents: state.documents.filter(doc => doc.uuid !== uuid),
        currentDocument: state.currentDocument?.uuid === uuid ? null : state.currentDocument
      }));
      
      return true;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete document'
      });
      return false;
    }
  },
  
  toggleArchive: async (uuid: string, archived: boolean) => {
    set({ isUpdating: true, error: null });
    try {
      const updatedDocument = await documentsService.toggleArchive(uuid, archived);
      // Build full summary
      const documentSummary: DocumentSummary = {
        uuid: updatedDocument.uuid,
        title: updatedDocument.title,
        original_name: updatedDocument.original_name,
        filename: updatedDocument.filename,
        file_path: updatedDocument.file_path,
        file_size: updatedDocument.file_size,
        mime_type: updatedDocument.mime_type,
        description: updatedDocument.description,
        is_favorite: updatedDocument.is_favorite,
        is_archived: updatedDocument.is_archived,
        // upload_status field removed - backend no longer tracks upload status
        created_at: updatedDocument.created_at,
        updated_at: updatedDocument.updated_at,
        tags: updatedDocument.tags,
        isExclusiveMode: updatedDocument.isExclusiveMode ?? false,
        projects: updatedDocument.projects ?? [],
      };

      set(state => {
        const exists = state.documents.some(d => d.uuid === updatedDocument.uuid);
        if (!exists) {
          // Fallback: reload list if local state is out of sync
          get().loadDocuments();
          return { isUpdating: false } as any;
        }
        const shouldShow = state.showArchived || !documentSummary.is_archived;
        const updatedDocuments = shouldShow 
          ? state.documents.map(doc => doc.uuid === updatedDocument.uuid ? documentSummary : doc)
          : state.documents.filter(doc => doc.uuid !== updatedDocument.uuid);
        return {
          documents: updatedDocuments,
          currentDocument: state.currentDocument?.uuid === updatedDocument.uuid ? updatedDocument : state.currentDocument,
          isUpdating: false
        };
      });

      return updatedDocument;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update document archive status', 
        isUpdating: false 
      });
      return null;
    }
  },
  
  // Search Actions
  searchDocuments: async (query: string) => {
    if (!query.trim()) {
      set({ searchResults: [], isSearching: false });
      return;
    }
    
    set({ isSearching: true, error: null });
    
    try {
      const response = await documentsService.searchDocuments(query);
      set({ searchResults: response.results, isSearching: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to search documents', 
        isSearching: false 
      });
    }
  },
  
  clearSearch: () => {
    set({ searchResults: [], searchQuery: '', isSearching: false });
  },
  
  // Download/Preview Actions
  downloadDocument: async (uuid: string) => {
    try {
      // Find the document to get its ID
      const state = get();
      const document = state.documents.find(doc => doc.uuid === uuid);
      if (!document) {
        throw new Error('Document not found');
      }
      
      const blob = await documentsService.downloadDocument(document.uuid);
      return blob;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to download document'
      });
      return null;
    }
  },
  
  getDownloadUrl: (uuid: string) => {
    // Find the document to get its ID
    const state = get();
    const document = state.documents.find(doc => doc.uuid === uuid);
    if (!document) {
      throw new Error('Document not found');
    }
    
    return documentsService.getDownloadUrl(document.uuid);
  },
  
  getPreviewUrl: (uuid: string) => {
    // Find the document to get its ID
    const state = get();
    const document = state.documents.find(doc => doc.uuid === uuid);
    if (!document) {
      throw new Error('Document not found');
    }
    
    return documentsService.getPreviewUrl(document.uuid);
  },
  
  previewDocument: (uuid: string) => {
    const state = get();
    const document = state.documents.find(doc => doc.uuid === uuid);
    if (!document) return;
    
    // Use authenticated download to get a Blob, then open as object URL for preview
    (async () => {
      try {
        const blob = await documentsService.downloadDocument((document as any).uuid);
        if (!blob) return;
        const objectUrl = URL.createObjectURL(blob);
        
        const previewableTypes = [
          'application/pdf',
          'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
          'text/plain', 'text/html', 'text/css', 'text/javascript',
          'application/json'
        ];
        
        if (previewableTypes.includes((document as any).mime_type)) {
          window.open(objectUrl, '_blank');
        } else {
          const a = window.document.createElement('a');
          a.href = objectUrl;
          a.download = (document as any).original_name || 'download';
          window.document.body.appendChild(a);
          a.click();
          window.document.body.removeChild(a);
        }
        // SECURITY: Revoke immediately for downloads, delay only for previews
        if (previewableTypes.includes((document as any).mime_type)) {
          // For previews, revoke after a short delay to allow tab to load
          setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } else {
          // For downloads, revoke immediately after download starts
          setTimeout(() => URL.revokeObjectURL(objectUrl), 100);
        }
      } catch (err) {
        // Swallow; error handling is done in downloadDocument
      }
    })();
  },
  
  // Filter actions
  setMimeType: (mimeType: string | null) => {
    set({ currentMimeType: mimeType });
    get().loadDocuments();
  },
  
  setTag: (tag: string | null) => {
    set({ currentTag: tag });
    get().loadDocuments();
  },
  
  setSearch: (query: string) => {
    set({ searchQuery: query });
    // Debounce search in the component, not here
  },
  
  setShowArchived: (show: boolean) => {
    set({ showArchived: show });
    get().loadDocuments();
  },
  
  setShowFavoritesOnly: (show: boolean) => {
    set({ showFavoritesOnly: show });
    get().loadDocuments();
  },

  setShowProjectOnly: (show: boolean) => {
    // When turning ON project-only, we implicitly turn off unassigned-only.
    // When turning OFF project-only, default to unassigned-only view.
    set({ showProjectOnly: show });
    get().loadDocuments();
  },

  setCurrentProjectId: (id: string | null) => {
    set({ currentProjectId: id });
    get().loadDocuments();
  },
  
  // UI actions
  clearError: () => set({ error: null }),
  
  clearCurrentDocument: () => set({ currentDocument: null }),
  
  setUploadProgress: (progress: number) => set({ uploadProgress: progress }),
  
  reset: () => {
    set(initialState);
  }
})); 