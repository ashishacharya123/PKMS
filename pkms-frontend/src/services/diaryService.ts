import { apiService } from './api';
import { format } from 'date-fns';

// --- NEW Data Structures ---

// Represents the raw, unencrypted data for a diary entry
export interface DiaryMetadata {
  sleep_hours?: number;
  exercise_minutes?: number;
  phone_hours?: number;
  activity_level?: number;
  custom_fields?: Record<string, any>;
}

export interface DiaryData {
  title?: string;
  content: string;
  mood?: number;
  weather?: string;
  tags?: string[];
  metadata?: DiaryMetadata;
}

// Represents the diary entry object stored in and retrieved from the backend
export interface DiaryEntry {
  id: number;
  date: string; // YYYY-MM-DD
  title?: string;
  encrypted_blob: string;
  encryption_iv: string;
  encryption_tag: string;
  mood?: number;
  metadata: DiaryMetadata;
  is_template: boolean;
  created_at: string;
  updated_at: string;
  media_count: number;
}

// Helper interface for encrypted content
export interface EncryptedContent {
  content: string; // The encrypted blob
  iv: string;
  tag: string;
}

export interface DiaryEntryCreatePayload {
  date: string; // YYYY-MM-DD
  title?: string;
  encrypted_blob: string;
  encryption_iv: string;
  encryption_tag: string;
  mood?: number;
  metadata?: DiaryMetadata;
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
  title?: string;
  mood?: number;
  metadata: DiaryMetadata;
  is_template: boolean;
  created_at: string;
  media_count: number;
  encrypted_blob: string;
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
  search_title?: string;
  day_of_week?: number;
  has_media?: boolean;
  limit?: number;
  offset?: number;
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

  // --- Core Entry Methods ---

  async createEntry(payload: DiaryEntryCreatePayload): Promise<DiaryEntry> {
    const response = await apiService.post<DiaryEntry>(`${this.baseUrl}/entries`, payload);
    return response.data;
  }

  async getEntriesByDate(date: Date): Promise<DiaryEntry[]> {
    const formattedDate = date.toISOString().split('T')[0];
    const response = await apiService.get<DiaryEntry[]>(`${this.baseUrl}/entries/date/${formattedDate}`);
    return response.data;
  }

  async getEntryById(entryId: number): Promise<DiaryEntry> {
    const response = await apiService.get<DiaryEntry>(`${this.baseUrl}/entries/${entryId}`);
    return response.data;
  }

  async updateEntry(entryId: number, payload: DiaryEntryCreatePayload): Promise<DiaryEntry> {
    const response = await apiService.put<DiaryEntry>(`${this.baseUrl}/entries/${entryId}`, payload);
    return response.data;
  }

  async deleteEntry(entryId: number): Promise<void> {
    await apiService.delete(`${this.baseUrl}/entries/${entryId}`);
  }

  // --- Encryption/Decryption Helpers ---

  async generateEncryptionKey(password: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    
    const hash = await crypto.subtle.digest('SHA-256', data);
    
    return crypto.subtle.importKey(
      'raw',
      hash,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encryptContent(content: string, key: CryptoKey): Promise<{ encrypted_blob: string; iv: string; tag: string }> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    
    // Generate a random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128
      },
      key,
      data
    );

    // Split the encrypted data and authentication tag
    const encryptedArray = new Uint8Array(encryptedData);
    const encryptedContent = encryptedArray.slice(0, encryptedArray.length - 16);
    const tag = encryptedArray.slice(encryptedArray.length - 16);

    return {
      encrypted_blob: this.arrayBufferToBase64(encryptedContent),
      iv: this.arrayBufferToBase64(iv),
      tag: this.arrayBufferToBase64(tag)
    };
  }

  async decryptContent(encryptedBlob: string, iv: string, tag: string, key: CryptoKey): Promise<string> {
    const encryptedData = this.base64ToArrayBuffer(encryptedBlob);
    const ivArray = this.base64ToArrayBuffer(iv);
    const tagArray = this.base64ToArrayBuffer(tag);

    // Combine encrypted content and tag
    const combined = new Uint8Array(encryptedData.byteLength + tagArray.byteLength);
    combined.set(new Uint8Array(encryptedData), 0);
    combined.set(new Uint8Array(tagArray), encryptedData.byteLength);

    const decryptedData = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivArray,
        tagLength: 128
      },
      key,
      combined
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  }

  async decryptRawContent(encryptedBlob: string, iv: string, tag: string, key: CryptoKey): Promise<string> {
    // This function is now identical to decryptContent, kept for any specific raw handling later
    return this.decryptContent(encryptedBlob, iv, tag, key);
  }
  
  // --- Base64 Helpers ---

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Entry methods
  async getEntries(params: DiaryListParams = {}): Promise<DiaryEntrySummary[]> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const url = `${this.baseUrl}/entries${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiService.get<DiaryEntrySummary[]>(url);
    return response.data;
  }

  // Calendar methods
  async getCalendarData(year: number, month: number): Promise<DiaryCalendarData[]> {
    const response = await apiService.get<{ calendar_data: DiaryCalendarData[] }>(`${this.baseUrl}/calendar/${year}/${month}`);
    return response.data.calendar_data || [];
  }

  // Media methods
  async uploadMedia(entryId: number, mediaData: MediaUploadData): Promise<DiaryMedia> {
    const formData = new FormData();
    formData.append('file', mediaData.file);
    formData.append('media_type', mediaData.media_type);
    if (mediaData.duration_seconds) {
      formData.append('duration_seconds', mediaData.duration_seconds.toString());
    }
    formData.append('encryption_iv', mediaData.encryption_iv);
    formData.append('encryption_tag', mediaData.encryption_tag);

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
    
    const response = await apiService.get<DiaryMedia[]>(url);
    return response.data;
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
    const response = await apiService.get<MoodStats>(url);
    return response.data;
  }

  // Template methods
  async getTemplates(): Promise<DiaryEntry[]> {
    const response = await apiService.get<DiaryEntry[]>(`${this.baseUrl}/templates`);
    return response.data;
  }

  // Utility methods for encryption
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
    const response = await apiService.get<DiaryEntrySummary[]>(url);
    return response.data;
  }
}

export const diaryService = new DiaryService(); 