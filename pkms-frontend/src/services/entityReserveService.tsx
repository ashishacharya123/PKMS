import React from 'react';
import { apiService } from './api';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { getModuleDisplayName } from '../utils/save_discard_verification';

export type ReserveModule = 'notes' | 'diary' | 'projects';

export interface DiaryReserveOptions {
  date: string; // YYYY-MM-DD
}

export interface ReserveResult {
  uuid: string;
}

export const entityReserveService = {
  async reserve(module: ReserveModule, options?: DiaryReserveOptions): Promise<ReserveResult> {
    try {
      let result: ReserveResult;
      
      switch (module) {
        case 'notes': {
          const res = await apiService.post<ReserveResult>('/notes/reserve');
          result = res.data;
          break;
        }
        case 'projects': {
          const res = await apiService.post<ReserveResult>('/projects/reserve');
          result = res.data;
          break;
        }
        case 'diary': {
          if (!options?.date) {
            throw new Error('Diary reserve requires a date (YYYY-MM-DD)');
          }
          const res = await apiService.post<ReserveResult>('/diary/reserve', { date: options.date });
          result = res.data;
          break;
        }
        default:
          throw new Error(`Unsupported module for reserve: ${module}`);
      }

      // Show success notification
      const moduleName = getModuleDisplayName(module);
      notifications.show({
        title: 'Ready for files',
        message: `File uploads enabled for your ${moduleName}`,
        color: 'green',
        autoClose: 2000,
      });

      return result;
    } catch (error) {
      // Show error notification
      const moduleName = getModuleDisplayName(module);
      notifications.show({
        title: 'Reservation failed',
        message: `Could not prepare ${moduleName}`,
        color: 'red',
      });
      throw error;
    }
  },

  async checkAssociatedFiles(module: ReserveModule, uuid: string): Promise<{ hasFiles: boolean; fileCount: number; fileNames: string[] }> {
    try {
      let files: any[] = [];

      switch (module) {
        case 'notes': {
          const response = await apiService.get(`/notes/${uuid}/documents`);
          files = response.data || [];
          break;
        }
        case 'projects': {
          // Projects use polymorphic project_items, but let's check for direct document associations
          const response = await apiService.get(`/projects/${uuid}/documents`);
          files = response.data || [];
          break;
        }
        case 'diary': {
          const response = await apiService.get(`/diary/entries/${uuid}/documents`);
          files = response.data || [];
          break;
        }
        default:
          return { hasFiles: false, fileCount: 0, fileNames: [] };
      }

      const fileNames = files.map((file: any) => file.originalName || file.name || 'Unnamed file').slice(0, 5);
      const hasFiles = files.length > 0;

      return { hasFiles, fileCount: files.length, fileNames };
    } catch (error) {
      // If we can't check files, assume no files to avoid blocking discard
      console.warn('Could not check associated files:', error);
      return { hasFiles: false, fileCount: 0, fileNames: [] };
    }
  },

  async discard(module: ReserveModule, uuid: string): Promise<void> {
    try {
      // Check for associated files first
      const { hasFiles, fileCount, fileNames } = await this.checkAssociatedFiles(module, uuid);

      if (hasFiles) {
        // Show confirmation dialog when there are files
        const confirmed = await new Promise<boolean>((resolve) => {
          const moduleName = getModuleDisplayName(module);
          const fileListText = fileNames.length > 0
            ? fileNames.join(', ') + (fileCount > fileNames.length ? ` and ${fileCount - fileNames.length} more...` : '')
            : `${fileCount} file(s)`;

          modals.openConfirmModal({
            title: '⚠️ Confirm Discard with Files',
            children: (
              <div>
                <p style={{ marginBottom: '12px', fontWeight: 500 }}>
                  This will permanently delete:
                </p>
                <ul style={{ marginBottom: '16px', paddingLeft: '20px' }}>
                  <li>The {moduleName} draft</li>
                  <li>{fileListText}</li>
                </ul>
                <p style={{ color: 'var(--mantine-color-red-6)', fontWeight: 500 }}>
                  ⚠️ This action cannot be undone. All files will be permanently lost.
                </p>
              </div>
            ),
            labels: { confirm: 'Delete Everything', cancel: 'Keep Files' },
            confirmProps: { color: 'red' },
            onCancel: () => resolve(false),
            onConfirm: () => resolve(true),
          });
        });

        if (!confirmed) {
          // User chose not to delete - don't discard anything
          const moduleName = getModuleDisplayName(module);
          notifications.show({
            title: 'Discard cancelled',
            message: `${moduleName} draft and files preserved`,
            color: 'blue',
            autoClose: 3000,
          });
          return;
        }
      }

      // Proceed with permanent deletion (entity and associated files will be handled by backend cascade deletes)
      switch (module) {
        case 'notes': {
          await apiService.delete(`/notes/${uuid}/permanent`);
          break;
        }
        case 'projects': {
          await apiService.delete(`/projects/${uuid}/permanent`);
          break;
        }
        case 'diary': {
          await apiService.delete(`/diary/entries/${uuid}/permanent`);
          break;
        }
        default:
          throw new Error(`Unsupported module for discard: ${module}`);
      }

      // Show success notification
      const moduleName = getModuleDisplayName(module);
      notifications.show({
        title: hasFiles ? 'Permanently deleted' : 'Draft discarded',
        message: hasFiles
          ? `${moduleName} and ${fileCount} file(s) permanently removed`
          : `Empty ${moduleName} permanently removed`,
        color: hasFiles ? 'red' : 'orange',
        autoClose: 4000,
      });
    } catch (error) {
      // Show error notification
      const moduleName = getModuleDisplayName(module);
      notifications.show({
        title: 'Discard failed',
        message: `Could not remove ${moduleName} draft`,
        color: 'red',
      });
      throw error;
    }
  }
};
