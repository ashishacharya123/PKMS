export interface DiaryMetadata {
  // Legacy fields (keeping for compatibility)
  sleep_hours?: number;
  exercise_minutes?: number;
  phone_hours?: number;
  activity_level?: number;
  
  // New wellness tracking fields
  did_exercise?: boolean;
  did_meditation?: boolean;
  sleep_duration?: number; // hours
  screen_time?: number; // hours
  water_intake?: number; // glasses
  time_outside?: number; // minutes
  social_interaction?: boolean;
  gratitude_practice?: boolean;
  reading_time?: number; // minutes
  energy_level?: number; // 1-5 scale
  stress_level?: number; // 1-5 scale
  
  custom_fields?: Record<string, any>;
}

export interface DiaryEntry {
  uuid: string;
  date: string;
  nepali_date?: string;
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
  tags: string[];
}

export interface DiaryEntrySummary {
  uuid: string;
  date: string;
  nepali_date?: string;
  title?: string;
  encrypted_blob: string;
  encryption_iv: string;
  encryption_tag: string;
  mood?: number;
  metadata: DiaryMetadata;
  created_at: string;
  updated_at: string;
  media_count: number;
  tags: string[];
}

export interface DiaryFormValues {
  uuid: string | null;
  date: Date;
  title: string;
  content: string;
  mood: number;
  metadata: DiaryMetadata;
  tags: string[];
}

export interface DiaryEntryCreatePayload {
  date: string;
  nepali_date?: string;
  title?: string;
  encrypted_blob: string;
  encryption_iv: string;
  encryption_tag: string;
  mood?: number;
  metadata?: DiaryMetadata;
  tags?: string[];
}

export interface DiaryEntryUpdatePayload extends DiaryEntryCreatePayload {
  uuid: string;
}

export interface DiaryCalendarData {
  date: string;
  has_entry: boolean;
  mood?: number;
  media_count: number;
}

export interface MoodStats {
  total_entries: number;
  average_mood: number;
  mood_distribution: Record<number, number>;
}

export type SortField = 'date' | 'created_at' | 'mood';
export type SortOrder = 'asc' | 'desc'; 