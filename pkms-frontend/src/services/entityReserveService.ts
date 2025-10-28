import { apiService } from './api';

export type ReserveModule = 'notes' | 'diary' | 'projects';

export interface DiaryReserveOptions {
  date: string; // YYYY-MM-DD
}

export interface ReserveResult {
  uuid: string;
}

export const entityReserveService = {
  async reserve(module: ReserveModule, options?: DiaryReserveOptions): Promise<ReserveResult> {
    switch (module) {
      case 'notes': {
        const res = await apiService.post<ReserveResult>('/notes/reserve');
        return res.data;
      }
      case 'projects': {
        const res = await apiService.post<ReserveResult>('/projects/reserve');
        return res.data;
      }
      case 'diary': {
        if (!options?.date) {
          throw new Error('Diary reserve requires a date (YYYY-MM-DD)');
        }
        const res = await apiService.post<ReserveResult>('/diary/reserve', { date: options.date });
        return res.data;
      }
      default:
        throw new Error(`Unsupported module for reserve: ${module}`);
    }
  },

  async discard(module: ReserveModule, uuid: string): Promise<void> {
    switch (module) {
      case 'notes': {
        await apiService.delete(`/notes/${uuid}`);
        return;
      }
      case 'projects': {
        await apiService.delete(`/projects/${uuid}`);
        return;
      }
      case 'diary': {
        await apiService.delete(`/diary/${uuid}`);
        return;
      }
      default:
        throw new Error(`Unsupported module for discard: ${module}`);
    }
  }
};
