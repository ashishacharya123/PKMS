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
  
  // Pagination
  limit: number;
  offset: number;
  hasMore: boolean;
  
  // Actions - Documents
  loadDocuments: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadDocument: (uuid: string) => Promise<void>;
  uploadDocument: (file: File, tags?: string[]) => Promise<Document | null>;
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
  
  // Filters
  setMimeType: (mimeType: string | null) => void;
  setTag: (tag: string | null) => void;
  setSearch: (query: string) => void;
  setShowArchived: (show: boolean) => void;
  
  // UI Actions
  clearError: () => void;
  clearCurrentDocument: () => void;
  setUploadProgress: (progress: number) => void;
  reset: () => void;
}

const initialState: Omit<DocumentsState, 'reset' | 'setUploadProgress' | 'clearCurrentDocument' | 'clearError' | 'setShowArchived' | 'setSearch' | 'setTag' | 'setMimeType' | 'getPreviewUrl' | 'getDownloadUrl' | 'downloadDocument' | 'clearSearch' | 'searchDocuments' | 'toggleArchive' | 'deleteDocument' | 'updateDocument' | 'uploadDocument' | 'loadDocument' | 'loadMore' | 'loadDocuments'> = {
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
  
  uploadDocument: async (file: File, tags: string[] = []) => {
    set({ isUploading: true, error: null, uploadProgress: 0 });
    
    try {
      const document = await documentsService.uploadDocument(
        file, 
        tags, 
        (progress) => set({ uploadProgress: progress })
      );
      
      // Convert Document to DocumentSummary for the list
      const documentSummary: DocumentSummary = {
        uuid: document.uuid,
        filename: document.filename,
        original_name: document.original_name,
        mime_type: document.mime_type,
        size_bytes: document.size_bytes,
        is_archived: document.is_archived,
        created_at: document.created_at,
        updated_at: document.updated_at,
        tags: document.tags,
        preview: document.extracted_text?.substring(0, 200) || ''
      };
      
      // Add to documents list if it matches current filters
      const state = get();
      const shouldAdd = (!state.currentMimeType || document.mime_type === state.currentMimeType) &&
                       (!state.currentTag || document.tags.includes(state.currentTag)) &&
                       (!state.searchQuery || document.original_name.toLowerCase().includes(state.searchQuery.toLowerCase())) &&
                       (state.showArchived || !document.is_archived);
      
      if (shouldAdd) {
        set({ 
          documents: [documentSummary, ...state.documents],
          isUploading: false,
          uploadProgress: 0
        });
      } else {
        set({ isUploading: false, uploadProgress: 0 });
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
      const updatedDocument = await documentsService.updateDocument(uuid, data);
      
      // Convert Document to DocumentSummary for the list
      const documentSummary: DocumentSummary = {
        uuid: updatedDocument.uuid,
        filename: updatedDocument.filename,
        original_name: updatedDocument.original_name,
        mime_type: updatedDocument.mime_type,
        size_bytes: updatedDocument.size_bytes,
        is_archived: updatedDocument.is_archived,
        created_at: updatedDocument.created_at,
        updated_at: updatedDocument.updated_at,
        tags: updatedDocument.tags,
        preview: updatedDocument.extracted_text?.substring(0, 200) || ''
      };
      
      // Update in documents list
      set(state => ({
        documents: state.documents.map(doc => 
          doc.uuid === uuid ? documentSummary : doc
        ),
        currentDocument: state.currentDocument?.uuid === uuid ? updatedDocument : state.currentDocument,
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
      await documentsService.deleteDocument(uuid);
      
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
      
      // Convert Document to DocumentSummary for the list
      const documentSummary: DocumentSummary = {
        uuid: updatedDocument.uuid,
        filename: updatedDocument.filename,
        original_name: updatedDocument.original_name,
        mime_type: updatedDocument.mime_type,
        size_bytes: updatedDocument.size_bytes,
        is_archived: updatedDocument.is_archived,
        created_at: updatedDocument.created_at,
        updated_at: updatedDocument.updated_at,
        tags: updatedDocument.tags,
        preview: updatedDocument.extracted_text?.substring(0, 200) || ''
      };
      
      // Update in documents list
      set(state => ({
        documents: state.documents.map(doc => 
          doc.uuid === uuid ? documentSummary : doc
        ),
        currentDocument: state.currentDocument?.uuid === uuid ? updatedDocument : state.currentDocument,
        isUpdating: false
      }));
      
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
      const blob = await documentsService.downloadDocument(uuid);
      return blob;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to download document'
      });
      return null;
    }
  },
  
  getDownloadUrl: (uuid: string) => {
    return documentsService.getDownloadUrl(uuid);
  },
  
  getPreviewUrl: (uuid: string) => {
    return documentsService.getPreviewUrl(uuid);
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
  
  // UI actions
  clearError: () => set({ error: null }),
  
  clearCurrentDocument: () => set({ currentDocument: null }),
  
  setUploadProgress: (progress: number) => set({ uploadProgress: progress }),
  
  reset: () => {
    set(initialState);
  }
})); 