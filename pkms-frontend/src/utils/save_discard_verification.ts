/**
 * Save & Discard Verification - Typed helpers for determining when entities should be kept vs discarded
 * Provides consistent, type-safe validation for auto-discard logic across all modules (notes, diary, projects)
 *
 * Purpose: Help determine if a user's creation (note/diary/project) is empty enough to auto-discard on cancel
 */

// Interface definitions for entity types
interface BaseEntity {
  uuid?: string;
  created_at?: string;
  updated_at?: string;
}

interface NoteEntity extends BaseEntity {
  title?: string;
  content?: string;
  files?: Array<any>;
  is_favorite?: boolean;
  is_archived?: boolean;
  is_template?: boolean;
  from_template_id?: string;
}

interface DiaryEntryEntity extends BaseEntity {
  title?: string;
  content?: string;
  date?: string;
  mood?: number;
  weather_code?: number;
  files?: Array<any>;
  is_template?: boolean;
}

interface ProjectEntity extends BaseEntity {
  title?: string;
  description?: string;
  files?: Array<any>;
  is_active?: boolean;
  is_archived?: boolean;
}

/**
 * Check if a note entity is effectively empty
 * @param note - Partial note object to check
 * @returns true if note has no meaningful content
 */
export const isEmptyNote = (note: Partial<NoteEntity>): boolean => {
  const hasTitle = note.title?.trim().length > 0;
  const hasContent = note.content?.trim().length > 0;
  const hasFiles = note.files && note.files.length > 0;

  return !hasTitle && !hasContent && !hasFiles;
};

/**
 * Check if a diary entry entity is effectively empty
 * @param entry - Partial diary entry object to check
 * @returns true if entry has no meaningful content
 */
export const isEmptyDiaryEntry = (entry: Partial<DiaryEntryEntity>): boolean => {
  const hasTitle = entry.title?.trim().length > 0;
  const hasContent = entry.content?.trim().length > 0;
  const hasFiles = entry.files && entry.files.length > 0;
  const hasMood = entry.mood !== undefined && entry.mood !== null;

  return !hasTitle && !hasContent && !hasFiles && !hasMood;
};

/**
 * Check if a project entity is effectively empty
 * @param project - Partial project object to check
 * @returns true if project has no meaningful content
 */
export const isEmptyProject = (project: Partial<ProjectEntity>): boolean => {
  const hasTitle = project.title?.trim().length > 0;
  const hasDescription = project.description?.trim().length > 0;
  const hasFiles = project.files && project.files.length > 0;

  return !hasTitle && !hasDescription && !hasFiles;
};

/**
 * Generic helper to check if any entity is empty
 * @param entity - Entity object to check
 * @param moduleType - Type of module ('notes', 'diary', 'projects')
 * @returns true if entity is empty based on module-specific criteria
 */
export const isEmptyEntity = (
  entity: Partial<NoteEntity | DiaryEntryEntity | ProjectEntity>,
  moduleType: 'notes' | 'diary' | 'projects'
): boolean => {
  switch (moduleType) {
    case 'notes':
      return isEmptyNote(entity as Partial<NoteEntity>);
    case 'diary':
      return isEmptyDiaryEntry(entity as Partial<DiaryEntryEntity>);
    case 'projects':
      return isEmptyProject(entity as Partial<ProjectEntity>);
    default:
      return true;
  }
};

/**
 * Get a display name for a module type
 * @param moduleType - Module type identifier
 * @returns User-friendly module name
 */
export const getModuleDisplayName = (moduleType: 'notes' | 'diary' | 'projects'): string => {
  switch (moduleType) {
    case 'notes':
      return 'note';
    case 'diary':
      return 'diary entry';
    case 'projects':
      return 'project';
    default:
      return 'item';
  }
};

// Export types for use in other files
export type { NoteEntity, DiaryEntryEntity, ProjectEntity };