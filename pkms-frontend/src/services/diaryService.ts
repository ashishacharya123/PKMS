import { apiService } from './api';
import { format } from 'date-fns';

// Types for diary
export interface DiaryEntry {
  id: number;
  date: string;
  title_encrypted?: string;
  content_encrypted: string;
  mood?: number;
  weather?: string;
  encryption_iv: string;
  encryption_tag: string;
  title_encryption_iv?: string;
  title_encryption_tag?: string;
  is_template: boolean;
  created_at: string;
  updated_at: string;
  media_count: number;
}

export interface DiaryEntryCreate {
  date: string;
  title_encrypted?: string;
  content_encrypted: string;
  mood?: number;
  weather?: string;
  encryption_iv: string;
  encryption_tag: string;
  title_encryption_iv?: string;
  title_encryption_tag?: string;
  is_template?: boolean;
}

export interface DiaryEntryUpdate {
  title_encrypted?: string;
  content_encrypted?: string;
  mood?: number;
  weather?: string;
  encryption_iv?: string;
  encryption_tag?: string;
  title_encryption_iv?: string;
  title_encryption_tag?: string;
  is_template?: boolean;
}

export interface DiaryEntrySummary {
  id: number;
  date: string;
  mood?: number;
  weather?: string;
  is_template: boolean;
  created_at: string;
  media_count: number;
  content_encrypted: string;
  encryption_iv: string;
  encryption_tag: string;
}

export interface DiaryMedia {
  uuid: string;
  entry_id: number;
  filename_encrypted: string;
  mime_type: string;
  size_bytes: number;
  encryption_iv: string;
  encryption_tag: string;
  media_type: string; // voice, photo, video
  duration_seconds?: number;
  created_at: string;
}

export interface DiaryCalendarData {
  date: string;
  mood?: number;
  has_entry: boolean;
  media_count: number;
}

export interface MoodStats {
  average_mood?: number;
  mood_distribution: Record<number, number>; // mood level -> count
  total_entries: number;
  period_start: string;
  period_end: string;
}

export interface DiaryListParams {
  year?: number;
  month?: number;
  mood?: number;
  templates?: boolean;
  limit?: number;
  offset?: number;
}

export interface EncryptedContent {
  content: string;
  iv: string;
  tag: string;
}

export interface MediaUploadData {
  file: File;
  media_type: 'voice' | 'photo' | 'video';
  duration_seconds?: number;
  encryption_iv: string;
  encryption_tag: string;
}

class DiaryService {
  private baseUrl = '/diary';

  // Entry methods
  async createEntry(entryData: DiaryEntryCreate): Promise<DiaryEntry> {
    // Format the date to YYYY-MM-DD
    const formattedData = {
      ...entryData,
      date: entryData.date.split('T')[0]
    };
    return await apiService.post<DiaryEntry>(`${this.baseUrl}/entries`, formattedData);
  }

  async getEntryByDate(date: Date): Promise<DiaryEntry> {
    try {
      // Format date as YYYY-MM-DD using date-fns
      const formattedDate = format(date, 'yyyy-MM-dd');
      console.log('[DEBUG] Fetching entry for date:', formattedDate);
      
      const response = await apiService.get<DiaryEntry>(`${this.baseUrl}/entries/${formattedDate}`);
      return response;
    } catch (error) {
      console.error('[DEBUG] Error fetching diary entry:', error);
      throw error;
    }
  }

  async getEntryById(entryId: number): Promise<DiaryEntry> {
    return await apiService.get<DiaryEntry>(`${this.baseUrl}/entries/id/${entryId}`);
  }

  async updateEntry(date: string, entryData: DiaryEntryUpdate): Promise<DiaryEntry> {
    return await apiService.put<DiaryEntry>(`${this.baseUrl}/entries/${date}`, entryData);
  }

  async deleteEntry(date: string): Promise<void> {
    await apiService.delete(`${this.baseUrl}/entries/${date}`);
  }

  async getEntries(params: DiaryListParams = {}): Promise<DiaryEntrySummary[]> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `${this.baseUrl}/entries${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return await apiService.get<DiaryEntrySummary[]>(url);
  }

  // Calendar methods
  async getCalendarData(year: number, month: number): Promise<DiaryCalendarData[]> {
    try {
      // Backend returns an object { calendar_data: DiaryCalendarData[] }
      const response = await apiService.get<{ calendar_data: DiaryCalendarData[] }>(`${this.baseUrl}/calendar/${year}/${month}`);
      return response.calendar_data || [];
    } catch (error) {
      console.error('Error fetching calendar data:', error);
      throw error;
    }
  }

  // Media methods
  async uploadMedia(entryId: number, mediaData: MediaUploadData): Promise<DiaryMedia> {
    const formData = new FormData();
    formData.append('file', mediaData.file);
    formData.append('media_type', mediaData.media_type);
    formData.append('encryption_iv', mediaData.encryption_iv);
    formData.append('encryption_tag', mediaData.encryption_tag);
    
    if (mediaData.duration_seconds) {
      formData.append('duration_seconds', mediaData.duration_seconds.toString());
    }

    // Use the axios instance directly for form data upload
    const axios = apiService.getAxiosInstance();
    const response = await axios.post(`${this.baseUrl}/entries/${entryId}/media`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  }

  async getEntryMedia(entryId: number, mediaType?: string): Promise<DiaryMedia[]> {
    const url = mediaType 
      ? `${this.baseUrl}/entries/${entryId}/media?media_type=${mediaType}`
      : `${this.baseUrl}/entries/${entryId}/media`;
    
    return await apiService.get<DiaryMedia[]>(url);
  }

  async downloadMedia(mediaUuid: string): Promise<Blob> {
    const axios = apiService.getAxiosInstance();
    const response = await axios.get(`${this.baseUrl}/media/${mediaUuid}/download`, {
      responseType: 'blob'
    });
    return response.data;
  }

  async deleteMedia(mediaUuid: string): Promise<void> {
    await apiService.delete(`${this.baseUrl}/media/${mediaUuid}`);
  }

  // Stats methods
  async getMoodStats(startDate?: string, endDate?: string): Promise<MoodStats> {
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append('start_date', startDate);
    if (endDate) queryParams.append('end_date', endDate);
    
    const url = `${this.baseUrl}/stats/mood${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    return await apiService.get<MoodStats>(url);
  }

