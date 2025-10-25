import { apiService } from './api';
import {
  DiaryEntry,
  DiaryEntrySummary,
  DiaryEntryCreatePayload,
  DiaryCalendarData,
  MoodStats,
  WellnessStats,
  DiaryDailyMetadata,
  WeeklyHighlights,
  HabitData,
  HabitAnalytics,
  HabitInsights,
} from '../types/diary';
import { coreUploadService } from './shared/coreUploadService';
import { coreDownloadService } from './shared/coreDownloadService';
import { diaryCryptoService } from './diaryCryptoService';

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
    return diaryCryptoService.generateEncryptionKey(password);
  }

  async encryptContent(content: string, key: CryptoKey): Promise<{ encryptedBlob: string; iv: string; charCount: number }> {
    return diaryCryptoService.encryptText(content, key);
  }

  async decryptContent(encryptedBlob: string, _iv: string, key: CryptoKey): Promise<string> {
    return diaryCryptoService.decryptText(encryptedBlob, key);
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
    searchTitle?: string;
    dayOfWeek?: number;
    limit?: number;
    offset?: number;
  }): Promise<DiaryEntrySummary[]> {
    const params = new URLSearchParams();
    
    if (filters?.year) params.append('year', filters.year.toString());
    if (filters?.month) params.append('month', filters.month.toString());
    if (filters?.mood) params.append('mood', filters.mood.toString());
    if (typeof filters?.templates === 'boolean') params.append('templates', String(filters.templates));
    // Query parameters must remain snake_case (not converted by CamelCaseModel)
    if (filters?.searchTitle) params.append('search_title', filters.searchTitle);
    if (filters?.dayOfWeek !== undefined) params.append('day_of_week', filters.dayOfWeek.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());
    
    const queryString = params.toString();
    const url = queryString ? `${this.baseUrl}/entries?${queryString}` : `${this.baseUrl}/entries`;
    
    const response = await apiService.get<DiaryEntrySummary[]>(url);
    return response.data;
  }

  async getEntriesByDate(entryDate: string): Promise<DiaryEntrySummary[]> {
    // entryDate should be in YYYY-MM-DD
    const response = await apiService.get<DiaryEntrySummary[]>(`${this.baseUrl}/entries/date/${entryDate}`);
    return response.data;
  }

  async getHistoricalEntries(dates: string[]): Promise<DiaryEntrySummary[]> {
    // Efficient API call for specific dates only
    const response = await apiService.post<DiaryEntrySummary[]>(`${this.baseUrl}/entries/historical`, {
      dates
    });
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

  // --- Daily Metadata Methods ---

  async getDailyMetadata(date: string): Promise<DiaryDailyMetadata> {
    const response = await apiService.get<DiaryDailyMetadata>(`${this.baseUrl}/daily-metadata/${date}`);
    return response.data;
  }

  async updateDailyMetadata(date: string, payload: Partial<Omit<DiaryDailyMetadata, 'date' | 'createdAt' | 'updatedAt'>> & {
    metrics?: Record<string, any>;
  }): Promise<DiaryDailyMetadata> {
    const response = await apiService.put<DiaryDailyMetadata>(`${this.baseUrl}/daily-metadata/${date}`, payload);
    return response.data;
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

  async getWellnessStats(days: number = 30): Promise<WellnessStats> {
    const response = await apiService.get<WellnessStats>(
      `${this.baseUrl}/stats/wellness?days=${days}`
    );
    return response.data;
  }

  async getWeeklyHighlights(): Promise<WeeklyHighlights> {
    const response = await apiService.get<WeeklyHighlights>(`${this.baseUrl}/weekly-highlights`);
    return response.data;
  }

  // --- File Methods (Document-based) ---

  async uploadFile(
    entryUuid: string,
    file: File,
    _fileType: 'photo' | 'video' | 'voice',
    caption?: string,
    key?: CryptoKey,
    onProgress?: (progress: { progress: number; status: string }) => void
  ): Promise<any> {
    try {
      // Step 0: Encrypt file if key provided
      let fileToUpload = file;
      if (key) {
        if (onProgress) {
          onProgress({ progress: 5, status: 'Encrypting...' });
        }
        const encryptedBlob = await diaryCryptoService.encryptFile(file, key);
        // Create a File object with .dat extension
        fileToUpload = new File([encryptedBlob], `${file.name}.dat`, {
          type: 'application/octet-stream'
        });
      }

      // Step 1: Upload chunks
      const uploadFileId = await coreUploadService.uploadFile(fileToUpload, {
        module: 'documents',
        onProgress: onProgress ? (progress) => {
          const baseProgress = key ? 10 : 0;
          const uploadProgress = baseProgress + (progress.progress * (85 - baseProgress) / 100);
          onProgress({ 
            progress: Math.round(uploadProgress), 
            status: `Uploading... ${Math.round(uploadProgress)}%` 
          });
        } : undefined,
      });

      if (onProgress) {
        onProgress({ progress: 90, status: 'Finalizing...' });
      }

      // Step 2: ATOMIC commit - backend handles document creation + diary linking
      // JSON body must use camelCase (converted by CamelCaseModel)
      const document = await apiService.post('/api/v1/documents/commit', {
        fileId: uploadFileId,
        title: file.name,
        description: caption || null,
        tags: [],
        diaryEntryUuid: entryUuid,  // Backend creates document_diary association
        isEncrypted: key !== undefined,  // Track encryption status
        originalName: file.name
      });

      if (onProgress) {
        onProgress({ progress: 100, status: 'Complete' });
      }

      return document.data;
    } catch (error) {
      console.error('❌ Diary file upload failed:', error);
      throw error;
    }
  }

  async downloadFile(
    documentUuid: string,
    key?: CryptoKey,
    originalName?: string,
    onProgress?: (progress: { progress: number; status: string }) => void
  ): Promise<Blob> {
    try {
      const downloadUrl = `/api/v1/documents/${documentUuid}/download`;
      
      const encryptedBlob = await coreDownloadService.downloadFile(downloadUrl, {
        fileId: `diary-document-${documentUuid}`,
        onProgress: onProgress ? (progress) => {
          const downloadProgress = key ? progress.progress * 0.9 : progress.progress; // Reserve 90-100% for decryption
          onProgress({
            progress: Math.round(downloadProgress),
            status: progress.status === 'downloading' ? 'Downloading...' : 'Complete'
          });
        } : undefined
      });

      // Decrypt if key provided
      if (key) {
        if (onProgress) {
          onProgress({ progress: 95, status: 'Decrypting...' });
        }
        const decryptedFile = await diaryCryptoService.decryptFile(encryptedBlob, key, originalName || 'file');
        if (onProgress) {
          onProgress({ progress: 100, status: 'Complete' });
        }
        return decryptedFile;
      }

      return encryptedBlob;
    } catch (error) {
      console.error('❌ Diary file download failed:', error);
      throw error;
    }
  }

  async getFileAsObjectURL(
    documentUuid: string,
    key?: CryptoKey,
    originalName?: string,
    onProgress?: (progress: { progress: number; status: string }) => void
  ): Promise<string> {
    try {
      // Download and optionally decrypt
      const blob = await this.downloadFile(documentUuid, key, originalName, onProgress);
      
      // Create object URL
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('❌ Diary file download failed:', error);
      throw error;
    }
  }

  async getEntryFiles(entryUuid: string): Promise<any[]> {
    const response = await apiService.get<any[]>(`${this.baseUrl}/entries/${entryUuid}/documents`);
    return response.data as any[];
  }

  async deleteFile(entryUuid: string, documentUuid: string): Promise<void> {
    // Unlink document from diary entry
    await apiService.post(`${this.baseUrl}/entries/${entryUuid}/documents:unlink`, {
      documentUuid: documentUuid
    });
  }

  async reorderFiles(entryUuid: string, documentUuids: string[]): Promise<void> {
    await apiService.patch(`${this.baseUrl}/entries/${entryUuid}/documents/reorder`, {
      documentUuids: documentUuids
    });
  }

  async linkExistingDocument(
    entryUuid: string,
    documentUuid: string,
    isEncrypted: boolean = false
  ): Promise<void> {
    // CRITICAL: Check for conflicts BEFORE linking
    // Linking to diary makes document exclusive (hidden from other views)
    const { projectApi } = await import('./projectApi');
    const preflight = await projectApi.getDeletePreflight('document', documentUuid);
    
    if (preflight.linkCount > 0) {
      const confirmed = window.confirm(
        `⚠️ Warning: This document is currently used in ${preflight.linkCount} other place(s).\n\n` +
        `${preflight.warningMessage}\n\n` +
        `Linking it to your diary will make it exclusive and hide it from those views. Continue?`
      );
      
      if (!confirmed) {
        return; // User canceled - no changes made
      }
    }

    // Proceed with linking (with isEncrypted flag)
    await apiService.post(`${this.baseUrl}/entries/${entryUuid}/documents:link`, {
      documentUuids: [documentUuid],
      isEncrypted: isEncrypted
    });
  }

  // --- Habit Tracking Methods ---

  async updateHabitsForDay(
    date: string,
    habitsData: Record<string, any>,
    units?: Record<string, string>
  ): Promise<HabitData> {
    const response = await apiService.post<HabitData>(
      `${this.baseUrl}/daily-metadata/${date}/habits`,
      {
        habits: habitsData,
        units: units
      }
    );
    return response.data;
  }

  async getHabitsForDay(date: string): Promise<HabitData> {
    const response = await apiService.get<HabitData>(
      `${this.baseUrl}/daily-metadata/${date}/habits`
    );
    return response.data;
  }

  async getHabitAnalytics(days: number = 30): Promise<HabitAnalytics> {
    const response = await apiService.get<HabitAnalytics>(
      `${this.baseUrl}/habits/analytics?days=${days}`
    );
    return response.data;
  }

  async getActiveHabits(days: number = 30): Promise<string[]> {
    const response = await apiService.get<string[]>(
      `${this.baseUrl}/habits/active?days=${days}`
    );
    return response.data;
  }

  async getHabitInsights(days: number = 30): Promise<HabitInsights> {
    const response = await apiService.get<HabitInsights>(
      `${this.baseUrl}/habits/insights?days=${days}`
    );
    return response.data;
  }

  // --- Advanced Analytics Methods ---
  
  async getWorkLifeBalance(days: number = 30): Promise<any> {
    const response = await apiService.get(
      `${this.baseUrl}/analytics/work-life-balance?days=${days}`
    );
    return response.data;
  }

  async getFinancialWellness(days: number = 60): Promise<any> {
    const response = await apiService.get(
      `${this.baseUrl}/analytics/financial-wellness?days=${days}`
    );
    return response.data;
  }

  async getWeeklyPatterns(days: number = 90): Promise<any> {
    const response = await apiService.get(
      `${this.baseUrl}/analytics/weekly-patterns?days=${days}`
    );
    return response.data;
  }

  async getTemperatureMood(days: number = 60): Promise<any> {
    const response = await apiService.get(
      `${this.baseUrl}/analytics/temperature-mood?days=${days}`
    );
    return response.data;
  }

  async getWritingTherapy(days: number = 90): Promise<any> {
    const response = await apiService.get(
      `${this.baseUrl}/analytics/writing-therapy?days=${days}`
    );
    return response.data;
  }

  async getHabitStreak(habitKey: string, endDate?: string): Promise<number> {
    const url = endDate
      ? `${this.baseUrl}/habits/${habitKey}/streak?end_date=${endDate}`
      : `${this.baseUrl}/habits/${habitKey}/streak`;

    const response = await apiService.get<{ streak: number }>(url);
    return response.data.streak;
  }

  // --- DRY Unified Habit Configuration & Tracking Methods ---

  async getHabitConfig(habitType: 'default' | 'defined'): Promise<any[]> {
    const response = await apiService.get<any[]>(
      `${this.baseUrl}/habits/${habitType}/config`
    );
    return response.data;
  }

  async saveHabitConfig(
    habitType: 'default' | 'defined', 
    config: any[]
  ): Promise<void> {
    await apiService.post(
      `${this.baseUrl}/habits/${habitType}/config`,
      config
    );
  }

  async addHabitToConfig(
    habitType: 'default' | 'defined',
    name: string,
    unit: string,
    goalType?: string,
    targetQuantity?: number
  ): Promise<any> {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('unit', unit);
    if (goalType) formData.append('goal_type', goalType);
    if (targetQuantity !== undefined) formData.append('target_quantity', targetQuantity.toString());

    const response = await apiService.post(
      `${this.baseUrl}/habits/${habitType}/config/add`,
      formData
    );
    return response.data;
  }

  async updateHabitInConfig(
    habitType: 'default' | 'defined',
    habitId: string,
    updates: Record<string, any>
  ): Promise<void> {
    await apiService.put(
      `${this.baseUrl}/habits/${habitType}/config/${habitId}`,
      updates
    );
  }

  async deleteHabitFromConfig(
    habitType: 'default' | 'defined',
    habitId: string
  ): Promise<void> {
    await apiService.delete(
      `${this.baseUrl}/habits/${habitType}/config/${habitId}`
    );
  }

  async updateDailyHabits(
    habitType: 'default' | 'defined',
    date: string,
    data: Record<string, number>
  ): Promise<any> {
    const response = await apiService.post(
      `${this.baseUrl}/daily-metadata/${date}/habits/${habitType}`,
      data
    );
    return response.data;
  }

  async updateDailyHabitsUnified(
    date: string,
    data: { default_habits: Record<string, number>, defined_habits: Record<string, number> }
  ): Promise<any> {
    const response = await apiService.post(
      `${this.baseUrl}/daily-metadata/${date}/habits`,  // No habit_type in URL
      data
    );
    return response.data;
  }

  async getDailyHabits(
    habitType: 'default' | 'defined',
    date: string
  ): Promise<any[]> {
    const response = await apiService.get<any[]>(
      `${this.baseUrl}/daily-metadata/${date}/habits/${habitType}`
    );
    return response.data;
  }

  // --- New Analytics Methods ---

  /**
   * Get analytics for 9 default habits with optional SMA overlays
   * @param days Number of days for analysis (7-365)
   * @param includeSMA Whether to include Simple Moving Average overlays
   * @param smaWindows List of SMA window sizes (default: [7, 14, 30])
   * @returns Default habits analytics data
   */
  async getDefaultHabitsAnalytics(
    days: number = 30,
    includeSMA: boolean = false,
    smaWindows: number[] = [7, 14, 30]
  ): Promise<any> {
    const params = new URLSearchParams({
      days: days.toString(),
      include_sma: includeSMA.toString(),
      sma_windows: smaWindows.join(',')
    });
    
    const response = await apiService.get<any>(
      `${this.baseUrl}/habits/analytics/default?${params}`
    );
    return response.data;
  }

  /**
   * Get analytics for user-defined custom habits with optional normalization
   * @param days Number of days for analysis (7-365)
   * @param normalize Whether to normalize values to percentage of target
   * @returns Defined habits analytics data
   */
  async getDefinedHabitsAnalytics(
    days: number = 30,
    normalize: boolean = false
  ): Promise<any> {
    const params = new URLSearchParams({
      days: days.toString(),
      normalize: normalize.toString()
    });
    
    const response = await apiService.get<any>(
      `${this.baseUrl}/habits/analytics/defined?${params}`
    );
    return response.data;
  }

  /**
   * Get unified view of all habits + mood + financial + insights
   * @param days Number of days for analysis (7-365)
   * @returns Comprehensive analytics data
   */
  async getComprehensiveAnalytics(days: number = 30): Promise<any> {
    const response = await apiService.get<any>(
      `${this.baseUrl}/habits/analytics/comprehensive?days=${days}`
    );
    return response.data;
  }

  /**
   * Calculate correlation between any two habits
   * @param habitX First habit identifier
   * @param habitY Second habit identifier
   * @param days Number of days for analysis (7-365)
   * @param normalize Whether to normalize defined habits to percentage of target
   * @returns Correlation analysis data
   */
  async getHabitCorrelation(
    habitX: string,
    habitY: string,
    days: number = 90,
    normalize: boolean = false
  ): Promise<any> {
    const params = new URLSearchParams({
      habit_x: habitX,
      habit_y: habitY,
      days: days.toString(),
      normalize: normalize.toString()
    });
    
    const response = await apiService.get<any>(
      `${this.baseUrl}/habits/correlation?${params}`
    );
    return response.data;
  }

  /**
   * Get trend data for specific habit with SMA overlays
   * @param habitKey Habit identifier
   * @param days Number of days for analysis (7-365)
   * @param includeSMA Whether to include SMA overlays
   * @param smaWindows List of SMA window sizes (default: [7, 14, 30])
   * @returns Habit trend data
   */
  async getHabitTrend(
    habitKey: string,
    days: number = 90,
    includeSMA: boolean = true,
    smaWindows: number[] = [7, 14, 30]
  ): Promise<any> {
    const params = new URLSearchParams({
      days: days.toString(),
      include_sma: includeSMA.toString(),
      sma_windows: smaWindows.join(',')
    });
    
    const response = await apiService.get<any>(
      `${this.baseUrl}/habits/trend/${habitKey}?${params}`
    );
    return response.data;
  }

  /**
   * Get lightweight dashboard summary for instant load (< 100ms)
   * @returns Dashboard summary data
   */
  async getHabitsDashboardSummary(): Promise<any> {
    const response = await apiService.get<any>(
      `${this.baseUrl}/habits/dashboard`
    );
    return response.data;
  }

  /**
   * Check if today's data is filled for habits
   * @returns Object with filled status and missing habits list
   */
  async checkTodayDataFilled(): Promise<{ filled: boolean; missing: string[] }> {
    try {
      const dashboard = await this.getHabitsDashboardSummary();
      return {
        filled: dashboard.missing_today.length === 0,
        missing: dashboard.missing_today || []
      };
    } catch (error) {
      console.error('Failed to check today data:', error);
      return { filled: false, missing: [] };
    }
  }
}

export const diaryService = new DiaryService();