export * from './auth';

// Re-export archive types for convenience
export type {
  ArchiveFolder,
  ArchiveItem,
  ArchiveItemSummary,
  FolderTree
} from '../services/archiveService';

export interface DiaryCalendarData {
  date: string;
  mood: number | null;
  has_entry: boolean;
  media_count: number;
}

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

export interface DiaryListParams {
  year?: number;
  month?: number;
  mood?: number;
  limit?: number;
  offset?: number;
}