  // Template methods
  async getTemplates(): Promise<DiaryEntry[]> {
    return await apiService.get<DiaryEntry[]>(`${this.baseUrl}/templates`);
  }

  // Utility methods for encryption
  async generateEncryptionKey(password: string): Promise<CryptoKey> {
    try {
      console.log('Starting key generation...');
      const encoder = new TextEncoder();
      const data = encoder.encode(password);
      
      // Generate a key from the password
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        data,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );
      
      // Use PBKDF2 to derive a key
      const salt = encoder.encode('PKMS-Diary-Salt');  // Fixed salt for now
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      );
      
      console.log('Key generation successful');
      return key;
    } catch (error) {
      console.error('Error generating encryption key:', error);
      throw new Error('Failed to generate encryption key. Please try again.');
    }
  }

  async encryptContent(content: string, key: CryptoKey): Promise<EncryptedContent> {
    try {
      console.log('Starting content encryption...');
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Encrypt the content
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      // Split into ciphertext and auth tag
      const encryptedArray = new Uint8Array(encrypted);
      const tag = encryptedArray.slice(-16); // Last 16 bytes are the auth tag
      const ciphertext = encryptedArray.slice(0, -16);

      // Convert to base64 for storage
      const result = {
        content: this.arrayBufferToBase64(ciphertext),
        iv: this.arrayBufferToBase64(iv),
        tag: this.arrayBufferToBase64(tag)
      };
      console.log('Content encryption successful');
      return result;
    } catch (error) {
      console.error('Error encrypting content:', error);
      throw new Error('Failed to encrypt content. Please try again.');
    }
  }

  async decryptContent(encryptedContent: EncryptedContent, key: CryptoKey): Promise<string> {
    try {
      console.log('Starting content decryption...');
      // Convert from base64
      const iv = this.base64ToArrayBuffer(encryptedContent.iv);
      const ciphertext = this.base64ToArrayBuffer(encryptedContent.content);
      const tag = this.base64ToArrayBuffer(encryptedContent.tag);

      // Combine ciphertext and tag for AES-GCM
      const encryptedData = new Uint8Array(ciphertext.byteLength + tag.byteLength);
      encryptedData.set(new Uint8Array(ciphertext));
      encryptedData.set(new Uint8Array(tag), ciphertext.byteLength);

      // Decrypt the content
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        key,
        encryptedData.buffer
      );

      // Convert back to string
      const decoder = new TextDecoder();
      const result = decoder.decode(decrypted);
      console.log('Content decryption successful');
      return result;
    } catch (error) {
      console.error('Error decrypting content:', error);
      throw new Error('Failed to decrypt content. Please check your password.');
    }
  }

  // Helper methods for base64 conversion
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Utility methods
  getMoodLabel(mood: number): string {
    const labels = {
      1: 'Very Bad',
      2: 'Bad',
      3: 'Neutral',
      4: 'Good',
      5: 'Excellent'
    };
    return labels[mood as keyof typeof labels] || 'Unknown';
  }

  getMoodColor(mood: number): string {
    const colors = {
      1: '#F44336', // Red
      2: '#FF9800', // Orange
      3: '#757575', // Gray
      4: '#4CAF50', // Green
      5: '#2196F3'  // Blue
    };
    return colors[mood as keyof typeof colors] || '#757575';
  }

  getMoodEmoji(mood: number): string {
    const emojis = {
      1: '😢',
      2: '😞',
      3: '😐',
      4: '😊',
      5: '😄'
    };
    return emojis[mood as keyof typeof emojis] || '😐';
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

  formatDateTime(dateTime: string): string {
    return new Date(dateTime).toLocaleString();
  }

  isToday(date: string): boolean {
    const today = new Date().toISOString().split('T')[0];
    return date === today;
  }

  getWeatherEmoji(weather: string): string {
    const weatherEmojis: Record<string, string> = {
      sunny: '☀️',
      cloudy: '☁️',
      rainy: '🌧️',
      snowy: '❄️',
      stormy: '⛈️',
      windy: '💨',
      foggy: '🌫️'
    };
    return weatherEmojis[weather.toLowerCase()] || '🌤️';
  }

  async listEntries(params: DiaryListParams): Promise<DiaryEntrySummary[]> {
    const queryParams = new URLSearchParams();
    if (params.year) queryParams.append('year', params.year.toString());
    if (params.month) queryParams.append('month', params.month.toString());
    if (params.mood) queryParams.append('mood', params.mood.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    
    const url = `${this.baseUrl}/entries?${queryParams.toString()}`;
    return await apiService.get<DiaryEntrySummary[]>(url);
  }
}

export const diaryService = new DiaryService(); 