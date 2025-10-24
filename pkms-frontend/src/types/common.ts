/**
 * Common types and interfaces for modular components
 * Used across all modules (Archive, Todos, Notes, Documents, Projects)
 */

export interface BaseItem {
  uuid: string;
  name: string;
  title?: string; // For items that use 'title' instead of 'name'
  description?: string;
  isFavorite: boolean;
  isArchived: boolean;
  isDeleted?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  tagObjs?: Array<{ uuid: string; name: string; color?: string }>;
}

// Base types for CRUD operations
export interface BaseEntity extends BaseItem {
  // Additional common fields can be added here
}

export interface BaseCreateRequest {
  name: string;
  title?: string;
  description?: string;
  tags?: string[];
  [key: string]: any;
}

export interface BaseUpdateRequest {
  name?: string;
  title?: string;
  description?: string;
  tags?: string[];
  [key: string]: any;
}

export interface BaseSummary extends BaseItem {
  // Summary-specific fields
}

export interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
  order: number;
}

export interface ModuleFilters {
  favorites?: boolean;
  archived?: boolean;
  mimeTypes?: string[];
  dateRange?: 'all' | 'today' | 'week' | 'month' | 'year';
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  // Custom filters per module
  [key: string]: any;
}

/**
 * Generic action menu item for any type of content item
 * Uses BaseItem since all supported items (Archive, Todo, Note, Document) extend BaseItem
 */
export interface ActionMenuItem {
  label: string;
  icon: React.ComponentType<any>;
  onClick: (item: BaseItem) => void;  // ✅ Use BaseItem instead of any
  color?: string;
  disabled?: boolean;
  hidden?: (item: BaseItem) => boolean;  // ✅ Use BaseItem instead of any
}

export interface ModuleHeaderProps {
  title: string;
  itemCount: number;
  onRefresh: () => void;
  onCreate?: () => void;
  onFilter?: () => void;
  showFilters?: boolean;
  showCreate?: boolean;
  showRefresh?: boolean;
  customActions?: React.ReactNode;
  isLoading?: boolean;
}

export interface ItemActionMenuProps {
  item: BaseItem;
  onToggleFavorite?: (item: BaseItem) => void;
  onToggleArchive?: (item: BaseItem) => void;
  onDelete?: (item: BaseItem) => void;
  onEdit?: (item: BaseItem) => void;
  onDownload?: (item: BaseItem) => void;
  onPreview?: (item: BaseItem) => void;
  customActions?: ActionMenuItem[];
  showFavorite?: boolean;
  showArchive?: boolean;
  showDelete?: boolean;
  showEdit?: boolean;
  showDownload?: boolean;
  showPreview?: boolean;
}

export interface ModuleLayoutProps<T extends BaseItem> {
  items: T[];
  viewMode: 'small-icons' | 'medium-icons' | 'list' | 'details';
  onItemClick: (item: T) => void;
  onToggleFavorite?: (item: T) => void;
  onToggleArchive?: (item: T) => void;
  onDelete?: (item: T) => void;
  onEdit?: (item: T) => void;
  onDownload?: (item: T) => void;
  onPreview?: (item: T) => void;
  renderIcon: (item: T) => React.ReactNode;
  renderContent: (item: T) => React.ReactNode;
  renderActions?: (item: T) => React.ReactNode;
  isLoading?: boolean;
  emptyMessage?: string;
  customActions?: ActionMenuItem[];
  showFavorite?: boolean;
  showArchive?: boolean;
  showDelete?: boolean;
  showEdit?: boolean;
  showDownload?: boolean;
  showPreview?: boolean;
}

// Module-specific item types extending BaseItem
export interface ArchiveItem extends BaseItem {
  originalFilename: string;
  storedFilename: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  folderUuid?: string;
  fileHash?: string;
  thumbnailPath?: string;
}

export interface ArchiveFolder extends BaseItem {
  parentUuid?: string;
  depth: number;
  itemCount: number;
  totalSize: number;
  path?: string; // For display purposes
}

export interface TodoItem extends BaseItem {
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  startDate?: string;
  completedAt?: string;
  parentUuid?: string;
  todoType: 'task' | 'checklist' | 'subtask';
  completionPercentage: number;
  subtasks?: SubtaskItem[];
  projectId?: string;
  projectIds?: string[];
  isExclusive?: boolean;
  description?: string;
  tags?: string[];
}

export interface SubtaskItem {
  uuid: string;
  title: string;
  completed: boolean;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteItem extends BaseItem {
  title: string;
  content: string;
  contentFilePath?: string;
  sizeBytes: number;
  version: number;
  fileCount: number;
  thumbnailPath?: string;
}

export interface DocumentItem extends BaseItem {
  title: string;
  filename: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  fileHash: string;
  mimeType: string;
  thumbnailPath?: string;
}

export interface ProjectItem extends BaseItem {
  name: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  startDate?: string;
  dueDate?: string;
  completionDate?: string;
  progressPercentage: number;
  sortOrder: number;
}

export interface DiaryItem extends BaseItem {
  title: string;
  content: string;
  date: string; // ISO date string
  mood?: string;
  weather?: string;
  location?: string;
  tags?: string[];
  is_encrypted?: boolean;
  thumbnail_path?: string;
}