import { apiService } from './api';
import { notifications } from '@mantine/notifications';
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

  async discard(module: ReserveModule, uuid: string): Promise<void> {
    try {
      switch (module) {
        case 'notes': {
          await apiService.delete(`/notes/${uuid}`);
          break;
        }
        case 'projects': {
          await apiService.delete(`/projects/${uuid}`);
          break;
        }
        case 'diary': {
          await apiService.delete(`/diary/${uuid}`);
          break;
        }
        default:
          throw new Error(`Unsupported module for discard: ${module}`);
      }

      // Show success notification
      const moduleName = getModuleDisplayName(module);
      notifications.show({
        title: 'Draft discarded',
        message: `Empty ${moduleName} draft removed`,
        color: 'gray',
        autoClose: 3000,
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
