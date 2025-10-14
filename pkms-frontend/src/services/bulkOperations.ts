export interface BulkOperationItem {
  id: string;
  type: 'note' | 'document' | 'todo' | 'diary' | 'archive' | 'folder';
  title: string;
  module: string;
  tags: string[];
  selected: boolean;
}

export interface BulkOperationOptions {
  operation: 'tag' | 'untag' | 'delete' | 'move' | 'archive' | 'favorite' | 'unfavorite' | 'export';
  items: BulkOperationItem[];
  target?: {
    tags?: string[];
    folder?: string;
    module?: string;
  };
}

export interface BulkOperationResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
  details: Array<{
    id: string;
    success: boolean;
    error?: string;
  }>;
}

export interface BulkSelectionState {
  items: BulkOperationItem[];
  allSelected: boolean;
  selectedCount: number;
  totalCount: number;
}

class BulkOperationsService {
  // private notificationId: string | null = null; // Reserved for future use

  constructor() {
    this.setupKeyboardShortcuts();
  }

  // Create selection state from items
  createSelectionState(items: any[], itemType: string): BulkSelectionState {
    const bulkItems: BulkOperationItem[] = items.map(item => ({
      id: item.id || item.uuid,
      type: this.getTypeFromModule(itemType),
      title: item.title || item.name || 'Untitled',
      module: itemType,
      tags: item.tags || [],
      selected: false
    }));

    return {
      items: bulkItems,
      allSelected: false,
      selectedCount: 0,
      totalCount: bulkItems.length
    };
  }

  // Toggle item selection
  toggleSelection(state: BulkSelectionState, itemId: string): BulkSelectionState {
    const item = state.items.find(item => item.id === itemId);
    if (item) {
      item.selected = !item.selected;
      return this.updateSelectionState(state);
    }
    return state;
  }

  // Toggle all items selection
  toggleAllSelection(state: BulkSelectionState): BulkSelectionState {
    const newState = { ...state };
    newState.allSelected = !newState.allSelected;

    newState.items.forEach(item => {
      item.selected = newState.allSelected;
    });

    return this.updateSelectionState(newState);
  }

  // Update selection state after changes
  private updateSelectionState(state: BulkSelectionState): BulkSelectionState {
    const selectedItems = state.items.filter(item => item.selected);
    return {
      ...state,
      selectedCount: selectedItems.length,
      allSelected: selectedItems.length === state.totalCount && state.totalCount > 0
    };
  }

  // Clear all selections
  clearSelections(state: BulkSelectionState): BulkSelectionState {
    state.items.forEach(item => {
      item.selected = false;
    });
    return {
      ...state,
      allSelected: false,
      selectedCount: 0
    };
  }

  // Get selected items
  getSelectedItems(state: BulkSelectionState): BulkOperationItem[] {
    return state.items.filter(item => item.selected);
  }

  // Perform bulk operation
  async performBulkOperation(options: BulkOperationOptions): Promise<BulkOperationResult> {
    const selectedItems = options.items.filter(item => item.selected);

    if (selectedItems.length === 0) {
      return {
        success: false,
        processed: 0,
        failed: 0,
        errors: ['No items selected'],
        details: []
      };
    }

    this.showProgressNotification(selectedItems.length, options.operation);

    try {
      switch (options.operation) {
        case 'tag':
          return await this.bulkAddTags(selectedItems, options.target?.tags || []);
        case 'untag':
          return await this.bulkRemoveTags(selectedItems, options.target?.tags || []);
        case 'delete':
          return await this.bulkDelete(selectedItems);
        case 'move':
          return await this.bulkMove(selectedItems, options.target?.folder, options.target?.module);
        case 'archive':
          return await this.bulkArchive(selectedItems);
        case 'favorite':
          return await this.bulkFavorite(selectedItems, true);
        case 'unfavorite':
          return await this.bulkFavorite(selectedItems, false);
        case 'export':
          return await this.bulkExport(selectedItems);
        default:
          throw new Error(`Unknown operation: ${options.operation}`);
      }
    } catch (error) {
      this.hideProgressNotification();
      return {
        success: false,
        processed: 0,
        failed: selectedItems.length,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        details: selectedItems.map(item => ({
          id: item.id,
          success: false,
          error: 'Operation failed'
        }))
      };
    }
  }

