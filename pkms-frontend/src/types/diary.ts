export interface DiaryMetadata {
  sleep_hours?: number;
  exercise_minutes?: number;
  phone_hours?: number;
  activity_level?: number;
  custom_fields?: Record<string, any>;
}

export interface DiaryEntry {
  id: number;
  date: string;
  title?: string;
  content: string;
  encrypted_blob: string;
  encryption_iv: string;
  encryption_tag: string;
  mood?: number;
  metadata: DiaryMetadata;
  created_at: string;
  updated_at: string;
  media_count: number;
}

export interface DiaryEntrySummary {
  id: number;
  date: string;
  title?: string;
  encrypted_blob: string;
  encryption_iv: string;
  encryption_tag: string;
  mood?: number;
  metadata: DiaryMetadata;
  created_at: string;
  media_count: number;
}

export interface DiaryFormValues {
  id: number | null;
  date: Date;
  title: string;
  content: string;
  mood: number;
  metadata: DiaryMetadata;
}

export interface DiaryEntryCreatePayload {
  date: string;
  title: string;
  encrypted_blob: string;
  encryption_iv: string;
  encryption_tag: string;
  mood: number;
  metadata: DiaryMetadata;
}

export interface DiaryEntryUpdatePayload extends DiaryEntryCreatePayload {
  id: number;
}

export interface DiaryCalendarData {
  date: string;
  has_entry: boolean;
  mood?: number;
}

export interface MoodStats {
  total_entries: number;
  average_mood: number;
  mood_distribution: Record<number, number>;
}

export type SortField = 'date' | 'created_at' | 'mood';
export type SortOrder = 'asc' | 'desc'; 