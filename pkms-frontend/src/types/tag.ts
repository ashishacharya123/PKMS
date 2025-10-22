/**
 * Tag TypeScript interfaces matching backend schemas exactly
 */

export interface Tag {
  uuid: string;
  name: string;
  // NO color field - backend removed for professional management
  usageCount: number;
  // NO moduleType - tags are GLOBAL (backend removed)
}

export interface TagResponse {
  uuid: string;
  name: string;
  // NO color field - backend removed for professional management
  usageCount: number;
}

export interface TagAutocompleteResponse {
  uuid: string;
  name: string;
  // NO color field - backend removed for professional management
  usageCount: number;
}

export interface CreateTagRequest {
  name: string;
  // NO color field - backend removed for professional management
}

export interface UpdateTagRequest {
  name?: string;
  // NO color field - backend removed for professional management
}
