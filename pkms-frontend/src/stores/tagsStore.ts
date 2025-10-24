/**
 * Tags Store - Zustand store for global tag management
 */

import { create } from 'zustand';
import { tagsService } from '../services/tagsService';
import { Tag } from '../types/tag';

interface TagsState {
  // Data
  tags: Tag[];
  isLoading: boolean;
  error: string | null;
  
  // Search and filtering
  searchQuery: string;
  filteredTags: Tag[];
  
  // Actions
  loadTags: () => Promise<void>;
  createTag: (name: string) => Promise<Tag | null>;
  updateTag: (uuid: string, name: string) => Promise<Tag | null>;
  deleteTag: (uuid: string) => Promise<boolean>;
  searchTags: (query: string) => void;
  clearError: () => void;
}

export const useTagsStore = create<TagsState>((set, get) => ({
  // Initial state
  tags: [],
  isLoading: false,
  error: null,
  searchQuery: '',
  filteredTags: [],

  // Actions
  loadTags: async () => {
    set({ isLoading: true, error: null });
    try {
      const tags = await tagsService.getAll();
      set({ 
        tags,
        filteredTags: tags,
        isLoading: false 
      });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load tags',
        isLoading: false 
      });
    }
  },

  createTag: async (name: string) => {
    set({ isLoading: true, error: null });
    try {
      const newTag = await tagsService.create({ name });
      if (newTag) {
        const currentTags = get().tags;
        set({ 
          tags: [...currentTags, newTag],
          filteredTags: [...currentTags, newTag],
          isLoading: false 
        });
        return newTag;
      }
      set({ isLoading: false });
      return null;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to create tag',
        isLoading: false 
      });
      return null;
    }
  },

  updateTag: async (uuid: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const updatedTag = await tagsService.update(uuid, { name });
      if (updatedTag) {
        const currentTags = get().tags;
        const updatedTags = currentTags.map(tag => 
          tag.uuid === uuid ? updatedTag : tag
        );
        set({ 
          tags: updatedTags,
          filteredTags: updatedTags,
          isLoading: false 
        });
        return updatedTag;
      }
      set({ isLoading: false });
      return null;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update tag',
        isLoading: false 
      });
      return null;
    }
  },

  deleteTag: async (uuid: string) => {
    set({ isLoading: true, error: null });
    try {
      await tagsService.delete(uuid);
      const currentTags = get().tags;
      const filteredTags = currentTags.filter(tag => tag.uuid !== uuid);
      set({ 
        tags: filteredTags,
        filteredTags,
        isLoading: false 
      });
      return true;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete tag',
        isLoading: false 
      });
      return false;
    }
  },

  searchTags: (query: string) => {
    const { tags } = get();
    const filtered = tags.filter(tag => 
      tag.name.toLowerCase().includes(query.toLowerCase())
    );
    set({ 
      searchQuery: query,
      filteredTags: filtered 
    });
  },

  clearError: () => set({ error: null }),
}));
