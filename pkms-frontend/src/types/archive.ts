export interface ArchiveFolder {
  itemType: 'folder';  // Discriminator field for type-safe unions
  uuid: string;
  name: string;
  description?: string;
  parentUuid?: string;
  path: string;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  subfolderCount: number;
  totalSize: number;
  // Missing fields from database
  isFavorite: boolean;
  depth: number;
}

export interface ArchiveItem {
  itemType: 'file';  // Discriminator field for type-safe unions
  uuid: string;
  name: string;
  description?: string;
  folderUuid: string;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  fileSize: number;
  extractedText?: string;
  metadata: Record<string, any>;
  thumbnailPath?: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  // Missing fields from database
  filePath: string;
  fileHash?: string;
}

export interface ArchiveItemSummary {
  uuid: string;
  name: string;
  folderUuid: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  preview: string;
  // Missing fields from database
  fileHash?: string;
  thumbnailPath?: string;
}

export interface FolderTree {
  folder: ArchiveFolder;
  children: FolderTree[];
  items: ArchiveItemSummary[];
}

export interface FolderCreate {
  name: string;
  description?: string;
  parentUuid?: string;
}

export interface FolderUpdate {
  name?: string;
  description?: string;
}

export interface ItemUpdate {
  name?: string;
  description?: string;
  folderUuid?: string;
  tags?: string[];
  isFavorite?: boolean;
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

/**
 * URL Query Parameter Values - MUST stay snake_case
 * These values are sent to the backend API as URL query parameters
 * (e.g., ?sort_by=created_at&sort_order=desc)
 * The Pydantic CamelCaseModel only converts JSON request/response bodies, not URL parameters
 */
export enum SortBy {
  NAME = 'name',
  CREATED_AT = 'created_at',  // URL param: ?sort_by=created_at
  UPDATED_AT = 'updated_at',  // URL param: ?sort_by=updated_at
  SIZE = 'size'
}

export interface ArchiveFilters {
  search?: string;
  mimeType?: string;
  tag?: string;
}

export interface ArchivePreviewImage {
  uuid: string;
  name: string;
  mimeType: string;
  fileSize: number;
  thumbnailPath?: string;
  originalFilename: string;
  storedFilename: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArchiveSelectedItem {
  uuid: string;
  name: string;
  mimeType: 'folder' | 'file';
  // Add additional fields as needed
  description?: string;
  fileSize?: number;
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