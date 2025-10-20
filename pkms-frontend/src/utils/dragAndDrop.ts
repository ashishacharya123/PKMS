/**
 * Drag and Drop Utilities for Project Operations
 * 
 * Provides utilities for:
 * - Document reordering within projects
 * - Section reordering within projects
 * - File reordering within notes/diary
 */

export interface DragItem {
  id: string;
  type: 'document' | 'note' | 'todo' | 'section' | 'file';
  index: number;
}

export interface DropResult {
  sourceIndex: number;
  destinationIndex: number;
  sourceId: string;
  destinationId?: string;
}

/**
 * Reorder array items based on drag and drop result
 */
export function reorderArray<T>(
  list: T[],
  startIndex: number,
  endIndex: number
): T[] {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

/**
 * Move item from one list to another
 */
export function moveItem<T>(
  sourceList: T[],
  destinationList: T[],
  sourceIndex: number,
  destinationIndex: number
): { sourceList: T[]; destinationList: T[] } {
  const sourceResult = Array.from(sourceList);
  const destinationResult = Array.from(destinationList);
  
  const [removed] = sourceResult.splice(sourceIndex, 1);
  destinationResult.splice(destinationIndex, 0, removed);
  
  return {
    sourceList: sourceResult,
    destinationList: destinationResult
  };
}

/**
 * Generate optimistic update for document reordering
 */
export function generateDocumentReorderUpdate(
  documents: Array<{ uuid: string }>,
  dropResult: DropResult
): string[] {
  const reorderedDocuments = reorderArray(
    documents,
    dropResult.sourceIndex,
    dropResult.destinationIndex
  );
  
  return reorderedDocuments.map(doc => doc.uuid);
}

/**
 * Generate optimistic update for section reordering
 */
export function generateSectionReorderUpdate(
  sections: string[],
  dropResult: DropResult
): string[] {
  return reorderArray(sections, dropResult.sourceIndex, dropResult.destinationIndex);
}

/**
 * Validate drag and drop operation
 */
export function validateDropOperation(
  source: DragItem,
  destination: DragItem | null,
  allowedTypes: string[]
): boolean {
  // Check if source type is allowed
  if (!allowedTypes.includes(source.type)) {
    return false;
  }
  
  // If no destination, it's a valid drop (e.g., outside drop zone)
  if (!destination) {
    return true;
  }
  
  // Check if destination type is allowed
  if (!allowedTypes.includes(destination.type)) {
    return false;
  }
  
  // Same item can't be dropped on itself
  if (source.id === destination.id) {
    return false;
  }
  
  return true;
}

/**
 * Get drag preview styles
 */
export function getDragPreviewStyles(isDragging: boolean): React.CSSProperties {
  return {
    opacity: isDragging ? 0.5 : 1,
    transform: isDragging ? 'rotate(5deg)' : 'none',
    transition: 'all 0.2s ease',
    cursor: isDragging ? 'grabbing' : 'grab'
  };
}

/**
 * Get drop zone styles
 */
export function getDropZoneStyles(
  isOver: boolean, 
  canDrop: boolean
): React.CSSProperties {
  return {
    backgroundColor: isOver && canDrop ? '#e3f2fd' : 'transparent',
    border: isOver && canDrop ? '2px dashed #2196f3' : '2px dashed transparent',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    minHeight: '50px'
  };
}
