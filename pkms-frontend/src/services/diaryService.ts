import { apiService } from './api';
import { DiaryEntry, DiaryEntrySummary, DiaryMetadata, DiaryEntryCreatePayload, DiaryCalendarData, MoodStats } from '../types/diary';

class DiaryService {
  private baseUrl = '/diary';

  // --- Encryption Methods ---

  async isEncryptionSetup(): Promise<boolean> {
    const response = await apiService.get<{ is_setup: boolean }>(`${this.baseUrl}/encryption/status`);
    return response.data.is_setup;
  }

  async setupEncryption(password: string, hint?: string): Promise<{ key: CryptoKey | null; success: boolean }> {
    const response = await apiService.post<{ success: boolean }>(`${this.baseUrl}/encryption/setup`, {
      password,
      hint,
    });

    if (response.data.success) {
      const key = await this.generateEncryptionKey(password);
      return { key, success: true };
    }

    return { key: null, success: false };
  }

  async unlockSession(password: string): Promise<{ key: CryptoKey | null; success: boolean }> {
    const response = await apiService.post<{ success: boolean }>(`${this.baseUrl}/encryption/unlock`, {
      password,
    });

    if (response.data.success) {
      const key = await this.generateEncryptionKey(password);
      return { key, success: true };
    }

    return { key: null, success: false };
  }

  async generateEncryptionKey(password: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const key = await crypto.subtle.importKey(
      'raw',
      hash,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    return key;
  }

  async encryptContent(content: string, key: CryptoKey): Promise<{ encrypted_blob: string; iv: string; tag: string }> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    return {
      encrypted_blob: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv)),
      tag: '', // GCM tag is included in the encrypted blob
    };
  }

  async decryptContent(encrypted_blob: string, iv: string, tag: string, key: CryptoKey): Promise<string> {
    const decoder = new TextDecoder();
    const encryptedData = Uint8Array.from(atob(encrypted_blob), c => c.charCodeAt(0));
    const ivData = Uint8Array.from(atob(iv), c => c.charCodeAt(0));

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivData },
      key,
      encryptedData
    );

    return decoder.decode(decrypted);
  }

  // --- Entry Methods ---

  async getEntries(): Promise<DiaryEntrySummary[]> {
    const response = await apiService.get<DiaryEntrySummary[]>(`${this.baseUrl}/entries`);
    return response.data;
  }

  async getEntryById(id: number): Promise<DiaryEntry> {
    const response = await apiService.get<DiaryEntry>(`${this.baseUrl}/entries/${id}`);
    return response.data;
  }

  async createEntry(payload: DiaryEntryCreatePayload): Promise<DiaryEntrySummary> {
    const response = await apiService.post<DiaryEntrySummary>(`${this.baseUrl}/entries`, payload);
    return response.data;
  }

  async updateEntry(id: number, payload: DiaryEntryCreatePayload): Promise<DiaryEntrySummary> {
    const response = await apiService.put<DiaryEntrySummary>(`${this.baseUrl}/entries/${id}`, payload);
    return response.data;
  }

  async deleteEntry(id: number): Promise<void> {
    await apiService.delete(`${this.baseUrl}/entries/${id}`);
  }

  // --- Calendar Methods ---

  async getCalendarData(year: number, month: number): Promise<DiaryCalendarData[]> {
    const response = await apiService.get<DiaryCalendarData[]>(`${this.baseUrl}/calendar/${year}/${month}`);
    return response.data;
  }

  async getMoodStats(): Promise<MoodStats> {
    const response = await apiService.get<MoodStats>(`${this.baseUrl}/stats/mood`);
    return response.data;
  }
}

export const diaryService = new DiaryService(); 