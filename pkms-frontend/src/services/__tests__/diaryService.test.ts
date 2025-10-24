import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diaryService } from '../diaryService';

// Mock fetch globally
global.fetch = vi.fn();

describe('diaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEntries', () => {
    it('should fetch diary entries successfully', async () => {
      const mockEntries = [
        {
          uuid: 'entry-1',
          title: 'Test Entry',
          date: '2024-01-21',
          mood: 5
        }
      ];

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entries: mockEntries, total: 1 })
      });

      const result = await diaryService.getEntries();
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/diary/entries'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      
      expect(result.entries).toEqual(mockEntries);
      expect(result.total).toBe(1);
    });

    it('should handle API errors gracefully', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' })
      });

      await expect(diaryService.getEntries()).rejects.toThrow('Failed to fetch diary entries');
    });
  });

  describe('createEntry', () => {
    it('should create a new diary entry', async () => {
      const entryData = {
        title: 'New Entry',
        content: 'Entry content',
        mood: 5,
        date: '2024-01-21'
      };

      const mockResponse = {
        uuid: 'new-entry-uuid',
        ...entryData,
        created_at: '2024-01-21T10:00:00Z'
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await diaryService.createEntry(entryData);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/diary/entries'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify(entryData)
        })
      );
      
      expect(result).toEqual(mockResponse);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        content: 'Entry without title'
      };

      await expect(diaryService.createEntry(invalidData as any)).rejects.toThrow('Title is required');
    });
  });

  describe('updateEntry', () => {
    it('should update an existing entry', async () => {
      const entryId = 'entry-1';
      const updateData = {
        title: 'Updated Title',
        content: 'Updated content'
      };

      const mockResponse = {
        uuid: entryId,
        ...updateData,
        updated_at: '2024-01-21T11:00:00Z'
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await diaryService.updateEntry(entryId, updateData);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/diary/entries/${entryId}`),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: JSON.stringify(updateData)
        })
      );
      
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteEntry', () => {
    it('should delete an entry successfully', async () => {
      const entryId = 'entry-1';

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Entry deleted successfully' })
      });

      await diaryService.deleteEntry(entryId);
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/diary/entries/${entryId}`),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });
  });
});
