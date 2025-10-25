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

export interface ActionMenuItem {
  label: string;
  icon: React.ComponentType<any>;  // Keep 'any' for icon props (acceptable)
  onClick: (item: BaseItem) => void;
  color?: string;
  disabled?: boolean;
  hidden?: (item: BaseItem) => boolean;
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

// Module-specific types are now defined in their respective type files:
// - ArchiveItem, ArchiveFolder in types/archive.ts
// - TodoItem, SubtaskItem in types/todo.ts  
// - NoteItem in types/note.ts
// - DocumentItem in types/document.ts
// - ProjectItem in types/project.ts
// - DiaryItem in types/diary.ts