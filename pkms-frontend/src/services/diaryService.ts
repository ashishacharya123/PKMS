import { apiService } from './api';

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
  is_template?: boolean;
}

export interface DiaryEntryUpdate {
  title_encrypted?: string;
  content_encrypted?: string;
  mood?: number;
  weather?: string;
  encryption_iv?: string;
  encryption_tag?: string;
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
    return await apiService.post<DiaryEntry>(`${this.baseUrl}/entries`, entryData);
  }

  async getEntryByDate(date: string): Promise<DiaryEntry> {
    return await apiService.get<DiaryEntry>(`${this.baseUrl}/entries/${date}`);
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
    return await apiService.get<DiaryCalendarData[]>(`${this.baseUrl}/calendar/${year}/${month}`);
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
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    // Derive a key using PBKDF2
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('pkms-diary-salt'), // In production, use a proper random salt
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encryptContent(content: string, key: CryptoKey): Promise<EncryptedContent> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    const encryptedArray = new Uint8Array(encrypted);
    const tag = encryptedArray.slice(-16); // Last 16 bytes are the auth tag
    const ciphertext = encryptedArray.slice(0, -16);

    return {
      content: this.arrayBufferToBase64(ciphertext),
      iv: this.arrayBufferToBase64(iv),
      tag: this.arrayBufferToBase64(tag)
    };
  }

  async decryptContent(encryptedContent: EncryptedContent, key: CryptoKey): Promise<string> {
    const iv = this.base64ToArrayBuffer(encryptedContent.iv);
    const ciphertext = this.base64ToArrayBuffer(encryptedContent.content);
    const tag = this.base64ToArrayBuffer(encryptedContent.tag);

    // Combine ciphertext and tag for AES-GCM
    const encrypted = new Uint8Array(ciphertext.byteLength + tag.byteLength);
    encrypted.set(new Uint8Array(ciphertext));
    encrypted.set(new Uint8Array(tag), ciphertext.byteLength);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
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
}

export const diaryService = new DiaryService(); 