import { apiService } from './api';
import { DiaryEntry, DiaryEntrySummary, DiaryEntryCreatePayload, DiaryCalendarData, MoodStats } from '../types/diary';
import { coreUploadService } from './shared/coreUploadService';
import { coreDownloadService } from './shared/coreDownloadService';

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

  async decryptContent(encrypted_blob: string, iv: string, _tag: string, key: CryptoKey): Promise<string> {
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

  async getPasswordHint(): Promise<string> {
    const response = await apiService.get<{ hint: string }>(`${this.baseUrl}/encryption/hint`);
    return response.data.hint;
  }

  // --- Entry Methods ---

  async getEntries(filters?: {
    year?: number;
    month?: number;
    mood?: number;
    templates?: boolean;
    search_title?: string;
    day_of_week?: number;
    has_media?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<DiaryEntrySummary[]> {
    const params = new URLSearchParams();
    
    if (filters?.year) params.append('year', filters.year.toString());
    if (filters?.month) params.append('month', filters.month.toString());
    if (filters?.mood) params.append('mood', filters.mood.toString());
    if (typeof filters?.templates === 'boolean') params.append('templates', String(filters.templates));
    if (filters?.search_title) params.append('search_title', filters.search_title);
    if (filters?.day_of_week !== undefined) params.append('day_of_week', filters.day_of_week.toString());
    if (filters?.has_media !== undefined) params.append('has_media', filters.has_media.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());
    
    const queryString = params.toString();
    const url = queryString ? `${this.baseUrl}/entries?${queryString}` : `${this.baseUrl}/entries`;
    
    const response = await apiService.get<DiaryEntrySummary[]>(url);
    return response.data;
  }

  async getEntryById(id: number): Promise<DiaryEntry> {
    const response = await apiService.get<DiaryEntry>(`${this.baseUrl}/entries/${id}`);
    return response.data;
  }

  // Allow lookup by either numeric id or uuid
  async getEntry(ref: number | string): Promise<DiaryEntry> {
    const response = await apiService.get<DiaryEntry>(`${this.baseUrl}/entries/${ref}`);
    return response.data;
  }

  async createEntry(payload: DiaryEntryCreatePayload): Promise<void> {
    await apiService.post(`${this.baseUrl}/entries`, payload);
  }

  async updateEntry(uuid: string, payload: DiaryEntryCreatePayload): Promise<void> {
    await apiService.put(`${this.baseUrl}/entries/${uuid}`, payload);
  }

  async deleteEntry(uuid: string): Promise<void> {
    await apiService.delete(`${this.baseUrl}/entries/${uuid}`);
  }

  // --- Calendar Methods ---

  async getCalendarData(year: number, month: number): Promise<DiaryCalendarData[]> {
    /*
     * Backend now returns an object of shape:
     *   { calendar_data: DiaryCalendarData[] }
     * Adapt to that while keeping the old array return type for callers.
     */
    const response = await apiService.get<{ calendar_data: DiaryCalendarData[] }>(
      `${this.baseUrl}/calendar/${year}/${month}`
    );
    // Fallback if backend rolls back to plain array
    const maybeArray = response.data as unknown as DiaryCalendarData[];
    if (Array.isArray(maybeArray)) {
      return maybeArray;
    }
    return (response.data as any).calendar_data ?? [];
  }

  async getMoodStats(): Promise<MoodStats> {
    const response = await apiService.get<MoodStats>(`${this.baseUrl}/stats/mood`);
    return response.data;
  }

  // --- Media Methods ---

  async uploadMedia(
    entryId: number, 
    file: File, 
    mediaType: 'photo' | 'video' | 'voice',
    caption?: string,
    onProgress?: (progress: { progress: number; status: string }) => void
  ): Promise<any> {
    try {
      // Step 1: Upload file using core chunk upload service
      const uploadResult = await coreUploadService.uploadFile(file, {
        module: 'diary',
        onProgress: onProgress ? (progress) => {
          onProgress({ 
            progress: progress.progress, 
            status: `Uploading... ${progress.progress}%` 
          });
        } : undefined,
      });

      if (onProgress) {
        onProgress({ progress: 95, status: 'Processing...' });
      }

      // Step 2: Commit the upload with diary-specific metadata
      const commitResponse = await apiService.post(`${this.baseUrl}/media/upload/commit`, {
        file_id: uploadResult.fileId,
        entry_id: entryId,
        media_type: mediaType,
        caption: caption || null
      });

      if (onProgress) {
        onProgress({ progress: 100, status: 'Complete' });
      }

      return commitResponse.data;
    } catch (error) {
      console.error('❌ Diary media upload failed:', error);
      throw error;
    }
  }

  async downloadMedia(
    mediaId: number,
    onProgress?: (progress: { progress: number; status: string }) => void
  ): Promise<Blob> {
    try {
      const downloadUrl = `${this.baseUrl}/media/${mediaId}/download`;
      
      return await coreDownloadService.downloadFile(downloadUrl, {
        fileId: `diary-media-${mediaId}`,
        onProgress: onProgress ? (progress) => {
          onProgress({
            progress: progress.progress,
            status: progress.status === 'downloading' ? 'Downloading...' : 'Complete'
          });
        } : undefined
      });
    } catch (error) {
      console.error('❌ Diary media download failed:', error);
      throw error;
    }
  }

  async getMediaAsObjectURL(
    mediaId: number,
    onProgress?: (progress: { progress: number; status: string }) => void
  ): Promise<string> {
    try {
      const downloadUrl = `${this.baseUrl}/media/${mediaId}/download`;
      
      return await coreDownloadService.downloadAsObjectURL(downloadUrl, {
        fileId: `diary-media-${mediaId}`,
        onProgress: onProgress ? (progress) => {
          onProgress({
            progress: progress.progress,
            status: progress.status === 'downloading' ? 'Downloading...' : 'Complete'
          });
        } : undefined
      });
    } catch (error) {
      console.error('❌ Diary media download failed:', error);
      throw error;
    }
  }

  async getEntryMedia(entryId: number): Promise<any[]> {
    const response = await apiService.get(`${this.baseUrl}/entries/${entryId}/media`);
    return response.data;
  }

  async deleteMedia(mediaId: number): Promise<void> {
    await apiService.delete(`${this.baseUrl}/media/${mediaId}`);
  }
}

export const diaryService = new DiaryService();