  // Bulk add tags
  private async bulkAddTags(items: BulkOperationItem[], tags: string[]): Promise<BulkOperationResult> {
    const results: BulkOperationResult['details'] = [];
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        await this.addTagsToItem(item, tags);
        results.push({ id: item.id, success: true });
        processed++;
      } catch (error) {
        results.push({
          id: item.id,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add tags'
        });
        failed++;
        errors.push(`${item.title}: ${error}`);
      }
      this.updateProgressNotification(processed + failed, items.length);
    }

    this.hideProgressNotification();
    this.showCompletionNotification('Tags Added', processed, failed);

    return {
      success: failed === 0,
      processed,
      failed,
      errors: errors.slice(0, 5), // Limit errors to avoid overwhelming UI
      details: results
    };
  }

  // Bulk remove tags
  private async bulkRemoveTags(items: BulkOperationItem[], tags: string[]): Promise<BulkOperationResult> {
    const results: BulkOperationResult['details'] = [];
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        await this.removeTagsFromItem(item, tags);
        results.push({ id: item.id, success: true });
        processed++;
      } catch (error) {
        results.push({
          id: item.id,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove tags'
        });
        failed++;
        errors.push(`${item.title}: ${error}`);
      }
      this.updateProgressNotification(processed + failed, items.length);
    }

    this.hideProgressNotification();
    this.showCompletionNotification('Tags Removed', processed, failed);

    return {
      success: failed === 0,
      processed,
      failed,
      errors: errors.slice(0, 5),
      details: results
    };
  }

  // Bulk delete
  private async bulkDelete(items: BulkOperationItem[]): Promise<BulkOperationResult> {
    // Confirm before deletion
    if (!window.confirm(`Are you sure you want to delete ${items.length} items? This action cannot be undone.`)) {
      return {
        success: false,
        processed: 0,
        failed: 0,
        errors: ['Operation cancelled by user'],
        details: []
      };
    }

    const results: BulkOperationResult['details'] = [];
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        await this.deleteItem(item);
        results.push({ id: item.id, success: true });
        processed++;
      } catch (error) {
        results.push({
          id: item.id,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete'
        });
        failed++;
        errors.push(`${item.title}: ${error}`);
      }
      this.updateProgressNotification(processed + failed, items.length);
    }

    this.hideProgressNotification();
    this.showCompletionNotification('Items Deleted', processed, failed);

    return {
      success: failed === 0,
      processed,
      failed,
      errors: errors.slice(0, 5),
      details: results
    };
  }

  // Bulk move
  private async bulkMove(items: BulkOperationItem[], targetFolder?: string, targetModule?: string): Promise<BulkOperationResult> {
    const results: BulkOperationResult['details'] = [];
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        await this.moveItem(item, targetFolder, targetModule);
        results.push({ id: item.id, success: true });
        processed++;
      } catch (error) {
        results.push({
          id: item.id,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to move'
        });
        failed++;
        errors.push(`${item.title}: ${error}`);
      }
      this.updateProgressNotification(processed + failed, items.length);
    }

    this.hideProgressNotification();
    this.showCompletionNotification('Items Moved', processed, failed);

    return {
      success: failed === 0,
      processed,
      failed,
      errors: errors.slice(0, 5),
      details: results
    };
  }

  // Bulk archive
  private async bulkArchive(items: BulkOperationItem[]): Promise<BulkOperationResult> {
    const results: BulkOperationResult['details'] = [];
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        await this.archiveItem(item);
        results.push({ id: item.id, success: true });
        processed++;
      } catch (error) {
        results.push({
          id: item.id,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to archive'
        });
        failed++;
        errors.push(`${item.title}: ${error}`);
      }
      this.updateProgressNotification(processed + failed, items.length);
    }

    this.hideProgressNotification();
    this.showCompletionNotification('Items Archived', processed, failed);

    return {
      success: failed === 0,
      processed,
      failed,
      errors: errors.slice(0, 5),
      details: results
    };
  }

  // Bulk favorite/unfavorite
  private async bulkFavorite(items: BulkOperationItem[], favorite: boolean): Promise<BulkOperationResult> {
    const action = favorite ? 'Favorited' : 'Unfavorited';
    const results: BulkOperationResult['details'] = [];
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of items) {
      try {
        await this.setFavoriteStatus(item, favorite);
        results.push({ id: item.id, success: true });
        processed++;
      } catch (error) {
        results.push({
          id: item.id,
          success: false,
          error: error instanceof Error ? error.message : `Failed to ${action.toLowerCase()}`
        });
        failed++;
        errors.push(`${item.title}: ${error}`);
      }
      this.updateProgressNotification(processed + failed, items.length);
    }

    this.hideProgressNotification();
    this.showCompletionNotification(`Items ${action}`, processed, failed);

    return {
      success: failed === 0,
      processed,
      failed,
      errors: errors.slice(0, 5),
      details: results
    };
  }

  // Bulk export
  private async bulkExport(items: BulkOperationItem[]): Promise<BulkOperationResult> {
    const exportData = {
      exported_at: new Date().toISOString(),
      total_items: items.length,
      items: items.map(item => ({
        id: item.id,
        type: item.type,
        module: item.module,
        title: item.title,
        tags: item.tags
      }))
    };

    try {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pkms-bulk-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showCompletionNotification('Export Complete', items.length, 0);

      return {
        success: true,
        processed: items.length,
        failed: 0,
        errors: [],
        details: items.map(item => ({ id: item.id, success: true }))
      };
    } catch (error) {
      return {
        success: false,
        processed: 0,
        failed: items.length,
        errors: [error instanceof Error ? error.message : 'Export failed'],
        details: items.map(item => ({ id: item.id, success: false, error: 'Export failed' }))
      };
    }
  }

  // API integration methods (to be implemented with actual API calls)
  private async addTagsToItem(item: BulkOperationItem, tags: string[]): Promise<void> {
    // This would integrate with the actual API for each module
    console.log(`Adding tags ${tags.join(', ')} to ${item.type} ${item.id}`);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // In real implementation, this would call the appropriate API endpoint
    // Example: await apiService.post(`/${item.module}/${item.id}/tags`, { tags });
  }

  private async removeTagsFromItem(item: BulkOperationItem, tags: string[]): Promise<void> {
    console.log(`Removing tags ${tags.join(', ')} from ${item.type} ${item.id}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async deleteItem(item: BulkOperationItem): Promise<void> {
    console.log(`Deleting ${item.type} ${item.id}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  private async moveItem(item: BulkOperationItem, targetFolder?: string, targetModule?: string): Promise<void> {
    console.log(`Moving ${item.type} ${item.id} to ${targetFolder || targetModule}`);
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  private async archiveItem(item: BulkOperationItem): Promise<void> {
    console.log(`Archiving ${item.type} ${item.id}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private async setFavoriteStatus(item: BulkOperationItem, favorite: boolean): Promise<void> {
    console.log(`Setting ${item.type} ${item.id} favorite status to ${favorite}`);
    await new Promise(resolve => setTimeout(resolve, 80));
  }

  // Notification methods
  private showProgressNotification(total: number, operation: string): void {
    // This would integrate with your notification system
    console.log(`Starting ${operation} for ${total} items`);
    // Example: notifications.show({ title: 'Bulk Operation', message: `Processing ${total} items...`, color: 'blue', autoClose: false, id: 'bulk-operation' });
  }

  private updateProgressNotification(processed: number, total: number): void {
    const percentage = Math.round((processed / total) * 100);
    console.log(`Progress: ${processed}/${total} (${percentage}%)`);
    // Example: notifications.update({ id: 'bulk-operation', message: `Processing ${processed}/${total} (${percentage}%)` });
  }

  private hideProgressNotification(): void {
    console.log('Hiding progress notification');
    // Example: notifications.hide('bulk-operation');
  }

  private showCompletionNotification(operation: string, success: number, failed: number): void {
    const message = failed === 0
      ? `${operation}: ${success} items processed successfully`
      : `${operation}: ${success} successful, ${failed} failed`;

    console.log(message);

    // Example: notifications.show({
    //   title: 'Bulk Operation Complete',
    //   message,
    //   color: failed === 0 ? 'green' : 'orange'
    // });
  }

  // Keyboard shortcuts
  private setupKeyboardShortcuts(): void {
    // This would integrate with the keyboard shortcuts service
    // For now, we'll log the setup
    console.log('Bulk operations keyboard shortcuts setup');
  }

  // Utility methods
  private getTypeFromModule(module: string): 'note' | 'document' | 'todo' | 'diary' | 'archive' | 'folder' {
    const typeMap: Record<string, 'note' | 'document' | 'todo' | 'diary' | 'archive' | 'folder'> = {
      'notes': 'note',
      'documents': 'document',
      'todos': 'todo',
      'diary': 'diary',
      'archive': 'archive',
      'folders': 'folder'
    };
    return typeMap[module] || 'note';
  }

  // Validate operation
  validateOperation(options: BulkOperationOptions): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (options.items.length === 0) {
      errors.push('No items provided');
    }

    const selectedItems = options.items.filter(item => item.selected);
    if (selectedItems.length === 0) {
      errors.push('No items selected');
    }

    switch (options.operation) {
      case 'tag':
      case 'untag':
        if (!options.target?.tags || options.target.tags.length === 0) {
          errors.push('No tags specified for tag operation');
        }
        break;
      case 'move':
        if (!options.target?.folder && !options.target?.module) {
          errors.push('No target specified for move operation');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Get operation description
  getOperationDescription(operation: string, itemCount: number, target?: any): string {
    const descriptions: Record<string, (count: number, target?: any) => string> = {
      tag: (count, _target) => `Add tags to ${count} items`,
      untag: (count, _target) => `Remove tags from ${count} items`,
      delete: (count) => `Delete ${count} items`,
      move: (count, target) => `Move ${count} items to ${target?.folder || target?.module}`,
      archive: (count) => `Archive ${count} items`,
      favorite: (count) => `Add ${count} items to favorites`,
      unfavorite: (count) => `Remove ${count} items from favorites`,
      export: (count) => `Export ${count} items`
    };

    return descriptions[operation]?.(itemCount, target) || `Process ${itemCount} items`;
  }

  // Get available operations for item types
  getAvailableOperations(itemTypes: string[]): Array<{
    value: string;
    label: string;
    icon?: string;
    color?: string;
  }> {
    const allOperations = [
      { value: 'tag', label: 'Add Tags', icon: '🏷️', color: 'blue' },
      { value: 'untag', label: 'Remove Tags', icon: '🏷️', color: 'orange' },
      { value: 'delete', label: 'Delete', icon: '🗑️', color: 'red' },
      { value: 'move', label: 'Move', icon: '📁', color: 'purple' },
      { value: 'archive', label: 'Archive', icon: '📦', color: 'gray' },
      { value: 'favorite', label: 'Add to Favorites', icon: '⭐', color: 'yellow' },
      { value: 'unfavorite', label: 'Remove from Favorites', icon: '⭐', color: 'gray' },
      { value: 'export', label: 'Export', icon: '📤', color: 'green' }
    ];

    // Filter operations based on item types
    return allOperations.filter(op => {
      if (op.value === 'delete' && itemTypes.includes('diary')) {
        return false; // Don't allow bulk deletion of diary entries for safety
      }
      return true;
    });
  }
}

// Global instance
export const bulkOperations = new BulkOperationsService();

// React hook for using bulk operations
export const useBulkOperations = () => {
  return {
    createSelectionState: bulkOperations.createSelectionState.bind(bulkOperations),
    toggleSelection: bulkOperations.toggleSelection.bind(bulkOperations),
    toggleAllSelection: bulkOperations.toggleAllSelection.bind(bulkOperations),
    clearSelections: bulkOperations.clearSelections.bind(bulkOperations),
    getSelectedItems: bulkOperations.getSelectedItems.bind(bulkOperations),
    performBulkOperation: bulkOperations.performBulkOperation.bind(bulkOperations),
    validateOperation: bulkOperations.validateOperation.bind(bulkOperations),
    getOperationDescription: bulkOperations.getOperationDescription.bind(bulkOperations),
    getAvailableOperations: bulkOperations.getAvailableOperations.bind(bulkOperations)
  };
};

export default bulkOperations;