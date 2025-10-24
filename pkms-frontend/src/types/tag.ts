/**
 * Tag TypeScript interfaces matching backend schemas exactly
 * NO COLOR - removed per user decision (not needed for 100+ tags)
 */

export interface Tag {
  uuid: string;
  name: string;
  description: string | null;
  usageCount: number;
  isSystem: boolean;  // System tags can't be deleted
  isArchived: boolean;  // Soft delete support
  createdAt: string;
}

export interface TagResponse {
  uuid: string;
  name: string;
  usageCount: number;
  // NO color field
}

// TagAutocompleteResponse DELETED - not needed (endpoint returns List[TagResponse] directly)

export interface CreateTagRequest {
  name: string;
}

export interface UpdateTagRequest {
  name?: string;
}