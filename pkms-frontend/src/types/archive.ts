export interface ArchiveFolder {
  uuid: string;
  name: string;
  description?: string;
  parent_uuid?: string;
  path: string;
  created_at: string;
  updated_at: string;
  item_count: number;
  subfolder_count: number;
  total_size: number;
  // Missing fields from database
  is_favorite: boolean;
  depth: number;
}

export interface ArchiveItem {
  uuid: string;
  name: string;
  description?: string;
  folder_uuid: string;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  file_size: number;
  extracted_text?: string;
  metadata: Record<string, any>;
  thumbnail_path?: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  // Missing fields from database
  file_path: string;
  file_hash?: string;
}

export interface ArchiveItemSummary {
  uuid: string;
  name: string;
  folder_uuid: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  preview: string;
  // Missing fields from database
  file_hash?: string;
  thumbnail_path?: string;
}

export interface FolderTree {
  folder: ArchiveFolder;
  children: FolderTree[];
  items: ArchiveItemSummary[];
}

export interface FolderCreate {
  name: string;
  description?: string;
  parent_uuid?: string;
}

export interface FolderUpdate {
  name?: string;
  description?: string;
}

export interface ItemUpdate {
  name?: string;
  description?: string;
  folder_uuid?: string;
  tags?: string[];
  is_favorite?: boolean;
}

export enum ViewMode {
  LIST = 'list',
  GRID = 'grid',
  TREE = 'tree'
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc'
}

export enum SortBy {
  NAME = 'name',
  CREATED_AT = 'created_at',
  UPDATED_AT = 'updated_at',
  SIZE = 'size'
}

export interface ArchiveFilters {
  search?: string;
  mime_type?: string;
  tag?: string;
}

export interface ArchivePreviewImage {
  uuid: string;
  name: string;
  mime_type: string;
  file_size: number;
  thumbnail_path?: string;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  created_at: string;
  updated_at: string;
}

export interface ArchiveSelectedItem {
  uuid: string;
  name: string;
  mime_type: 'folder' | 'file';
  // Add additional fields as needed
  description?: string;
  file_size?: number;
}

export interface ArchiveState {
  folders: ArchiveFolder[];
  items: ArchiveItemSummary[];
  currentFolder: ArchiveFolder | null;
  breadcrumb: ArchiveFolder[];
  folderTree: FolderTree[];
  viewMode: ViewMode;
  sortBy: SortBy;
  sortOrder: SortOrder;
  filters: ArchiveFilters;
  isLoading: boolean;
  error: string | null;
  selectedItems: string[];
} 