export interface ArchiveFolder {
  uuid: string;
  name: string;
  description?: string;
  parent_uuid?: string;
  path: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  item_count: number;
  subfolder_count: number;
  total_size: number;
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
  is_archived: boolean;
  is_favorite: boolean;
  version: string;
  created_at: string;
  updated_at: string;
  tags: string[];
}

export interface ArchiveItemSummary {
  uuid: string;
  name: string;
  folder_uuid: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  is_archived: boolean;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  preview: string;
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
  is_archived?: boolean;
}

export interface ItemUpdate {
  name?: string;
  description?: string;
  folder_uuid?: string;
  tags?: string[];
  is_archived?: boolean;
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
  archived?: boolean;
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