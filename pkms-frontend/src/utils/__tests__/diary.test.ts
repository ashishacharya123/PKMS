import { describe, it, expect } from 'vitest';
import { 
  formatNepaliDate, 
  convertToNepaliDate, 
  validateDiaryEntry,
  encryptContent,
  decryptContent 
} from '../diary';

describe('diary utilities', () => {
  describe('formatNepaliDate', () => {
    it('should format nepali date correctly', () => {
      const nepaliDate = '2080-10-07';
      const formatted = formatNepaliDate(nepaliDate);
      expect(formatted).toBe('2080-10-07');
    });

    it('should handle invalid nepali date', () => {
      const invalidDate = 'invalid-date';
      expect(() => formatNepaliDate(invalidDate)).toThrow('Invalid nepali date format');
    });
  });

  describe('convertToNepaliDate', () => {
    it('should convert English date to Nepali date', () => {
      const englishDate = new Date('2024-01-21');
      const nepaliDate = convertToNepaliDate(englishDate);
      expect(nepaliDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should handle edge cases', () => {
      const edgeDate = new Date('2024-12-31');
      const nepaliDate = convertToNepaliDate(edgeDate);
      expect(nepaliDate).toBeDefined();
    });
  });

  describe('validateDiaryEntry', () => {
    it('should validate a complete diary entry', () => {
      const validEntry = {
        title: 'Test Entry',
        content: 'Test content',
        mood: 5,
        date: '2024-01-21'
      };

      const result = validateDiaryEntry(validEntry);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch missing required fields', () => {
      const invalidEntry = {
        content: 'Test content without title'
      };

      const result = validateDiaryEntry(invalidEntry as any);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title is required');
    });

    it('should validate mood range', () => {
      const invalidMoodEntry = {
        title: 'Test Entry',
        content: 'Test content',
        mood: 15, // Invalid mood (should be 1-10)
        date: '2024-01-21'
      };

      const result = validateDiaryEntry(invalidMoodEntry);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Mood must be between 1 and 10');
    });

    it('should validate date format', () => {
      const invalidDateEntry = {
        title: 'Test Entry',
        content: 'Test content',
        mood: 5,
        date: 'invalid-date'
      };

      const result = validateDiaryEntry(invalidDateEntry);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid date format');
    });
  });

  describe('encryptContent', () => {
    it('should encrypt content with password', async () => {
      const content = 'Sensitive diary content';
      const password = 'test-password';
      
      const encrypted = await encryptContent(content, password);
      
      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(content);
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('should produce different encrypted results for same content', async () => {
      const content = 'Test content';
      const password = 'test-password';
      
      const encrypted1 = await encryptContent(content, password);
      const encrypted2 = await encryptContent(content, password);
      
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('decryptContent', () => {
    it('should decrypt content with correct password', async () => {
      const content = 'Sensitive diary content';
      const password = 'test-password';
      
      const encrypted = await encryptContent(content, password);
      const decrypted = await decryptContent(encrypted, password);
      
      expect(decrypted).toBe(content);
    });

    it('should fail to decrypt with wrong password', async () => {
      const content = 'Sensitive diary content';
      const correctPassword = 'test-password';
      const wrongPassword = 'wrong-password';
      
      const encrypted = await encryptContent(content, correctPassword);
      
      await expect(decryptContent(encrypted, wrongPassword)).rejects.toThrow('Decryption failed');
    });

    it('should handle corrupted encrypted data', async () => {
      const corruptedData = 'corrupted-encrypted-data';
      const password = 'test-password';
      
      await expect(decryptContent(corruptedData, password)).rejects.toThrow('Decryption failed');
    });
  });
});
