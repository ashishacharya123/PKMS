import { apiService } from './api';

export interface DeletionImpact {
  can_delete: boolean;
  warnings: string[];
  blockers: string[];
  impact_summary: string;
  orphan_items: Array<{
    type: string;
    uuid: string;
    title?: string;
  }>;
  preserved_items: Array<{
    type: string;
    uuid: string;
    title?: string;
  }>;
}

export type ItemType = 'project' | 'note' | 'todo' | 'document' | 'diary' | 'archive';
export type DeletionMode = 'soft' | 'hard';

class DeletionImpactService {
  /**
   * Analyze the impact of deleting an item
   */
  async analyzeDeletionImpact(
    itemType: ItemType,
    itemUuid: string,
    mode: DeletionMode = 'soft'
  ): Promise<DeletionImpact> {
    try {
      const response = await apiService.get(
        `/api/v1/deletion-impact/analyze/${itemType}/${itemUuid}`,
        {
          params: { mode }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error analyzing deletion impact:', error);
      throw error;
    }
  }

  /**
   * Get a user-friendly summary of the deletion impact
   */
  getImpactSummary(impact: DeletionImpact, mode: DeletionMode): string {
    if (mode === 'soft') {
      return 'This item will be moved to the Recycle Bin and can be restored later.';
    }

    if (impact.blockers.length > 0) {
      return `Cannot delete: ${impact.blockers.join(', ')}`;
    }

    if (impact.orphan_items.length === 0 && impact.preserved_items.length === 0) {
      return 'This item will be permanently deleted.';
    }

    const parts: string[] = [];
    
    if (impact.orphan_items.length > 0) {
      parts.push(`${impact.orphan_items.length} orphaned item(s) will be deleted forever`);
    }
    
    if (impact.preserved_items.length > 0) {
      parts.push(`${impact.preserved_items.length} shared item(s) will be preserved`);
    }

    return parts.length > 0 ? parts.join(', ') : 'This item will be permanently deleted.';
  }

  /**
   * Get a detailed breakdown of what will be affected
   */
  getDetailedImpact(impact: DeletionImpact): {
    willBeDeleted: Array<{ type: string; title: string }>;
    willBePreserved: Array<{ type: string; title: string }>;
    warnings: string[];
  } {
    return {
      willBeDeleted: impact.orphan_items.map(item => ({
        type: item.type,
        title: item.title || `${item.type} (${item.uuid.slice(0, 8)}...)`
      })),
      willBePreserved: impact.preserved_items.map(item => ({
        type: item.type,
        title: item.title || `${item.type} (${item.uuid.slice(0, 8)}...)`
      })),
      warnings: impact.warnings
    };
  }

  /**
   * Check if deletion is allowed
   */
  canDelete(impact: DeletionImpact): boolean {
    return impact.can_delete && impact.blockers.length === 0;
  }

  /**
   * Get the appropriate button text for the deletion action
   */
  getActionButtonText(mode: DeletionMode, impact: DeletionImpact): string {
    if (mode === 'soft') {
      return 'Move to Recycle Bin';
    }

    if (!this.canDelete(impact)) {
      return 'Cannot Delete';
    }

    if (impact.orphan_items.length > 0) {
      return `Delete Forever (${impact.orphan_items.length} items)`;
    }

    return 'Delete Forever';
  }

  /**
   * Get the appropriate button color for the deletion action
   */
  getActionButtonColor(mode: DeletionMode, impact: DeletionImpact): string {
    if (mode === 'soft') {
      return 'blue';
    }

    if (!this.canDelete(impact)) {
      return 'gray';
    }

    return 'red';
  }

  /**
   * Get the appropriate modal title
   */
  getModalTitle(mode: DeletionMode, itemTitle: string): string {
    if (mode === 'soft') {
      return `Move "${itemTitle}" to Recycle Bin?`;
    }
    return `Permanently Delete "${itemTitle}"?`;
  }

  /**
   * Get the appropriate modal description
   */
  getModalDescription(mode: DeletionMode, impact: DeletionImpact): string {
    if (mode === 'soft') {
      return 'This item will be moved to the Recycle Bin where it can be restored later. This action is reversible.';
    }

    if (!this.canDelete(impact)) {
      return `This item cannot be deleted: ${impact.blockers.join(', ')}`;
    }

    if (impact.orphan_items.length === 0 && impact.preserved_items.length === 0) {
      return 'This action cannot be undone. The item will be permanently deleted.';
    }

    const parts: string[] = ['This action cannot be undone.'];
    
    if (impact.orphan_items.length > 0) {
      parts.push(`${impact.orphan_items.length} orphaned item(s) will also be deleted forever.`);
    }
    
    if (impact.preserved_items.length > 0) {
      parts.push(`${impact.preserved_items.length} shared item(s) will be preserved.`);
    }

    return parts.join(' ');
  }
}

export default new DeletionImpactService();
